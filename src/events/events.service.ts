import { Injectable, Inject } from '@nestjs/common';
import { EventsRepository, OrderEvent } from '../infrastructure/dynamodb/events.repository';

@Injectable()
export class EventsService {
  constructor(
    @Inject(EventsRepository) private readonly eventsRepository: EventsRepository
  ) {}

  async recordEvent(event: OrderEvent): Promise<void> {
    await this.eventsRepository.putEvent(event);
  }
}
