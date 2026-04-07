import { Injectable, Logger } from '@nestjs/common';
import * as AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

export interface OrderEvent {
  orderId: string;
  type: string;
  timestamp: string;
}

@Injectable()
export class EventsRepository {
  private readonly logger = new Logger(EventsRepository.name);
  private readonly dynamo = new AWS.DynamoDB.DocumentClient();
  private readonly tableName = process.env.DYNAMODB_TABLE || 'events';

  async putEvent(event: OrderEvent): Promise<void> {
    await this.dynamo.put({
      TableName: this.tableName,
      Item: {
        eventId: uuidv4(),
        orderId: event.orderId,
        type: event.type,
        timestamp: event.timestamp,
      },
    }).promise();
    this.logger.log(`Event stored: ${event.type} for order ${event.orderId}`);
  }
}
