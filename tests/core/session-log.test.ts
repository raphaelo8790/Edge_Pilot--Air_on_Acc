import {
  buildSharePayload,
  digestPrompt,
  MemorySessionLogStore,
  redact,
  SessionLog,
  SHARE_CONSENT_STATEMENT,
} from '../../src/core/logging/SessionLog';

describe('redact', () => {
  it('removes anything whose key looks like a credential, at depth', () => {
    const cleaned = redact({
      provider: 'gemini',
      config: {
        GEMINI_API_KEY: 'AIza-real-key',
        nested: [{ authorization: 'Bearer abc', model: 'flash' }],
      },
      sentryDsn: 'https://abc@sentry.io/1',
    });

    const asText = JSON.stringify(cleaned);

    expect(asText).not.toContain('AIza-real-key');
    expect(asText).not.toContain('Bearer abc');
    expect(asText).not.toContain('sentry.io');
    expect(asText).toContain('[redacted]');
    expect(asText).toContain('gemini');
    expect(asText).toContain('flash');
  });

  it('leaves primitives and arrays intact', () => {
    expect(redact('plain')).toBe('plain');
    expect(redact(42)).toBe(42);
    expect(redact([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('digestPrompt', () => {
  it('records length and a digest but not the text', () => {
    const digest = digestPrompt('our unreleased Q3 revenue figures', false);

    expect(digest.characters).toBe(33);
    expect(digest.sha256Prefix).toHaveLength(12);
    expect(digest.text).toBeUndefined();
  });

  it('is stable for the same prompt and different for another', () => {
    expect(digestPrompt('same', false).sha256Prefix).toBe(
      digestPrompt('same', false).sha256Prefix
    );
    expect(digestPrompt('same', false).sha256Prefix).not.toBe(
      digestPrompt('different', false).sha256Prefix
    );
  });

  it('includes the text only when explicitly asked', () => {
    expect(digestPrompt('secret', true).text).toBe('secret');
  });
});

describe('SessionLog', () => {
  it('redacts on the way in, not on the way out', () => {
    const log = new SessionLog('s1', new Date().toISOString());
    log.record('info', 'provider', 'configured', { apiKey: 'live-key' });

    expect(JSON.stringify(log.export())).not.toContain('live-key');
  });

  it('keeps only the most recent events and says it truncated', () => {
    const log = new SessionLog('s1', new Date().toISOString(), { maxEvents: 3 });

    for (let i = 0; i < 10; i += 1) {
      log.record('info', 'benchmark', `event ${i}`);
    }

    const exported = log.export();

    expect(exported.event_count).toBe(3);
    expect(exported.truncated).toBe(true);
    expect(exported.events.map((e) => e.message)).toEqual([
      'event 7',
      'event 8',
      'event 9',
    ]);
  });

  it('states in the file itself what was not recorded', () => {
    const log = new SessionLog('s1', new Date().toISOString());
    const disclosure = log.export().disclosure.join(' ');

    expect(disclosure).toContain('not as content');
    expect(disclosure).toContain('No account');
  });

  it('warns loudly in the file when prompts were included', () => {
    const log = new SessionLog('s1', new Date().toISOString(), {
      includePromptText: true,
    });

    expect(log.export().disclosure[0]).toContain('FULL PROMPT TEXT IS INCLUDED');
  });
});

describe('MemorySessionLogStore', () => {
  it('returns the same log for a session and null for an unknown one', () => {
    const store = new MemorySessionLogStore();
    const opened = store.open('abcd1234');

    expect(store.get('abcd1234')).toBe(opened);
    expect(store.get('never-seen')).toBeNull();
  });

  it('discards a session on close', () => {
    const store = new MemorySessionLogStore();
    store.open('abcd1234');
    store.close('abcd1234');

    expect(store.get('abcd1234')).toBeNull();
  });

  // This path was silently dead under the project's es5 target: the sweep used
  // `for...of` over a Map, which downlevels to an index loop that iterates
  // nothing. Nothing failed - sessions simply never expired. Covered now.
  it('expires a session that has been idle past its TTL', async () => {
    const store = new MemorySessionLogStore({ ttlMs: 5 });
    store.open('abcd1234');

    expect(store.count()).toBe(1);

    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });

    expect(store.count()).toBe(0);
    expect(store.get('abcd1234')).toBeNull();
  });

  it('keeps a session alive while it is being used', async () => {
    const store = new MemorySessionLogStore({ ttlMs: 40 });
    store.open('abcd1234');

    for (let i = 0; i < 3; i += 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 15);
      });
      expect(store.get('abcd1234')).not.toBeNull();
    }
  });

  it('caps concurrent sessions so it cannot be used to exhaust memory', () => {
    const store = new MemorySessionLogStore({ maxSessions: 3 });

    for (let i = 0; i < 20; i += 1) {
      store.open(`session-${i}`);
    }

    expect(store.count()).toBeLessThanOrEqual(3);
    expect(store.get('session-19')).not.toBeNull();
    expect(store.get('session-0')).toBeNull();
  });
});

describe('buildSharePayload', () => {
  it('strips prompt text even when the session opted into recording it', () => {
    const log = new SessionLog('s1', new Date().toISOString(), {
      includePromptText: true,
    });

    log.record('info', 'comparison', 'Comparison requested', {
      prompt: digestPrompt('our unreleased Q3 revenue figures', true),
      iterations: 3,
    });

    // The local export honours the opt-in...
    expect(JSON.stringify(log.export())).toContain('unreleased Q3');

    // ...the shared copy never does.
    const shared = JSON.stringify(buildSharePayload(log));

    expect(shared).not.toContain('unreleased Q3');
    expect(shared).toContain('sha256Prefix');
  });

  it('keeps the digest so shared runs stay correlatable', () => {
    const log = new SessionLog('s1', new Date().toISOString());
    log.record('info', 'comparison', 'requested', {
      prompt: digestPrompt('same prompt', false),
    });

    const payload = buildSharePayload(log);
    const prompt = payload.events[0].data.prompt as Record<string, unknown>;

    expect(prompt.sha256Prefix).toBe(
      digestPrompt('same prompt', false).sha256Prefix
    );
    expect(prompt.characters).toBe(11);
    expect(prompt.text).toBeUndefined();
  });

  it('says in the payload that prompt text was removed', () => {
    const log = new SessionLog('s1', new Date().toISOString());
    log.record('info', 'benchmark', 'ran');

    expect(buildSharePayload(log).disclosure[0]).toContain(
      'Prompt text has been removed'
    );
  });

  it('leaves events without a prompt untouched', () => {
    const log = new SessionLog('s1', new Date().toISOString());
    log.record('info', 'benchmark', 'ran', { entrant: 'ollama / mistral:7b' });

    const payload = buildSharePayload(log);

    expect(payload.events[0].data.entrant).toBe('ollama / mistral:7b');
    expect(payload.event_count).toBe(1);
  });

  it('states what the sharer is agreeing to, including what is absent', () => {
    expect(SHARE_CONSENT_STATEMENT).toContain('does not contain my prompt text');
    expect(SHARE_CONSENT_STATEMENT).toContain('identity');
  });
});
