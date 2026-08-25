/**
 * Which interstitial plays for which palette.
 *
 * The animations themselves cannot be asserted on here — a hidden document
 * runs no animation frames at all — but picking the wrong bit for a palette
 * is a silent, visible-only bug, so the mapping is pinned.
 */
import {
  gameFor,
  GAME_RUN_MS,
  isBackwardNavigation,
} from "@/components/arcadeGame";

describe("gameFor", () => {
  /**
   * `null` is the answer that matters most: the click handler checks for it
   * BEFORE calling preventDefault, so a wrong answer here does not just play
   * the wrong animation — it swallows the click and the page never changes.
   */
  test("cockpit has no interstitial, in either mode", () => {
    expect(gameFor(null, null)).toBeNull();
    expect(gameFor(null, "light")).toBeNull();
    expect(gameFor("cockpit", "dark")).toBeNull();
    expect(gameFor("cockpit", "light")).toBeNull();
  });

  test("arcade + dark is Pac-Man", () => {
    expect(gameFor("arcade", null)).toBe("pacman");
    expect(gameFor("arcade", "dark")).toBe("pacman");
  });

  test("arcade + light is Mario", () => {
    expect(gameFor("arcade", "light")).toBe("mario");
  });

  test("an unknown palette falls back to no interstitial, not to a game", () => {
    // Anything that is not the arcade gets plain, instant links. Guessing a
    // game here would put a cartoon in front of a palette that never asked
    // for one.
    expect(gameFor("something-else", "light")).toBeNull();
    expect(gameFor("", "dark")).toBeNull();
  });
});

describe("GAME_RUN_MS", () => {
  const games = ["pacman", "mario"] as const;

  test("every game has a duration a person will actually wait through", () => {
    games.forEach((game) => {
      expect(GAME_RUN_MS[game]).toBeGreaterThanOrEqual(600);
      // Past about a second and a half an interstitial stops being a flourish
      // and starts being an obstacle between the click and the page.
      expect(GAME_RUN_MS[game]).toBeLessThanOrEqual(1500);
    });
  });

  /**
   * Both sequences end with a full-screen wipe that has to COMPLETE before
   * the route changes — otherwise the next page appears behind a half-open
   * iris, which reads as a glitch rather than a transition. That is the
   * reason these are as long as they are, and the reason they should not be
   * trimmed without also retiming the wipe.
   */
  test("both games leave room for their closing wipe", () => {
    games.forEach((game) => {
      expect(GAME_RUN_MS[game]).toBeGreaterThanOrEqual(1400);
    });
  });

  test("has an entry for every game and no others", () => {
    expect(Object.keys(GAME_RUN_MS).sort()).toEqual(["mario", "pacman"]);
  });
});

/**
 * Which direction a link click tells the story in.
 *
 * Clicking "home" used to play the forward sequence, which said the opposite
 * of what was happening: you dived into a pipe and surfaced at the page you
 * started from. Depth decides it, so the rule holds for any shallower target
 * rather than only for the literal "/".
 */
describe("isBackwardNavigation", () => {
  test("going home from a page is backward", () => {
    expect(isBackwardNavigation("/compare", "/")).toBe(true);
    expect(isBackwardNavigation("/evidence", "/")).toBe(true);
    expect(isBackwardNavigation("/vision-benchmark", "/")).toBe(true);
  });

  test("leaving home for a page is forward", () => {
    expect(isBackwardNavigation("/", "/dashboard")).toBe(false);
    expect(isBackwardNavigation("/", "/evaluation")).toBe(false);
  });

  test("moving between siblings is forward, not backward", () => {
    // Same depth is a sideways move; treating it as backward would play the
    // reverse sequence for half the nav.
    expect(isBackwardNavigation("/compare", "/evidence")).toBe(false);
    expect(isBackwardNavigation("/evidence", "/dashboard")).toBe(false);
  });

  test("staying put is not backward", () => {
    expect(isBackwardNavigation("/", "/")).toBe(false);
    expect(isBackwardNavigation("/compare", "/compare")).toBe(false);
  });

  test("a deeper route counts as deeper, trailing slashes and all", () => {
    expect(isBackwardNavigation("/a/b", "/a")).toBe(true);
    expect(isBackwardNavigation("/a", "/a/b")).toBe(false);
    // Trailing slashes must not change the depth, or "/compare/" would read
    // as deeper than "/compare" and flip the direction.
    expect(isBackwardNavigation("/compare/", "/")).toBe(true);
    expect(isBackwardNavigation("/", "/compare/")).toBe(false);
  });
});
