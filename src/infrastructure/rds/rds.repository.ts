import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../../modules/orders/entities/order.entity';

@Injectable()
export class RdsRepository {
  constructor(
    @InjectRepository(Order)
    private readonly repo: Repository<Order>,
  ) {}

  async create(order: Partial<Order>): Promise<Order> {
    const entity = this.repo.create(order);
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<Order | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findAll(): Promise<Order[]> {
    return this.repo.find({ order: { created_at: 'DESC' } });
  }

  async updateStatus(id: string, status: OrderStatus): Promise<void> {
    await this.repo.update(id, { status });
  }
}
