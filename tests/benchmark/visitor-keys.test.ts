import {
  applyVisitorKeys,
  hasVisitorKeys,
  visitorKeysFrom,
  GEMINI_KEY_HEADER,
  GROQ_KEY_HEADER,
} from '@/modules/benchmark/infrastructure/visitor-keys';
import type { BenchmarkConfig } from '@/modules/benchmark/infrastructure/config';

function requestWith(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/v1/benchmarks', { headers });
}

describe('visitorKeysFrom', () => {
  it('reads both headers, trimmed', () => {
    const keys = visitorKeysFrom(
      requestWith({ [GEMINI_KEY_HEADER]: ' AIza-abc ', [GROQ_KEY_HEADER]: 'gsk_xyz' })
    );
    expect(keys).toEqual({ geminiApiKey: 'AIza-abc', groqApiKey: 'gsk_xyz' });
    expect(hasVisitorKeys(keys)).toBe(true);
  });

  it('is empty without the headers', () => {
    const keys = visitorKeysFrom(requestWith({}));
    expect(keys).toEqual({ geminiApiKey: null, groqApiKey: null });
    expect(hasVisitorKeys(keys)).toBe(false);
  });

  it('drops a value that is not shaped like a key', () => {
    const keys = visitorKeysFrom(
      requestWith({ [GROQ_KEY_HEADER]: 'has a space', [GEMINI_KEY_HEADER]: 'x'.repeat(600) })
    );
    expect(keys).toEqual({ geminiApiKey: null, groqApiKey: null });
  });
});

describe('applyVisitorKeys', () => {
  const server = {
    geminiApiKey: 'server-gemini',
    groqApiKey: 'server-groq',
  } as BenchmarkConfig;

  it("lays the visitor's key over the server's, per provider", () => {
    const merged = applyVisitorKeys(server, { geminiApiKey: 'mine', groqApiKey: null });
    expect(merged.geminiApiKey).toBe('mine');
    expect(merged.groqApiKey).toBe('server-groq');
  });
});
