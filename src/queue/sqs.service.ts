import { Injectable, Logger } from '@nestjs/common';
import * as AWS from 'aws-sdk';

@Injectable()
export class SqsService {
  private readonly logger = new Logger(SqsService.name);
  private readonly sqs = new AWS.SQS();
  private readonly queueUrl = process.env.SQS_QUEUE_URL || '';

  async sendMessage(payload: Record<string, unknown>): Promise<void> {
    await this.sqs.sendMessage({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(payload),
    }).promise();
    this.logger.log(`SQS message sent: ${JSON.stringify(payload)}`);
  }
}
