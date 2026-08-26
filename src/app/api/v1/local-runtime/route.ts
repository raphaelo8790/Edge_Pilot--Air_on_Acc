/**
 * GET /api/v1/local-runtime — is Ollama running, and what does it have?
 *
 * Answers before a benchmark is attempted rather than after one fails. The
 * dashboard calls this when the local provider is selected, so the user is
 * told "running, 9 models" or "nothing answered on this host, here is the
 * command to start it" at the moment they make the choice.
 *
 * `ok` is the single field a caller needs to decide whether to enable a Run
 * button. `remedy` is what to show when it is false — never a bare failure.
 *
 * No credential is involved and no prompt is sent; this reads a version
 * string and a model list from the configured host.
 */

import { NextResponse } from 'next/server';
import { logForRequest } from '@/core/logging/sessionLogStore';
import { OllamaCatalog } from '@/modules/benchmark/infrastructure/OllamaCatalog';
import { toLocalRuntimeDto } from '@/modules/benchmark/application/dtos/LocalRuntime';
import {
  assertServerSide,
  loadBenchmarkConfig,
} from '@/modules/benchmark/infrastructure/config';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Takes the request only to resolve the session log. Whether the local
  // runtime answered - and what it was holding when it did - is the context
  // that makes a later measurement readable, so it belongs in the record.
  const log = logForRequest(request);

  try {
    assertServerSide('local-runtime route');

    const config = loadBenchmarkConfig();
    const status = await new OllamaCatalog({ host: config.ollamaHost }).status();

    log?.record(
      status.ok ? 'info' : 'warn',
      'runtime',
      status.ok
        ? `Local runtime reachable, ${status.models.length} models installed`
        : `Local runtime not reachable: ${status.message}`,
      {
        provider: 'ollama',
        state: status.state,
        // The host is configuration, not a credential: it is a LAN address or
        // localhost, and knowing which one was asked is half of any diagnosis.
        host: status.host,
        version: status.version,
        model_count: status.models.length,
        resident_models: status.models
          .filter((model) => model.resident === true)
          .map((model) => model.name),
        remedy: status.ok ? null : status.remedy,
      }
    );

    // The same mapping the browser applies to its own probe, so the two
    // answers are interchangeable. NOTE: hosted, this route describes the
    // SERVER's machine, which has no Ollama; the dashboard asks the
    // visitor's browser instead (see infrastructure/browser-ollama.ts).
    return NextResponse.json({ success: true, data: toLocalRuntimeDto(status) });
  } catch (error) {
    console.error('Local runtime status error:', error);

    log?.record('error', 'runtime', 'Local runtime check failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
