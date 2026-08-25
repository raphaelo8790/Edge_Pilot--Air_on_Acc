/**
 * Rate Limiting Utility
 * 
 * Provides rate limiting for EdgePilot AI API routes.
 * Uses in-memory store for simplicity (can be upgraded to Redis).
 * 
 * @module src/core/rate-limit/rate-limit
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export function rateLimit(config: RateLimitConfig) {
  const { windowMs, maxRequests } = config;

  return async function checkRateLimit(identifier: string): Promise<{
    success: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const now = Date.now();
    const entry = store.get(identifier);

    if (!entry || now > entry.resetTime) {
      // New window
      store.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      });
      return {
        success: true,
        remaining: maxRequests - 1,
        resetTime: now + windowMs,
      };
    }

    if (entry.count >= maxRequests) {
      // Rate limit exceeded
      return {
        success: false,
        remaining: 0,
        resetTime: entry.resetTime,
      };
    }

    // Increment count
    entry.count++;
    return {
      success: true,
      remaining: maxRequests - entry.count,
      resetTime: entry.resetTime,
    };
  };
}

// Pre-configured rate limiters
export const benchmarkRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 benchmarks per minute
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
});
