import {
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { VisionBenchmarkEvidenceSchema } from '../core/schemas';
import { VisionBenchmarkEvidence } from '../core/types';

const SAFE_EVIDENCE_FILENAME = /^[a-z0-9._-]+\.json$/;

function defaultEvidenceFileName(
  evidence: VisionBenchmarkEvidence
): string {
  // Lowercased because SAFE_EVIDENCE_FILENAME accepts [a-z0-9._-] only, and
  // an ISO timestamp carries an uppercase T and Z. Without this, save() threw
  // "The evidence filename is not safe" on every run that did not pass a
  // filename by hand - which is every live run. The controlled generator
  // passes 'controlled-ollama.json' explicitly, so the fixtures hid the bug.
  const timestamp = evidence.completedAt
    .replace(/[:.]/g, '-')
    .toLowerCase();
  const provider = evidence.provider
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-');
  const model = evidence.model
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-');

  return `${evidence.executionMode}-${provider}-${model}-${timestamp}.json`;
}

export class FileVisionEvidenceStore {
  constructor(private readonly directory: string) {}

  async save(
    unvalidatedEvidence: VisionBenchmarkEvidence,
    fileName?: string
  ): Promise<string> {
    const evidence = VisionBenchmarkEvidenceSchema.parse(
      unvalidatedEvidence
    );
    const resolvedFileName =
      fileName ?? defaultEvidenceFileName(evidence);

    if (!SAFE_EVIDENCE_FILENAME.test(resolvedFileName)) {
      throw new Error('The evidence filename is not safe.');
    }

    await mkdir(this.directory, { recursive: true });

    const destination = path.join(
      this.directory,
      resolvedFileName
    );

    await writeFile(
      destination,
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8'
    );

    return destination;
  }

  async readAll(): Promise<VisionBenchmarkEvidence[]> {
    let fileNames: string[];

    try {
      fileNames = await readdir(this.directory);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return [];
      }

      throw error;
    }

    const evidence: VisionBenchmarkEvidence[] = [];

    for (const fileName of fileNames.sort()) {
      if (!SAFE_EVIDENCE_FILENAME.test(fileName)) {
        continue;
      }

      const raw = await readFile(
        path.join(this.directory, fileName),
        'utf8'
      );

      evidence.push(
        VisionBenchmarkEvidenceSchema.parse(JSON.parse(raw))
      );
    }

    return evidence.sort((left, right) =>
      right.completedAt.localeCompare(left.completedAt)
    );
  }
}
