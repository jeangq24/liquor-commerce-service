import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CommerceActor } from '../../common/security/commerce-actor.js';

export type InventoryActor = CommerceActor;

export interface InventoryItem {
  readonly variantId: string;
  readonly quantity: number;
}

export interface InventoryReservation {
  readonly reservationId: string;
  readonly locationId: string;
  readonly status: 'ACTIVE' | 'RELEASED' | 'DISPATCHED';
}

export interface StockReturnItem {
  readonly variantId: string;
  readonly quantityReceived: number;
  readonly quantityRestockable: number;
  readonly reason?: string;
}

@Injectable()
export class InventoryClientService {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly locationId: string;
  private readonly timeoutMs: number;

  constructor(configService: ConfigService) {
    this.baseUrl = configService.getOrThrow<string>('INVENTORY_API_URL')
      .replace(/\/+$/, '');
    this.token = configService.getOrThrow<string>('INVENTORY_SERVICE_TOKEN');
    this.locationId = configService.getOrThrow<string>(
      'INVENTORY_LOCATION_ID',
    );
    this.timeoutMs = Number(
      configService.get<string>('INVENTORY_TIMEOUT_MS', '5000'),
    );
  }

  async reserve(
    orderId: string,
    idempotencyKey: string,
    items: readonly InventoryItem[],
    actor?: InventoryActor,
  ): Promise<InventoryReservation> {
    const response = await this.request(
      '/internal/v1/stock/reservations',
      'POST',
      'inventory.stock.reserve',
      {
        orderId,
        locationId: this.locationId,
        idempotencyKey,
        items,
      },
      actor,
    );
    return this.parseReservation(response, 'ACTIVE');
  }

  async release(
    orderId: string,
    idempotencyKey: string,
    reason: string,
    actor: InventoryActor,
  ): Promise<InventoryReservation> {
    const response = await this.request(
      `/internal/v1/stock/reservations/${orderId}/release`,
      'POST',
      'inventory.stock.release',
      { idempotencyKey, reason },
      actor,
    );
    return this.parseReservation(response, 'RELEASED');
  }

  async dispatch(
    orderId: string,
    idempotencyKey: string,
    actor: InventoryActor,
  ): Promise<InventoryReservation> {
    const response = await this.request(
      `/internal/v1/stock/reservations/${orderId}/dispatch`,
      'POST',
      'inventory.stock.dispatch',
      { idempotencyKey },
      actor,
    );
    return this.parseReservation(response, 'DISPATCHED');
  }

  async registerReturn(
    input: {
      readonly orderId: string;
      readonly idempotencyKey: string;
      readonly reason: string;
      readonly deliveryAttemptId?: string;
      readonly items: readonly StockReturnItem[];
    },
    actor: InventoryActor,
  ): Promise<void> {
    await this.request(
      '/internal/v1/stock/returns',
      'POST',
      'inventory.stock.return',
      {
        ...input,
        locationId: this.locationId,
      },
      actor,
    );
  }

  private async request(
    path: string,
    method: 'POST',
    permission: string,
    body: object,
    actor?: InventoryActor,
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
      response = await fetch(new URL(path, `${this.baseUrl}/`), {
        method,
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        'Inventory service is unavailable.',
        { cause: error },
      );
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new UnauthorizedException(
          'Inventory rejected the configured service credentials.',
        );
      }
      if (response.status === 403) {
        throw new ForbiddenException(
          'Inventory rejected the actor permissions for this operation.',
        );
      }
      if (response.status === 404) {
        throw new NotFoundException('Inventory resource was not found.');
      }
      if (response.status === 409) {
        throw new ConflictException('Inventory rejected the stock operation.');
      }
      if (response.status >= 500) {
        throw new ServiceUnavailableException(
          `Inventory service failed with status ${response.status}.`,
        );
      }
      throw new BadGatewayException(
        `Inventory service rejected the request with status ${response.status}.`,
      );
    }

    if (response.status === 204) {
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

  private parseReservation(
    response: unknown,
    expectedStatus: InventoryReservation['status'],
  ): InventoryReservation {
    if (
      !isRecord(response) ||
      typeof response.reservationId !== 'string' ||
      typeof response.locationId !== 'string' ||
      !isUuid(response.reservationId) ||
      !isUuid(response.locationId) ||
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
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
