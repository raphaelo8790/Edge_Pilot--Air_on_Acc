import { describeEgressWarning } from '../../src/modules/benchmark/core/services/egress-warning';

const PROMPT = 'Summarise this internal incident report.';

describe('describeEgressWarning', () => {
  it('shows nothing for a run that stays on the machine', () => {
    // Interrupting someone to confirm that nothing is leaving their own
    // computer is how you train them to click through the one that matters.
    const warning = describeEgressWarning(
      'http://localhost:11434',
      'Ollama',
      'local',
      PROMPT
    );

    expect(warning.required).toBe(false);
    expect(warning.egress).toBe('none');
    expect(warning.severity).toBe('none');
  });

  it('treats 127.0.0.1 as the same machine', () => {
    expect(
      describeEgressWarning('http://127.0.0.1:11434', 'Ollama', 'local', PROMPT)
        .required
    ).toBe(false);
  });

  it('warns, and names the host, when the prompt goes to the internet', () => {
    const warning = describeEgressWarning(
      'https://generativelanguage.googleapis.com/v1beta',
      'Google Gemini',
      'unknown',
      PROMPT
    );

    expect(warning.required).toBe(true);
    expect(warning.severity).toBe('warning');
    expect(warning.points.join(' ')).toContain('generativelanguage.googleapis.com');
    expect(warning.points.length).toBeGreaterThan(0);
  });

  it('warns for a machine on the local network, which is not this machine', () => {
    const warning = describeEgressWarning(
      'http://192.168.1.40:11434',
      'Ollama',
      'local',
      PROMPT
    );

    expect(warning.required).toBe(true);
    expect(warning.egress).toBe('local-network');
  });

  it('fails closed when the endpoint is unknown', () => {
    // A null endpoint is not evidence that nothing leaves. Assuming safety
    // from missing information is how a prompt gets sent silently.
    const warning = describeEgressWarning(null, 'Unknown provider', 'unknown', PROMPT);

    expect(warning.required).toBe(true);
    expect(warning.egress).toBe('internet');
  });

  it('never puts the prompt in the warning text itself', () => {
    // The UI shows the prompt deliberately and separately. The warning object
    // travels into logs and API responses, and must not carry content with it.
    const warning = describeEgressWarning(
      'https://api.groq.com/openai/v1',
      'Groq',
      'free',
      PROMPT
    );

    expect(JSON.stringify(warning)).not.toContain(PROMPT);
  });
});
