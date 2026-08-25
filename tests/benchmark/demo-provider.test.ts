/**
 * The demo adapter is the documented substitute the acceptance criteria allow
 * when no real provider is reachable. These tests exist to hold it to the one
 * promise that makes it acceptable: nothing it produces can be mistaken for a
 * measurement.
 */

import { DemoProvider } from '@/modules/benchmark/infrastructure/providers/DemoProvider';
import { steppedClock } from './helpers';

describe('DemoProvider', () => {
  it('labels every single figure as simulated', async () => {
    const [measured] = await new DemoProvider({
      clock: steppedClock(10),
    }).measure('hi', 'demo-model', 1);

    expect(measured.provenance).toEqual({
      latencyMs: 'simulated',
      ttftMs: 'simulated',
      tokensPerSecond: 'simulated',
      outputTokens: 'simulated',
    });
  });

  it('says in the output text itself that no model produced it', async () => {
    const result = await new DemoProvider({ clock: steppedClock(10) }).generate(
      'hi',
      'demo-model'
    );

    expect(result.success).toBe(true);
    expect(result.text).toContain('simulated output from the demo adapter');
    expect(result.text).toContain('not produced by a model');
  });

  it('is deterministic, so a demo is reproducible and obviously synthetic', async () => {
    const first = await new DemoProvider({ clock: steppedClock(10) }).measure(
      'same prompt',
      'demo-model',
      1
    );
    const second = await new DemoProvider({ clock: steppedClock(10) }).measure(
      'same prompt',
      'demo-model',
      1
    );

    expect(first[0].usage.outputTokens).toBe(second[0].usage.outputTokens);
    expect(first[0].tokens_per_second).toBe(second[0].tokens_per_second);
  });

  it('varies with the prompt, so a demo is not one repeated number', async () => {
    const adapter = new DemoProvider({ clock: steppedClock(10) });

    const [a] = await adapter.measure('prompt one', 'demo-model', 1);
    const [b] = await adapter.measure('a completely different prompt', 'demo-model', 1);

    expect(a.usage.outputTokens).not.toBe(b.usage.outputTokens);
  });

  it('needs no configuration, and says so', () => {
    const adapter = new DemoProvider();

    expect(adapter.isConfigured()).toBe(true);
    expect(adapter.describe().displayName).toContain('simulated');
    expect(adapter.describe().officialSource).toContain(
      'docs/local-model-setup.md'
    );
  });

  it('runs each requested iteration', async () => {
    const results = await new DemoProvider({
      clock: steppedClock(10),
    }).benchmark('hi', 'demo-model', 4);

    expect(results.map((result) => result.iteration)).toEqual([1, 2, 3, 4]);
    expect(results.every((result) => result.success)).toBe(true);
  });
});
