import { Injectable } from '@nestjs/common';
import type {
  CartRecord,
  CartItemRecord,
  CartWithItems,
  OrderDetails,
  OrderRecord,
  PaymentRecord,
} from './commerce.repository.port.js';

export interface CartItemResponse {
  readonly id: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CartResponse {
  readonly id: string;
  readonly sessionId: string | null;
  readonly status: CartRecord['status'];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CartWithItemsResponse extends CartResponse {
  readonly items: readonly CartItemResponse[];
}

export interface CartAvailabilityResponse {
  readonly variantId: string;
  readonly quantityRequested: number;
  readonly quantityAvailable: number;
  readonly isAvailable: boolean;
}

export interface OrderSummaryResponse {
  readonly id: string;
  readonly orderNumber: string;
  readonly customerType: OrderRecord['customerType'];
  readonly customerName: string;
  readonly customerPhone: string;
  readonly customerEmail: string | null;
  readonly status: OrderRecord['status'];
  readonly fulfillmentType: OrderRecord['fulfillmentType'];
  readonly inventoryReservationStatus: OrderRecord['inventoryReservationStatus'];
  readonly subtotalCop: string;
  readonly discountCop: string;
  readonly deliveryFeeCop: string;
  readonly totalCop: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PaymentResponse {
  readonly id: string;
  readonly orderId: string;
  readonly method: PaymentRecord['method'];
  readonly status: PaymentRecord['status'];
  readonly amountCop: string;
  readonly reference: string | null;
  readonly paidAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OrderDetailsResponse extends OrderSummaryResponse {
  readonly notes: string | null;
  readonly cancellationReason: string | null;
  readonly items: readonly {
    readonly id: string;
    readonly variantId: string;
    readonly productNameSnapshot: string;
    readonly variantNameSnapshot: string;
    readonly skuSnapshot: string;
    readonly quantity: number;
    readonly unitPriceCop: string;
    readonly discountAmountCop: string;
    readonly lineTotalCop: string;
    readonly createdAt: Date;
  }[];
  readonly payments: readonly PaymentResponse[];
  readonly delivery: {
    readonly recipientName: string | null;
    readonly recipientPhone: string | null;
    readonly municipality: string;
    readonly neighborhood: string;
    readonly address: string;
    readonly addressReference: string | null;
    readonly latitude: string | null;
    readonly longitude: string | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  } | null;
  readonly inventoryReservations: readonly {
    readonly reservationId: string;
    readonly locationId: string;
    readonly status: OrderDetails['inventoryReservations'][number]['status'];
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }[];
}

@Injectable()
export class CommerceResponseMapper {
  mapCart(cart: CartRecord): CartResponse {
    return {
      id: cart.id,
      sessionId: cart.sessionId,
      status: cart.status,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    };
  }

  mapCartWithItems(cart: CartWithItems): CartWithItemsResponse {
    return {
      ...this.mapCart(cart),
      items: cart.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        quantity: item.quantity,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  mapCartItem(item: CartItemRecord): CartItemResponse {
    return {
      id: item.id,
      variantId: item.variantId,
      quantity: item.quantity,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  mapOrderSummary(order: OrderRecord): OrderSummaryResponse {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerType: order.customerType,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      status: order.status,
      fulfillmentType: order.fulfillmentType,
      inventoryReservationStatus: order.inventoryReservationStatus,
      subtotalCop: order.subtotalCop.toString(),
      discountCop: order.discountCop.toString(),
      deliveryFeeCop: order.deliveryFeeCop.toString(),
      totalCop: order.totalCop.toString(),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  mapOrder(order: OrderDetails): OrderDetailsResponse {
    return {
      ...this.mapOrderSummary(order),
      notes: order.notes,
      cancellationReason: order.cancellationReason,
      items: order.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        productNameSnapshot: item.productNameSnapshot,
        variantNameSnapshot: item.variantNameSnapshot,
        skuSnapshot: item.skuSnapshot,
        quantity: item.quantity,
        unitPriceCop: item.unitPriceCop.toString(),
        discountAmountCop: item.discountAmountCop.toString(),
        lineTotalCop: item.lineTotalCop.toString(),
        createdAt: item.createdAt,
      })),
      payments: order.payments.map((payment) => this.mapPayment(payment)),
      delivery: order.delivery
        ? {
            recipientName: order.delivery.recipientName,
            recipientPhone: order.delivery.recipientPhone,
            municipality: order.delivery.municipality,
            neighborhood: order.delivery.neighborhood,
            address: order.delivery.address,
            addressReference: order.delivery.addressReference,
            latitude: order.delivery.latitude,
            longitude: order.delivery.longitude,
            createdAt: order.delivery.createdAt,
            updatedAt: order.delivery.updatedAt,
          }
        : null,
      inventoryReservations: order.inventoryReservations.map(
        (reservation) => ({
          reservationId: reservation.reservationId,
          locationId: reservation.locationId,
          status: reservation.status,
          createdAt: reservation.createdAt,
          updatedAt: reservation.updatedAt,
        }),
      ),
    };
  }

  mapPayment(payment: PaymentRecord): PaymentResponse {
    return {
      id: payment.id,
      orderId: payment.orderId,
      method: payment.method,
      status: payment.status,
      amountCop: payment.amountCop.toString(),
      reference: payment.reference,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}
