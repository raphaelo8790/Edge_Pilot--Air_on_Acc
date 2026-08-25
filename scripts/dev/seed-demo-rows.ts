/**
 * Local-only helper: create the rows a benchmark run needs.
 *
 * MOSTLY OBSOLETE. This existed because POST /api/v1/workloads and
 * POST /api/v1/devices were scaffold stubs that echoed `temp-workload-id` /
 * `temp-device-id` and never wrote to the database, so an end-to-end run had
 * to have its rows seeded from outside and their uuids pasted into the
 * dashboard by hand.
 *
 * Both endpoints persist now, own their rows by session id, and the dashboard
 * no longer has a field to paste a uuid into. The normal way to get these
 * rows is to open the dashboard and fill in step 1.
 *
 * Still useful for driving a run from curl or a script, where there is no
 * dashboard to click. RunBenchmark derives ownership from `workloads.user_id`,
 * refuses a workload it cannot find (404), and refuses a device owned by a
 * different user (403), so the two rows it prints must belong to one user.
 *
 * Idempotent: re-running reuses the same demo user, workload and device.
 *
 * Run against the LOCAL docker database only:
 *     node --import tsx scripts/dev/seed-demo-rows.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'local-demo@edgepilot.invalid';

async function main() {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, name: 'Local demo user' },
  });

  let workload = await prisma.workload.findFirst({
    where: { userId: user.id, taskType: 'text_generation' },
  });
  if (!workload) {
    workload = await prisma.workload.create({
      data: {
        taskType: 'text_generation',
        inputFormat: 'text/plain',
        outputFormat: 'text/plain',
        constraints: { maxLatencyMs: 5000, privacy: 'local-only' },
        userId: user.id,
      },
    });
  }

  console.log('');
  console.log('Paste these into the dashboard (step 1, "use an existing id"):');
  console.log('');
  console.log('  workload_id  ' + workload.id);
  console.log('');
  console.log('  (owner user_id ' + user.id + ')');
  console.log('');
  console.log('There is no device id any more. The devices table stored a name,');
  console.log('CPU, RAM, GPU and storage that no measurement ever read, and hardware');
  console.log('fit now comes from what the runtime reports about GPU residency during');
  console.log('the run. The dashboard needs nothing pasted: describe the workload in');
  console.log('step 1 and it owns the row by session.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
