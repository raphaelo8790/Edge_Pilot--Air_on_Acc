/**
 * EdgePilot AI - pre-flight egress warning
 *
 * Answers one question before a run starts: is this prompt about to leave
 * the machine, and if so, to whom.
 *
 * The point is timing. A privacy score shown after the run is a report on
 * something that already happened; the prompt is on someone else's server by
 * then. For a tool aimed at people deciding whether a workload can leave
 * their premises, the useful moment is before the request, not after.
 *
 * Pure and synchronous so any surface can use it - the dashboard, the CLI
 * agent, or a browser-side probe - without pulling in the provider layer.
 */

import { Egress, ProviderTier, classifyEgress } from './PrivacyAssessor';

export interface EgressWarning {
  /** False when nothing leaves the machine and no warning is needed. */
  required: boolean;
  egress: Egress;
  severity: 'none' | 'notice' | 'warning';
  title: string;
  /** What is about to be sent, and where. */
  detail: string;
  /** Extra lines worth showing as a list. Never empty when required. */
  points: string[];
  /** Label for the button that proceeds. */
  confirmLabel: string;
}

const NO_WARNING: EgressWarning = {
  required: false,
  egress: 'none',
  severity: 'none',
  title: 'Stays on this machine',
  detail:
    'This provider runs locally. The prompt is sent to a process on this machine and does not touch a network.',
  points: [],
  confirmLabel: 'Run benchmark',
};


/**
 * Builds the warning for a run that is about to start.
 *
 * @param endpointUrl   where the request will go
 * @param providerName  display name, for the message
 * @param tier          declared billing tier, which changes the terms
 * @param prompt        used for its LENGTH only. The text is never copied
 *                      into the returned object - see the note further down -
 *                      but how much is leaving is worth stating, and a size
 *                      carries no content.
 */
export function describeEgressWarning(
  endpointUrl: string | null,
  providerName: string,
  tier: ProviderTier,
  prompt: string
): EgressWarning {
  const egress = classifyEgress(endpointUrl);

  if (egress === 'none') {
    return NO_WARNING;
  }

  const host = (() => {
    try {
      return endpointUrl ? new URL(endpointUrl).host : 'an unknown host';
    } catch {
      return 'an unknown host';
    }
  })();

  const points: string[] = [];

  if (egress === 'local-network') {
    points.push(
      `The prompt leaves this machine and is sent to ${host} on your local network.`
    );
    points.push(
      'Anyone who administers that network, or is on it, may be able to observe the request.'
    );
  } else {
    points.push(`The prompt is sent over the internet to ${providerName} (${host}).`);
    points.push(
      'Once sent, what happens to it is governed by that provider’s terms, not by this tool.'
    );
  }

  if (tier === 'free') {
    points.push(
      'You have declared this key as a free tier. Free tiers commonly permit the provider to retain content and use it to improve their models. Verify the current terms before sending anything confidential.'
    );
  } else if (tier === 'unknown') {
    points.push(
      'The billing tier for this key has not been declared, and free and paid tiers usually differ on retention and training. Set the tier to get an accurate assessment.'
    );
  }

  points.push(
    `${prompt.length.toLocaleString()} characters will be sent.`
  );

  // The prompt TEXT is not copied into this object, deliberately.
  //
  // It used to be, as a truncated preview. But every caller of this function
  // already has the prompt - they passed it in - so echoing it back buys
  // nothing, while making the returned object something that must never be
  // logged, cached or returned by an API. SessionLog goes to real trouble to
  // store a digest instead of prompt text; a warning object that quietly
  // carries the text would route around that the first time someone logged it.
  //
  // The dialog renders the prompt directly from the value it already holds.

  return {
    required: true,
    egress,
    severity: egress === 'internet' ? 'warning' : 'notice',
    title:
      egress === 'internet'
        ? 'This prompt will leave your machine'
        : 'This prompt will leave this machine',
    detail:
      egress === 'internet'
        ? `Running this benchmark sends your prompt to ${providerName}. If the prompt contains anything confidential, stop here and use a local provider instead.`
        : `Running this benchmark sends your prompt to ${host} on your local network.`,
    points,
    confirmLabel:
      egress === 'internet' ? 'Send it anyway' : 'Continue',
  };
}
