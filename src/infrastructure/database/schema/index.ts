import { relations } from 'drizzle-orm';
import * as tables from './commerce.schema.js';
import {
  carts,
  cartItems,
  deliveryAttempts,
  orderDeliveries,
  orderInventoryReservations,
  orderItems,
  orders,
  payments,
} from './commerce.schema.js';

export * from './commerce.schema.js';

export const cartsRelations = relations(carts, ({ many }) => ({
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, {
    fields: [cartItems.cartId],
    references: [carts.id],
  }),
}));

export const ordersRelations = relations(orders, ({ many, one }) => ({
  items: many(orderItems),
  payments: many(payments),
  delivery: one(orderDeliveries),
  inventoryReservations: many(orderInventoryReservations),
}));

export const orderInventoryReservationsRelations = relations(
  orderInventoryReservations,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderInventoryReservations.orderId],
      references: [orders.id],
    }),
  }),
);

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
}));

export const orderDeliveriesRelations = relations(
  orderDeliveries,
  ({ many, one }) => ({
    order: one(orders, {
      fields: [orderDeliveries.orderId],
      references: [orders.id],
    }),
    attempts: many(deliveryAttempts),
  }),
);

export const deliveryAttemptsRelations = relations(
  deliveryAttempts,
  ({ one }) => ({
    delivery: one(orderDeliveries, {
      fields: [deliveryAttempts.deliveryId],
      references: [orderDeliveries.id],
    }),
  }),
);

export const schema = {
  ...tables,
  cartsRelations,
  cartItemsRelations,
  ordersRelations,
  orderInventoryReservationsRelations,
  orderItemsRelations,
  paymentsRelations,
  orderDeliveriesRelations,
  deliveryAttemptsRelations,
};
