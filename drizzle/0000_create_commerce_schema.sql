CREATE SCHEMA IF NOT EXISTS "commerce";
--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "commerce"."cart_status" AS ENUM('ACTIVE', 'CONVERTED', 'ABANDONED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "commerce"."customer_type" AS ENUM('REGISTERED', 'GUEST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "commerce"."delivery_attempt_status" AS ENUM('PENDING', 'IN_TRANSIT', 'FAILED', 'RETURNED_TO_STORE', 'DELIVERED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "commerce"."fulfillment_type" AS ENUM('DELIVERY', 'PICKUP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "commerce"."inventory_reservation_status" AS ENUM('PENDING', 'RESERVED', 'RELEASED', 'DISPATCHED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "commerce"."order_status" AS ENUM('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'ON_DELIVERY', 'DELIVERY_FAILED', 'RETURNED_TO_STORE', 'DELIVERED', 'PICKED_UP', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "commerce"."outbox_event_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "commerce"."payment_method" AS ENUM('CASH', 'BANK_TRANSFER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "commerce"."payment_status" AS ENUM('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REFUNDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commerce"."cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_cart_items_variant" UNIQUE("cart_id","variant_id"),
	CONSTRAINT "chk_cart_items_quantity" CHECK ("commerce"."cart_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commerce"."carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"customer_type" "commerce"."customer_type" NOT NULL,
	"session_id" varchar(180),
	"status" "commerce"."cart_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_carts_customer_reference" CHECK ((
        ("commerce"."carts"."customer_type" = 'REGISTERED' AND "commerce"."carts"."customer_id" IS NOT NULL)
        OR
        ("commerce"."carts"."customer_type" = 'GUEST' AND "commerce"."carts"."customer_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commerce"."delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "commerce"."delivery_attempt_status" DEFAULT 'PENDING' NOT NULL,
	"failure_reason" varchar(180),
	"started_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"registered_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_delivery_attempts_number" UNIQUE("delivery_id","attempt_number"),
	CONSTRAINT "chk_delivery_attempts_number" CHECK ("commerce"."delivery_attempts"."attempt_number" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commerce"."order_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"recipient_name" varchar(180),
	"recipient_phone" varchar(30),
	"municipality" varchar(120) NOT NULL,
	"neighborhood" varchar(120) NOT NULL,
	"address" text NOT NULL,
	"address_reference" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_order_deliveries_order" UNIQUE("order_id"),
	CONSTRAINT "chk_order_deliveries_latitude" CHECK ("commerce"."order_deliveries"."latitude" IS NULL OR "commerce"."order_deliveries"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "chk_order_deliveries_longitude" CHECK ("commerce"."order_deliveries"."longitude" IS NULL OR "commerce"."order_deliveries"."longitude" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commerce"."order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_name_snapshot" varchar(180) NOT NULL,
	"variant_name_snapshot" varchar(180) NOT NULL,
	"sku_snapshot" varchar(100) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cop" bigint NOT NULL,
	"discount_amount_cop" bigint DEFAULT 0 NOT NULL,
	"line_total_cop" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_order_items_quantity" CHECK ("commerce"."order_items"."quantity" > 0),
	CONSTRAINT "chk_order_items_unit_price" CHECK ("commerce"."order_items"."unit_price_cop" >= 0),
	CONSTRAINT "chk_order_items_discount" CHECK ("commerce"."order_items"."discount_amount_cop" >= 0),
	CONSTRAINT "chk_order_items_line_total" CHECK ("commerce"."order_items"."line_total_cop" >= 0),
	CONSTRAINT "chk_order_items_total_calculation" CHECK ("commerce"."order_items"."line_total_cop" = ("commerce"."order_items"."quantity" * "commerce"."order_items"."unit_price_cop") - "commerce"."order_items"."discount_amount_cop")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commerce"."orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(40) NOT NULL,
	"customer_id" uuid,
	"customer_type" "commerce"."customer_type" NOT NULL,
	"customer_name" varchar(180) NOT NULL,
	"customer_phone" varchar(30) NOT NULL,
	"customer_email" varchar(180),
	"status" "commerce"."order_status" DEFAULT 'PENDING' NOT NULL,
	"fulfillment_type" "commerce"."fulfillment_type" NOT NULL,
	"inventory_reservation_status" "commerce"."inventory_reservation_status" DEFAULT 'PENDING' NOT NULL,
	"subtotal_cop" bigint NOT NULL,
	"discount_cop" bigint DEFAULT 0 NOT NULL,
	"delivery_fee_cop" bigint DEFAULT 0 NOT NULL,
	"total_cop" bigint NOT NULL,
	"notes" text,
	"cancellation_reason" varchar(180),
	"checkout_idempotency_key" varchar(180) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_orders_order_number" UNIQUE("order_number"),
	CONSTRAINT "uq_orders_checkout_idempotency_key" UNIQUE("checkout_idempotency_key"),
	CONSTRAINT "chk_orders_customer_reference" CHECK ((
        ("commerce"."orders"."customer_type" = 'REGISTERED' AND "commerce"."orders"."customer_id" IS NOT NULL)
        OR
        ("commerce"."orders"."customer_type" = 'GUEST' AND "commerce"."orders"."customer_id" IS NULL)
      )),
	CONSTRAINT "chk_orders_subtotal" CHECK ("commerce"."orders"."subtotal_cop" >= 0),
	CONSTRAINT "chk_orders_discount" CHECK ("commerce"."orders"."discount_cop" >= 0),
	CONSTRAINT "chk_orders_delivery_fee" CHECK ("commerce"."orders"."delivery_fee_cop" >= 0),
	CONSTRAINT "chk_orders_total" CHECK ("commerce"."orders"."total_cop" >= 0),
	CONSTRAINT "chk_orders_total_calculation" CHECK ("commerce"."orders"."total_cop" = "commerce"."orders"."subtotal_cop" - "commerce"."orders"."discount_cop" + "commerce"."orders"."delivery_fee_cop")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commerce"."outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" varchar(180) NOT NULL,
	"status" "commerce"."outbox_event_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "uq_outbox_events_idempotency_key" UNIQUE("idempotency_key"),
	CONSTRAINT "chk_outbox_attempts" CHECK ("commerce"."outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commerce"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"method" "commerce"."payment_method" NOT NULL,
	"status" "commerce"."payment_status" DEFAULT 'PENDING' NOT NULL,
	"amount_cop" bigint NOT NULL,
	"reference" varchar(180),
	"proof_path" text,
	"paid_at" timestamp with time zone,
	"verified_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_payments_amount" CHECK ("commerce"."payments"."amount_cop" > 0)
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cart_items_cart' AND conrelid = '"commerce"."cart_items"'::regclass) THEN
		ALTER TABLE "commerce"."cart_items" ADD CONSTRAINT "fk_cart_items_cart" FOREIGN KEY ("cart_id") REFERENCES "commerce"."carts"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_delivery_attempts_delivery' AND conrelid = '"commerce"."delivery_attempts"'::regclass) THEN
		ALTER TABLE "commerce"."delivery_attempts" ADD CONSTRAINT "fk_delivery_attempts_delivery" FOREIGN KEY ("delivery_id") REFERENCES "commerce"."order_deliveries"("id") ON DELETE no action ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_order_deliveries_order' AND conrelid = '"commerce"."order_deliveries"'::regclass) THEN
		ALTER TABLE "commerce"."order_deliveries" ADD CONSTRAINT "fk_order_deliveries_order" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE no action ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_order_items_order' AND conrelid = '"commerce"."order_items"'::regclass) THEN
		ALTER TABLE "commerce"."order_items" ADD CONSTRAINT "fk_order_items_order" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE no action ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_order' AND conrelid = '"commerce"."payments"'::regclass) THEN
		ALTER TABLE "commerce"."payments" ADD CONSTRAINT "fk_payments_order" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cart_items_variant" ON "commerce"."cart_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_carts_customer" ON "commerce"."carts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_carts_session" ON "commerce"."carts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_carts_status" ON "commerce"."carts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_delivery_attempts_delivery" ON "commerce"."delivery_attempts" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_delivery_attempts_status" ON "commerce"."delivery_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_delivery_attempts_created_at" ON "commerce"."delivery_attempts" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_deliveries_municipality" ON "commerce"."order_deliveries" USING btree ("municipality");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_deliveries_neighborhood" ON "commerce"."order_deliveries" USING btree ("neighborhood");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_items_order" ON "commerce"."order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_items_variant" ON "commerce"."order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_customer" ON "commerce"."orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_status" ON "commerce"."orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_reservation_status" ON "commerce"."orders" USING btree ("inventory_reservation_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_created_at" ON "commerce"."orders" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_fulfillment" ON "commerce"."orders" USING btree ("fulfillment_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_events_status_next_attempt" ON "commerce"."outbox_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_events_aggregate" ON "commerce"."outbox_events" USING btree ("aggregate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_events_created_at" ON "commerce"."outbox_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_order" ON "commerce"."payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_status" ON "commerce"."payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_method" ON "commerce"."payments" USING btree ("method");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_created_at" ON "commerce"."payments" USING btree ("created_at" DESC NULLS LAST);