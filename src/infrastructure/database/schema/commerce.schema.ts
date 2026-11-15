import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const commerceSchema = pgSchema('commerce');

export const customerTypeEnum = commerceSchema.enum('customer_type', [
  'REGISTERED',
  'GUEST',
]);

export const cartStatusEnum = commerceSchema.enum('cart_status', [
  'ACTIVE',
  'CONVERTED',
  'ABANDONED',
]);

export const fulfillmentTypeEnum = commerceSchema.enum('fulfillment_type', [
  'DELIVERY',
  'PICKUP',
]);

export const orderStatusEnum = commerceSchema.enum('order_status', [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'ON_DELIVERY',
  'DELIVERY_FAILED',
  'RETURNED_TO_STORE',
  'DELIVERED',
  'PICKED_UP',
  'CANCELLED',
]);

export const inventoryReservationStatusEnum = commerceSchema.enum(
  'inventory_reservation_status',
  ['PENDING', 'RESERVED', 'RELEASED', 'DISPATCHED', 'FAILED'],
);

export const paymentMethodEnum = commerceSchema.enum('payment_method', [
  'CASH',
  'BANK_TRANSFER',
]);

export const paymentStatusEnum = commerceSchema.enum('payment_status', [
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'REFUNDED',
  'CANCELLED',
]);

export const deliveryAttemptStatusEnum = commerceSchema.enum(
  'delivery_attempt_status',
  ['PENDING', 'IN_TRANSIT', 'FAILED', 'RETURNED_TO_STORE', 'DELIVERED'],
);

export const outboxEventStatusEnum = commerceSchema.enum(
  'outbox_event_status',
  ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
);

export const carts = commerceSchema.table(
  'carts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id'),
    customerType: customerTypeEnum('customer_type').notNull(),
    sessionId: varchar('session_id', { length: 180 }),
    status: cartStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    customerReferenceCheck: check(
      'chk_carts_customer_reference',
      sql`(
        (${table.customerType} = 'REGISTERED' AND ${table.customerId} IS NOT NULL)
        OR
        (${table.customerType} = 'GUEST' AND ${table.customerId} IS NULL)
      )`,
    ),
    customerIndex: index('idx_carts_customer').on(table.customerId),
    sessionIndex: index('idx_carts_session').on(table.sessionId),
    statusIndex: index('idx_carts_status').on(table.status),
  }),
);

export const cartItems = commerceSchema.table(
  'cart_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cartId: uuid('cart_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    cartForeignKey: foreignKey({
      name: 'fk_cart_items_cart',
      columns: [table.cartId],
      foreignColumns: [carts.id],
    }).onDelete('cascade'),
    variantUnique: unique('uq_cart_items_variant').on(
      table.cartId,
      table.variantId,
    ),
    quantityCheck: check(
      'chk_cart_items_quantity',
      sql`${table.quantity} > 0`,
    ),
    variantIndex: index('idx_cart_items_variant').on(table.variantId),
  }),
);

export const orders = commerceSchema.table(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderNumber: varchar('order_number', { length: 40 }).notNull(),
    customerId: uuid('customer_id'),
    customerType: customerTypeEnum('customer_type').notNull(),
    customerName: varchar('customer_name', { length: 180 }).notNull(),
    customerPhone: varchar('customer_phone', { length: 30 }).notNull(),
    customerEmail: varchar('customer_email', { length: 180 }),
    status: orderStatusEnum('status').notNull().default('PENDING'),
    fulfillmentType: fulfillmentTypeEnum('fulfillment_type').notNull(),
    inventoryReservationStatus: inventoryReservationStatusEnum(
      'inventory_reservation_status',
    )
      .notNull()
      .default('PENDING'),
    subtotalCop: bigint('subtotal_cop', { mode: 'bigint' }).notNull(),
    discountCop: bigint('discount_cop', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    deliveryFeeCop: bigint('delivery_fee_cop', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    totalCop: bigint('total_cop', { mode: 'bigint' }).notNull(),
    notes: text('notes'),
    cancellationReason: varchar('cancellation_reason', { length: 180 }),
    checkoutIdempotencyKey: varchar('checkout_idempotency_key', {
      length: 180,
    }).notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderNumberUnique: unique('uq_orders_order_number').on(table.orderNumber),
    checkoutIdempotencyKeyUnique: unique(
      'uq_orders_checkout_idempotency_key',
    ).on(table.checkoutIdempotencyKey),
    customerReferenceCheck: check(
      'chk_orders_customer_reference',
      sql`(
        (${table.customerType} = 'REGISTERED' AND ${table.customerId} IS NOT NULL)
        OR
        (${table.customerType} = 'GUEST' AND ${table.customerId} IS NULL)
      )`,
    ),
    subtotalCheck: check(
      'chk_orders_subtotal',
      sql`${table.subtotalCop} >= 0`,
    ),
    discountCheck: check(
      'chk_orders_discount',
      sql`${table.discountCop} >= 0`,
    ),
    deliveryFeeCheck: check(
      'chk_orders_delivery_fee',
      sql`${table.deliveryFeeCop} >= 0`,
    ),
    totalCheck: check('chk_orders_total', sql`${table.totalCop} >= 0`),
    totalCalculationCheck: check(
      'chk_orders_total_calculation',
      sql`${table.totalCop} = ${table.subtotalCop} - ${table.discountCop} + ${table.deliveryFeeCop}`,
    ),
    customerIndex: index('idx_orders_customer').on(table.customerId),
    statusIndex: index('idx_orders_status').on(table.status),
    reservationStatusIndex: index('idx_orders_reservation_status').on(
      table.inventoryReservationStatus,
    ),
    createdAtIndex: index('idx_orders_created_at').on(
      table.createdAt.desc(),
    ),
    fulfillmentIndex: index('idx_orders_fulfillment').on(
      table.fulfillmentType,
    ),
  }),
);

export const orderInventoryReservations = commerceSchema.table(
  'order_inventory_reservations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id').notNull(),
    reservationId: uuid('reservation_id').notNull(),
    locationId: uuid('location_id').notNull(),
    status: inventoryReservationStatusEnum('status')
      .notNull()
      .default('RESERVED'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderForeignKey: foreignKey({
      name: 'fk_order_inventory_reservations_order',
      columns: [table.orderId],
      foreignColumns: [orders.id],
    }),
    reservationUnique: unique(
      'uq_order_inventory_reservations_reservation_id',
    ).on(table.reservationId),
    orderIndex: index('idx_order_inventory_reservations_order').on(
      table.orderId,
    ),
    locationIndex: index('idx_order_inventory_reservations_location').on(
      table.locationId,
    ),
    statusIndex: index('idx_order_inventory_reservations_status').on(
      table.status,
    ),
  }),
);

export const orderItems = commerceSchema.table(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    productNameSnapshot: varchar('product_name_snapshot', {
      length: 180,
    }).notNull(),
    variantNameSnapshot: varchar('variant_name_snapshot', {
      length: 180,
    }).notNull(),
    skuSnapshot: varchar('sku_snapshot', { length: 100 }).notNull(),
    quantity: integer('quantity').notNull(),
    unitPriceCop: bigint('unit_price_cop', { mode: 'bigint' }).notNull(),
    discountAmountCop: bigint('discount_amount_cop', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    lineTotalCop: bigint('line_total_cop', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderForeignKey: foreignKey({
      name: 'fk_order_items_order',
      columns: [table.orderId],
      foreignColumns: [orders.id],
    }),
    quantityCheck: check(
      'chk_order_items_quantity',
      sql`${table.quantity} > 0`,
    ),
    unitPriceCheck: check(
      'chk_order_items_unit_price',
      sql`${table.unitPriceCop} >= 0`,
    ),
    discountCheck: check(
      'chk_order_items_discount',
      sql`${table.discountAmountCop} >= 0`,
    ),
    lineTotalCheck: check(
      'chk_order_items_line_total',
      sql`${table.lineTotalCop} >= 0`,
    ),
    totalCalculationCheck: check(
      'chk_order_items_total_calculation',
      sql`${table.lineTotalCop} = (${table.quantity} * ${table.unitPriceCop}) - ${table.discountAmountCop}`,
    ),
    orderIndex: index('idx_order_items_order').on(table.orderId),
    variantIndex: index('idx_order_items_variant').on(table.variantId),
  }),
);

export const payments = commerceSchema.table(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id').notNull(),
    method: paymentMethodEnum('method').notNull(),
    status: paymentStatusEnum('status').notNull().default('PENDING'),
    amountCop: bigint('amount_cop', { mode: 'bigint' }).notNull(),
    reference: varchar('reference', { length: 180 }),
    proofPath: text('proof_path'),
    paidAt: timestamp('paid_at', {
      withTimezone: true,
      mode: 'date',
    }),
    verifiedBy: uuid('verified_by'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderForeignKey: foreignKey({
      name: 'fk_payments_order',
      columns: [table.orderId],
      foreignColumns: [orders.id],
    }),
    amountCheck: check('chk_payments_amount', sql`${table.amountCop} > 0`),
    orderIndex: index('idx_payments_order').on(table.orderId),
    statusIndex: index('idx_payments_status').on(table.status),
    methodIndex: index('idx_payments_method').on(table.method),
    createdAtIndex: index('idx_payments_created_at').on(
      table.createdAt.desc(),
    ),
  }),
);

export const orderDeliveries = commerceSchema.table(
  'order_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id').notNull(),
    recipientName: varchar('recipient_name', { length: 180 }),
    recipientPhone: varchar('recipient_phone', { length: 30 }),
    municipality: varchar('municipality', { length: 120 }).notNull(),
    neighborhood: varchar('neighborhood', { length: 120 }).notNull(),
    address: text('address').notNull(),
    addressReference: text('address_reference'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderForeignKey: foreignKey({
      name: 'fk_order_deliveries_order',
      columns: [table.orderId],
      foreignColumns: [orders.id],
    }),
    orderUnique: unique('uq_order_deliveries_order').on(table.orderId),
    latitudeCheck: check(
      'chk_order_deliveries_latitude',
      sql`${table.latitude} IS NULL OR ${table.latitude} BETWEEN -90 AND 90`,
    ),
    longitudeCheck: check(
      'chk_order_deliveries_longitude',
      sql`${table.longitude} IS NULL OR ${table.longitude} BETWEEN -180 AND 180`,
    ),
    municipalityIndex: index('idx_order_deliveries_municipality').on(
      table.municipality,
    ),
    neighborhoodIndex: index('idx_order_deliveries_neighborhood').on(
      table.neighborhood,
    ),
  }),
);

export const deliveryAttempts = commerceSchema.table(
  'delivery_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deliveryId: uuid('delivery_id').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    status: deliveryAttemptStatusEnum('status')
      .notNull()
      .default('PENDING'),
    failureReason: varchar('failure_reason', { length: 180 }),
    startedAt: timestamp('started_at', {
      withTimezone: true,
      mode: 'date',
    }),
    failedAt: timestamp('failed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    returnedAt: timestamp('returned_at', {
      withTimezone: true,
      mode: 'date',
    }),
    deliveredAt: timestamp('delivered_at', {
      withTimezone: true,
      mode: 'date',
    }),
    registeredBy: uuid('registered_by'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    deliveryForeignKey: foreignKey({
      name: 'fk_delivery_attempts_delivery',
      columns: [table.deliveryId],
      foreignColumns: [orderDeliveries.id],
    }),
    deliveryAttemptUnique: unique('uq_delivery_attempts_number').on(
      table.deliveryId,
      table.attemptNumber,
    ),
    attemptNumberCheck: check(
      'chk_delivery_attempts_number',
      sql`${table.attemptNumber} > 0`,
    ),
    deliveryIndex: index('idx_delivery_attempts_delivery').on(
      table.deliveryId,
    ),
    statusIndex: index('idx_delivery_attempts_status').on(table.status),
    createdAtIndex: index('idx_delivery_attempts_created_at').on(
      table.createdAt.desc(),
    ),
  }),
);

export const outboxEvents = commerceSchema.table(
  'outbox_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventType: varchar('event_type', { length: 120 }).notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 180 }).notNull(),
    status: outboxEventStatusEnum('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => ({
    idempotencyKeyUnique: unique('uq_outbox_events_idempotency_key').on(
      table.idempotencyKey,
    ),
    attemptsCheck: check(
      'chk_outbox_attempts',
      sql`${table.attempts} >= 0`,
    ),
    statusNextAttemptIndex: index(
      'idx_outbox_events_status_next_attempt',
    ).on(table.status, table.nextAttemptAt),
    aggregateIndex: index('idx_outbox_events_aggregate').on(
      table.aggregateId,
    ),
    createdAtIndex: index('idx_outbox_events_created_at').on(
      table.createdAt,
    ),
  }),
);
