import { Injectable, Logger } from '@nestjs/common';
import { SQSEvent, SQSRecord } from 'aws-lambda';
import { RdsRepository } from '../../infrastructure/rds/rds.repository';
import { EventsService } from '../../events/events.service';
import { OrderStatus } from '../orders/entities/order.entity';

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);

  constructor(
    private readonly rdsRepository: RdsRepository,
    private readonly eventsService: EventsService,
  ) {}

  async processSqsEvent(event: SQSEvent): Promise<void> {
    for (const record of event.Records) {
      await this.processRecord(record);
    }
  }

  private async processRecord(record: SQSRecord): Promise<void> {
    let orderId: string | undefined;
    try {
      const body = JSON.parse(record.body);
      orderId = body.orderId;
      if (!orderId) throw new Error('Missing orderId in SQS message');

      const order = await this.rdsRepository.findById(orderId);
      if (!order) throw new Error(`Order ${orderId} not found`);

      await this.rdsRepository.updateStatus(orderId, OrderStatus.PROCESSING);
      await this.eventsService.recordEvent({ orderId, type: 'ORDER_PROCESSING', timestamp: new Date().toISOString() });
      this.logger.log(`Order ${orderId} → PROCESSING`);

      await this.simulateProcessing();

      await this.rdsRepository.updateStatus(orderId, OrderStatus.COMPLETED);
      await this.eventsService.recordEvent({ orderId, type: 'ORDER_COMPLETED', timestamp: new Date().toISOString() });
      this.logger.log(`Order ${orderId} → COMPLETED`);
    } catch (error) {
      this.logger.error(`Error processing order: ${error.message}`);
      if (orderId) {
        await this.rdsRepository.updateStatus(orderId, OrderStatus.FAILED).catch(() => null);
        await this.eventsService.recordEvent({ orderId, type: 'ORDER_FAILED', timestamp: new Date().toISOString() }).catch(() => null);
      }
      throw error; // SQS retry
    }
  }

  private simulateProcessing(): Promise<void> {
    const delay = Math.floor(Math.random() * 3000) + 2000;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
