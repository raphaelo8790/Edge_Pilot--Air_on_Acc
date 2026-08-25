import {
  assessPrivacy,
  classifyEgress,
  observeTransport,
  PRIVACY_CLASS_RANK,
  PrivacyPolicyFacts,
  unverified,
} from '../../src/modules/benchmark/core/services/PrivacyAssessor';
import {
  isFullyUnverified,
  lookupPolicyFacts,
} from '../../src/modules/benchmark/core/services/privacy-catalogue';
import { describeEgressWarning } from '../../src/modules/benchmark/core/services/egress-warning';

const cited = <T>(value: T) => ({
  value,
  provenance: 'cited' as const,
  source: 'https://example.invalid/terms',
  asOf: '2026-08-22',
});

function facts(overrides: Partial<PrivacyPolicyFacts> = {}): PrivacyPolicyFacts {
  return {
    retentionDays: unverified<number>(null),
    trainsOnInput: unverified<boolean>(null),
    humanReview: unverified<boolean>(null),
    jurisdiction: unverified<string>(null),
    ...overrides,
  };
}

describe('classifyEgress', () => {
  it('treats loopback as never leaving the machine', () => {
    expect(classifyEgress('http://localhost:11434')).toBe('none');
    expect(classifyEgress('http://127.0.0.1:11434')).toBe('none');
    expect(classifyEgress('http://[::1]:11434')).toBe('none');
  });

  it('distinguishes the local network from the internet', () => {
    expect(classifyEgress('http://192.168.1.50:11434')).toBe('local-network');
    expect(classifyEgress('http://10.0.0.4:11434')).toBe('local-network');
    expect(classifyEgress('http://172.16.5.5:11434')).toBe('local-network');
    expect(classifyEgress('https://generativelanguage.googleapis.com')).toBe(
      'internet'
    );
  });

  it('fails closed on a missing or unparseable endpoint', () => {
    expect(classifyEgress(null)).toBe('internet');
    expect(classifyEgress('not a url')).toBe('internet');
  });
});

describe('observeTransport', () => {
  it('reports encryption from the scheme', () => {
    expect(observeTransport('https://x.invalid').transportEncrypted).toBe(true);
    expect(observeTransport('http://x.invalid').transportEncrypted).toBe(false);
    expect(observeTransport(null).transportEncrypted).toBeNull();
  });
});

describe('assessPrivacy - classes', () => {
  it('classes a local run as on-device from observation alone', () => {
    const result = assessPrivacy('http://localhost:11434', 'local', null);

    expect(result.privacyClass).toBe('on-device');
    expect(result.termsVerified).toBe(true);
    expect(result.disqualifies).toEqual([]);
    expect(result.limitations.join(' ')).toContain('never left this machine');
  });

  it('classes a LAN run as local-network and says who can see it', () => {
    const result = assessPrivacy('http://192.168.1.50:11434', 'local', null);

    expect(result.privacyClass).toBe('local-network');
    expect(result.disqualifies).toContain('data-must-not-leave-this-machine');
    expect(result.limitations.join(' ')).toContain('local network');
  });

  it('states what is known when vendor terms are unverified, without inventing the rest', () => {
    const result = assessPrivacy('https://api.example.invalid', 'free', null);

    expect(result.privacyClass).toBe('vendor-processed');
    expect(result.termsVerified).toBe(false);
    expect(result.summary).toContain('have not been verified');
  });

  it('treats facts that exist but are unverified the same as none', () => {
    const result = assessPrivacy('https://api.example.invalid', 'paid', facts());

    expect(result.privacyClass).toBe('vendor-processed');
    expect(result.termsVerified).toBe(false);
  });

  it('escalates the class when the vendor trains on input', () => {
    const result = assessPrivacy(
      'https://api.example.invalid',
      'free',
      facts({ trainsOnInput: cited(true) })
    );

    expect(result.privacyClass).toBe('vendor-processed-trains-on-input');
    expect(result.termsVerified).toBe(true);
    expect(result.disqualifies).toContain(
      'content-must-not-train-third-party-models'
    );
  });

  it('keeps the lower class when the vendor states it does not train on input', () => {
    const result = assessPrivacy(
      'https://api.example.invalid',
      'paid',
      facts({ trainsOnInput: cited(false) })
    );

    expect(result.privacyClass).toBe('vendor-processed');
    expect(result.termsVerified).toBe(true);
    expect(result.disqualifies).not.toContain(
      'content-must-not-train-third-party-models'
    );
  });

  it('ranks classes so providers can be ordered without arithmetic', () => {
    expect(PRIVACY_CLASS_RANK['on-device']).toBeLessThan(
      PRIVACY_CLASS_RANK['local-network']
    );
    expect(PRIVACY_CLASS_RANK['local-network']).toBeLessThan(
      PRIVACY_CLASS_RANK['vendor-processed']
    );
    expect(PRIVACY_CLASS_RANK['vendor-processed']).toBeLessThan(
      PRIVACY_CLASS_RANK['vendor-processed-trains-on-input']
    );
  });

  it('warns when the tier was not declared', () => {
    const result = assessPrivacy(
      'https://api.example.invalid',
      'unknown',
      facts({ trainsOnInput: cited(false) })
    );

    expect(result.limitations.join(' ')).toContain('tier was not declared');
  });

  it('reports unencrypted transport as a limitation', () => {
    const result = assessPrivacy(
      'http://api.example.invalid',
      'paid',
      facts({ trainsOnInput: cited(false) })
    );

    expect(result.limitations.join(' ')).toContain('not encrypted');
  });

  it('surfaces human review when the vendor admits it', () => {
    const result = assessPrivacy(
      'https://api.example.invalid',
      'paid',
      facts({ trainsOnInput: cited(false), humanReview: cited(true) })
    );

    expect(result.limitations.join(' ')).toContain('humans may review');
  });
});

describe('privacy catalogue', () => {
  it('ships every provider unverified, so nothing is classed from memory', () => {
    expect(isFullyUnverified(lookupPolicyFacts('gemini', 'free'))).toBe(true);
    expect(isFullyUnverified(lookupPolicyFacts('groq', 'paid'))).toBe(true);
  });

  it('has no entry for a local provider or an unknown one', () => {
    expect(lookupPolicyFacts('ollama', 'local')).toBeNull();
    expect(lookupPolicyFacts('nope', 'free')).toBeNull();
  });
});

describe('describeEgressWarning', () => {
  it('does not warn for a local run', () => {
    const warning = describeEgressWarning(
      'http://localhost:11434',
      'Ollama (local)',
      'local',
      'secret prompt'
    );

    expect(warning.required).toBe(false);
  });

  it('warns before sending to the internet, and carries no prompt text with it', () => {
    // REVERSED DELIBERATELY. This test used to assert the opposite - that the
    // prompt appeared in points - because the warning shipped a truncated
    // preview so a caller could display it. That was wrong: every caller
    // already has the prompt, since it passed it in, so echoing it back buys
    // nothing while making this object unsafe to log, cache or return from an
    // API. SessionLog stores a digest rather than prompt text precisely to
    // avoid that, and a warning object carrying the text would route around it
    // the first time someone logged one. The dialog renders the prompt from
    // the value it already holds.
    const prompt = 'our unreleased Q3 revenue figures';

    const warning = describeEgressWarning(
      'https://generativelanguage.googleapis.com',
      'Gemini',
      'free',
      prompt
    );

    expect(warning.required).toBe(true);
    expect(warning.severity).toBe('warning');
    expect(warning.confirmLabel).toBe('Send it anyway');
    expect(warning.points.join(' ')).toContain('free tier');

    // The whole object, not just points - the text must not reappear in the
    // title or detail either.
    expect(JSON.stringify(warning)).not.toContain(prompt);
  });

  it('uses a softer notice for the local network', () => {
    const warning = describeEgressWarning(
      'http://192.168.1.50:11434',
      'Ollama (LAN)',
      'local',
      'hello'
    );

    expect(warning.required).toBe(true);
    expect(warning.severity).toBe('notice');
  });
});
