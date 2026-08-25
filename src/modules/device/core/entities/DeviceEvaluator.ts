/**
 * Device Evaluator - Core domain logic for device readiness evaluation.
 *
 * Provides deterministic readiness scoring and benchmark comparison
 * for AI workload deployment decisions.
 *
 * This module is framework-agnostic and has no dependencies on
 * infrastructure or UI layers.
 */

import { z } from 'zod';

/**
 * Device tier classification
 */
export const DeviceTier = z.enum(['edge', 'local', 'cloud']);
export type DeviceTier = z.infer<typeof DeviceTier>;

/**
 * Device status for readiness evaluation
 */
export const DeviceStatus = z.enum(['ready', 'not-measured', 'conflict']);
export type DeviceStatus = z.infer<typeof DeviceStatus>;

/**
 * Device specifications schema
 */
export const DeviceSpecsSchema = z.object({
  ram: z.string(),
  hasGPU: z.boolean().default(false),
});
export type DeviceSpecs = z.infer<typeof DeviceSpecsSchema>;

/**
 * Device schema for validation
 */
export const DeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  architecture: z.string(),
  tier: DeviceTier,
  status: DeviceStatus.optional(),
  specs: DeviceSpecsSchema.optional(),
});
export type Device = z.infer<typeof DeviceSchema>;

/**
 * Workload requirements for device evaluation
 */
export interface WorkloadRequirements {
  workloadType: string;
  requiresHeavyGPU: boolean;
  minRAM?: number;
  requiresLocalInference?: boolean;
}

/**
 * Readiness evaluation result
 */
export interface ReadinessResult {
  score: number;
  state: 'NOT_MEASURED' | 'CONFLICT_DETECTED' | 'PASSED';
  details: string;
}

/**
 * Comparison result for benchmark ranking
 */
export interface ComparisonResult {
  deviceName: string;
  tier: DeviceTier;
  score: number;
  state: ReadinessResult['state'];
  details: string;
}

/**
 * DeviceEvaluator - Deterministic device readiness scoring
 *
 * This class provides two core deterministic tools:
 * 1. readiness_score() - Evaluates a single device against workload requirements
 * 2. compare_benchmarks() - Ranks multiple devices by readiness score
 *
 * Both functions are deterministic: same inputs always produce same outputs.
 */
export class DeviceEvaluator {
  /**
   * Calculate readiness score for a device against workload requirements.
   *
   * @param device - Device to evaluate
   * @param workload - Workload requirements
   * @returns ReadinessResult with score (0-100), state, and details
   */
  static readiness_score(
    device: Device,
    workload: WorkloadRequirements
  ): ReadinessResult {
    // Handle not-measured devices
    if (!device.status || device.status === 'not-measured') {
      return {
        score: 0,
        state: 'NOT_MEASURED',
        details: 'Not enough data to evaluate this device.',
      };
    }

    // Handle conflict: edge device with heavy GPU workload
    if (device.tier === 'edge' && workload.requiresHeavyGPU) {
      return {
        score: 20,
        state: 'CONFLICT_DETECTED',
        details: 'Edge device cannot handle heavy GPU workload.',
      };
    }

    // Calculate base score
    let score = 70;

    // Bonus for cloud or GPU-equipped devices
    if (device.tier === 'cloud' || device.specs?.hasGPU) {
      score += 25;
    }

    // Bonus for ready status
    if (device.status === 'ready') {
      score += 5;
    }

    // Cap at 100
    score = Math.min(score, 100);

    return {
      score,
      state: 'PASSED',
      details: `${device.name} fits the workload requirements well.`,
    };
  }

  /**
   * Compare multiple devices and rank by readiness score.
   *
   * @param devices - Array of devices to compare
   * @param workload - Workload requirements
   * @returns Array of ComparisonResult sorted by score (descending)
   */
  static compare_benchmarks(
    devices: Device[],
    workload: WorkloadRequirements
  ): ComparisonResult[] {
    const results: ComparisonResult[] = devices.map((device) => {
      const evaluation = this.readiness_score(device, workload);
      return {
        deviceName: device.name,
        tier: device.tier,
        score: evaluation.score,
        state: evaluation.state,
        details: evaluation.details,
      };
    });

    // Sort by score descending (highest readiness first)
    return results.sort((a, b) => b.score - a.score);
  }
}
