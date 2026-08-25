/**
 * A tiny external store for scroll position and direction, shaped for
 * useSyncExternalStore — the same pattern the theme and palette toggles use,
 * so the speedometer needs no effects and no local state.
 *
 * The snapshot is a STRING (`"0.375:down"`) rather than an object on purpose:
 * useSyncExternalStore compares snapshots by identity, so returning a fresh
 * object on every read would re-render forever.
 *
 * Progress is quantised to 48 steps. That is finer than the eye can follow on
 * a 24px gauge, and it collapses a continuous scroll into a few dozen
 * renders instead of one per frame.
 */

type Direction = "down" | "up";

const STEPS = 48;
/** Ignore sub-pixel jitter and trackpad rubber-banding when reading direction. */
const DEADZONE_PX = 2;
/** Within this distance of the top the car is parked, never in reverse. */
const TOP_PX = 4;

const listeners = new Set<() => void>();
let snapshot = "0:down";
let lastY = 0;
let frame = 0;
/**
 * Guards against measuring more than once per frame. This is a separate flag
 * rather than a check on `frame`, because `frame` is only assigned AFTER
 * requestAnimationFrame returns: if the callback runs synchronously, the
 * assignment lands after the callback has already finished and the gate stays
 * latched shut, silently ignoring every later scroll event.
 */
let scheduled = false;
let attached = false;

function measure(): void {
  const y = window.scrollY;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const progress = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;

  let direction: Direction = snapshot.endsWith("up") ? "up" : "down";
  const delta = y - lastY;
  if (Math.abs(delta) > DEADZONE_PX) {
    direction = delta < 0 ? "up" : "down";
    lastY = y;
  }
  // Parked at the top: come out of reverse, so the mark cannot get stuck.
  if (y <= TOP_PX) direction = "down";

  const quantised = Math.round(progress * STEPS) / STEPS;
  const next = `${quantised}:${direction}`;
  if (next !== snapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
}

function onScroll(): void {
  // One measurement per frame, however many events arrive.
  if (scheduled) return;
  scheduled = true;
  frame = requestAnimationFrame(() => {
    scheduled = false;
    measure();
  });
}

export function subscribeScroll(onChange: () => void): () => void {
  listeners.add(onChange);

  if (!attached) {
    attached = true;
    lastY = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    measure(); // pick up a restored scroll position on load
  }

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      attached = false;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      scheduled = false;
    }
  };
}

export function getScrollSnapshot(): string {
  return snapshot;
}

/** No scroll position exists on the server; the gauge renders parked. */
export function getScrollServerSnapshot(): string {
  return "0:down";
}

export function parseScroll(value: string): {
  progress: number;
  reverse: boolean;
} {
  const [progress, direction] = value.split(":");
  return { progress: Number(progress), reverse: direction === "up" };
}
