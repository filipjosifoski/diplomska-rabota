# Git Security Scanning Infra

## Pre-requisites

* `node` and `yarn`
* aws access - `aws sts get-caller-identity`
* [`aws-vault`](https://github.com/99designs/aws-vault/) - recommended

<details>
<summary>Example <code>aws-vault</code> configuration</summary>
Example how to use aws-vault with AWS SSO (in <code>~/.aws/config</code>):
<pre>
[profile dev-acc]
sso_start_url=https://d-1037c5a71e.awsapps.com/start
sso_region=us-east-1
sso_account_id=123456789  # Example account id
sso_role_name=DevOps      # Example permissionset name
</pre>
</details>

## Useful commands for CDK

* `yarn add …`        - add 3rd party packages from npmjs (see https://constructs.dev/)
* `yarn build`        - compile typescript to js
* `yarn test`         - perform the jest unit tests
* `yarn test:fix`     - update the jest test snapshot
* `yarn lint`         - lint the code
* `yarn lint:fix`     - try to fix the lint errors
* `yarn prettier`     - check for code formating compliance
* `yarn prettier:fix` - fix code formatting issues
* `yarn diff`         - compare deployed stack with current state
* `yarn synth`        - emits the synthesized CloudFormation template
* `yarn deploy …`     - deploy this stack to your default AWS account/region

<details>
<summary>CDK Bootstrap (optional)</summary>

Before using CDK in any AWS Account and Region, the Account + Region needs to be "cdk bootstraped"

```
# check if your aws is properly configured
aws sts get-caller-identity

# bootstrap cdk for the account and region
yarn cdk bootstrap [aws://123456789/us-east-1]

# or if using `aws-vault` then use `--no-session` just for the bootstrapping:
aws-vault exec MyProfile --no-session -- yarn cdk bootstrap [aws://123456789/us-east-1]
```

This **only needs to be done once** in the history of the account/region.
</details>
