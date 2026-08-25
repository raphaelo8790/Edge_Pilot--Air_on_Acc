/**
 * Dashboard display helpers — the null-honesty contract.
 *
 * The wire contract makes aggregates nullable so that "we never got an
 * answer" is never rendered as 0. These tests pin the helpers that enforce
 * that rule in the UI.
 */
import {
  describeErrorCode,
  fmtElapsed,
  fmtMs,
  fmtNum,
  fmtPct,
  isPlaceholderId,
  isUuid,
} from '@/components/dashboard/format';

describe('fmtMs / fmtNum / fmtPct', () => {
  it('never renders null as a number', () => {
    expect(fmtMs(null)).toBe('not measured');
    expect(fmtMs(undefined)).toBe('not measured');
    expect(fmtNum(null)).toBe('not measured');
    expect(fmtPct(null)).toBe('not measured');
  });

  it('formats real values with units and separators', () => {
    expect(fmtMs(812.44)).toBe('812 ms');
    expect(fmtMs(12744)).toBe('12,744 ms');
    expect(fmtNum(47.94)).toBe('47.9');
    expect(fmtPct(80)).toBe('80%');
  });

  it('zero is a real value, not a fallback', () => {
    expect(fmtMs(0)).toBe('0 ms');
    expect(fmtPct(0)).toBe('0%');
  });
});

describe('isUuid / isPlaceholderId', () => {
  it('accepts RFC-4122 uuids', () => {
    expect(isUuid('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    expect(isUuid('  123e4567-e89b-42d3-a456-426614174000  ')).toBe(true);
  });

  it('rejects the scaffold placeholder ids', () => {
    expect(isUuid('temp-workload-id')).toBe(false);
    expect(isPlaceholderId('temp-device-id')).toBe(true);
    expect(isPlaceholderId('123e4567-e89b-42d3-a456-426614174000')).toBe(false);
  });
});

describe('describeErrorCode', () => {
  it('maps every wire error code to a sentence', () => {
    for (const code of [
      'timeout',
      'local_unavailable',
      'invalid_model',
      'unauthorized',
      'rate_limited',
      'invalid_response',
      'not_configured',
      'provider_error',
    ]) {
      expect(describeErrorCode(code).length).toBeGreaterThan(10);
    }
    expect(describeErrorCode(null)).toBe('');
  });
});

describe('fmtElapsed', () => {
  it('formats seconds and minutes', () => {
    expect(fmtElapsed(7)).toBe('7s');
    expect(fmtElapsed(65)).toBe('1m 05s');
    expect(fmtElapsed(600)).toBe('10m 00s');
  });
});
