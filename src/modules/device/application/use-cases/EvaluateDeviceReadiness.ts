/**
 * Evaluate Device Readiness - Application use case.
 *
 * This use case orchestrates the device readiness evaluation
 * by combining the device repository, AI service, and
 * deterministic evaluation logic.
 */

import type { Device, WorkloadRequirements, ComparisonResult } from '../../core/entities/DeviceEvaluator';
import { DeviceEvaluator } from '../../core/entities/DeviceEvaluator';
import type { DeviceRepository, AIServicePort } from '../../core/ports/DeviceRepository';

/**
 * Input for device readiness evaluation
 */
export interface EvaluateReadinessInput {
  workload: WorkloadRequirements;
  deviceId?: string; // Optional: evaluate specific device
}

/**
 * Output from device readiness evaluation
 */
export interface EvaluateReadinessOutput {
  devices: ComparisonResult[];
  aiInsight?: string;
  summary: {
    totalDevices: number;
    passed: number;
    conflicts: number;
    notMeasured: number;
  };
}

/**
 * Evaluate Device Readiness use case
 */
export class EvaluateDeviceReadiness {
  constructor(
    private deviceRepository: DeviceRepository,
    private aiService?: AIServicePort
  ) {}

  /**
   * Execute the use case
   */
  async execute(input: EvaluateReadinessInput): Promise<EvaluateReadinessOutput> {
    // 1. Get devices
    let devices: Device[];
    if (input.deviceId) {
      const device = await this.deviceRepository.getDeviceById(input.deviceId);
      devices = device ? [device] : [];
    } else {
      devices = await this.deviceRepository.getDevices();
    }

    // 2. Compare benchmarks (deterministic)
    const comparison = DeviceEvaluator.compare_benchmarks(devices, input.workload);

    // 3. Calculate summary
    const summary = {
      totalDevices: comparison.length,
      passed: comparison.filter((r) => r.state === 'PASSED').length,
      conflicts: comparison.filter((r) => r.state === 'CONFLICT_DETECTED').length,
      notMeasured: comparison.filter((r) => r.state === 'NOT_MEASURED').length,
    };

    // 4. Get AI insight if available
    let aiInsight: string | undefined;
    if (this.aiService && comparison.length > 0) {
      const topDevice = comparison[0];
      const prompt = `Analyze this device readiness result:
        Device: ${topDevice.deviceName}
        Score: ${topDevice.score}/100
        State: ${topDevice.state}
        Workload: ${input.workload.workloadType}
        Requires Heavy GPU: ${input.workload.requiresHeavyGPU}
        
        Provide a brief recommendation.`;
      aiInsight = await this.aiService.getInsight(prompt);
    }

    return {
      devices: comparison,
      aiInsight,
      summary,
    };
  }
}
