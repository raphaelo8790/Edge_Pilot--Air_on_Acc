/**
 * Single entry point for Prisma commands against the shared remote database.
 *
 * Replaces `dotenv -e .env.neon -- prisma ...`, which had two problems.
 *
 * It failed silently when .env.neon was absent: dotenv loaded nothing, Prisma
 * fell back to .env, and a command named "neon" ran against localhost while
 * reporting success.
 *
 * And flags did not survive the trip. `npx dotenv -e f -- prisma migrate
 * resolve --applied X` loses `--applied` somewhere between npx, dotenv-cli and
 * the shell, so Prisma complains that a flag you clearly passed is missing.
 *
 * This reads the file itself, sets the variables, prints the destination host
 * (never the credentials), and hands the remaining arguments to the local
 * Prisma binary untouched.
 *
 *   node scripts/db/neon.mjs migrate status
 *   node scripts/db/neon.mjs migrate deploy
 *   node scripts/db/neon.mjs migrate resolve --applied 20260726225537_init
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const ENV_FILE = '.env.neon';
const path = resolve(process.cwd(), ENV_FILE);

if (!existsSync(path)) {
  console.error(
    `\n  ${ENV_FILE} does not exist in ${process.cwd()}.\n` +
      '  Without it this would silently run against your local database. Refusing.\n'
  );
  process.exit(1);
}

const parsed = {};

for (const line of readFileSync(path, 'utf8').split('\n')) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);

  if (!match) {
    continue;
  }

  parsed[match[1]] = match[2].replace(/^["']|["']$/g, '');
}

if (!parsed.DATABASE_URL) {
  console.error(`\n  ${ENV_FILE} defines no DATABASE_URL. Refusing.\n`);
  process.exit(1);
}

let host;

try {
  host = new URL(parsed.DATABASE_URL).host;
} catch {
  console.error(`\n  DATABASE_URL in ${ENV_FILE} is not a valid URL. Refusing.\n`);
  process.exit(1);
}

if (/^(localhost|127\.|\[::1\]|host\.docker\.internal)/i.test(host)) {
  console.error(
    `\n  ${ENV_FILE} points at ${host}, which is local.\n` +
      '  These commands exist to target the shared remote database. Refusing.\n'
  );
  process.exit(1);
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('\n  Usage: node scripts/db/neon.mjs <prisma args...>\n');
  process.exit(1);
}

console.log(`\n  target : ${host}`);
console.log(`  command: prisma ${args.join(' ')}\n`);

/*
 * Runs Prisma's JavaScript entry point under this Node process rather than the
 * .bin shim.
 *
 * The shim needs shell: true on Windows, and Node does not quote the command
 * path when a shell is used - so a project path containing a space (this one
 * lives under "Air On Accountant Backup") gets split by cmd and you are told
 * that 'C:\Users\LoQ\Documents\Air' is not a recognised command. Resolving
 * the entry point and spawning node directly avoids the shell, and with it
 * every quoting rule that differs between cmd, PowerShell and sh.
 */
const require = createRequire(import.meta.url);

let entry;

try {
  const manifestPath = require.resolve('prisma/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const relative =
    typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.prisma;

  if (!relative) {
    throw new Error('prisma package.json declares no bin entry');
  }

  entry = resolve(dirname(manifestPath), relative);
} catch (error) {
  console.error(
    `\n  Could not locate the Prisma CLI: ${
      error instanceof Error ? error.message : 'unknown error'
    }\n  Is it installed? Try npm install.\n`
  );
  process.exit(1);
}

const child = spawn(process.execPath, [entry, ...args], {
  stdio: 'inherit',
  env: { ...process.env, ...parsed },
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
