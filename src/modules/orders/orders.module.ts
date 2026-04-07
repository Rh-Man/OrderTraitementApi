import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { RdsRepository } from '../../infrastructure/rds/rds.repository';
import { EventsService } from '../../events/events.service';
import { EventsRepository } from '../../infrastructure/dynamodb/events.repository';
import { SqsService } from '../../queue/sqs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  controllers: [OrdersController],
  providers: [OrdersService, RdsRepository, EventsService, EventsRepository, SqsService],
})
export class OrdersModule {}
