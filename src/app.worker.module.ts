import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkerModule } from './modules/worker/worker.module';
import { Order } from './modules/orders/entities/order.entity';
import { getDatabaseCredentials } from './config/database.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: async () => {
        const credentials = await getDatabaseCredentials();
        return {
          type: 'postgres' as const,
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || '5432'),
          username: credentials.username,
          password: credentials.password,
          database: process.env.DB_NAME,
          entities: [Order],
          synchronize: false,
          ssl: { rejectUnauthorized: false },
        };
      },
    }),
    WorkerModule,
  ],
})
export class AppWorkerModule {}
