import { z } from 'zod';
import {
  VISION_DATASET_ID,
  VISION_LABELS,
  VISION_WORKLOAD_ID,
} from './types';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const GitCommitSchema = z.string().regex(/^[a-f0-9]{7,40}$/);
const RateSchema = z.number().finite().min(0).max(1);
const NonNegativeFiniteNumberSchema = z.number().finite().min(0);

export const VisionLabelSchema = z.enum(VISION_LABELS);

export const VisionBenchmarkSampleSchema = z.object({
  id: z.string().min(1).max(120),
  imagePath: z.string().min(1).max(500),
  expectedLabel: VisionLabelSchema,
  sourceId: z.string().min(1).max(120),
  licenseSpdx: z.literal('MIT'),
  licenseVerified: z.literal(true),
  privacyReviewed: z.literal(true),
  containsPeople: z.literal(false),
  containsFaces: z.literal(false),
  containsPersonalData: z.literal(false),
  exifPresent: z.literal(false),
  sha256: Sha256Schema,
});

export const VisionDatasetManifestSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    datasetId: z.literal(VISION_DATASET_ID),
    workloadId: z.literal(VISION_WORKLOAD_ID),
    manifestVersion: z.string().min(1).max(40),
    status: z.enum(['draft', 'ready']),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(1000),
    source: z.object({
      type: z.literal('project_generated_synthetic'),
      generator: z.literal(
        'scripts/vision-benchmark/generate-fixtures.mjs'
      ),
      repository: z
        .string()
        .url()
        .refine((value) => value.startsWith('https://github.com/')),
      createdBy: z.string().min(1).max(200),
    }),
    license: z.object({
      spdxId: z.literal('MIT'),
      file: z.literal('LICENSE'),
      redistributionAllowed: z.literal(true),
      commercialUseAllowed: z.literal(true),
    }),
    labels: z.array(VisionLabelSchema).length(VISION_LABELS.length),
    privacyChecks: z.object({
      peopleAllowed: z.literal(false),
      facesAllowed: z.literal(false),
      personalDataAllowed: z.literal(false),
      locationMetadataAllowed: z.literal(false),
      exifMustBeRemoved: z.literal(true),
      manualReviewRequired: z.literal(true),
      manualReviewCompleted: z.literal(true),
    }),
    generation: z.object({
      width: z.literal(256),
      height: z.literal(256),
      samplesPerLabel: z.literal(3),
      deterministic: z.literal(true),
    }),
    samples: z.array(VisionBenchmarkSampleSchema),
  })
  .superRefine((manifest, context) => {
    if (new Set(manifest.labels).size !== VISION_LABELS.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['labels'],
        message: 'The manifest must contain every supported label once.',
      });
    }

    const sampleIds = manifest.samples.map((sample) => sample.id);

    if (new Set(sampleIds).size !== sampleIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['samples'],
        message: 'Duplicate sample identifiers are not allowed.',
      });
    }

    if (manifest.status === 'ready') {
      for (const label of VISION_LABELS) {
        const count = manifest.samples.filter(
          (sample) => sample.expectedLabel === label
        ).length;

        if (count !== manifest.generation.samplesPerLabel) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['samples'],
            message: `A ready manifest requires exactly three '${label}' samples.`,
          });
        }
      }
    }
  });

export const VisionBenchmarkThresholdsSchema = z.object({
  minimumAccuracy: RateSchema,
  minimumMacroF1: RateSchema,
  maximumInvalidOutputRate: RateSchema,
  minimumSuccessfulRequestRate: RateSchema,
});

export const VisionPredictionRecordSchema = z.object({
  sampleId: z.string().min(1),
  expectedLabel: VisionLabelSchema,
  rawOutput: z.string(),
  normalizedLabel: VisionLabelSchema.nullable(),
  latencyMs: NonNegativeFiniteNumberSchema,
  providerSuccess: z.boolean(),
  errorCategory: z
    .enum(['provider_error', 'invalid_output'])
    .nullable(),
});

export const VisionClassMetricsSchema = z.object({
  label: VisionLabelSchema,
  truePositive: z.number().int().nonnegative(),
  falsePositive: z.number().int().nonnegative(),
  falseNegative: z.number().int().nonnegative(),
  precision: RateSchema,
  recall: RateSchema,
  f1: RateSchema,
  support: z.number().int().nonnegative(),
});

export const VisionAggregateMetricsSchema = z.object({
  totalSamples: z.number().int().positive(),
  correctPredictions: z.number().int().nonnegative(),
  exactMatchAccuracy: RateSchema,
  macroPrecision: RateSchema,
  macroRecall: RateSchema,
  macroF1: RateSchema,
  invalidOutputRate: RateSchema,
  successfulRequestRate: RateSchema,
  medianLatencyMs: NonNegativeFiniteNumberSchema,
  p95LatencyMs: NonNegativeFiniteNumberSchema,
  throughputSamplesPerSecond: NonNegativeFiniteNumberSchema,
  perClass: z
    .array(VisionClassMetricsSchema)
    .length(VISION_LABELS.length),
});

export const VisionBenchmarkEvidenceSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    workloadId: z.literal(VISION_WORKLOAD_ID),
    workloadVersion: z.string().min(1),
    datasetId: z.literal(VISION_DATASET_ID),
    manifestVersion: z.string().min(1),
    manifestSha256: Sha256Schema,
    preprocessingVersion: z.string().min(1),
    promptVersion: z.string().min(1),
    executionMode: z.enum(['controlled', 'live']),
    provider: z.string().min(1),
    providerKind: z.enum(['local', 'cloud']),
    model: z.string().min(1),
    deviceProfileId: z.string().min(1),
    gitCommitSha: GitCommitSchema,
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    records: z.array(VisionPredictionRecordSchema).min(1),
    metrics: VisionAggregateMetricsSchema,
    thresholds: VisionBenchmarkThresholdsSchema,
    passed: z.boolean(),
    limitations: z.array(z.string().min(1)),
  })
  .superRefine((evidence, context) => {
    if (evidence.records.length !== evidence.metrics.totalSamples) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['metrics', 'totalSamples'],
        message: 'Metric sample count must match the evidence records.',
      });
    }

    if (new Set(evidence.records.map((item) => item.sampleId)).size !==
      evidence.records.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['records'],
        message: 'Evidence records must have unique sample identifiers.',
      });
    }

    if (new Date(evidence.completedAt) < new Date(evidence.startedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['completedAt'],
        message: 'Completion time cannot be before the start time.',
      });
    }

    const expectedPass =
      evidence.metrics.exactMatchAccuracy >=
        evidence.thresholds.minimumAccuracy &&
      evidence.metrics.macroF1 >=
        evidence.thresholds.minimumMacroF1 &&
      evidence.metrics.invalidOutputRate <=
        evidence.thresholds.maximumInvalidOutputRate &&
      evidence.metrics.successfulRequestRate >=
        evidence.thresholds.minimumSuccessfulRequestRate;

    if (evidence.passed !== expectedPass) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['passed'],
        message: 'Pass status must match the recorded metrics and thresholds.',
      });
    }
  });

export const VisionBenchmarkRunRequestSchema = z.object({
  workloadId: z.literal(VISION_WORKLOAD_ID),
  provider: z.enum(['ollama', 'gemini']),
  model: z.string().min(1).max(200),
  deviceProfileId: z.string().min(1).max(200),
  gitCommitSha: GitCommitSchema,
  promptVersion: z.string().min(1).max(40),
  prompt: z.string().min(1).max(4000),
  thresholds: VisionBenchmarkThresholdsSchema.partial().optional(),
});

export const VisionDashboardRowSchema = z.object({
  workloadId: z.literal(VISION_WORKLOAD_ID),
  datasetId: z.literal(VISION_DATASET_ID),
  provider: z.string().min(1),
  providerKind: z.enum(['local', 'cloud']),
  model: z.string().min(1),
  executionMode: z.enum(['controlled', 'live']),
  sampleCount: z.number().int().positive(),
  accuracy: RateSchema,
  macroF1: RateSchema,
  invalidOutputRate: RateSchema,
  successfulRequestRate: RateSchema,
  medianLatencyMs: NonNegativeFiniteNumberSchema,
  p95LatencyMs: NonNegativeFiniteNumberSchema,
  throughputSamplesPerSecond: NonNegativeFiniteNumberSchema,
  passed: z.boolean(),
  completedAt: z.string().datetime(),
});

export type VisionDatasetManifest = z.infer<
  typeof VisionDatasetManifestSchema
>;

export type VisionBenchmarkRunRequest = z.infer<
  typeof VisionBenchmarkRunRequestSchema
>;
