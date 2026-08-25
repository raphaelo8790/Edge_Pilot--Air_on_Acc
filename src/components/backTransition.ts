/**
 * Going back plays the transition in reverse.
 *
 * A link click can be intercepted and delayed, which is why the forward
 * sequences run BEFORE the route changes. The browser's back button cannot:
 * by the time `popstate` fires the navigation has already happened. So the
 * reverse sequences are arrival animations — they play on the page you land
 * on, and the metaphor still reads: Mario climbs back out of the pipe,
 * Pac-Man runs from the ghost into the page behind him.
 *
 * BACK ONLY, NOT FORWARD. `popstate` fires for both directions, so a naive
 * listener replays the reverse animation when someone presses FORWARD —
 * which is backwards in the literal sense. Direction is worked out by
 * stamping each history entry with an increasing index: an entry whose index
 * is lower than where we were is a step back, higher is a step forward.
 * Forward gets no animation at all, which matches what arriving via a normal
 * click looks like (the click's own sequence plays before it leaves, so the
 * page you land on is still).
 *
 * State lives here rather than in a component because the component that
 * observes it did not exist when the event fired: popstate arrives while the
 * OLD page's header is still mounted, and the new page's header subscribes a
 * moment later. A module singleton spans that gap; component state would not.
 */
import { gameFor, GAME_RUN_MS, type Game } from "./arcadeGame";

const INDEX_KEY = "epHistoryIndex";

const listeners = new Set<() => void>();
let snapshot = "idle";
let token = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let attached = false;

/** Highest index handed out so far, and where we currently are. */
let maxIndex = 0;
let currentIndex = 0;

export type NavDirection = "back" | "forward" | "unknown";

/** Pure, so the rule can be tested without a history stack. */
export function navigationDirection(
  targetIndex: number | null,
  fromIndex: number,
): NavDirection {
  if (targetIndex === null) return "unknown";
  if (targetIndex < fromIndex) return "back";
  if (targetIndex > fromIndex) return "forward";
  return "unknown";
}

function readIndex(): number | null {
  const state = (history.state ?? {}) as Record<string, unknown>;
  const value = state[INDEX_KEY];
  return typeof value === "number" ? value : null;
}

/**
 * Give the current entry an index if it does not have one. Entries created by
 * a push have none until they are first seen; entries we have visited before
 * keep theirs, which is what makes the comparison meaningful.
 *
 * The existing state is spread rather than replaced — Next keeps its own
 * router bookkeeping in there, and clobbering it breaks navigation.
 */
function stampCurrentEntry(): void {
  const existing = readIndex();
  if (existing !== null) {
    currentIndex = existing;
    if (existing > maxIndex) maxIndex = existing;
    return;
  }
  maxIndex += 1;
  currentIndex = maxIndex;
  try {
    const state = (history.state ?? {}) as Record<string, unknown>;
    history.replaceState({ ...state, [INDEX_KEY]: currentIndex }, "");
  } catch {
    // Some embedded contexts refuse replaceState; direction then reads as
    // "unknown" and nothing animates, which is the safe way to be wrong.
  }
}

function publish(next: string): void {
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/**
 * Play the reverse sequence.
 *
 * Exported because the back BUTTON is not the only way to go backwards: a nav
 * link pointing at a shallower page (usually "home") is also a step back, and
 * should tell the same story. See isBackwardNavigation in arcadeGame.ts.
 *
 * Safe to call from anywhere — it declines quietly when the palette has no
 * sequence or the visitor asked for reduced motion.
 */
export function playBackTransition(): void {
  if (typeof window === "undefined") return;

  // Reduced motion: go straight there, no performance.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const root = document.documentElement;
  const game = gameFor(
    root.getAttribute("data-palette"),
    root.getAttribute("data-theme"),
  );
  // Cockpit has no sequence to reverse — going back there is just going back.
  if (game === null) return;

  // The token makes each navigation a distinct snapshot, so going back twice
  // in a row restarts the animation instead of looking like nothing happened.
  token += 1;
  publish(`${game}:${token}`);

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => publish("idle"), GAME_RUN_MS[game]);
}

function onPopState(): void {
  const target = readIndex();
  const direction = navigationDirection(target, currentIndex);
  if (target !== null) currentIndex = target;

  // Only a step BACK gets the reverse sequence.
  if (direction !== "back") return;

  playBackTransition();
}

export function subscribeBack(onChange: () => void): () => void {
  listeners.add(onChange);

  // Every navigation — pushed or popped — ends in a mount, so this is where
  // freshly pushed entries get their index.
  stampCurrentEntry();

  // Attached once for the life of the page and never removed. Detaching on
  // last-unsubscribe would open a race: during a back navigation every header
  // unmounts and remounts, and popstate fires in that gap — with no listener
  // attached, the transition would silently never play.
  if (!attached) {
    attached = true;
    window.addEventListener("popstate", onPopState);
  }

  return () => {
    listeners.delete(onChange);
  };
}

export function getBackSnapshot(): string {
  return snapshot;
}

export function getBackServerSnapshot(): string {
  return "idle";
}

export function parseBack(value: string): { active: boolean; game: Game | null } {
  if (value === "idle") return { active: false, game: null };
  return { active: true, game: value.split(":")[0] as Game };
}
