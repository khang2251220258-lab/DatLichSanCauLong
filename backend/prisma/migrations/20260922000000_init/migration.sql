-- Initial migration draft for review only. NOT APPLIED.
-- Generated offline by Prisma 7.10.0 migrate diff --from-empty --to-schema prisma/schema.prisma --script.
-- Do not regenerate over the manual CHECK section without preserving M01-M16.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "email_normalized" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255),
    "google_subject" VARCHAR(255),
    "full_name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(30),
    "avatar_path" VARCHAR(1024),
    "role" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "locked_at" TIMESTAMPTZ(3),
    "locked_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "csrf_token" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "invalidated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_profiles" (
    "user_id" BIGINT NOT NULL,
    "approved_request_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "owner_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "owner_requests" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "applicant_name_snapshot" VARCHAR(150) NOT NULL,
    "applicant_email_snapshot" VARCHAR(254) NOT NULL,
    "applicant_phone_snapshot" VARCHAR(30),
    "reviewed_by" BIGINT,
    "reviewed_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "owner_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" BIGSERIAL NOT NULL,
    "owner_id" BIGINT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "district" VARCHAR(100) NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "phone" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "opening_time" TIME(6) NOT NULL,
    "closing_time" TIME(6) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3),
    "reviewed_by" BIGINT,
    "reviewed_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "suspended_at" TIMESTAMPTZ(3),
    "suspension_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_images" (
    "id" BIGSERIAL NOT NULL,
    "facility_id" BIGINT NOT NULL,
    "image_path" VARCHAR(1024) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "facility_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courts" (
    "id" BIGSERIAL NOT NULL,
    "facility_id" BIGINT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenities" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_amenities" (
    "facility_id" BIGINT NOT NULL,
    "amenity_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "facility_amenities_pkey" PRIMARY KEY ("facility_id","amenity_id")
);

-- CreateTable
CREATE TABLE "price_rules" (
    "id" BIGSERIAL NOT NULL,
    "facility_id" BIGINT NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "hourly_rate" DECIMAL(12,0) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_policies" (
    "id" BIGSERIAL NOT NULL,
    "facility_id" BIGINT NOT NULL,
    "cutoff_hours" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cancellation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" BIGSERIAL NOT NULL,
    "facility_id" BIGINT NOT NULL,
    "bank_name" VARCHAR(150) NOT NULL,
    "account_number" VARCHAR(50) NOT NULL,
    "account_holder" VARCHAR(150) NOT NULL,
    "qr_image_path" VARCHAR(1024),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" BIGSERIAL NOT NULL,
    "customer_id" BIGINT NOT NULL,
    "court_id" BIGINT NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "total_amount" DECIMAL(12,0) NOT NULL,
    "deposit_amount" DECIMAL(12,0) NOT NULL,
    "remaining_amount" DECIMAL(12,0) NOT NULL,
    "cancellation_cutoff_hours_snapshot" INTEGER,
    "bank_name_snapshot" VARCHAR(150) NOT NULL,
    "account_number_snapshot" VARCHAR(50) NOT NULL,
    "account_holder_snapshot" VARCHAR(150) NOT NULL,
    "qr_image_path_snapshot" VARCHAR(1024),
    "facility_name_snapshot" VARCHAR(200) NOT NULL,
    "facility_address_snapshot" VARCHAR(500) NOT NULL,
    "court_name_snapshot" VARCHAR(100) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "rejected_at" TIMESTAMPTZ(3),
    "expired_at" TIMESTAMPTZ(3),
    "cancelled_by" VARCHAR(16),
    "rejection_reason" TEXT,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_slots" (
    "id" BIGSERIAL NOT NULL,
    "booking_id" BIGINT NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "hourly_rate_snapshot" DECIMAL(12,0) NOT NULL,
    "slot_amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_slot_locks" (
    "court_id" BIGINT NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "booking_slot_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "court_slot_locks_pkey" PRIMARY KEY ("court_id","start_at")
);

-- CreateTable
CREATE TABLE "payment_proofs" (
    "id" BIGSERIAL NOT NULL,
    "booking_id" BIGINT NOT NULL,
    "image_path" VARCHAR(1024) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "reviewed_by" BIGINT,
    "reviewed_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" BIGSERIAL NOT NULL,
    "booking_id" BIGINT NOT NULL,
    "amount" DECIMAL(12,0) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "reason" TEXT NOT NULL,
    "proof_image_path" VARCHAR(1024),
    "proof_mime_type" VARCHAR(100),
    "proof_size_bytes" BIGINT,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "proof_submitted_at" TIMESTAMPTZ(3),
    "refunded_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_blocks" (
    "id" BIGSERIAL NOT NULL,
    "court_id" BIGINT NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "court_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "user_id" BIGINT NOT NULL,
    "facility_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id","facility_id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" BIGSERIAL NOT NULL,
    "booking_id" BIGINT NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "status" VARCHAR(16) NOT NULL,
    "moderated_by" BIGINT,
    "moderated_at" TIMESTAMPTZ(3),
    "moderation_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_images" (
    "id" BIGSERIAL NOT NULL,
    "review_id" BIGINT NOT NULL,
    "image_path" VARCHAR(1024) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "review_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" BIGSERIAL NOT NULL,
    "recipient_id" BIGINT NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "event_key" VARCHAR(191) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "booking_id" BIGINT,
    "facility_id" BIGINT,
    "owner_request_id" BIGINT,
    "review_id" BIGINT,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_pages" (
    "id" BIGSERIAL NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "is_published" BOOLEAN NOT NULL,
    "updated_by" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "content_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"("email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_subject_key" ON "users"("google_subject");

-- CreateIndex
CREATE INDEX "users_role_status_created_at_idx" ON "users"("role", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_revoked_at_idx" ON "auth_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_used_at_invalidated_at_idx" ON "password_reset_tokens"("user_id", "used_at", "invalidated_at");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "owner_profiles_approved_request_id_key" ON "owner_profiles"("approved_request_id");

-- CreateIndex
CREATE INDEX "owner_requests_status_created_at_idx" ON "owner_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "owner_requests_user_id_created_at_idx" ON "owner_requests"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "owner_requests_one_pending_per_user" ON "owner_requests"("user_id") WHERE (status = 'PENDING');

-- CreateIndex
CREATE INDEX "facilities_owner_id_status_idx" ON "facilities"("owner_id", "status");

-- CreateIndex
CREATE INDEX "facilities_status_district_idx" ON "facilities"("status", "district");

-- CreateIndex
CREATE INDEX "facilities_name_idx" ON "facilities"("name");

-- CreateIndex
CREATE INDEX "facility_images_facility_id_sort_order_idx" ON "facility_images"("facility_id", "sort_order");

-- CreateIndex
CREATE INDEX "courts_facility_id_status_idx" ON "courts"("facility_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "courts_facility_id_name_key" ON "courts"("facility_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_name_key" ON "amenities"("name");

-- CreateIndex
CREATE INDEX "facility_amenities_amenity_id_facility_id_idx" ON "facility_amenities"("amenity_id", "facility_id");

-- CreateIndex
CREATE INDEX "price_rules_facility_id_start_time_idx" ON "price_rules"("facility_id", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "price_rules_facility_id_start_time_end_time_key" ON "price_rules"("facility_id", "start_time", "end_time");

-- CreateIndex
CREATE UNIQUE INDEX "cancellation_policies_facility_id_key" ON "cancellation_policies"("facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_facility_id_key" ON "bank_accounts"("facility_id");

-- CreateIndex
CREATE INDEX "bookings_customer_id_created_at_idx" ON "bookings"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_court_id_start_at_end_at_idx" ON "bookings"("court_id", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "bookings_status_expires_at_idx" ON "bookings"("status", "expires_at");

-- CreateIndex
CREATE INDEX "bookings_status_start_at_idx" ON "bookings"("status", "start_at");

-- CreateIndex
CREATE INDEX "booking_slots_booking_id_end_at_idx" ON "booking_slots"("booking_id", "end_at");

-- CreateIndex
CREATE UNIQUE INDEX "booking_slots_booking_id_start_at_key" ON "booking_slots"("booking_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "court_slot_locks_booking_slot_id_key" ON "court_slot_locks"("booking_slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_proofs_booking_id_key" ON "payment_proofs"("booking_id");

-- CreateIndex
CREATE INDEX "payment_proofs_status_submitted_at_idx" ON "payment_proofs"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_booking_id_key" ON "refunds"("booking_id");

-- CreateIndex
CREATE INDEX "refunds_status_requested_at_idx" ON "refunds"("status", "requested_at");

-- CreateIndex
CREATE INDEX "court_blocks_court_id_start_at_end_at_idx" ON "court_blocks"("court_id", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "favorites_facility_id_user_id_idx" ON "favorites"("facility_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_booking_id_key" ON "reviews"("booking_id");

-- CreateIndex
CREATE INDEX "reviews_status_created_at_idx" ON "reviews"("status", "created_at");

-- CreateIndex
CREATE INDEX "review_images_review_id_sort_order_idx" ON "review_images"("review_id", "sort_order");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_created_at_idx" ON "notifications"("recipient_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_recipient_id_event_key_key" ON "notifications"("recipient_id", "event_key");

-- CreateIndex
CREATE UNIQUE INDEX "content_pages_slug_key" ON "content_pages"("slug");

-- CreateIndex
CREATE INDEX "content_pages_is_published_slug_idx" ON "content_pages"("is_published", "slug");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "owner_profiles" ADD CONSTRAINT "owner_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "owner_profiles" ADD CONSTRAINT "owner_profiles_approved_request_id_fkey" FOREIGN KEY ("approved_request_id") REFERENCES "owner_requests"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "owner_requests" ADD CONSTRAINT "owner_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "owner_requests" ADD CONSTRAINT "owner_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owner_profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "facility_images" ADD CONSTRAINT "facility_images_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "courts" ADD CONSTRAINT "courts_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "facility_amenities" ADD CONSTRAINT "facility_amenities_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "facility_amenities" ADD CONSTRAINT "facility_amenities_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cancellation_policies" ADD CONSTRAINT "cancellation_policies_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "court_slot_locks" ADD CONSTRAINT "court_slot_locks_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "court_slot_locks" ADD CONSTRAINT "court_slot_locks_booking_slot_id_fkey" FOREIGN KEY ("booking_slot_id") REFERENCES "booking_slots"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "court_blocks" ADD CONSTRAINT "court_blocks_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "court_blocks" ADD CONSTRAINT "court_blocks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_fkey" FOREIGN KEY ("moderated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_images" ADD CONSTRAINT "review_images_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_owner_request_id_fkey" FOREIGN KEY ("owner_request_id") REFERENCES "owner_requests"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Manual CHECK constraints M01-M16: docs/plans/PRISMA_SCHEMA_REVIEW.md.
-- Row-level checks only; ownership, transitions and locking remain application responsibilities.
-- M01
ALTER TABLE "users" ADD CONSTRAINT "m01_users_positive_ids_check" CHECK (
    "id" > 0
);

-- M01
ALTER TABLE "auth_sessions" ADD CONSTRAINT "m01_auth_sessions_positive_ids_check" CHECK (
    "id" > 0
    AND "user_id" > 0
);

-- M01
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "m01_password_reset_tokens_positive_ids_check" CHECK (
    "id" > 0
    AND "user_id" > 0
);

-- M01
ALTER TABLE "owner_profiles" ADD CONSTRAINT "m01_owner_profiles_positive_ids_check" CHECK (
    "user_id" > 0
    AND "approved_request_id" > 0
);

-- M01
ALTER TABLE "owner_requests" ADD CONSTRAINT "m01_owner_requests_positive_ids_check" CHECK (
    "id" > 0
    AND "user_id" > 0
    AND ("reviewed_by" IS NULL OR "reviewed_by" > 0)
);

-- M01
ALTER TABLE "facilities" ADD CONSTRAINT "m01_facilities_positive_ids_check" CHECK (
    "id" > 0
    AND "owner_id" > 0
    AND ("reviewed_by" IS NULL OR "reviewed_by" > 0)
);

-- M01
ALTER TABLE "facility_images" ADD CONSTRAINT "m01_facility_images_positive_ids_check" CHECK (
    "id" > 0
    AND "facility_id" > 0
);

-- M01
ALTER TABLE "courts" ADD CONSTRAINT "m01_courts_positive_ids_check" CHECK (
    "id" > 0
    AND "facility_id" > 0
);

-- M01
ALTER TABLE "amenities" ADD CONSTRAINT "m01_amenities_positive_ids_check" CHECK (
    "id" > 0
);

-- M01
ALTER TABLE "facility_amenities" ADD CONSTRAINT "m01_facility_amenities_positive_ids_check" CHECK (
    "facility_id" > 0
    AND "amenity_id" > 0
);

-- M01
ALTER TABLE "price_rules" ADD CONSTRAINT "m01_price_rules_positive_ids_check" CHECK (
    "id" > 0
    AND "facility_id" > 0
);

-- M01
ALTER TABLE "cancellation_policies" ADD CONSTRAINT "m01_cancellation_policies_positive_ids_check" CHECK (
    "id" > 0
    AND "facility_id" > 0
);

-- M01
ALTER TABLE "bank_accounts" ADD CONSTRAINT "m01_bank_accounts_positive_ids_check" CHECK (
    "id" > 0
    AND "facility_id" > 0
);

-- M01
ALTER TABLE "bookings" ADD CONSTRAINT "m01_bookings_positive_ids_check" CHECK (
    "id" > 0
    AND "customer_id" > 0
    AND "court_id" > 0
);

-- M01
ALTER TABLE "booking_slots" ADD CONSTRAINT "m01_booking_slots_positive_ids_check" CHECK (
    "id" > 0
    AND "booking_id" > 0
);

-- M01
ALTER TABLE "court_slot_locks" ADD CONSTRAINT "m01_court_slot_locks_positive_ids_check" CHECK (
    "court_id" > 0
    AND "booking_slot_id" > 0
);

-- M01
ALTER TABLE "payment_proofs" ADD CONSTRAINT "m01_payment_proofs_positive_ids_check" CHECK (
    "id" > 0
    AND "booking_id" > 0
    AND ("reviewed_by" IS NULL OR "reviewed_by" > 0)
);

-- M01
ALTER TABLE "refunds" ADD CONSTRAINT "m01_refunds_positive_ids_check" CHECK (
    "id" > 0
    AND "booking_id" > 0
);

-- M01
ALTER TABLE "court_blocks" ADD CONSTRAINT "m01_court_blocks_positive_ids_check" CHECK (
    "id" > 0
    AND "court_id" > 0
    AND "created_by" > 0
);

-- M01
ALTER TABLE "favorites" ADD CONSTRAINT "m01_favorites_positive_ids_check" CHECK (
    "user_id" > 0
    AND "facility_id" > 0
);

-- M01
ALTER TABLE "reviews" ADD CONSTRAINT "m01_reviews_positive_ids_check" CHECK (
    "id" > 0
    AND "booking_id" > 0
    AND ("moderated_by" IS NULL OR "moderated_by" > 0)
);

-- M01
ALTER TABLE "review_images" ADD CONSTRAINT "m01_review_images_positive_ids_check" CHECK (
    "id" > 0
    AND "review_id" > 0
);

-- M01
ALTER TABLE "notifications" ADD CONSTRAINT "m01_notifications_positive_ids_check" CHECK (
    "id" > 0
    AND "recipient_id" > 0
    AND ("booking_id" IS NULL OR "booking_id" > 0)
    AND ("facility_id" IS NULL OR "facility_id" > 0)
    AND ("owner_request_id" IS NULL OR "owner_request_id" > 0)
    AND ("review_id" IS NULL OR "review_id" > 0)
);

-- M01
ALTER TABLE "content_pages" ADD CONSTRAINT "m01_content_pages_positive_ids_check" CHECK (
    "id" > 0
    AND "updated_by" > 0
);

-- M02
ALTER TABLE "users" ADD CONSTRAINT "m02_users_role_check" CHECK (
    "role" IN ('CUSTOMER', 'ADMIN')
);

-- M02
ALTER TABLE "users" ADD CONSTRAINT "m02_users_status_check" CHECK (
    "status" IN ('ACTIVE', 'LOCKED')
);

-- M02
ALTER TABLE "owner_requests" ADD CONSTRAINT "m02_owner_requests_status_check" CHECK (
    "status" IN ('PENDING', 'APPROVED', 'REJECTED')
);

-- M02
ALTER TABLE "facilities" ADD CONSTRAINT "m02_facilities_status_check" CHECK (
    "status" IN ('DRAFT', 'PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED')
);

-- M02
ALTER TABLE "courts" ADD CONSTRAINT "m02_courts_status_check" CHECK (
    "status" IN ('ACTIVE', 'INACTIVE')
);

-- M02
ALTER TABLE "bookings" ADD CONSTRAINT "m02_bookings_status_check" CHECK (
    "status" IN ('PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'COMPLETED', 'EXPIRED', 'REJECTED', 'CANCELLED')
);

-- M02
ALTER TABLE "bookings" ADD CONSTRAINT "m02_bookings_cancelled_by_check" CHECK (
    "cancelled_by" IS NULL OR "cancelled_by" IN ('CUSTOMER', 'OWNER')
);

-- M02
ALTER TABLE "payment_proofs" ADD CONSTRAINT "m02_payment_proofs_status_check" CHECK (
    "status" IN ('SUBMITTED', 'APPROVED', 'REJECTED')
);

-- M02
ALTER TABLE "refunds" ADD CONSTRAINT "m02_refunds_status_check" CHECK (
    "status" IN ('PENDING', 'PROOF_SUBMITTED', 'REFUNDED')
);

-- M02
ALTER TABLE "reviews" ADD CONSTRAINT "m02_reviews_status_check" CHECK (
    "status" IN ('VISIBLE', 'HIDDEN')
);

-- M02
ALTER TABLE "notifications" ADD CONSTRAINT "m02_notifications_event_type_check" CHECK (
    "event_type" IN ('BOOKING_CREATED', 'PAYMENT_PROOF_SUBMITTED', 'PAYMENT_CONFIRMED', 'PAYMENT_REJECTED', 'BOOKING_CANCELLED', 'BOOKING_EXPIRED', 'OWNER_REQUEST_APPROVED', 'OWNER_REQUEST_REJECTED', 'FACILITY_APPROVED', 'FACILITY_REJECTED', 'NEW_REVIEW')
);

-- M03
ALTER TABLE "auth_sessions" ADD CONSTRAINT "m03_auth_sessions_token_hash_length_check" CHECK (
    octet_length("token_hash") = 32
);

-- M03
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "m03_password_reset_tokens_token_hash_length_check" CHECK (
    octet_length("token_hash") = 32
);

-- M04
ALTER TABLE "facility_images" ADD CONSTRAINT "m04_facility_images_sort_order_check" CHECK (
    "sort_order" >= 0
);

-- M04
ALTER TABLE "review_images" ADD CONSTRAINT "m04_review_images_sort_order_check" CHECK (
    "sort_order" >= 0
);

-- M04
ALTER TABLE "cancellation_policies" ADD CONSTRAINT "m04_cancellation_policies_cutoff_hours_check" CHECK (
    "cutoff_hours" >= 0
);

-- M04
ALTER TABLE "bookings" ADD CONSTRAINT "m04_bookings_cancellation_cutoff_hours_snapshot_check" CHECK (
    "cancellation_cutoff_hours_snapshot" IS NULL OR "cancellation_cutoff_hours_snapshot" >= 0
);

-- M04
ALTER TABLE "payment_proofs" ADD CONSTRAINT "m04_payment_proofs_size_bytes_check" CHECK (
    "size_bytes" >= 0
);

-- M04
ALTER TABLE "refunds" ADD CONSTRAINT "m04_refunds_proof_size_bytes_check" CHECK (
    "proof_size_bytes" IS NULL OR "proof_size_bytes" >= 0
);

-- M05
ALTER TABLE "facilities" ADD CONSTRAINT "m05_facilities_opening_interval_check" CHECK (
    "closing_time" > "opening_time"
);

-- M05
ALTER TABLE "facilities" ADD CONSTRAINT "m05_facilities_rejection_reason_check" CHECK (
    "status" <> 'REJECTED' OR ("rejection_reason" IS NOT NULL AND length(btrim("rejection_reason")) > 0)
);

-- M05
ALTER TABLE "facilities" ADD CONSTRAINT "m05_facilities_suspension_reason_check" CHECK (
    "status" <> 'SUSPENDED' OR ("suspension_reason" IS NOT NULL AND length(btrim("suspension_reason")) > 0)
);

-- M06
ALTER TABLE "price_rules" ADD CONSTRAINT "m06_price_rules_time_range_check" CHECK (
    "start_time" < "end_time"
);

-- M06
ALTER TABLE "price_rules" ADD CONSTRAINT "m06_price_rules_start_alignment_check" CHECK (
    EXTRACT(MINUTE FROM "start_time") IN (0, 30)
    AND EXTRACT(SECOND FROM "start_time") = 0
);

-- M06
ALTER TABLE "price_rules" ADD CONSTRAINT "m06_price_rules_end_alignment_check" CHECK (
    EXTRACT(MINUTE FROM "end_time") IN (0, 30)
    AND EXTRACT(SECOND FROM "end_time") = 0
);

-- M06
ALTER TABLE "price_rules" ADD CONSTRAINT "m06_price_rules_hourly_rate_check" CHECK (
    "hourly_rate" > 0
);

-- M07
ALTER TABLE "bookings" ADD CONSTRAINT "m07_bookings_nonnegative_amounts_check" CHECK (
    "total_amount" >= 0 AND "deposit_amount" >= 0 AND "remaining_amount" >= 0
);

-- M07
ALTER TABLE "bookings" ADD CONSTRAINT "m07_bookings_deposit_amount_check" CHECK (
    "deposit_amount" = ROUND("total_amount" * 30 / 100, 0)
);

-- M07
ALTER TABLE "bookings" ADD CONSTRAINT "m07_bookings_remaining_amount_check" CHECK (
    "remaining_amount" = "total_amount" - "deposit_amount"
);

-- M08
ALTER TABLE "bookings" ADD CONSTRAINT "m08_bookings_time_range_check" CHECK (
    "end_at" > "start_at"
);

-- M08
ALTER TABLE "bookings" ADD CONSTRAINT "m08_bookings_start_alignment_check" CHECK (
    EXTRACT(MINUTE FROM ("start_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')) IN (0, 30)
    AND EXTRACT(SECOND FROM ("start_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')) = 0
);

-- M08
ALTER TABLE "bookings" ADD CONSTRAINT "m08_bookings_end_alignment_check" CHECK (
    EXTRACT(MINUTE FROM ("end_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')) IN (0, 30)
    AND EXTRACT(SECOND FROM ("end_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')) = 0
);

-- M08
ALTER TABLE "bookings" ADD CONSTRAINT "m08_bookings_duration_check" CHECK (
    MOD(EXTRACT(EPOCH FROM ("end_at" - "start_at")), 1800) = 0
);

-- M09
ALTER TABLE "bookings" ADD CONSTRAINT "m09_bookings_cancelled_metadata_check" CHECK (
    "status" <> 'CANCELLED' OR ("cancelled_by" IS NOT NULL AND "cancelled_at" IS NOT NULL)
);

-- M09
ALTER TABLE "bookings" ADD CONSTRAINT "m09_bookings_owner_cancel_reason_check" CHECK (
    "cancelled_by" IS DISTINCT FROM 'OWNER' OR ("cancellation_reason" IS NOT NULL AND length(btrim("cancellation_reason")) > 0)
);

-- M09
ALTER TABLE "bookings" ADD CONSTRAINT "m09_bookings_rejection_reason_check" CHECK (
    "status" <> 'REJECTED' OR ("rejection_reason" IS NOT NULL AND length(btrim("rejection_reason")) > 0)
);

-- M10
ALTER TABLE "booking_slots" ADD CONSTRAINT "m10_booking_slots_duration_check" CHECK (
    "end_at" = "start_at" + INTERVAL '30 minutes'
);

-- M10
ALTER TABLE "booking_slots" ADD CONSTRAINT "m10_booking_slots_start_alignment_check" CHECK (
    EXTRACT(MINUTE FROM ("start_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')) IN (0, 30)
    AND EXTRACT(SECOND FROM ("start_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')) = 0
);

-- M10
ALTER TABLE "booking_slots" ADD CONSTRAINT "m10_booking_slots_end_alignment_check" CHECK (
    EXTRACT(MINUTE FROM ("end_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')) IN (0, 30)
    AND EXTRACT(SECOND FROM ("end_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')) = 0
);

-- M10
ALTER TABLE "booking_slots" ADD CONSTRAINT "m10_booking_slots_price_snapshot_check" CHECK (
    "hourly_rate_snapshot" > 0 AND "slot_amount" >= 0
    AND "slot_amount" = "hourly_rate_snapshot" / 2
);

-- M11
ALTER TABLE "court_slot_locks" ADD CONSTRAINT "m11_court_slot_locks_start_alignment_check" CHECK (
    EXTRACT(MINUTE FROM ("start_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')) IN (0, 30)
    AND EXTRACT(SECOND FROM ("start_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')) = 0
);

-- M12
ALTER TABLE "court_blocks" ADD CONSTRAINT "m12_court_blocks_time_range_check" CHECK (
    "end_at" > "start_at"
);

-- M12
ALTER TABLE "court_blocks" ADD CONSTRAINT "m12_court_blocks_reason_check" CHECK (
    ("reason" IS NOT NULL AND length(btrim("reason")) > 0)
);

-- M13
ALTER TABLE "owner_requests" ADD CONSTRAINT "m13_owner_requests_pending_metadata_check" CHECK (
    "status" <> 'PENDING' OR ("reviewed_by" IS NULL AND "reviewed_at" IS NULL AND "rejection_reason" IS NULL)
);

-- M13
ALTER TABLE "owner_requests" ADD CONSTRAINT "m13_owner_requests_reviewed_metadata_check" CHECK (
    "status" NOT IN ('APPROVED', 'REJECTED') OR ("reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL)
);

-- M13
ALTER TABLE "owner_requests" ADD CONSTRAINT "m13_owner_requests_rejection_reason_check" CHECK (
    "status" <> 'REJECTED' OR ("rejection_reason" IS NOT NULL AND length(btrim("rejection_reason")) > 0)
);

-- M14
ALTER TABLE "payment_proofs" ADD CONSTRAINT "m14_payment_proofs_rejection_reason_check" CHECK (
    "status" <> 'REJECTED' OR ("rejection_reason" IS NOT NULL AND length(btrim("rejection_reason")) > 0)
);

-- M15
ALTER TABLE "refunds" ADD CONSTRAINT "m15_refunds_amount_check" CHECK (
    "amount" >= 0
);

-- M15
ALTER TABLE "refunds" ADD CONSTRAINT "m15_refunds_proof_by_status_check" CHECK (
    (
      "status" = 'PENDING'
      AND "proof_image_path" IS NULL AND "proof_mime_type" IS NULL
      AND "proof_size_bytes" IS NULL AND "proof_submitted_at" IS NULL
      AND "confirmed_at" IS NULL AND "refunded_at" IS NULL
    ) OR (
      "status" = 'PROOF_SUBMITTED'
      AND "proof_image_path" IS NOT NULL AND "proof_mime_type" IS NOT NULL
      AND "proof_size_bytes" IS NOT NULL AND "proof_submitted_at" IS NOT NULL
      AND "confirmed_at" IS NULL AND "refunded_at" IS NULL
    ) OR (
      "status" = 'REFUNDED'
      AND "proof_image_path" IS NOT NULL AND "proof_mime_type" IS NOT NULL
      AND "proof_size_bytes" IS NOT NULL AND "proof_submitted_at" IS NOT NULL
      AND "confirmed_at" IS NOT NULL AND "refunded_at" IS NOT NULL
    )
);

-- M15
ALTER TABLE "refunds" ADD CONSTRAINT "m15_refunds_time_order_check" CHECK (
    ("proof_submitted_at" IS NULL OR "requested_at" <= "proof_submitted_at")
    AND ("confirmed_at" IS NULL OR ("proof_submitted_at" IS NOT NULL AND "proof_submitted_at" <= "confirmed_at"))
);

-- M15
ALTER TABLE "refunds" ADD CONSTRAINT "m15_refunds_confirmed_time_check" CHECK (
    ("confirmed_at" IS NULL AND "refunded_at" IS NULL)
    OR ("confirmed_at" IS NOT NULL AND "refunded_at" IS NOT NULL AND "refunded_at" = "confirmed_at")
);

-- M16
ALTER TABLE "reviews" ADD CONSTRAINT "m16_reviews_rating_check" CHECK (
    "rating" BETWEEN 1 AND 5
);
