/**
 * The local runtime as the dashboard sees it — one shape whether it was asked
 * by the server (GET /api/v1/local-runtime, for the CLI and for a server that
 * happens to sit next to an Ollama) or by the browser (the visitor's own
 * machine, which is the case that matters once the app is hosted).
 */

import type { LocalRuntimeStatus } from '../../infrastructure/OllamaCatalog';
import {
  classifyModality,
  type Modality,
  type ModalityConfidence,
} from '../../core/services/ModelModality';

export interface LocalModelDto {
  name: string;
  size_bytes: number | null;
  parameter_size: string | null;
  quantization: string | null;
  families: string[];
  modality: Modality;
  modality_confidence: ModalityConfidence;
  modality_reason: string;
  /** Loaded in memory right now. Null when the runtime could not be asked. */
  resident: boolean | null;
}

export interface LocalRuntimeDto {
  provider: 'ollama';
  state: LocalRuntimeStatus['state'];
  ok: boolean;
  host: string | null;
  version: string | null;
  message: string;
  remedy: string | null;
  model_count: number;
  models: LocalModelDto[];
}

/**
 * Turns a runtime-reported parameter size into billions. Ollama reports
 * strings like "7.2B" or "566.70M". Anything unrecognised returns null, so a
 * normalised work-rate row is omitted rather than computed from a guess.
 */
export function parseParameterSize(raw: string | null): number | null {
  if (!raw) {
    return null;
  }

  const match = /^([0-9]+(?:\.[0-9]+)?)\s*([BM])$/i.exec(raw.trim());

  if (!match) {
    return null;
  }

  const value = Number(match[1]);

  if (!isFinite(value) || value <= 0) {
    return null;
  }

  return match[2].toUpperCase() === 'B' ? value : value / 1000;
}

export function toLocalRuntimeDto(status: LocalRuntimeStatus): LocalRuntimeDto {
  return {
    provider: 'ollama',
    state: status.state,
    ok: status.ok,
    host: status.host,
    version: status.version,
    message: status.message,
    remedy: status.remedy,
    model_count: status.models.length,
    // Each model carries what kind of work it can do. The classifier reads
    // the families the runtime reports; vision and embedding are identified
    // positively, and text is the residual - which is why the confidence
    // travels with the verdict instead of being dropped.
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
        resident: model.resident,
      };
    }),
  };
}
