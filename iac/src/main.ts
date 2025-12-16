#!/usr/bin/env ts-node
import * as cdk from "aws-cdk-lib";

import { devConfig } from "./config/dev";
import { GitScanningStack } from "./stack";

const app = new cdk.App();

new GitScanningStack(app, "GitScanningStack", {
  env: devConfig.env,
  config: devConfig,
});
