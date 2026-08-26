/**
 * GET /api/v1/providers/models?provider=gemini|groq — which models can the
 * configured key for a cloud provider actually run?
 *
 * The cloud counterpart of /api/v1/local-runtime. The dashboard calls it when
 * Gemini or Groq is selected, so the model field can be a list of real names
 * instead of a free-text box that fails with `invalid_model` after the run
 * has already been sent.
 *
 * The key is read from server configuration and sent to the vendor in a
 * header. Nothing about it — not its presence, not a fragment — is in this
 * response beyond the boolean the providers endpoint already exposes.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logForRequest } from '@/core/logging/sessionLogStore';
import {
  applyVisitorKeys,
  visitorKeysFrom,
} from '@/modules/benchmark/infrastructure/visitor-keys';
import { CloudCatalog } from '@/modules/benchmark/infrastructure/CloudCatalog';
import {
  assertServerSide,
  loadBenchmarkConfig,
} from '@/modules/benchmark/infrastructure/config';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  provider: z.enum(['gemini', 'groq']),
});

export async function GET(request: Request) {
  const log = logForRequest(request);

  try {
    assertServerSide('providers/models route');

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      provider: url.searchParams.get('provider') ?? '',
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unknown provider',
          details: 'provider must be "gemini" or "groq". Ollama is listed by /api/v1/local-runtime.',
        },
        { status: 400 }
      );
    }

    const { provider } = parsed.data;
    // The visitor's own key, when they set one, else the server's.
    const config = applyVisitorKeys(loadBenchmarkConfig(), visitorKeysFrom(request));
    const status = await new CloudCatalog({
      provider,
      apiKey: provider === 'gemini' ? config.geminiApiKey : config.groqApiKey,
    }).status();

    log?.record(
      status.ok ? 'info' : 'warn',
      'runtime',
      status.ok
        ? `${provider} lists ${status.models.length} text models`
        : `${provider} catalogue unavailable: ${status.message}`,
      {
        provider,
        model_count: status.models.length,
        omitted_count: status.omittedCount,
        remedy: status.remedy,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        provider,
        ok: status.ok,
        message: status.message,
        remedy: status.remedy,
        model_count: status.models.length,
        omitted_count: status.omittedCount,
        models: status.models.map((model) => ({
          name: model.name,
          display_name: model.displayName,
          context_window: model.contextWindow,
          supports_vision: model.supportsVision,
        })),
      },
    });
  } catch (error) {
    console.error('Provider models error:', error);

    log?.record('error', 'runtime', 'Provider catalogue check failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
