#!/usr/bin/env bash
set -euo pipefail

# Главната функција со која се скенира секој репозиториум. Пред секое скенирање се проверува дали постои baseline репорт од претходно скенирање.
# Ако постои, се користи за да се споредат новите наоди со претходните. По скенирањето, резултатите се качуваат на S3 bucket-от.
scan_repo() {
  local repo="$1"
  local workdir
  workdir="$(mktemp -d -p "$TMP_DIR")"

  echo "Scanning $repo"

  if ! timeout 300 gh repo clone "$GH_ORG_NAME/$repo" "$workdir/$repo"; then
    echo "[WARN] Failed or timed out cloning $repo"
    echo "$repo" >> "$FAILED_REPOS_FILE"
    rm -rf "$workdir"
    return 1
  fi

  local baseline_file="$REPORT_DIR/$repo-baseline.json"
  if aws s3 ls "s3://$S3_BUCKET_NAME/$repo-report.json" >/dev/null 2>&1; then
    echo "Downloading baseline for $repo"
    aws s3 cp "s3://$S3_BUCKET_NAME/$repo-report.json" "$baseline_file"
    baseline_args=(--baseline-path "$baseline_file")
  else
    baseline_args=()
  fi

  local report_file="$REPORT_DIR/$repo-report.json"
  if ! timeout 600 gitleaks detect \
      --source "$workdir/$repo" \
      --report-path "$report_file" \
      --report-format json \
      "${baseline_args[@]}"; then
    echo "[WARN] Gitleaks scan timed out or failed for $repo"
    echo "$repo" >> "$FAILED_REPOS_FILE"
  fi

if [[ -f "$baseline_file" ]]; then
    jq -s 'add' "$baseline_file" "$report_file" > "$REPORT_DIR/$repo-report-merged.json"
    mv "$REPORT_DIR/$repo-report-merged.json" "$report_file"
fi

aws s3 cp "$report_file" "s3://$S3_BUCKET_NAME/$repo-report.json" || true
  rm -rf "$workdir"
}

# Дефинираме конфигурации за колку паралелни скенирања да се изршуваат, каде да се ставаат резултатите и како ќе се вика целосниот репорт.
PARALLEL_JOBS="${PARALLEL_JOBS:-8}"
REPORT_DIR="reports"
CLONE_DIR="repos"
TMP_DIR="$(mktemp -d)"
MERGED_REPORT="$REPORT_DIR/merged-report.json"

# Проверуваме дали се поставени потребните envionment variables односно организацијата која треба да се скенира, токенот за пристап и S3 bucket-от каде ќе се чуваат резултатите.
  echo "[ERROR] GH_ORG_NAME environment variable is required"
  exit 1
fi

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "[ERROR] ORG environment variable is required"
  exit 1
fi

if [[ -z "${S3_BUCKET_NAME:-}" ]]; then
  echo "[ERROR] S3_BUCKET_NAME environment variable is required"
  exit 1
fi


# Ги креираме потребните директориуми и датотеки
mkdir -p "$REPORT_DIR" "$CLONE_DIR"

FAILED_REPOS_FILE="$TMP_DIR/failed-repos.txt"
touch "$FAILED_REPOS_FILE"


export -f scan_repo
export GH_ORG_NAME REPORT_DIR TMP_DIR S3_BUCKET_NAME FAILED_REPOS_FILE


# Ги листаме сите Github репозиториуми и за секој од нив ја повикуваме функцијата за скенирање. Паралелизираме со xargs
gh repo list "$GH_ORG_NAME" --json name -q '.[].name' | \
  xargs -P "$PARALLEL_JOBS" -I {} bash -c 'scan_repo "{}"'

# Кога ќе завршат сите скенирања креираме еден голем репорт со сите наоди и го качуваме на S3 bucket-от.
echo "Merging all reports  in $MERGED_REPORT"
jq -s 'add' "$REPORT_DIR"/*-report.json > "$MERGED_REPORT"
aws s3 cp "$MERGED_REPORT" "s3://$S3_BUCKET_NAME/merged-report.json" || true

# Прикажуваме резиме на скенирањето
echo "Repos with NEW secrets detected:"
NEW_SECRETS_REPOS=()
for f in "$REPORT_DIR"/*-report.json; do
  # Skip empty reports
  if [[ -s "$f" ]] && [[ "$(jq length "$f")" -gt 0 ]]; then
    repo_name=$(basename "$f" "-report.json")
    NEW_SECRETS_REPOS+=("$repo_name")
  fi
done

if [[ ${#NEW_SECRETS_REPOS[@]} -gt 0 ]]; then
  echo "${NEW_SECRETS_REPOS[@]}" | tr ' ' '\n'
else
  echo "None"
fi

# Прикажуваме кои репозиториуми не се скенирани успешно
if [[ -s "$FAILED_REPOS_FILE" ]]; then
  FAILED_COUNT=$(wc -l < "$FAILED_REPOS_FILE")
  echo "$FAILED_COUNT repo(s) failed during scanning:"
  cat "$FAILED_REPOS_FILE"
else
  echo "All repos scanned successfully"
fi

echo "Merged report available at: $MERGED_REPORT"
