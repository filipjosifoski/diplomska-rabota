import { Accounts, GitScanningConfig } from "./types";

export const devConfig: GitScanningConfig = {
  env: {
    account: Accounts.Dev,
    region: "us-east-1",
  },
};
