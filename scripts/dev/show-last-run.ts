/**
 * Dev helper: print what the LAST benchmark run actually persisted.
 *
 * The dashboard reports `persisted: true`, but that is the API telling you
 * what it believes. This reads the database directly, so it is independent
 * evidence that the rows are really there.
 *
 * Usage:  node --import tsx scripts/dev/show-last-run.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function ms(n: number | null | undefined) {
  return n === null || n === undefined ? '     —  ' : n.toFixed(1).padStart(8);
}

async function main() {
  const count = await prisma.benchmark.count();
  console.log(`benchmarks table: ${count} row(s) total\n`);

  const run = await prisma.benchmark.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      provider: true,
      results: { orderBy: { iteration: 'asc' } },
      readiness: true,
    },
  });

  if (!run) {
    console.log('No benchmark rows. The dashboard run did not persist.');
    return;
  }

  console.log('LAST RUN');
  console.log(`  id           ${run.id}`);
  console.log(`  provider     ${run.provider.name}`);
  console.log(`  model        ${run.model}`);
  console.log(`  status       ${run.status}`);
  console.log(`  iterations   ${run.iterations} requested`);
  console.log(`  created      ${run.createdAt.toISOString()}`);
  console.log(`  completed    ${run.completedAt?.toISOString() ?? 'NULL (never marked complete)'}`);
  console.log(`  workload_id  ${run.workloadId}`);
  console.log(`  user_id      ${run.userId}`);

  console.log(`\n  RESULT ROWS: ${run.results.length}`);
  if (run.results.length) {
    console.log('  iter   latency      ttft     tok/s   ok');
    for (const r of run.results) {
      console.log(
        `  ${String(r.iteration).padStart(4)} ${ms(r.latencyMs)} ${ms(r.ttftMs)} ${ms(
          r.tokensPerSecond
        )}   ${r.success ? 'y' : 'N  ' + (r.errorMessage ?? '')}`
      );
    }
    // iteration 0 is the discarded warm-up; 1..n are the measured ones.
    const warmUpRow = run.results.find((r) => r.warmup);
    const measured = run.results.filter((r) => !r.warmup && r.success);

    if (warmUpRow) {
      console.log(
        `\n  cold start (iter 0, NOT counted): latency ${warmUpRow.latencyMs.toFixed(1)} ms, ttft ${
          warmUpRow.ttftMs?.toFixed(1) ?? '—'
        } ms`
      );
    }

    if (measured.length > 0) {
      const warm = measured;
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      console.log(
        `  warm (rest):   latency ${mean(warm.map((r) => r.latencyMs)).toFixed(
          1
        )} ms, ttft ${mean(warm.map((r) => r.ttftMs ?? 0)).toFixed(1)} ms`
      );
    }
  }

  console.log('\n  READINESS ROW:');
  if (!run.readiness) {
    console.log('    none stored');
  } else {
    const r = run.readiness;
    console.log(
      `    overall ${r.overallReadiness}  = hardware ${r.hardwareFit ?? 'null (not assessed)'} (x0.25, MEASURED from GPU residency)`
    );
    console.log(`                    + latency  ${r.latencyScore} (x0.20, measured)`);
    console.log(`                    + cost     ${r.costScore} (x0.15, assumed $0)`);
    console.log(`                    + reliab.  ${r.reliabilityScore} (x0.20, measured)`);
    console.log(
      `    privacy is NOT scored: recorded as class ${r.privacyClass ?? 'null'} (see PrivacyAssessor)`
    );
    console.log(`    recommendation: ${r.recommendation}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
