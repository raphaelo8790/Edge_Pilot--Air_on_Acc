/**
 * EdgePilot AI — database seed
 *
 * Baseline reference data: the provider catalog every environment starts with.
 * Run it with `npm run db:seed` (local) or `npm run db:neon:seed` (shared).
 *
 * Safe to re-run. upsert() with an empty `update` means an existing row is left
 * exactly as it is — so re-seeding never duplicates a provider and never
 * clobbers a local change (for example a provider you deactivated on purpose).
 *
 * Row data does not travel through git. Everyone gets the same providers only
 * because this file is committed and everyone runs it.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const providers = [
  {
    name: 'ollama',
    type: 'local',
    baseUrl: 'http://localhost:11434',
  },
  {
    name: 'gemini',
    type: 'cloud',
    baseUrl: null,
  },
  {
    name: 'groq',
    type: 'cloud',
    baseUrl: null,
  },
];

async function main() {
  for (const provider of providers) {
    await prisma.provider.upsert({
      where: { name: provider.name },
      update: {},
      create: provider,
    });
  }

  console.log(`Seeded ${providers.length} providers.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
