"use client";

/**
 * Palette switch: original ⇄ arcade. A second axis, independent of the
 * dark/light ThemeToggle, so there are four combinations:
 *
 *   original + dark   amber instrument panel   (the default)
 *   original + light  cream instrument panel
 *   arcade   + dark   PAC-MAN cabinet
 *   arcade   + light  SUPER MARIO overworld
 *
 * "original" is the label; the stored value is still `cockpit`. Renaming the
 * value would silently reset the saved preference of anyone who had already
 * chosen, for no gain — the string never reaches the screen.
 *
 * Same mechanics as ThemeToggle: the <html> attribute is the store, read
 * through useSyncExternalStore so every toggle on the page stays in sync,
 * and an inline script in the root layout applies the saved value before
 * first paint.
 */
import { useSyncExternalStore } from "react";

import { applyThemeChange } from "./applyThemeChange";

const STORAGE_KEY = "edgepilot.palette";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-palette", "data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): string {
  const palette =
    document.documentElement.getAttribute("data-palette") === "arcade"
      ? "arcade"
      : "cockpit";
  const theme =
    document.documentElement.getAttribute("data-theme") === "light"
      ? "light"
      : "dark";
  return `${palette}:${theme}`;
}

function getServerSnapshot(): string {
  return "cockpit:dark";
}

/** What the button says it will switch TO, plus the game it is showing now. */
function label(palette: string, theme: string): string {
  if (palette === "arcade") {
    return theme === "light"
      ? "🍄 mario · to original"
      : "👻 pac-man · to original";
  }
  return "🕹 to arcade";
}

export function PaletteToggle({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [palette, theme] = snapshot.split(":");

  const toggle = () => {
    const next = palette === "arcade" ? "cockpit" : "arcade";
    applyThemeChange(() => {
      if (next === "arcade") {
        document.documentElement.setAttribute("data-palette", "arcade");
      } else {
        document.documentElement.removeAttribute("data-palette");
      }
    });
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing: the switch works, it just is not remembered.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      style={style}
      aria-label={
        palette === "arcade"
          ? "Switch to the original theme"
          : "Switch to the arcade theme"
      }
      title={
        palette === "arcade"
          ? "Currently arcade — switch back to the original theme"
          : "Switch to arcade: Pac-Man in dark, Super Mario in light"
      }
    >
      {label(palette, theme)}
    </button>
  );
}
