/**
 * Guard for the `db:neon:*` scripts.
 *
 * `dotenv -e .env.neon -- prisma migrate deploy` fails SILENTLY when the file
 * is missing: dotenv-cli loads nothing, Prisma falls back to its own .env, and
 * the command reports success against whatever that points at. A run intended
 * for Neon quietly hit localhost and printed "No pending migrations to apply."
 *
 * The inverse is the dangerous one. A file that is present but points
 * somewhere unexpected would let a command that looks local reach a shared
 * database, and `migrate` against the wrong database is not recoverable by
 * reading the output afterwards.
 *
 * So: refuse to proceed unless the file exists, parses, and names a host that
 * is plausibly remote. Print the host - never the credentials - so whoever ran
 * it can see where it is about to go.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const target = process.argv[2];

if (!target) {
  console.error('require-env-file: no file given.');
  process.exit(1);
}

const path = resolve(process.cwd(), target);

if (!existsSync(path)) {
  console.error(
    `\n  ${target} does not exist in ${process.cwd()}.\n\n` +
      '  Without it, dotenv loads nothing and Prisma silently falls back to .env,\n' +
      '  so this command would run against your LOCAL database while appearing to\n' +
      '  target the remote one. Refusing to continue.\n'
  );
  process.exit(1);
}

const contents = readFileSync(path, 'utf8');
const match = /^\s*DATABASE_URL\s*=\s*["']?([^"'\n]+)/m.exec(contents);

if (!match) {
  console.error(`\n  ${target} defines no DATABASE_URL. Refusing to continue.\n`);
  process.exit(1);
}

let host;

try {
  host = new URL(match[1]).host;
} catch {
  console.error(`\n  DATABASE_URL in ${target} is not a valid URL. Refusing to continue.\n`);
  process.exit(1);
}

const isLocal = /^(localhost|127\.|\[::1\]|host\.docker\.internal)/i.test(host);

if (isLocal) {
  console.error(
    `\n  ${target} points at ${host}, which is local.\n\n` +
      '  These scripts exist to target the shared remote database. Running them\n' +
      '  against localhost means the name of the command no longer describes what\n' +
      '  it does. Refusing to continue.\n'
  );
  process.exit(1);
}

console.log(`  ${target} -> ${host}`);
