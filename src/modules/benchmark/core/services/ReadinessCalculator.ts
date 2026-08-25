import { ReadinessScore } from '../entities/Benchmark';

export interface ReadinessFactors {
  hardwareFit: number;      // 0-100
  latencyMs: number;        // Measured latency
  privacyLevel: 'low' | 'medium' | 'high';
  estimatedCost: number;    // Cost per 1000 requests
  reliabilityScore: number; // 0-100
}

export class ReadinessCalculator {
  calculate(factors: ReadinessFactors): number {
    // Normalize latency (lower is better, max 10000ms)
    const latencyScore = Math.max(0, 100 - (factors.latencyMs / 100));
    
    // Privacy score mapping
    const privacyScores: Record<string, number> = { low: 30, medium: 60, high: 100 };
    const privacyScore = privacyScores[factors.privacyLevel] || 50;
    
    // Cost score (lower is better, normalize to $0.10 per 1000 requests)
    const costScore = Math.max(0, 100 - (factors.estimatedCost * 1000));
    
    // Weighted average
    const weights = {
      hardware: 0.25,
      latency: 0.20,
      privacy: 0.20,
      cost: 0.15,
      reliability: 0.20,
    };
    
    return Math.round(
      factors.hardwareFit * weights.hardware +
      latencyScore * weights.latency +
      privacyScore * weights.privacy +
      costScore * weights.cost +
      factors.reliabilityScore * weights.reliability
    );
  }
}
