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
import { OllamaCatalog } from '@/modules/benchmark/infrastructure/OllamaCatalog';
import { classifyModality } from '@/modules/benchmark/core/services/ModelModality';
import {
  assertServerSide,
  loadBenchmarkConfig,
} from '@/modules/benchmark/infrastructure/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    assertServerSide('local-runtime route');

    const config = loadBenchmarkConfig();
    const status = await new OllamaCatalog({ host: config.ollamaHost }).status();

    return NextResponse.json({
      success: true,
      data: {
        provider: 'ollama',
        state: status.state,
        ok: status.ok,
        host: status.host,
        version: status.version,
        message: status.message,
        remedy: status.remedy,
        model_count: status.models.length,
        // Each model carries what kind of work it can do. The classifier
        // reads the families the runtime reports; vision and embedding are
        // identified positively, and text is the residual - which is why the
        // confidence travels with the verdict instead of being dropped.
        models: status.models.map((model) => {
          const verdict = classifyModality(model.name, model.families);

          return {
            name: model.name,
            size_bytes: model.sizeBytes,
            parameter_size: model.parameterSize,
            quantization: model.quantization,
            families: model.families,
            modality: verdict.modality,
            modality_confidence: verdict.confidence,
            modality_reason: verdict.reason,
            // Loaded right now, from /api/ps. Null when that call failed —
            // "we could not ask" is not "it is asleep".
            resident: model.resident,
          };
        }),
      },
    });
  } catch (error) {
    console.error('Local runtime status error:', error);

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
