/**
 * Prints the tables and columns the Neon database actually has, plus the
 * recorded migration history. Names only - no rows, no values. For the case
 * where `migrate deploy` says "nothing pending" but the schema disagrees.
 *
 *   node scripts/db/inspect-neon.mjs
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const parsed = {};
for (const line of readFileSync('.env.neon', 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) parsed[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!parsed.DIRECT_URL && !parsed.DATABASE_URL) {
  console.error('.env.neon has no DIRECT_URL/DATABASE_URL'); process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: parsed.DIRECT_URL ?? parsed.DATABASE_URL } } });

const columns = await prisma.$queryRawUnsafe(
  `select table_name, column_name from information_schema.columns
   where table_schema = 'public' order by table_name, ordinal_position`
);
const byTable = {};
for (const row of columns) (byTable[row.table_name] ??= []).push(row.column_name);
for (const [table, cols] of Object.entries(byTable)) console.log(`${table}: ${cols.join(', ')}`);

try {
  const history = await prisma.$queryRawUnsafe(
    `select migration_name, finished_at, rolled_back_at from "_prisma_migrations" order by started_at`
  );
  console.log('\n_prisma_migrations:');
  for (const h of history) console.log(`  ${h.migration_name}  finished=${h.finished_at ? 'yes' : 'no'}  rolled_back=${h.rolled_back_at ? 'yes' : 'no'}`);
} catch {
  console.log('\n(no _prisma_migrations table)');
}
await prisma.$disconnect();
