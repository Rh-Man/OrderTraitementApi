import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from './entities/order.entity';
import { RdsRepository } from '../../infrastructure/rds/rds.repository';
import { EventsService } from '../../events/events.service';
import { SqsService } from '../../queue/sqs.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(RdsRepository) private readonly rdsRepository: RdsRepository,
    @Inject(EventsService) private readonly eventsService: EventsService,
    @Inject(SqsService) private readonly sqsService: SqsService,
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<{ orderId: string; status: string }> {
    const orderId = uuidv4();

    await this.rdsRepository.create({
      id: orderId,
      product: dto.product,
      quantity: dto.quantity,
      status: OrderStatus.PENDING,
    });
    this.logger.log(`Order created: ${orderId}`);

    await this.eventsService.recordEvent({
      orderId,
      type: 'ORDER_CREATED',
      timestamp: new Date().toISOString(),
    });

    await this.sqsService.sendMessage({ orderId });

    return { orderId, status: OrderStatus.PENDING };
  }

  async getOrder(orderId: string) {
    const order = await this.rdsRepository.findById(orderId);
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    return order;
  }

  async getAllOrders() {
    return this.rdsRepository.findAll();
  }
}
