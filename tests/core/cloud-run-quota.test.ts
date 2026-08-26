import {
  CLOUD_RUNS_PER_HOUR,
  resetCloudRunQuota,
  takeCloudRun,
} from '@/core/quota/cloudRunQuota';

beforeEach(() => resetCloudRunQuota());

describe('takeCloudRun', () => {
  it('allows the configured number per hour, then refuses with a retry time', () => {
    const t0 = 1_000_000;

    for (let i = 0; i < CLOUD_RUNS_PER_HOUR; i += 1) {
      const verdict = takeCloudRun('session-a', t0 + i);
      expect(verdict.allowed).toBe(true);
      expect(verdict.remaining).toBe(CLOUD_RUNS_PER_HOUR - i - 1);
    }

    const refused = takeCloudRun('session-a', t0 + 10);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(3500);
  });

  it('frees a slot once the oldest run leaves the window', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < CLOUD_RUNS_PER_HOUR; i += 1) takeCloudRun('s', t0 + i);

    expect(takeCloudRun('s', t0 + 60 * 60 * 1000 + 1).allowed).toBe(true);
  });

  it('keeps sessions apart, and pools visitors with no session', () => {
    for (let i = 0; i < CLOUD_RUNS_PER_HOUR; i += 1) takeCloudRun('a', i);

    expect(takeCloudRun('b', 10).allowed).toBe(true);
    expect(takeCloudRun(null, 10).allowed).toBe(true);
    expect(takeCloudRun(undefined, 11).remaining).toBe(CLOUD_RUNS_PER_HOUR - 2);
  });
});
