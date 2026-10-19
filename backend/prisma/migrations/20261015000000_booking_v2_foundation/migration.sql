-- Booking V2 foundation is additive. Existing rows remain V1 via the default/backfill.
ALTER TABLE "bookings"
  ADD COLUMN "booking_flow_version" SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN "confirmation_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "confirmed_by_user_id" BIGINT;

ALTER TABLE "bookings" ADD CONSTRAINT "m15_bookings_flow_version_check"
  CHECK ("booking_flow_version" IN (1, 2));

ALTER TABLE "bookings" ADD CONSTRAINT "m15_bookings_confirmation_deadline_check"
  CHECK (
    ("booking_flow_version" = 1 AND "confirmation_expires_at" IS NULL)
    OR
    ("booking_flow_version" = 2 AND "confirmation_expires_at" IS NOT NULL)
  );

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_confirmed_by_user_id_fkey"
  FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
