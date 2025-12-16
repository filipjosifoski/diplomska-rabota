import { Size, Stack, StackProps } from "aws-cdk-lib";
import {
  EcsFargateContainerDefinition,
  EcsJobDefinition,
  FargateComputeEnvironment,
  JobQueue,
  Secret as batchSecret,
} from "aws-cdk-lib/aws-batch";
import { SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { ContainerImage } from "aws-cdk-lib/aws-ecs";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { BatchJob } from "aws-cdk-lib/aws-events-targets";
import { AnyPrincipal, Effect, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

import { GitScanningConfig } from "./config/types";

export interface GitScanningProps extends StackProps {
  config: GitScanningConfig;
}
export class GitScanningStack extends Stack {
  constructor(scope: Construct, id: string, props?: GitScanningProps) {
    super(scope, id, props);

    // Дефинираме VPC мрежа со јавни и приватни подмрежи. Јавната е потреба само за да приватната има пристап до интернет т.е да може да ја превзема потребната слика од ECR
    // како и да го чита Secrets Manager за GitHub токенот и да ги постира извештаите во S3.
    const vpc = new Vpc(this, "GitScanningVPC", {
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "Private",
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ECR репозиториум каде што ќе се чува Docker сликата за скенирање на Git репозиториуми
    const repository = new Repository(this, "GitScanningRepository", {
      repositoryName: "git-scanning-repo",
    });

    // S3 кофа каде што ќе се чуваат извештаите од скенирањето
    const reportingBucket = new Bucket(this, "GitScanningReportingBucket", {
      bucketName: "git-scanning-reports-bucket",
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    // Secrets Manager тајна каде што ќе се чува GitHub токенот
    const githubSecret = new Secret(this, "GitHubSecret", {
      secretName: "github-token",
    });

    // IAM ролја за Batch задачи
    const batchJobRole = new Role(this, "GitScanningBatchJobRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    // Додавање на S3 пермисии на ролјата
    batchJobRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"));

    // Дефинираме Fargate Compute Environment за AWS Batch. Ова овозможува извршување на задачи во Fargate.
    const batchComputeEnv = new FargateComputeEnvironment(this, "GitScanningComputeEnv", {
      computeEnvironmentName: "git-scanning-compute-env",
      vpc: vpc,
      vpcSubnets: vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS }),
    });

    // Додавање на S3 bucket policy за да се дозволи пристап само од Batch задачите и од одреден корисник
    // Ова е критичен чекор бидејќи во оваa S3 кофа ќе се чуваат чувствителни податоци (извештаи од скенирањето), па не би сакале
    // да стане мета на напади или неовластен пристап.
    reportingBucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.DENY,
        principals: [new AnyPrincipal()],
        actions: ["s3:*"],
        resources: [reportingBucket.bucketArn, `${reportingBucket.bucketArn}/*`],
        conditions: {
          StringNotLike: {
            "aws:PrincipalArn": [
              batchJobRole.roleArn,
              "arn:aws:iam::977285526069:user/filipjosifoski",
            ],
          },
        },
      }),
    );

    // Дефинираме Job Queue за AWS Batch задачи. Кога EventBridge го активира правилото, задачите ќе се постават во оваа редица.
    const batchJobQueue = new JobQueue(this, "GitScanningJobQueue", {
      jobQueueName: "git-scanning-job-queue",
      computeEnvironments: [
        {
          computeEnvironment: batchComputeEnv,
          order: 1,
        },
      ],
    });

    // Дефинираме Fargate контејнер. Овде се ставаат потребните променливи, колку CPU и меморија ќе се користат, како и тајните кои ќе се користат во задачата.
    const batchTaskDef = new EcsFargateContainerDefinition(this, "GitScanningJobDef", {
      image: ContainerImage.fromEcrRepository(repository),
      memory: Size.gibibytes(8),
      cpu: 4,
      ephemeralStorageSize: Size.gibibytes(100),
      jobRole: batchJobRole,
      environment: {
        S3_BUCKET_NAME: reportingBucket.bucketName,
        GH_ORG_NAME: "gitleaks",
        PARALLEL_JOBS: "16",
      },
      secrets: {
        GH_TOKEN: batchSecret.fromSecretsManager(githubSecret, "GH_TOKEN"),
      },
    });

    // Дефинираме Job Definition за AWS Batch која користи гореспоменатата Fargate задача.
    const jobDefinition = new EcsJobDefinition(this, "GitScanningJobDefinition", {
      jobDefinitionName: "git-scanning-job-definition",
      container: batchTaskDef,
    });


    // Дефинираме EventBridge правило кое ќе го активира AWS Batch секоја недела во понеделник на полноќ.
    new Rule(this, "GitScanningScheduleRule", {
      schedule: Schedule.cron({
        minute: "0",
        hour: "0",
        weekDay: "1",
      }),
      targets: [new BatchJob(batchJobQueue.jobQueueArn, batchJobQueue, jobDefinition.jobDefinitionArn, jobDefinition)],
    });

    // Дозволуваме AWS Batch задачата да ја превземе сликата од ECR репозиториумот и да го прочита GitHub токенот од Secrets Manager.
    repository.grantPull(batchTaskDef.executionRole!);
    githubSecret.grantRead(batchJobRole);
  }
}
