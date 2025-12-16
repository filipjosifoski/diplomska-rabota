FROM debian:bullseye-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    git \
    ca-certificates \
    gnupg \
    jq \
    bash \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip" && \
    unzip /tmp/awscliv2.zip -d /tmp && \
    /tmp/aws/install --install-dir /aws-cli --bin-dir /usr/local/bin && \
    rm -rf /tmp/aws /tmp/awscliv2.zip

RUN curl -sL "https://github.com/gitleaks/gitleaks/releases/download/v8.30.0/gitleaks_8.30.0_linux_x64.tar.gz" \
    -o /tmp/gitleaks.tar.gz && \
    tar -xzf /tmp/gitleaks.tar.gz -C /tmp && \
    mv /tmp/gitleaks /usr/local/bin/gitleaks && \
    chmod +x /usr/local/bin/gitleaks && \
    rm -rf /tmp/gitleaks.tar.gz

RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && \
    apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/local/bin:$PATH"

COPY script.sh script.sh
RUN chmod +x script.sh

CMD ["./script.sh"]
