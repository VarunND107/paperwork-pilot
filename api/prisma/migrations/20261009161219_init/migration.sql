-- CreateEnum
CREATE TYPE "due_unit" AS ENUM ('DAY', 'WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "office_kind" AS ENUM ('OFFICE', 'PORTAL');

-- CreateEnum
CREATE TYPE "step_document_role" AS ENUM ('REQUIRES', 'PRODUCES');

-- CreateEnum
CREATE TYPE "case_step_status" AS ENUM ('PENDING', 'DONE');

-- CreateEnum
CREATE TYPE "tip_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "tip_origin" AS ENUM ('SEED', 'USER');

-- CreateEnum
CREATE TYPE "org_role" AS ENUM ('OWNER', 'MEMBER');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "place" TEXT NOT NULL DEFAULT 'Bengaluru, Karnataka',
    "event_date_label" TEXT NOT NULL DEFAULT 'Date of the event',
    "keywords" TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "source_url" TEXT,
    "last_verified_at" TIMESTAMP(3),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "steps" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "where_text" TEXT NOT NULL,
    "office_id" TEXT,
    "fee" TEXT NOT NULL,
    "wait_text" TEXT NOT NULL,
    "due_text" TEXT NOT NULL,
    "due_amount" INTEGER,
    "due_unit" "due_unit",
    "source_url" TEXT NOT NULL,
    "last_verified_at" TIMESTAMP(3),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step_dependencies" (
    "step_id" TEXT NOT NULL,
    "depends_on_step_id" TEXT NOT NULL,

    CONSTRAINT "step_dependencies_pkey" PRIMARY KEY ("step_id","depends_on_step_id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source_url" TEXT,
    "last_verified_at" TIMESTAMP(3),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step_documents" (
    "id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "role" "step_document_role" NOT NULL,
    "produced_by_step_id" TEXT,
    "label" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "step_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "office_kind" NOT NULL DEFAULT 'OFFICE',
    "city" TEXT NOT NULL DEFAULT 'Bengaluru',
    "address" TEXT,
    "url" TEXT,
    "hours" TEXT,
    "source_url" TEXT,
    "last_verified_at" TIMESTAMP(3),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tips" (
    "id" TEXT NOT NULL,
    "step_id" TEXT,
    "office_id" TEXT,
    "body" TEXT NOT NULL,
    "status" "tip_status" NOT NULL DEFAULT 'PENDING',
    "origin" "tip_origin" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moderated_at" TIMESTAMP(3),

    CONSTRAINT "tips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tip_flags" (
    "id" TEXT NOT NULL,
    "tip_id" TEXT NOT NULL,
    "voter_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tip_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT,
    "org_id" TEXT,
    "client_name" TEXT,
    "token_hash" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_date" DATE,
    "reminders_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "reminder_email" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_steps" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "status" "case_step_status" NOT NULL DEFAULT 'PENDING',
    "done_at" TIMESTAMP(3),

    CONSTRAINT "case_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_documents" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "ticked" BOOLEAN NOT NULL DEFAULT false,
    "ticked_at" TIMESTAMP(3),

    CONSTRAINT "case_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_logs" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "email" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_members" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "org_role" NOT NULL DEFAULT 'MEMBER',
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "steps_event_id_position_idx" ON "steps"("event_id", "position");

-- CreateIndex
CREATE INDEX "steps_office_id_idx" ON "steps"("office_id");

-- CreateIndex
CREATE INDEX "step_dependencies_depends_on_step_id_idx" ON "step_dependencies"("depends_on_step_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_name_key" ON "documents"("name");

-- CreateIndex
CREATE INDEX "step_documents_document_id_idx" ON "step_documents"("document_id");

-- CreateIndex
CREATE INDEX "step_documents_produced_by_step_id_idx" ON "step_documents"("produced_by_step_id");

-- CreateIndex
CREATE UNIQUE INDEX "step_documents_step_id_document_id_role_key" ON "step_documents"("step_id", "document_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "offices_name_city_key" ON "offices"("name", "city");

-- CreateIndex
CREATE INDEX "tips_status_created_at_idx" ON "tips"("status", "created_at");

-- CreateIndex
CREATE INDEX "tips_step_id_status_idx" ON "tips"("step_id", "status");

-- CreateIndex
CREATE INDEX "tips_office_id_status_idx" ON "tips"("office_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tip_flags_tip_id_voter_hash_key" ON "tip_flags"("tip_id", "voter_hash");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "cases_token_hash_key" ON "cases"("token_hash");

-- CreateIndex
CREATE INDEX "cases_event_id_idx" ON "cases"("event_id");

-- CreateIndex
CREATE INDEX "cases_org_id_idx" ON "cases"("org_id");

-- CreateIndex
CREATE INDEX "cases_reminders_opt_in_idx" ON "cases"("reminders_opt_in");

-- CreateIndex
CREATE INDEX "case_steps_step_id_idx" ON "case_steps"("step_id");

-- CreateIndex
CREATE UNIQUE INDEX "case_steps_case_id_step_id_key" ON "case_steps"("case_id", "step_id");

-- CreateIndex
CREATE INDEX "case_documents_document_id_idx" ON "case_documents"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "case_documents_case_id_document_id_key" ON "case_documents"("case_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_logs_case_id_step_id_due_date_key" ON "reminder_logs"("case_id", "step_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "org_members_token_hash_key" ON "org_members"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "org_members_org_id_email_key" ON "org_members"("org_id", "email");

-- AddForeignKey
ALTER TABLE "steps" ADD CONSTRAINT "steps_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "steps" ADD CONSTRAINT "steps_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_dependencies" ADD CONSTRAINT "step_dependencies_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_dependencies" ADD CONSTRAINT "step_dependencies_depends_on_step_id_fkey" FOREIGN KEY ("depends_on_step_id") REFERENCES "steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_documents" ADD CONSTRAINT "step_documents_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_documents" ADD CONSTRAINT "step_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_documents" ADD CONSTRAINT "step_documents_produced_by_step_id_fkey" FOREIGN KEY ("produced_by_step_id") REFERENCES "steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tip_flags" ADD CONSTRAINT "tip_flags_tip_id_fkey" FOREIGN KEY ("tip_id") REFERENCES "tips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_steps" ADD CONSTRAINT "case_steps_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_steps" ADD CONSTRAINT "case_steps_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Constraints Prisma cannot express in schema.prisma ---------------------------------------------

-- A step can never depend on itself.
ALTER TABLE "step_dependencies"
  ADD CONSTRAINT "step_dependencies_no_self_dependency" CHECK ("step_id" <> "depends_on_step_id");

-- A machine-readable deadline needs both its amount and its unit, and the amount cannot be negative.
ALTER TABLE "steps"
  ADD CONSTRAINT "steps_due_amount_and_unit_together"
  CHECK (("due_amount" IS NULL) = ("due_unit" IS NULL) AND ("due_amount" IS NULL OR "due_amount" >= 0));

-- Only a requires-row can name the step that produces the document.
ALTER TABLE "step_documents"
  ADD CONSTRAINT "step_documents_producer_only_on_requires"
  CHECK ("produced_by_step_id" IS NULL OR "role" = 'REQUIRES');

-- A tip belongs to exactly one thing: a step or an office. Tips are short.
ALTER TABLE "tips"
  ADD CONSTRAINT "tips_exactly_one_target" CHECK (num_nonnulls("step_id", "office_id") = 1);
ALTER TABLE "tips"
  ADD CONSTRAINT "tips_body_length" CHECK (char_length("body") BETWEEN 1 AND 400);

-- done_at is set exactly when the step is done.
ALTER TABLE "case_steps"
  ADD CONSTRAINT "case_steps_done_at_matches_status"
  CHECK (("status" = 'DONE') = ("done_at" IS NOT NULL));

-- Reminders need somewhere to go.
ALTER TABLE "cases"
  ADD CONSTRAINT "cases_opt_in_needs_email" CHECK (NOT "reminders_opt_in" OR "reminder_email" IS NOT NULL);
