import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

export class OrderManagementStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2, natGateways: 1 });

    // SQS
    const dlq = new sqs.Queue(this, 'OrdersDLQ', {
      retentionPeriod: cdk.Duration.days(14),
    });
    const queue = new sqs.Queue(this, 'OrdersQueue', {
      visibilityTimeout: cdk.Duration.seconds(30),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    // DynamoDB
    const eventsTable = new dynamodb.Table(this, 'EventsTable', {
      tableName: 'events',
      partitionKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // RDS
    const dbSecret = new rds.DatabaseSecret(this, 'DbSecret', { username: 'orderadmin' });
    const dbSg = new ec2.SecurityGroup(this, 'DbSg', { vpc });
    const database = new rds.DatabaseInstance(this, 'OrdersDb', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_15 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSg],
      credentials: rds.Credentials.fromSecret(dbSecret),
      databaseName: 'orders',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
    });

    // Lambda SG
    const lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', { vpc });
    dbSg.addIngressRule(lambdaSg, ec2.Port.tcp(5432), 'Lambda → RDS');

    // Shared env
    const env = {
      NODE_ENV: 'production',
      DB_HOST: database.dbInstanceEndpointAddress,
      DB_PORT: database.dbInstanceEndpointPort,
      DB_NAME: 'orders',
      DYNAMODB_TABLE: eventsTable.tableName,
      SQS_QUEUE_URL: queue.queueUrl,
    };

    const lambdaCode = lambda.Code.fromAsset('..', {
      exclude: ['infra', 'infra/**', 'node_modules/**', '.git/**'],
    });

    // Lambda 1 — API
    const apiLambda = new lambda.Function(this, 'ApiLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'dist/lambda-api.handler',
      code: lambdaCode,
      timeout: cdk.Duration.seconds(15),
      memorySize: 512,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      environment: env,
    });
    dbSecret.grantRead(apiLambda);
    apiLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:PutItem'],
      resources: [eventsTable.tableArn],
    }));
    apiLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['sqs:SendMessage'],
      resources: [queue.queueArn],
    }));

    // Lambda 2 — Worker
    const workerLambda = new lambda.Function(this, 'WorkerLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'dist/lambda-worker.handler',
      code: lambdaCode,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      environment: env,
    });
    dbSecret.grantRead(workerLambda);
    workerLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:PutItem'],
      resources: [eventsTable.tableArn],
    }));
    workerLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
      resources: [queue.queueArn],
    }));

    // SQS → Worker event source
    workerLambda.addEventSource(new lambdaEventSources.SqsEventSource(queue, { batchSize: 1 }));

    // API Gateway
    const api = new apigateway.RestApi(this, 'OrdersApi', {
      restApiName: 'Orders API',
      deployOptions: { stageName: 'prod' },
    });
    const integration = new apigateway.LambdaIntegration(apiLambda, { proxy: true });
    const orders = api.root.addResource('orders');
    orders.addMethod('POST', integration);
    orders.addResource('{id}').addMethod('GET', integration);

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'QueueUrl', { value: queue.queueUrl });
  }
}
