import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { InventoryInsufficientStockException } from './inventory-insufficient-stock.exception.js';
import {
  INVENTORY_HTTP_TRANSPORT,
  type InventoryActor,
  type InventoryAvailability,
  type InventoryClient,
  type InventoryHttpTransport,
  type InventoryItem,
  type InventoryReservation,
  type RegisterStockReturnInput,
} from './inventory-client.contract.js';
import {
  DEFAULT_INVENTORY_TIMEOUT_MS,
  INVENTORY_AVAILABILITY_BATCH_SIZE,
  InventoryPermission,
  MAX_INVENTORY_IDEMPOTENCY_KEY_LENGTH,
  InventoryReservationState,
  InventoryReturnState,
} from './inventory-client.constants.js';

@Injectable()
export class InventoryClientService implements InventoryClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly locationId: string;
  private readonly timeoutMs: number;

  constructor(
    configService: ConfigService,
    @Inject(INVENTORY_HTTP_TRANSPORT)
    private readonly transport: InventoryHttpTransport,
  ) {
    this.baseUrl = configService.getOrThrow<string>('INVENTORY_API_URL')
      .replace(/\/+$/, '');
    this.token = configService.getOrThrow<string>('INVENTORY_SERVICE_TOKEN');
    this.locationId = configService.getOrThrow<string>(
      'INVENTORY_LOCATION_ID',
    );
    this.timeoutMs = Number(
      configService.get<string>(
        'INVENTORY_TIMEOUT_MS',
        String(DEFAULT_INVENTORY_TIMEOUT_MS),
      ),
    );
  }

  async getAvailability(
    variantIds: readonly string[],
  ): Promise<readonly InventoryAvailability[]> {
    const availability: InventoryAvailability[] = [];
    for (
      let offset = 0;
      offset < variantIds.length;
      offset += INVENTORY_AVAILABILITY_BATCH_SIZE
    ) {
      const batch = variantIds.slice(
        offset,
        offset + INVENTORY_AVAILABILITY_BATCH_SIZE,
      );
      const query = new URLSearchParams({ locationId: this.locationId });
      for (const variantId of batch) {
        query.append('variantIds', variantId);
      }
      const response = await this.request(
        '/internal/v1/stock/availability',
        'GET',
        InventoryPermission.STOCK_READ,
        undefined,
        undefined,
        query,
      );
      availability.push(...this.parseAvailability(response, batch));
    }
    return availability;
  }

  async reserve(
    orderId: string,
    idempotencyKey: string,
    items: readonly InventoryItem[],
    actor?: InventoryActor,
  ): Promise<InventoryReservation> {
    this.assertIdempotencyKey(idempotencyKey);
    const response = await this.request(
      '/internal/v1/stock/reservations',
      'POST',
      InventoryPermission.STOCK_RESERVE,
      {
        orderId,
        locationId: this.locationId,
        idempotencyKey,
        items,
      },
      actor,
    );
    return this.parseReservation(
      response,
      orderId,
      InventoryReservationState.ACTIVE,
    );
  }

  async release(
    orderId: string,
    idempotencyKey: string,
    reason: string,
    actor: InventoryActor,
  ): Promise<InventoryReservation> {
    this.assertIdempotencyKey(idempotencyKey);
    const response = await this.request(
      `/internal/v1/stock/reservations/${orderId}/release`,
      'POST',
      InventoryPermission.STOCK_RELEASE,
      { idempotencyKey, reason },
      actor,
    );
    return this.parseReservation(
      response,
      orderId,
      InventoryReservationState.RELEASED,
    );
  }

  async dispatch(
    orderId: string,
    idempotencyKey: string,
    actor: InventoryActor,
  ): Promise<InventoryReservation> {
    this.assertIdempotencyKey(idempotencyKey);
    const response = await this.request(
      `/internal/v1/stock/reservations/${orderId}/dispatch`,
      'POST',
      InventoryPermission.STOCK_DISPATCH,
      { idempotencyKey },
      actor,
    );
    return this.parseReservation(
      response,
      orderId,
      InventoryReservationState.DISPATCHED,
    );
  }

  async registerReturn(
    input: RegisterStockReturnInput,
    actor: InventoryActor,
  ): Promise<void> {
    this.assertIdempotencyKey(input.idempotencyKey);
    const response = await this.request(
      '/internal/v1/stock/returns',
      'POST',
      InventoryPermission.STOCK_RETURN,
      {
        ...input,
        locationId: this.locationId,
      },
      actor,
    );
    if (
      !isRecord(response) ||
      typeof response.returnId !== 'string' ||
      !isUUID(response.returnId, '4') ||
      response.orderId !== input.orderId ||
      response.locationId !== this.locationId ||
      response.status !== InventoryReturnState.PROCESSED ||
      response.deliveryAttemptId !== (input.deliveryAttemptId ?? null) ||
      !Array.isArray(response.items) ||
      response.items.length !== input.items.length
    ) {
      throw new BadGatewayException(
        'Inventory returned an invalid stock-return response.',
      );
    }

    const requestedItems = new Map(
      input.items.map((item) => [
        item.variantId,
        [item.quantityReceived, item.quantityRestockable],
      ]),
    );
    const receivedVariantIds = new Set<string>();
    const responseItems: readonly unknown[] = response.items;
    for (const item of responseItems) {
      if (
        !isRecord(item) ||
        typeof item.variantId !== 'string' ||
        !isUUID(item.variantId, '4') ||
        typeof item.quantityReceived !== 'number' ||
        typeof item.quantityRestockable !== 'number'
      ) {
        throw new BadGatewayException(
          'Inventory returned an invalid stock-return response.',
        );
      }
      const requestedQuantities = requestedItems.get(item.variantId);
      if (
        !requestedQuantities ||
        receivedVariantIds.has(item.variantId) ||
        item.quantityReceived !== requestedQuantities[0] ||
        item.quantityRestockable !== requestedQuantities[1]
      ) {
        throw new BadGatewayException(
          'Inventory returned a stock-return response that does not match the request.',
        );
      }
      receivedVariantIds.add(item.variantId);
    }
  }

  private async request(
    path: string,
    method: 'GET' | 'POST',
    permission: InventoryPermission,
    body?: object,
    actor?: InventoryActor,
    query?: URLSearchParams,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
      'content-type': 'application/json',
      'x-actor-permissions': permission,
    };
    if (actor) {
      headers['x-actor-id'] = actor.id;
    }

    let response: Response;
    try {
      const url = new URL(path, `${this.baseUrl}/`);
      if (query) {
        url.search = query.toString();
      }
      response = await this.transport.fetch(url, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        'Inventory service is unavailable.',
        { cause: error },
      );
    }

    if (!response.ok) {
      if (response.status === HttpStatus.UNAUTHORIZED) {
        throw new UnauthorizedException(
          'Inventory rejected the configured service credentials.',
        );
      }
      if (response.status === HttpStatus.FORBIDDEN) {
        throw new ForbiddenException(
          'Inventory rejected the actor permissions for this operation.',
        );
      }
      if (response.status === HttpStatus.NOT_FOUND) {
        throw new NotFoundException('Inventory resource was not found.');
      }
      if (response.status === HttpStatus.CONFLICT) {
        if (path === '/internal/v1/stock/reservations') {
          let errorPayload: unknown;
          try {
            errorPayload = await response.json();
          } catch (error) {
            throw new BadGatewayException(
              'Inventory returned an invalid conflict response.',
              { cause: error },
            );
          }
          if (
            isRecord(errorPayload) &&
            typeof errorPayload.message === 'string' &&
            /^Insufficient available stock for variant [0-9a-f-]{36}$/i.test(
              errorPayload.message,
            )
          ) {
            throw new InventoryInsufficientStockException();
          }
        }
        throw new ConflictException('Inventory rejected the stock operation.');
      }
      if (response.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        throw new ServiceUnavailableException(
          `Inventory service failed with status ${response.status}.`,
        );
      }
      throw new BadGatewayException(
        `Inventory service rejected the request with status ${response.status}.`,
      );
    }

    if (response.status === HttpStatus.NO_CONTENT) {
      return null;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new BadGatewayException(
        'Inventory returned an invalid JSON response.',
        { cause: error },
      );
    }

    return payload;
  }

  private parseAvailability(
    response: unknown,
    requestedVariantIds: readonly string[],
  ): readonly InventoryAvailability[] {
    if (!Array.isArray(response)) {
      throw new BadGatewayException(
        'Inventory returned an invalid stock-availability response.',
      );
    }

    const entries: readonly unknown[] = response;
    const requestedIds = new Set(requestedVariantIds);
    const receivedIds = new Set<string>();
    const availability: InventoryAvailability[] = [];
    for (const entry of entries) {
      if (
        !isRecord(entry) ||
        typeof entry.variantId !== 'string' ||
        !isUUID(entry.variantId, '4') ||
        entry.locationId !== this.locationId ||
        typeof entry.quantityAvailable !== 'number' ||
        !Number.isSafeInteger(entry.quantityAvailable) ||
        entry.quantityAvailable < 0 ||
        !requestedIds.has(entry.variantId) ||
        receivedIds.has(entry.variantId)
      ) {
        throw new BadGatewayException(
          'Inventory returned an invalid stock-availability response.',
        );
      }
      receivedIds.add(entry.variantId);
      availability.push({
        variantId: entry.variantId,
        quantityAvailable: entry.quantityAvailable,
      });
    }

    if (receivedIds.size !== requestedIds.size) {
      throw new BadGatewayException(
        'Inventory returned incomplete stock-availability results.',
      );
    }
    return availability;
  }

  private parseReservation(
    response: unknown,
    expectedOrderId: string,
    expectedStatus: InventoryReservation['status'],
  ): InventoryReservation {
    if (
      !isRecord(response) ||
      typeof response.reservationId !== 'string' ||
      typeof response.locationId !== 'string' ||
      response.orderId !== expectedOrderId ||
      !isUUID(response.reservationId, '4') ||
      !isUUID(response.locationId, '4') ||
      response.locationId !== this.locationId ||
      response.status !== expectedStatus
    ) {
      throw new BadGatewayException(
        'Inventory returned an invalid stock-reservation response.',
      );
    }

    return {
      reservationId: response.reservationId,
      locationId: response.locationId,
      status: expectedStatus,
    };
  }

  private assertIdempotencyKey(idempotencyKey: string): void {
    if (
      !idempotencyKey.trim() ||
      idempotencyKey.length > MAX_INVENTORY_IDEMPOTENCY_KEY_LENGTH
    ) {
      throw new BadRequestException(
        `Inventory idempotency keys must contain between 1 and ${MAX_INVENTORY_IDEMPOTENCY_KEY_LENGTH} characters.`,
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
