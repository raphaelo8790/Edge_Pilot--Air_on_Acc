/**
 * The browser's own identity for this installation.
 *
 * There is no account and no server-assigned id. The browser generates one,
 * keeps it, and sends it on every request. That is enough to own rows in the
 * database without asking anyone to sign up, and it is the same id the
 * session log is keyed on, so a user's runs and a user's workloads agree
 * about who they belong to.
 *
 * It is deliberately never rendered. A user should no more be asked to see
 * or paste this than they would be asked to type their own cookie.
 *
 * WHY localStorage AND NOT sessionStorage. A workload registered in one tab
 * has to still be yours in the next tab, and tomorrow. sessionStorage is
 * cleared when the tab closes, which would orphan every row the moment the
 * user closed the window.
 *
 * WHAT CLEARING IT DOES. Clearing site data generates a fresh id on the next
 * call, and the previous rows become unreachable from this browser. They are
 * not deleted; they are simply no longer owned by anyone who visits. That is
 * the honest cost of having no accounts, and it is the intended behaviour.
 */

const STORAGE_KEY = 'edgepilot.session-id';

/**
 * The server accepts /^[A-Za-z0-9_-]{8,64}$/ (see sessionLogStore.ts). A
 * canonical uuid is 36 characters of hex and hyphens, so it satisfies that
 * pattern - but the check is kept here rather than assumed, because a value
 * read back from storage was last written by something we do not control.
 */
const ACCEPTABLE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Fallback for browsers without crypto.randomUUID (it needs a secure
 * context, and a deployment reached over plain http on a LAN address is not
 * one). getRandomValues is available far more widely; Math.random is the
 * last resort and is fine here because this id is an ownership handle, not a
 * secret or a capability.
 */
function generate(): string {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);

    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  return (
    'sid-' +
    Math.random().toString(36).slice(2, 14) +
    Math.random().toString(36).slice(2, 14)
  );
}

/**
 * This module is imported by api.ts, which is imported by server-rendered
 * components. On the server there is no localStorage and no identity to
 * have, so it returns null and the caller omits the header rather than
 * inventing an id that would own rows on the visitor's behalf.
 */
export function getSessionId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);

    if (existing && ACCEPTABLE.test(existing)) {
      return existing;
    }

    const fresh = generate();
    window.localStorage.setItem(STORAGE_KEY, fresh);

    return fresh;
  } catch {
    // Private browsing modes and "block all cookies" settings make
    // localStorage throw on access rather than return null. An id that lives
    // only for this page load still lets the request be attributed
    // consistently within it, which is better than sending nothing.
    return generate();
  }
}
