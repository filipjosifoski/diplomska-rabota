import * as cdk from "aws-cdk-lib";
import "jest-cdk-snapshot";

import { devConfig } from "../src/config/dev";
import { GitScanningStack } from "../src/stack";

// Test for dev stack
test("snapshot for GitScanning Dev matches previous state", () => {
  const app = new cdk.App();
  const stack = new GitScanningStack(app, "GitScanningDev", { config: devConfig });

  expect(stack).toMatchCdkSnapshot({
    ignoreAssets: true,
    ignoreCurrentVersion: true,
    ignoreMetadata: true,
  });
});
