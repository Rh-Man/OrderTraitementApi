import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkerService } from './worker.service';
import { Order } from '../orders/entities/order.entity';
import { RdsRepository } from '../../infrastructure/rds/rds.repository';
import { EventsService } from '../../events/events.service';
import { EventsRepository } from '../../infrastructure/dynamodb/events.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  providers: [WorkerService, RdsRepository, EventsService, EventsRepository],
  exports: [WorkerService],
})
export class WorkerModule {}
