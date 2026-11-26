import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { InventoryClientModule } from '../inventory-client/inventory-client.module.js';
import { OUTBOX_REPOSITORY } from './outbox.contract.js';
import { OutboxProcessor } from './outbox.processor.js';
import { DrizzleOutboxRepository } from './outbox.repository.js';

@Module({
  imports: [DatabaseModule, InventoryClientModule, ScheduleModule.forRoot()],
  providers: [
    DrizzleOutboxRepository,
    { provide: OUTBOX_REPOSITORY, useExisting: DrizzleOutboxRepository },
    OutboxProcessor,
  ],
})
export class OutboxModule {}
