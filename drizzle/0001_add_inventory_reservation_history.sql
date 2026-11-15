CREATE TABLE IF NOT EXISTS "commerce"."order_inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"status" "commerce"."inventory_reservation_status" DEFAULT 'RESERVED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_order_inventory_reservations_reservation_id' AND conrelid = '"commerce"."order_inventory_reservations"'::regclass) THEN
		ALTER TABLE "commerce"."order_inventory_reservations" ADD CONSTRAINT "uq_order_inventory_reservations_reservation_id" UNIQUE ("reservation_id");
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_order_inventory_reservations_order' AND conrelid = '"commerce"."order_inventory_reservations"'::regclass) THEN
		ALTER TABLE "commerce"."order_inventory_reservations" ADD CONSTRAINT "fk_order_inventory_reservations_order" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_inventory_reservations_order" ON "commerce"."order_inventory_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_inventory_reservations_location" ON "commerce"."order_inventory_reservations" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_inventory_reservations_status" ON "commerce"."order_inventory_reservations" USING btree ("status");