-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workloads" (
    "id" TEXT NOT NULL,
    "task_type" TEXT NOT NULL,
    "input_format" TEXT NOT NULL,
    "output_format" TEXT NOT NULL,
    "constraints" JSONB NOT NULL DEFAULT '{}',
    "user_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpu" TEXT NOT NULL,
    "ram_gb" INTEGER NOT NULL,
    "gpu" TEXT,
    "storage_gb" INTEGER NOT NULL,
    "network" TEXT,
    "user_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "base_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmarks" (
    "id" TEXT NOT NULL,
    "workload_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "iterations" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "user_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_results" (
    "id" TEXT NOT NULL,
    "benchmark_id" TEXT NOT NULL,
    "iteration" INTEGER NOT NULL,
    "latency_ms" DOUBLE PRECISION NOT NULL,
    "tokens_per_second" DOUBLE PRECISION,
    "ttft_ms" DOUBLE PRECISION,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readiness_scores" (
    "id" TEXT NOT NULL,
    "benchmark_id" TEXT NOT NULL,
    "hardware_fit" INTEGER NOT NULL,
    "latency_score" INTEGER NOT NULL,
    "privacy_score" INTEGER NOT NULL,
    "cost_score" INTEGER NOT NULL,
    "reliability_score" INTEGER NOT NULL,
    "overall_readiness" INTEGER NOT NULL,
    "recommendation" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "limitations" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "readiness_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "workloads_user_id_idx" ON "workloads"("user_id");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "providers_name_key" ON "providers"("name");

-- CreateIndex
CREATE INDEX "benchmarks_workload_id_idx" ON "benchmarks"("workload_id");

-- CreateIndex
CREATE INDEX "benchmarks_device_id_idx" ON "benchmarks"("device_id");

-- CreateIndex
CREATE INDEX "benchmarks_provider_id_idx" ON "benchmarks"("provider_id");

-- CreateIndex
CREATE INDEX "benchmarks_user_id_idx" ON "benchmarks"("user_id");

-- CreateIndex
CREATE INDEX "benchmark_results_benchmark_id_idx" ON "benchmark_results"("benchmark_id");

-- CreateIndex
CREATE UNIQUE INDEX "readiness_scores_benchmark_id_key" ON "readiness_scores"("benchmark_id");

-- CreateIndex
CREATE INDEX "rate_limits_identifier_timestamp_idx" ON "rate_limits"("identifier", "timestamp");

-- AddForeignKey
ALTER TABLE "workloads" ADD CONSTRAINT "workloads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_workload_id_fkey" FOREIGN KEY ("workload_id") REFERENCES "workloads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmark_results" ADD CONSTRAINT "benchmark_results_benchmark_id_fkey" FOREIGN KEY ("benchmark_id") REFERENCES "benchmarks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readiness_scores" ADD CONSTRAINT "readiness_scores_benchmark_id_fkey" FOREIGN KEY ("benchmark_id") REFERENCES "benchmarks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
