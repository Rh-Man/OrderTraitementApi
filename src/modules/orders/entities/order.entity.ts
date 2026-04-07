import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('orders')
export class Order {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  product: string;

  @Column('int')
  quantity: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @CreateDateColumn()
  created_at: Date;
}
