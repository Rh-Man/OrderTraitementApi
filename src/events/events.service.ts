import { Injectable } from '@nestjs/common';
import { EventsRepository, OrderEvent } from '../infrastructure/dynamodb/events.repository';

@Injectable()
export class EventsService {
  constructor(private readonly eventsRepository: EventsRepository) {}

  async recordEvent(event: OrderEvent): Promise<void> {
    await this.eventsRepository.putEvent(event);
  }
}
