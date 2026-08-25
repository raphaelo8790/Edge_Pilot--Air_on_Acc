/**
 * JSON Device Repository - Infrastructure adapter for device data.
 *
 * This adapter implements the DeviceRepository port using
 * hardcoded device data from the official device profiles.
 * In production, this could be replaced with a database adapter.
 */

import type { Device } from '../../core/entities/DeviceEvaluator';
import { DeviceSchema } from '../../core/entities/DeviceEvaluator';
import type { DeviceRepository } from '../../core/ports/DeviceRepository';

/**
 * Official device profiles from the handbook
 */
const OFFICIAL_DEVICES: Device[] = [
  {
    id: 'edge-pi4',
    name: 'Raspberry Pi 4 (ARM, 4GB RAM)',
    architecture: 'ARM64',
    tier: 'edge',
    status: 'ready',
    specs: { ram: '4GB', hasGPU: false },
  },
  {
    id: 'edge-pi5',
    name: 'Raspberry Pi 5 (ARM, 8GB RAM)',
    architecture: 'ARM64',
    tier: 'edge',
    status: 'ready',
    specs: { ram: '8GB', hasGPU: false },
  },
  {
    id: 'local-m1',
    name: 'MacBook Air M1 (8GB RAM)',
    architecture: 'ARM64',
    tier: 'local',
    status: 'not-measured',
    specs: { ram: '8GB', hasGPU: true },
  },
  {
    id: 'local-m2',
    name: 'MacBook Pro M2 (16GB RAM)',
    architecture: 'ARM64',
    tier: 'local',
    status: 'ready',
    specs: { ram: '16GB', hasGPU: true },
  },
  {
    id: 'pc-rtx',
    name: 'Gaming PC (Intel i7, 32GB RAM, RTX 3070)',
    architecture: 'x86_64',
    tier: 'local',
    status: 'ready',
    specs: { ram: '32GB', hasGPU: true },
  },
  {
    id: 'cloud-basic',
    name: 'Cloud VM Basic (2 vCPU, 4GB RAM)',
    architecture: 'x86_64',
    tier: 'cloud',
    status: 'not-measured',
    specs: { ram: '4GB', hasGPU: false },
  },
  {
    id: 'cloud-gpu',
    name: 'Cloud VM GPU (4 vCPU, 16GB RAM, T4)',
    architecture: 'x86_64',
    tier: 'cloud',
    status: 'ready',
    specs: { ram: '16GB', hasGPU: true },
  },
  {
    id: 'cloud-high',
    name: 'Cloud VM High (8 vCPU, 32GB RAM, A100)',
    architecture: 'x86_64',
    tier: 'cloud',
    status: 'ready',
    specs: { ram: '32GB', hasGPU: true },
  },
];

/**
 * JSON Device Repository implementation
 */
export class JsonDeviceRepository implements DeviceRepository {
  private devices: Device[];

  constructor() {
    // Validate all devices on initialization
    this.devices = OFFICIAL_DEVICES.map((d) => DeviceSchema.parse(d));
  }

  async getDevices(): Promise<Device[]> {
    return [...this.devices];
  }

  async getDeviceById(id: string): Promise<Device | null> {
    return this.devices.find((d) => d.id === id) ?? null;
  }

  async getDevicesByTier(tier: Device['tier']): Promise<Device[]> {
    return this.devices.filter((d) => d.tier === tier);
  }
}
