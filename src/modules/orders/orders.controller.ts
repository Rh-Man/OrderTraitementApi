import { Body, Controller, Get, Param, Post, UsePipes, ValidationPipe, Inject } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('orders')
export class OrdersController {
  constructor(
    @Inject(OrdersService) private readonly ordersService: OrdersService
  ) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createOrder(@Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(dto);
  }

  @Get()
  async getAllOrders() {
    return this.ordersService.getAllOrders();
  }

  @Get(':id')
  async getOrder(@Param('id') id: string) {
    return this.ordersService.getOrder(id);
  }
}
