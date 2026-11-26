import { ServiceUnavailableException } from '@nestjs/common';
import type { InventoryClient } from '../inventory-client/inventory-client.contract.js';
import { InventoryInsufficientStockException } from '../inventory-client/inventory-insufficient-stock.exception.js';
import type { OutboxRepository, ReservationJob } from './outbox.contract.js';
import { OutboxProcessor } from './outbox.processor.js';

describe('OutboxProcessor', () => {
  const job: ReservationJob = {
    id: 'event',
    orderId: 'order',
    idempotencyKey: 'reserve:order',
    attempt: 1,
    items: [{ variantId: 'variant', quantity: 2 }],
  };
  const reservation = {
    reservationId: 'reservation',
    locationId: 'location',
    status: 'ACTIVE',
  } as const;
  let repository: OutboxRepository;
  let inventory: InventoryClient;
  let processor: OutboxProcessor;
  let reserve: ReturnType<typeof vi.fn<InventoryClient['reserve']>>;
  let completeReservation: ReturnType<
    typeof vi.fn<OutboxRepository['completeReservation']>
  >;
  let rejectReservation: ReturnType<
    typeof vi.fn<OutboxRepository['rejectReservation']>
  >;
  let retryReservation: ReturnType<
    typeof vi.fn<OutboxRepository['retryReservation']>
  >;

  beforeEach(() => {
    reserve = vi
      .fn<InventoryClient['reserve']>()
      .mockResolvedValue(reservation);
    completeReservation = vi
      .fn<OutboxRepository['completeReservation']>()
      .mockResolvedValue();
    rejectReservation = vi
      .fn<OutboxRepository['rejectReservation']>()
      .mockResolvedValue();
    retryReservation = vi
      .fn<OutboxRepository['retryReservation']>()
      .mockResolvedValue();
    repository = {
      claimReservation: vi
        .fn<OutboxRepository['claimReservation']>()
        .mockResolvedValue(job),
      completeReservation,
      rejectReservation,
      retryReservation,
    };
    inventory = {
      getAvailability: vi.fn<InventoryClient['getAvailability']>(),
      reserve,
      release: vi.fn<InventoryClient['release']>(),
      dispatch: vi.fn<InventoryClient['dispatch']>(),
      registerReturn: vi.fn<InventoryClient['registerReturn']>(),
    };
    processor = new OutboxProcessor(repository, inventory);
  });

  it('completes a confirmed reservation', async () => {
    await processor.process();
    expect(reserve).toHaveBeenCalledWith(
      job.orderId,
      job.idempotencyKey,
      job.items,
    );
    expect(completeReservation).toHaveBeenCalledWith(job, reservation);
  });

  it('retries an unknown outcome using the same reservation key', async () => {
    reserve
      .mockRejectedValueOnce(new ServiceUnavailableException('timeout'))
      .mockResolvedValueOnce(reservation);
    await processor.process();
    await processor.process();
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(reserve.mock.calls[1]).toEqual([
      job.orderId,
      job.idempotencyKey,
      job.items,
    ]);
    expect(retryReservation).toHaveBeenCalledOnce();
    expect(completeReservation).toHaveBeenCalledOnce();
  });

  it('rejects a confirmed insufficient-stock result without retrying', async () => {
    reserve.mockRejectedValue(new InventoryInsufficientStockException());
    await processor.process();
    expect(rejectReservation).toHaveBeenCalledWith(job);
    expect(retryReservation).not.toHaveBeenCalled();
  });

  it('retries if Commerce persistence fails after Inventory confirms', async () => {
    completeReservation.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await processor.process();
    await processor.process();
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(retryReservation).toHaveBeenCalledOnce();
  });
});
