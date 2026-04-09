import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from './modules/orders/orders.module';
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
          synchronize: false, // ⚠️ DÉSACTIVÉ pour la production
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        };
      },
    }),
    OrdersModule,
  ],
})
export class AppModule {}
