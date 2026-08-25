/**
 * Device Evaluator Tests
 *
 * Tests for the deterministic readiness scoring and benchmark comparison.
 */

import { describe, it, expect } from '@jest/globals';
import {
  DeviceEvaluator,
  DeviceSchema,
  type Device,
  type WorkloadRequirements,
} from '../../src/modules/device/core/entities/DeviceEvaluator';

describe('DeviceEvaluator', () => {
  // Test data
  const edgeDevice: Device = {
    id: 'edge-pi4',
    name: 'Raspberry Pi 4',
    architecture: 'ARM64',
    tier: 'edge',
    status: 'ready',
    specs: { ram: '4GB', hasGPU: false },
  };

  const localDevice: Device = {
    id: 'local-m1',
    name: 'MacBook Air M1',
    architecture: 'ARM64',
    tier: 'local',
    status: 'ready',
    specs: { ram: '8GB', hasGPU: true },
  };

  const cloudDevice: Device = {
    id: 'cloud-gpu',
    name: 'Cloud VM GPU',
    architecture: 'x86_64',
    tier: 'cloud',
    status: 'ready',
    specs: { ram: '16GB', hasGPU: true },
  };

  const notMeasuredDevice: Device = {
    id: 'unknown',
    name: 'Unknown Device',
    architecture: 'unknown',
    tier: 'local',
    status: 'not-measured',
  };

  const gpuWorkload: WorkloadRequirements = {
    workloadType: 'Vision Inference',
    requiresHeavyGPU: true,
  };

  const lightWorkload: WorkloadRequirements = {
    workloadType: 'Text Generation',
    requiresHeavyGPU: false,
  };

  describe('readiness_score', () => {
    it('should return NOT_MEASURED for unmeasured devices', () => {
      const result = DeviceEvaluator.readiness_score(notMeasuredDevice, gpuWorkload);
      expect(result.state).toBe('NOT_MEASURED');
      expect(result.score).toBe(0);
    });

    it('should return CONFLICT_DETECTED for edge device with GPU workload', () => {
      const result = DeviceEvaluator.readiness_score(edgeDevice, gpuWorkload);
      expect(result.state).toBe('CONFLICT_DETECTED');
      expect(result.score).toBe(20);
    });

    it('should return PASSED for cloud device with GPU workload', () => {
      const result = DeviceEvaluator.readiness_score(cloudDevice, gpuWorkload);
      expect(result.state).toBe('PASSED');
      expect(result.score).toBeGreaterThanOrEqual(90);
    });

    it('should return PASSED for local device with light workload', () => {
      const result = DeviceEvaluator.readiness_score(localDevice, lightWorkload);
      expect(result.state).toBe('PASSED');
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('should be deterministic - same inputs produce same outputs', () => {
      const result1 = DeviceEvaluator.readiness_score(cloudDevice, gpuWorkload);
      const result2 = DeviceEvaluator.readiness_score(cloudDevice, gpuWorkload);
      expect(result1).toEqual(result2);
    });
  });

  describe('compare_benchmarks', () => {
    it('should rank devices by score descending', () => {
      const devices = [edgeDevice, localDevice, cloudDevice, notMeasuredDevice];
      const results = DeviceEvaluator.compare_benchmarks(devices, gpuWorkload);

      // Should be sorted by score descending
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });

    it('should include all devices in results', () => {
      const devices = [edgeDevice, localDevice, cloudDevice];
      const results = DeviceEvaluator.compare_benchmarks(devices, gpuWorkload);
      expect(results).toHaveLength(3);
    });

    it('should mark edge device as CONFLICT_DETECTED with GPU workload', () => {
      const devices = [edgeDevice, cloudDevice];
      const results = DeviceEvaluator.compare_benchmarks(devices, gpuWorkload);

      const edgeResult = results.find((r) => r.deviceName === 'Raspberry Pi 4');
      expect(edgeResult?.state).toBe('CONFLICT_DETECTED');
    });

    it('should be deterministic', () => {
      const devices = [edgeDevice, localDevice, cloudDevice];
      const results1 = DeviceEvaluator.compare_benchmarks(devices, gpuWorkload);
      const results2 = DeviceEvaluator.compare_benchmarks(devices, gpuWorkload);
      expect(results1).toEqual(results2);
    });
  });

  describe('DeviceSchema', () => {
    it('should validate valid device', () => {
      const validDevice = {
        id: 'test',
        name: 'Test Device',
        architecture: 'x86_64',
        tier: 'local',
        status: 'ready',
        specs: { ram: '16GB', hasGPU: true },
      };
      expect(() => DeviceSchema.parse(validDevice)).not.toThrow();
    });

    it('should reject invalid tier', () => {
      const invalidDevice = {
        id: 'test',
        name: 'Test Device',
        architecture: 'x86_64',
        tier: 'invalid',
      };
      expect(() => DeviceSchema.parse(invalidDevice)).toThrow();
    });

    it('should accept optional fields', () => {
      const minimalDevice = {
        id: 'test',
        name: 'Test Device',
        architecture: 'x86_64',
        tier: 'local',
      };
      expect(() => DeviceSchema.parse(minimalDevice)).not.toThrow();
    });
  });
});
