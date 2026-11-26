import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OUTBOX_POLL_INTERVAL_MS } from '../commerce/checkout.constants.js';
import {
  INVENTORY_CLIENT,
  type InventoryClient,
} from '../inventory-client/inventory-client.contract.js';
import { InventoryInsufficientStockException } from '../inventory-client/inventory-insufficient-stock.exception.js';
import { OUTBOX_REPOSITORY, type OutboxRepository } from './outbox.contract.js';

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private running = false;

  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly repository: OutboxRepository,
    @Inject(INVENTORY_CLIENT) private readonly inventory: InventoryClient,
  ) {}

  @Interval(OUTBOX_POLL_INTERVAL_MS)
  async process(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const job = await this.repository.claimReservation();
      if (!job) {
        return;
      }
      try {
        const reservation = await this.inventory.reserve(
          job.orderId,
          job.idempotencyKey,
          job.items,
        );
        await this.repository.completeReservation(job, reservation);
      } catch (error) {
        if (error instanceof InventoryInsufficientStockException) {
          await this.repository.rejectReservation(job);
          return;
        }
        const message =
          error instanceof HttpException
            ? error.message
            : 'Reservation processing failed.';
        this.logger.error(`Reservation event ${job.id} failed: ${message}`);
        await this.repository.retryReservation(job, message);
      }
    } catch (error) {
      this.logger.error(
        'Outbox processing failed; the event will remain recoverable.',
        error instanceof Error ? error.name : 'Unknown error',
      );
    } finally {
      this.running = false;
    }
  }
}
