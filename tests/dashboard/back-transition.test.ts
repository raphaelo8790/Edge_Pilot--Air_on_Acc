/**
 * Which way through history a `popstate` went.
 *
 * `popstate` fires for BOTH the back and the forward button, with nothing on
 * the event to say which. Without this rule the reverse animation replayed
 * when someone pressed forward — the sequence running backwards while the
 * navigation went forwards. The direction is derived from an index stamped on
 * each history entry, and that comparison is the whole fix, so it is pinned
 * here rather than left to be re-discovered by pressing buttons.
 */
import { navigationDirection } from "@/components/backTransition";

describe("navigationDirection", () => {
  test("a lower index than where we were is a step back", () => {
    expect(navigationDirection(1, 2)).toBe("back");
    expect(navigationDirection(0, 7)).toBe("back");
  });

  test("a higher index is a step forward, which must NOT animate", () => {
    expect(navigationDirection(3, 2)).toBe("forward");
    expect(navigationDirection(9, 1)).toBe("forward");
  });

  test("an unstamped entry is unknown rather than assumed to be back", () => {
    // Assuming "back" here is what made forward replay the animation. An
    // entry we have never seen tells us nothing, so nothing should happen.
    expect(navigationDirection(null, 4)).toBe("unknown");
  });

  test("the same index is not a direction", () => {
    expect(navigationDirection(2, 2)).toBe("unknown");
  });

  test("only 'back' is ever treated as animatable", () => {
    const animatable = (d: string) => d === "back";
    expect(animatable(navigationDirection(1, 2))).toBe(true);
    expect(animatable(navigationDirection(3, 2))).toBe(false);
    expect(animatable(navigationDirection(null, 2))).toBe(false);
    expect(animatable(navigationDirection(2, 2))).toBe(false);
  });
});
