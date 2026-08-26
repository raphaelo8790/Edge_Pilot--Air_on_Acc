-- The session activity log moves from server memory into the database.
-- Hosted, a request can land on any instance and none of them keep memory
-- between calls, so a log recorded in one place was never there when the
-- visitor asked another place to export it.

-- CreateTable
CREATE TABLE "session_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "correlation_id" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "session_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_events_session_id_at_idx" ON "session_events"("session_id", "at");

-- CreateIndex
CREATE INDEX "session_events_at_idx" ON "session_events"("at");
