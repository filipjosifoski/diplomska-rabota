import { Environment } from "aws-cdk-lib";

export enum Accounts {
  Dev = "977285526069",
}
export interface GitScanningConfig {
  env: Environment;
}
