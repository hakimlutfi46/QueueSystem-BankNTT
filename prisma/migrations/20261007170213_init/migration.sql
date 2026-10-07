-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('WAITING', 'SERVING', 'DONE', 'NO_SHOW', 'EXPIRED');

-- CreateEnum
CREATE TYPE "counter_status" AS ENUM ('CLOSED', 'OPEN', 'PAUSED');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'STAFF');

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" VARCHAR(2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'STAFF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "display_number" INTEGER NOT NULL,
    "status" "counter_status" NOT NULL DEFAULT 'CLOSED',
    "current_user_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counter_services" (
    "counter_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,

    CONSTRAINT "counter_services_pkey" PRIMARY KEY ("counter_id","service_id")
);

-- CreateTable
CREATE TABLE "daily_sequences" (
    "service_id" INTEGER NOT NULL,
    "service_date" DATE NOT NULL,
    "last_number" INTEGER NOT NULL,

    CONSTRAINT "daily_sequences_pkey" PRIMARY KEY ("service_id","service_date")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" BIGSERIAL NOT NULL,
    "request_id" UUID NOT NULL,
    "service_id" INTEGER NOT NULL,
    "service_date" DATE NOT NULL,
    "seq" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ticket_status" NOT NULL DEFAULT 'WAITING',
    "counter_id" INTEGER,
    "served_by" INTEGER,
    "call_count" INTEGER NOT NULL DEFAULT 0,
    "auto_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "called_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" BIGSERIAL NOT NULL,
    "ticket_id" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "counter_id" INTEGER,
    "user_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "services_prefix_key" ON "services"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_request_id_key" ON "tickets"("request_id");

-- CreateIndex
CREATE INDEX "tickets_waiting_idx" ON "tickets"("service_date", "service_id", "created_at", "id") WHERE (status = 'WAITING');

-- CreateIndex
CREATE INDEX "tickets_report_idx" ON "tickets"("service_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_service_id_service_date_seq_key" ON "tickets"("service_id", "service_date", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_one_active_per_counter" ON "tickets"("counter_id") WHERE (status = 'SERVING');

-- AddForeignKey
ALTER TABLE "counters" ADD CONSTRAINT "counters_current_user_id_fkey" FOREIGN KEY ("current_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_services" ADD CONSTRAINT "counter_services_counter_id_fkey" FOREIGN KEY ("counter_id") REFERENCES "counters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_services" ADD CONSTRAINT "counter_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_sequences" ADD CONSTRAINT "daily_sequences_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_counter_id_fkey" FOREIGN KEY ("counter_id") REFERENCES "counters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_served_by_fkey" FOREIGN KEY ("served_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_counter_id_fkey" FOREIGN KEY ("counter_id") REFERENCES "counters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
