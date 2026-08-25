"use client";

/**
 * One button, two themes. The choice lives as `data-theme` on <html> (set
 * before first paint by an inline script in the root layout) and is stored in
 * localStorage. Every colour in the app resolves through CSS custom
 * properties, so flipping the attribute reskins the whole page — including
 * the provider logos, which are drawn in currentColor for exactly this
 * reason.
 *
 * The <html> attribute IS the store: useSyncExternalStore subscribes to it
 * with a MutationObserver, so several toggles on one page (each .epd header
 * has one) stay in sync without any shared React state.
 */
import { useSyncExternalStore } from "react";

import { applyThemeChange } from "./applyThemeChange";

const STORAGE_KEY = "edgepilot.theme";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): "dark" | "light" {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

function getServerSnapshot(): "dark" | "light" {
  return "dark"; // the app's default; a saved "light" applies pre-hydration
}

export function ThemeToggle({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    applyThemeChange(() => {
      if (next === "light") {
        document.documentElement.setAttribute("data-theme", "light");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    });
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing: the toggle still works, it just is not remembered.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      style={style}
      aria-label={
        theme === "light" ? "Switch to dark theme" : "Switch to light theme"
      }
      title={theme === "light" ? "Switch to dark" : "Switch to light"}
    >
      {theme === "light" ? "◐ dark" : "◑ light"}
    </button>
  );
}
