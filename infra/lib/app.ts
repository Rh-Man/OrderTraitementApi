import * as cdk from 'aws-cdk-lib';
import { OrderManagementStack } from './stack';

const app = new cdk.App();
new OrderManagementStack(app, 'OrderManagementStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'eu-west-1',
  },
});
