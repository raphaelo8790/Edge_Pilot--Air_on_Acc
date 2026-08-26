-- Reconcile a database that was created from the team's original init
-- (20260724193118_init) and then had this repository's init recorded as
-- applied without its SQL running. On such a database `providers` still has
-- the old `label`, `enabled` and `config` columns and no `is_active`, and
-- `rate_limits` was never created. Every statement here is conditional, so
-- on a database that is already at the current schema this migration does
-- nothing.

-- providers.is_active, carrying the old `enabled` flag across when present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'providers' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE "providers" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'providers' AND column_name = 'enabled'
    ) THEN
      UPDATE "providers" SET "is_active" = "enabled";
    END IF;
  END IF;
END $$;

-- The old columns. `label` was NOT NULL with no default, which is what made
-- the seed's insert fail; the application never read any of the three.
ALTER TABLE "providers" DROP COLUMN IF EXISTS "label";
ALTER TABLE "providers" DROP COLUMN IF EXISTS "enabled";
ALTER TABLE "providers" DROP COLUMN IF EXISTS "config";
ALTER TABLE "providers" DROP COLUMN IF EXISTS "updatedAt";

-- name must be unique for the seed's upsert-by-name.
CREATE UNIQUE INDEX IF NOT EXISTS "providers_name_key" ON "providers"("name");

-- rate_limits, exactly as this repository's init defines it.
CREATE TABLE IF NOT EXISTS "rate_limits" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "rate_limits_identifier_timestamp_idx" ON "rate_limits"("identifier", "timestamp");
