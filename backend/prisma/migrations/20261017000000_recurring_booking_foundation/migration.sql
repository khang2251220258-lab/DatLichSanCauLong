-- Additive recurring-booking foundation. Existing bookings remain ungrouped (NULL booking_series_id).
CREATE TABLE "booking_series" (
    "id" BIGSERIAL NOT NULL,
    "customer_id" BIGINT NOT NULL,
    "facility_id" BIGINT NOT NULL,
    "court_id" BIGINT NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "occurrence_count" SMALLINT NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "confirmation_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "total_amount" DECIMAL(12,0) NOT NULL,
    "deposit_amount" DECIMAL(12,0) NOT NULL,
    "remaining_amount" DECIMAL(12,0) NOT NULL,
    "bank_name_snapshot" VARCHAR(150) NOT NULL,
    "account_number_snapshot" VARCHAR(50) NOT NULL,
    "account_holder_snapshot" VARCHAR(150) NOT NULL,
    "qr_image_path_snapshot" VARCHAR(1024),
    "facility_name_snapshot" VARCHAR(200) NOT NULL,
    "facility_address_snapshot" VARCHAR(500) NOT NULL,
    "court_name_snapshot" VARCHAR(100) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by_user_id" BIGINT,
    "rejected_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "booking_series_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_series_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7),
    CONSTRAINT "booking_series_time_check" CHECK (
      "start_time" < "end_time"
      AND EXTRACT(SECOND FROM "start_time") = 0 AND EXTRACT(SECOND FROM "end_time") = 0
      AND EXTRACT(MINUTE FROM "start_time") IN (0, 30) AND EXTRACT(MINUTE FROM "end_time") IN (0, 30)
      AND "end_time" - "start_time" <= INTERVAL '3 hours'
    ),
    CONSTRAINT "booking_series_date_check" CHECK (
      "starts_on" <= "ends_on" AND ("ends_on" - "starts_on") <= 92
    ),
    CONSTRAINT "booking_series_occurrence_count_check" CHECK ("occurrence_count" BETWEEN 1 AND 14),
    CONSTRAINT "booking_series_status_check" CHECK ("status" IN ('PENDING_CONFIRMATION','CONFIRMED','REJECTED','EXPIRED')),
    CONSTRAINT "booking_series_amount_check" CHECK (
      "total_amount" >= 0 AND "deposit_amount" >= 0 AND "remaining_amount" >= 0
      AND "deposit_amount" + "remaining_amount" = "total_amount"
    )
);

ALTER TABLE "bookings" ADD COLUMN "booking_series_id" BIGINT;

CREATE INDEX "booking_series_customer_id_created_at_idx" ON "booking_series"("customer_id", "created_at");
CREATE INDEX "booking_series_facility_id_status_created_at_idx" ON "booking_series"("facility_id", "status", "created_at");
CREATE INDEX "booking_series_court_id_starts_on_ends_on_idx" ON "booking_series"("court_id", "starts_on", "ends_on");
CREATE UNIQUE INDEX "bookings_booking_series_id_start_at_key" ON "bookings"("booking_series_id", "start_at");

ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_confirmed_by_user_id_fkey"
  FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_facility_id_fkey"
  FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_court_id_fkey"
  FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_booking_series_id_fkey"
  FOREIGN KEY ("booking_series_id") REFERENCES "booking_series"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
