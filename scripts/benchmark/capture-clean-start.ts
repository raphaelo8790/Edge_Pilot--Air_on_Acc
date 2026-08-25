/**
 * Runs the documented clean-environment sequence and writes down exactly what
 * happened, into `evidence/benchmark/clean-start.log`.
 *
 *   npm run bench:clean-start
 *   npm run bench:clean-start -- --with-install --model=llama3.2:1b
 *   npm run bench:clean-start -- --dry-run
 *
 * The acceptance criterion this exists for is "Docker/WSL setup works from
 * written clean-environment instructions". A claim that it works is not
 * evidence; a log with the real commands, the real exit codes and the real
 * output is. So this script does not summarise, does not retry silently and
 * does not hide a failure — a failed step is written into the log with its
 * stderr and the run exits non-zero.
 *
 * It runs the same commands docs/local-model-setup.md tells a new person to
 * run, in the same order. If the two ever disagree, the doc is wrong: this
 * file is the executable copy.
 *
 * Flags
 *   --with-install     also run `npm ci` (slow, and it deletes node_modules).
 *                      Off by default so the script is safe to re-run while
 *                      you are working.
 *   --model=<name>     the model to pull into Ollama. Default llama3.2:1b.
 *   --skip-docker      do not touch Docker. For a machine where the runtime is
 *                      already up, or for capturing the Node half only.
 *   --skip-benchmark   do not run a live measured benchmark at the end.
 *   --out=<path>       default evidence/benchmark/clean-start.log
 *   --dry-run          print the plan, run nothing, write nothing.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { hostname, arch, cpus, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';

/** Anything longer than this in a single stream is truncated in the log. */
const MAX_CAPTURED_CHARACTERS = 20000;

const DEFAULT_MODEL = 'llama3.2:1b';
const OLLAMA_HEALTH_URL =
  process.env.OLLAMA_HOST !== undefined && process.env.OLLAMA_HOST !== ''
    ? `${process.env.OLLAMA_HOST.replace(/\/+$/, '')}/api/tags`
    : 'http://localhost:11434/api/tags';

interface Step {
  /** Short label used in the log and in the final summary. */
  label: string;
  /** The literal command, so a reader can copy it out of the log and re-run it. */
  command: string;
  /**
   * A required step failing fails the run. An optional step failing is
   * recorded and the run continues — `docker compose down` on a machine that
   * never had the stack up is not a problem worth failing over.
   */
  required: boolean;
  /** Milliseconds before the step is killed. */
  timeoutMs: number;
  /** Why this step is in the sequence at all. Copied into the log. */
  why: string;
}

interface StepResult {
  label: string;
  command: string;
  why: string;
  required: boolean;
  skipped: boolean;
  started_at: string;
  duration_ms: number;
  exit_code: number | null;
  timed_out: boolean;
  stdout: string;
  stderr: string;
  ok: boolean;
}

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((argument) => argument.startsWith(prefix));

  if (found !== undefined) {
    return found.slice(prefix.length);
  }

  return process.argv.includes(`--${name}`) ? 'true' : undefined;
}

function truncate(value: string): string {
  if (value.length <= MAX_CAPTURED_CHARACTERS) {
    return value;
  }

  return `${value.slice(0, MAX_CAPTURED_CHARACTERS)}\n… [${
    value.length - MAX_CAPTURED_CHARACTERS
  } more characters truncated by capture-clean-start.ts]`;
}

/**
 * Runs one command through the platform shell.
 *
 * `shell: true` on purpose: the sequence has to work identically from PowerShell,
 * from WSL and from a Linux CI runner, and `npm` is `npm.cmd` on Windows. Every
 * command string in this file is a literal written here — none is built from
 * user input — so there is nothing for a shell to interpolate unexpectedly.
 */
function run(step: Step): Promise<StepResult> {
  const startedAtIso = new Date().toISOString();
  const startedAt = Date.now();

  return new Promise<StepResult>((resolvePromise) => {
    const child = spawn(step.command, {
      shell: true,
      cwd: process.cwd(),
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, step.timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const finish = (code: number | null): void => {
      clearTimeout(timer);
      resolvePromise({
        label: step.label,
        command: step.command,
        why: step.why,
        required: step.required,
        skipped: false,
        started_at: startedAtIso,
        duration_ms: Date.now() - startedAt,
        exit_code: code,
        timed_out: timedOut,
        stdout: truncate(stdout.trim()),
        stderr: truncate(stderr.trim()),
        ok: code === 0 && !timedOut,
      });
    };

    // 'error' fires when the command could not be spawned at all — the usual
    // cause is that the binary is not on PATH, which is exactly the failure a
    // clean-environment log needs to record rather than swallow.
    child.on('error', (error: Error) => {
      stderr += `\n[spawn error] ${error.message}`;
      finish(null);
    });

    child.on('close', (code) => {
      finish(code);
    });
  });
}

/**
 * Polls the Ollama tags endpoint until it answers.
 *
 * The container reports healthy before the HTTP server is necessarily ready to
 * serve, and a benchmark fired one second too early records a connection
 * refusal as a measurement. Waiting here is what stops that.
 */
async function waitForOllama(timeoutMs: number): Promise<StepResult> {
  const startedAtIso = new Date().toISOString();
  const startedAt = Date.now();
  const attempts: string[] = [];
  let attempt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;

    try {
      const response = await fetch(OLLAMA_HEALTH_URL);
      const body = await response.text();

      if (response.ok) {
        attempts.push(
          `attempt ${attempt}: HTTP ${response.status} after ${
            Date.now() - startedAt
          } ms — ${truncate(body)}`
        );

        return {
          label: 'wait for the Ollama HTTP API',
          command: `GET ${OLLAMA_HEALTH_URL}`,
          why: 'The container is healthy before the HTTP server accepts requests. A benchmark fired too early records a connection refusal as a measurement.',
          required: true,
          skipped: false,
          started_at: startedAtIso,
          duration_ms: Date.now() - startedAt,
          exit_code: 0,
          timed_out: false,
          stdout: attempts.join('\n'),
          stderr: '',
          ok: true,
        };
      }

      attempts.push(`attempt ${attempt}: HTTP ${response.status}`);
    } catch (error) {
      attempts.push(
        `attempt ${attempt}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    await new Promise<void>((sleep) => {
      setTimeout(sleep, 2000);
    });
  }

  return {
    label: 'wait for the Ollama HTTP API',
    command: `GET ${OLLAMA_HEALTH_URL}`,
    why: 'The container is healthy before the HTTP server accepts requests.',
    required: true,
    skipped: false,
    started_at: startedAtIso,
    duration_ms: Date.now() - startedAt,
    exit_code: null,
    timed_out: true,
    stdout: truncate(attempts.join('\n')),
    stderr: `Gave up after ${timeoutMs} ms and ${attempt} attempts.`,
    ok: false,
  };
}

function machineSection(): string {
  const cores = cpus();

  return [
    `host              : ${hostname()}`,
    `platform          : ${platform()} ${release()} (${arch()})`,
    `cpu               : ${cores[0]?.model ?? 'unknown'} × ${cores.length}`,
    `memory            : ${(totalmem() / 1024 ** 3).toFixed(2)} GB`,
    `node              : ${process.version}`,
    `cwd               : ${process.cwd()}`,
    `ollama health url : ${OLLAMA_HEALTH_URL}`,
    // Not detected. A CPU figure and a GPU figure are not comparable, and
    // guessing which one this was would be inventing a fact about the run.
    `accelerator       : NOT DETECTED — state manually whether this run used a GPU`,
  ].join('\n');
}

function renderStep(index: number, result: StepResult): string {
  const status = result.skipped
    ? 'SKIPPED'
    : result.ok
      ? 'OK'
      : result.timed_out
        ? 'TIMED OUT'
        : 'FAILED';

  const lines = [
    '',
    '─'.repeat(78),
    `[${String(index).padStart(2, '0')}] ${result.label} — ${status}`,
    '─'.repeat(78),
    `why      : ${result.why}`,
    `command  : ${result.command}`,
    `started  : ${result.started_at}`,
    `duration : ${result.duration_ms} ms`,
    `exit code: ${result.exit_code === null ? 'none (not spawned or killed)' : result.exit_code}`,
    `required : ${result.required ? 'yes' : 'no'}`,
  ];

  if (result.skipped) {
    lines.push('', '(skipped by a flag — see the invocation at the top of this log)');
    return lines.join('\n');
  }

  if (result.stdout.length > 0) {
    lines.push('', '--- stdout ---', result.stdout);
  }

  if (result.stderr.length > 0) {
    lines.push('', '--- stderr ---', result.stderr);
  }

  if (result.stdout.length === 0 && result.stderr.length === 0) {
    lines.push('', '(no output)');
  }

  return lines.join('\n');
}

function skipped(step: Step, reason: string): StepResult {
  return {
    label: step.label,
    command: step.command,
    why: `${step.why} SKIPPED: ${reason}`,
    required: step.required,
    skipped: true,
    started_at: new Date().toISOString(),
    duration_ms: 0,
    exit_code: null,
    timed_out: false,
    stdout: '',
    stderr: '',
    ok: true,
  };
}

async function main(): Promise<void> {
  const model = flag('model') ?? DEFAULT_MODEL;
  const withInstall = flag('with-install') === 'true';
  const skipDocker = flag('skip-docker') === 'true';
  const skipBenchmark = flag('skip-benchmark') === 'true';
  const dryRun = flag('dry-run') === 'true';

  const output = resolve(
    process.cwd(),
    flag('out') ?? 'evidence/benchmark/clean-start.log'
  );

  const dockerSteps: Step[] = [
    {
      label: 'docker version',
      command: 'docker --version',
      required: true,
      timeoutMs: 30000,
      why: 'Records which Docker produced the rest of this log. Docker Desktop on Windows must have the WSL2 backend enabled.',
    },
    {
      label: 'docker compose version',
      command: 'docker compose version',
      required: true,
      timeoutMs: 30000,
      why: 'The repository uses the Compose V2 plugin syntax (`docker compose`, not `docker-compose`).',
    },
    {
      label: 'start Postgres and Ollama',
      command: 'docker compose --profile ollama up -d',
      required: true,
      timeoutMs: 900000,
      why: 'The documented first command. Postgres is unprofiled so it always starts; the ollama profile adds the local runtime.',
    },
    {
      label: 'container status',
      command: 'docker compose --profile ollama ps',
      required: true,
      timeoutMs: 60000,
      why: 'Proves what is actually running and on which ports, rather than asserting it.',
    },
  ];

  const pullStep: Step = {
    label: `pull ${model} into Ollama`,
    command: `docker compose --profile ollama exec -T ollama ollama pull ${model}`,
    required: true,
    timeoutMs: 1800000,
    why: 'A benchmark against a model that is not installed measures a download, not inference. Pulling first is what makes the later figures mean anything.',
  };

  const listStep: Step = {
    label: 'list installed models',
    command: 'docker compose --profile ollama exec -T ollama ollama list',
    required: true,
    timeoutMs: 120000,
    why: 'Names the exact model tag the measured run used. A tag is not a version, so the digest in this output is the reproducible identifier.',
  };

  const installStep: Step = {
    label: 'install dependencies from the lockfile',
    command: 'npm ci',
    required: true,
    timeoutMs: 1800000,
    why: '`npm ci` and not `npm install`: it installs exactly what package-lock.json pins and fails if the lockfile and package.json disagree, which is the point of a clean start.',
  };

  const nodeSteps: Step[] = [
    {
      label: 'node and npm versions',
      command: 'node --version && npm --version',
      required: true,
      timeoutMs: 30000,
      why: 'Records the toolchain. Next.js 16 needs Node 20.9 or newer.',
    },
    {
      label: 'generate the Prisma client',
      command: 'npx prisma generate',
      required: false,
      timeoutMs: 300000,
      why: 'The benchmark repository imports the generated client. Optional here because the provider layer and its tests do not touch the database.',
    },
    {
      label: 'typecheck',
      command: 'npx tsc --noEmit',
      required: true,
      timeoutMs: 600000,
      why: 'A clean checkout must typecheck before anything else is believable. `tsx` strips types without checking them, so nothing else in this list would have caught a type error in the scripts.',
    },
    {
      label: 'lint',
      command: 'npm run lint',
      required: true,
      timeoutMs: 600000,
      why: 'Zero errors is the bar. Warnings that predate this work package are listed in docs/benchmark/README.md rather than suppressed.',
    },
    {
      label: 'benchmark unit and integration tests',
      command: 'npx jest tests/benchmark --ci',
      required: true,
      timeoutMs: 900000,
      why: 'The whole benchmark suite: normal, invalid, timeout and fallback paths. Run directly through jest rather than `npm test` so the vision `pretest` hook does not regenerate fixtures inside a clean-start capture.',
    },
    {
      label: 'capture failure-mode evidence',
      command: 'npm run bench:evidence:failures',
      required: true,
      timeoutMs: 600000,
      why: 'Regenerates evidence/benchmark/failure-modes.json and exits non-zero if any error classification or fallback decision stopped matching the documented table.',
    },
    {
      label: 'production build',
      command: 'npm run build',
      required: false,
      timeoutMs: 1800000,
      why: 'Proves the Docker image will build. Optional, because it needs two things this module does not own: a generated Prisma client, and network access to Google Fonts for `next/font` in src/app/layout.tsx. Either being unavailable fails this step without anything being wrong with the code.',
    },
  ];

  const benchmarkStep: Step = {
    label: 'measured benchmark against the local model',
    command: `npm run bench:run -- --provider=ollama --model=${model} --iterations=5`,
    required: true,
    timeoutMs: 900000,
    why: 'The only step that produces measured numbers. Writes evidence/benchmark/measured-ollama-*.json.',
  };

  const plan: Step[] = [
    ...(skipDocker ? [] : dockerSteps),
    ...(skipDocker ? [] : [pullStep, listStep]),
    ...(withInstall ? [installStep] : []),
    ...nodeSteps,
    ...(skipBenchmark || skipDocker ? [] : [benchmarkStep]),
  ];

  if (dryRun) {
    console.log(
      [
        'capture-clean-start.ts — plan (nothing was run, nothing was written)',
        '',
        ...plan.map(
          (step, index) =>
            `  ${String(index + 1).padStart(2, '0')}. ${step.label}\n      ${step.command}`
        ),
        '',
        skipDocker
          ? '  (Docker steps skipped by --skip-docker)'
          : '  Between "start Postgres and Ollama" and the model pull, the script polls ' +
            OLLAMA_HEALTH_URL,
        '',
      ].join('\n')
    );
    return;
  }

  const invocation = `npm run bench:clean-start -- ${process.argv.slice(2).join(' ')}`.trim();
  const runStartedAt = new Date().toISOString();
  const results: StepResult[] = [];

  console.log(`Capturing a clean start into ${output}\n`);

  let dockerUp = !skipDocker;

  for (const step of plan) {
    const isOllamaDependent =
      step === pullStep || step === listStep || step === benchmarkStep;

    if (isOllamaDependent && !dockerUp) {
      results.push(
        skipped(step, 'an earlier required Docker step did not succeed')
      );
      continue;
    }

    console.log(`→ ${step.label}`);

    const result = await run(step);
    results.push(result);

    console.log(
      `  ${result.ok ? 'ok' : result.timed_out ? 'TIMED OUT' : 'FAILED'} (${result.duration_ms} ms)`
    );

    if (!result.ok && result.required && step.command.startsWith('docker')) {
      dockerUp = false;
    }

    // The health poll belongs immediately after the stack comes up, not as a
    // fixed sleep: a fixed sleep is either too short on a cold machine or
    // wasted time on a warm one.
    if (step === dockerSteps[2] && result.ok) {
      console.log('→ wait for the Ollama HTTP API');
      const health = await waitForOllama(180000);
      results.push(health);
      console.log(`  ${health.ok ? 'ok' : 'FAILED'} (${health.duration_ms} ms)`);

      if (!health.ok) {
        dockerUp = false;
      }
    }
  }

  const failures = results.filter((result) => !result.ok && result.required);
  const optionalFailures = results.filter(
    (result) => !result.ok && !result.required
  );

  const header = [
    '='.repeat(78),
    'EdgePilot AI — clean-environment start, captured automatically',
    '='.repeat(78),
    '',
    'WHAT THIS LOG IS',
    '  The output of scripts/benchmark/capture-clean-start.ts, which runs the',
    '  same commands docs/local-model-setup.md gives a new person, in the same',
    '  order, on a real machine. Every exit code and every line of output below',
    '  came from that run. Nothing here was written by hand.',
    '',
    'WHAT IT PROVES',
    '  That the documented setup sequence completes on this machine, with these',
    '  versions, on this date — and, where a step failed, exactly how it failed.',
    '',
    'WHAT IT DOES NOT PROVE',
    '  Nothing about a different operating system, a different Docker version,',
    '  or a machine with a GPU when this one had none. The durations below are',
    '  setup times, not benchmark measurements: measured inference figures live',
    '  in evidence/benchmark/measured-*.json and nowhere else.',
    '',
    `invocation : ${invocation}`,
    `started    : ${runStartedAt}`,
    `finished   : ${new Date().toISOString()}`,
    `steps      : ${results.length} (${results.filter((r) => r.ok && !r.skipped).length} ok, ${failures.length} required failures, ${optionalFailures.length} optional failures, ${results.filter((r) => r.skipped).length} skipped)`,
    '',
    'MACHINE',
    machineSection(),
    '',
    'RESULT',
    failures.length === 0
      ? '  PASS — every required step succeeded.'
      : `  FAIL — ${failures.length} required step(s) did not succeed: ${failures
          .map((failure) => failure.label)
          .join(', ')}.`,
  ].join('\n');

  const body = results
    .map((result, index) => renderStep(index + 1, result))
    .join('\n');

  const document = `${header}\n${body}\n\n${'='.repeat(78)}\nEnd of capture.\n`;

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, document, 'utf8');

  console.log(`\nWrote ${output}`);
  console.log(
    failures.length === 0
      ? '  PASS — every required step succeeded.'
      : `  FAIL — required steps that did not succeed: ${failures.map((failure) => failure.label).join(', ')}`
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
