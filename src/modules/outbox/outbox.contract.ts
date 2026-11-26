import type {
  InventoryItem,
  InventoryReservation,
} from '../inventory-client/inventory-client.contract.js';

export const OUTBOX_REPOSITORY = Symbol('OUTBOX_REPOSITORY');

export interface ReservationJob {
  readonly id: string;
  readonly orderId: string;
  readonly idempotencyKey: string;
  readonly attempt: number;
  readonly items: readonly InventoryItem[];
}

export interface OutboxRepository {
  claimReservation(): Promise<ReservationJob | null>;
  completeReservation(
    job: ReservationJob,
    reservation: InventoryReservation,
  ): Promise<void>;
  rejectReservation(job: ReservationJob): Promise<void>;
  retryReservation(job: ReservationJob, message: string): Promise<void>;
}
