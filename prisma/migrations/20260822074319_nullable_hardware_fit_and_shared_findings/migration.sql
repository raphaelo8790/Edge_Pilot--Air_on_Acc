-- AlterTable
ALTER TABLE "readiness_scores" ADD COLUMN     "privacy_class" TEXT,
ALTER COLUMN "hardware_fit" DROP NOT NULL,
ALTER COLUMN "privacy_score" DROP NOT NULL;

-- CreateTable
CREATE TABLE "shared_findings" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "event_count" INTEGER NOT NULL,
    "note" TEXT,
    "consent_statement" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shared_findings_session_id_idx" ON "shared_findings"("session_id");

-- CreateIndex
CREATE INDEX "shared_findings_created_at_idx" ON "shared_findings"("created_at");
