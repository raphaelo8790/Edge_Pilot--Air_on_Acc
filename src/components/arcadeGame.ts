/**
 * Which interstitial plays when a nav link is clicked.
 *
 * Only the arcade palette has one. Cockpit navigates instantly: it is the
 * half of the product meant to look like an instrument, and a benchmark tool
 * that makes you watch a cartoon before every page is a benchmark tool people
 * stop clicking around in.
 *
 * `null` is a real answer here, not a missing one — the caller lets the link
 * behave like a link.
 */

export type Game = "pacman" | "mario";

/** How long each bit runs before the route actually changes. */
export const GAME_RUN_MS: Record<Game, number> = {
  /**
   * Chase the ghost, clear the pellets, take it, then the mouth irises out.
   * The wipe has to land before the route changes, or the next page appears
   * behind a half-open iris.
   */
  pacman: 1450,
  /** Run in, jump onto the pipe, drop in, then the mouth irises out. */
  mario: 1450,
};

export function gameFor(
  palette: string | null,
  theme: string | null,
): Game | null {
  if (palette !== "arcade") return null;
  return theme === "light" ? "mario" : "pacman";
}

/** How deep a route sits: "/" is 0, "/compare" is 1, "/a/b" is 2. */
function depthOf(path: string): number {
  return path.split("/").filter(Boolean).length;
}

/**
 * Whether moving from one route to another is a step BACK through the site.
 *
 * Clicking "home" from anywhere is going up and out, so it should play the
 * reverse sequence — Mario climbing back out of the pipe rather than diving
 * into it. Running the forward bit there told the opposite story: you dive
 * into a pipe and surface at the page you started from.
 *
 * Depth rather than a hardcoded check for "/", so a link to any shallower
 * page reads the same way, and sideways moves between siblings stay forward.
 */
export function isBackwardNavigation(from: string, to: string): boolean {
  return depthOf(to) < depthOf(from);
}
