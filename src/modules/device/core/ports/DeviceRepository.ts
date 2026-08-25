/**
 * Device Repository Port - Interface for device data access.
 *
 * This is a port in the hexagonal architecture that defines
 * how the application layer interacts with device data sources.
 * Infrastructure adapters must implement this interface.
 */

import type { Device } from '../entities/DeviceEvaluator';

/**
 * Device repository interface
 */
export interface DeviceRepository {
  /**
   * Get all available devices
   * @returns Array of validated devices
   */
  getDevices(): Promise<Device[]>;

  /**
   * Get device by ID
   * @param id - Device ID
   * @returns Device or null if not found
   */
  getDeviceById(id: string): Promise<Device | null>;

  /**
   * Get devices by tier
   * @param tier - Device tier (edge, local, cloud)
   * @returns Array of devices in the specified tier
   */
  getDevicesByTier(tier: Device['tier']): Promise<Device[]>;
}

/**
 * AI Service Port - Interface for AI service integration.
 *
 * This is a port for integrating with AI services (e.g., Ollama)
 * to provide intelligent insights about device readiness.
 */
export interface AIServicePort {
  /**
   * Get AI insight for a prompt
   * @param prompt - The prompt to send to the AI service
   * @returns AI response string
   */
  getInsight(prompt: string): Promise<string>;
}
