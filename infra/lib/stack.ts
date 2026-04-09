import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import { Construct } from 'constructs';

export class OrderManagementStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2, natGateways: 1 });

    vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    });

    const dlq = new sqs.Queue(this, 'OrdersDLQ', {
      retentionPeriod: cdk.Duration.days(14),
    });
    const queue = new sqs.Queue(this, 'OrdersQueue', {
      visibilityTimeout: cdk.Duration.seconds(30),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    const eventsTable = new dynamodb.Table(this, 'EventsTable', {
      tableName: 'events',
      partitionKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

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

    const lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', { vpc });
    dbSg.addIngressRule(lambdaSg, ec2.Port.tcp(5432), 'Lambda to RDS');

    const env = {
      NODE_ENV: 'production',
      DB_HOST: database.dbInstanceEndpointAddress,
      DB_PORT: database.dbInstanceEndpointPort,
      DB_NAME: 'orders',
      DB_SECRET_ARN: dbSecret.secretArn,
      DYNAMODB_TABLE: eventsTable.tableName,
      SQS_QUEUE_URL: queue.queueUrl,
    };

    const apiLambda = new NodejsFunction(this, 'ApiLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/lambda-api.handler.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(15),
      memorySize: 512,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      environment: env,
      bundling: {
        externalModules: [
          '@nestjs/microservices',
          '@nestjs/websockets',
          'class-transformer/storage',
        ],
        minify: false,
        sourceMap: true,
        forceDockerBundling: false,
        tsconfig: path.join(__dirname, '../../tsconfig.json'),
        esbuildArgs: {
          '--keep-names': '',
        },
      },
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

    const workerLambda = new NodejsFunction(this, 'WorkerLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/lambda-worker.handler.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      environment: env,
      bundling: {
        externalModules: [
          '@nestjs/microservices',
          '@nestjs/websockets',
          'class-transformer/storage',
        ],
        minify: false,
        sourceMap: true,
        forceDockerBundling: false,
        tsconfig: path.join(__dirname, '../../tsconfig.json'),
        esbuildArgs: {
          '--keep-names': '',
        },
      },
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

    workerLambda.addEventSource(new lambdaEventSources.SqsEventSource(queue, { batchSize: 1 }));

    const api = new apigateway.RestApi(this, 'OrdersApi', {
      restApiName: 'Orders API',
      deployOptions: { stageName: 'prod' },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });
    const integration = new apigateway.LambdaIntegration(apiLambda, { proxy: true });
    const orders = api.root.addResource('orders');
    orders.addMethod('POST', integration);
    orders.addMethod('GET', integration);
    orders.addResource('{id}').addMethod('GET', integration);

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'QueueUrl', { value: queue.queueUrl });

    const dashboard = new cloudwatch.Dashboard(this, 'OrdersDashboard', {
      dashboardName: 'Orders-Monitoring',
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Lambda - Invocations & Errors',
        left: [apiLambda.metricInvocations({ statistic: 'Sum' })],
        right: [apiLambda.metricErrors({ statistic: 'Sum' })],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Lambda - Duration',
        left: [apiLambda.metricDuration({ statistic: 'Average' })],
        width: 12,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Worker Lambda - Invocations & Errors',
        left: [workerLambda.metricInvocations({ statistic: 'Sum' })],
        right: [workerLambda.metricErrors({ statistic: 'Sum' })],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Worker Lambda - Duration',
        left: [workerLambda.metricDuration({ statistic: 'Average' })],
        width: 12,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'SQS - Messages',
        left: [
          queue.metricNumberOfMessagesSent({ statistic: 'Sum', label: 'Messages Sent' }),
          queue.metricApproximateNumberOfMessagesVisible({ statistic: 'Average', label: 'Messages Visible' }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'DLQ - Messages (Dead Letter Queue)',
        left: [dlq.metricApproximateNumberOfMessagesVisible({ statistic: 'Average' })],
        width: 12,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Requests',
        left: [
          api.metricCount({ statistic: 'Sum', label: 'Total Requests' }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '4XXError',
            dimensionsMap: { ApiName: api.restApiName },
            statistic: 'Sum',
            label: '4XX Errors',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '5XXError',
            dimensionsMap: { ApiName: api.restApiName },
            statistic: 'Sum',
            label: '5XX Errors',
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Latency',
        left: [api.metricLatency({ statistic: 'Average' })],
        width: 12,
      })
    );

    apiLambda.metricErrors({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    }).createAlarm(this, 'ApiLambdaErrorAlarm', {
      alarmName: 'Orders-API-Lambda-Errors',
      alarmDescription: 'API Lambda has too many errors',
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    workerLambda.metricErrors({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    }).createAlarm(this, 'WorkerLambdaErrorAlarm', {
      alarmName: 'Orders-Worker-Lambda-Errors',
      alarmDescription: 'Worker Lambda has too many errors',
      threshold: 3,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    dlq.metricApproximateNumberOfMessagesVisible({
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    }).createAlarm(this, 'DLQAlarm', {
      alarmName: 'Orders-DLQ-Messages',
      alarmDescription: 'Messages detected in Dead Letter Queue - requires investigation',
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5XXError',
      dimensionsMap: { ApiName: api.restApiName },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    }).createAlarm(this, 'ApiGateway5xxAlarm', {
      alarmName: 'Orders-API-Gateway-5xx',
      alarmDescription: 'API Gateway returning too many 5xx errors',
      threshold: 10,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=Orders-Monitoring`,
      description: 'CloudWatch Dashboard URL',
    });
  }
}
