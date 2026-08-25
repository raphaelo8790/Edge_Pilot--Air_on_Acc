/*
  Warnings:

  - You are about to drop the column `device_id` on the `benchmarks` table.
  - You are about to drop the `devices` table.

  This is deliberate and destructive. The devices table stored a machine's
  name, CPU, RAM, GPU, storage and network, all typed in by hand. No
  measurement, score or query ever read any of those six columns back:
  RunBenchmark loaded a device row only to check who owned it, and hardware
  fit is measured from what the runtime reports about GPU residency
  (/api/ps size_vram / size), not from a spec sheet.

  Any run recorded before this keeps its measurements. It loses only the
  pointer to a row that described nothing.
*/

-- DropForeignKey
ALTER TABLE "benchmarks" DROP CONSTRAINT "benchmarks_device_id_fkey";

-- DropForeignKey
ALTER TABLE "devices" DROP CONSTRAINT "devices_user_id_fkey";

-- DropIndex
DROP INDEX "benchmarks_device_id_idx";

-- AlterTable
ALTER TABLE "benchmarks" DROP COLUMN "device_id";

-- DropTable
DROP TABLE "devices";
