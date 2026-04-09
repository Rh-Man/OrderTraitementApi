import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppWorkerModule } from './app.worker.module';
import { WorkerService } from './modules/worker/worker.service';
import { SQSEvent } from 'aws-lambda';

let workerService: WorkerService;

async function bootstrap(): Promise<WorkerService> {
  const app = await NestFactory.createApplicationContext(AppWorkerModule);
  return app.get(WorkerService);
}

export const handler = async (event: SQSEvent): Promise<void> => {
  if (!workerService) {
    workerService = await bootstrap();
  }
  await workerService.processSqsEvent(event);
};
