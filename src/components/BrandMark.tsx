"use client";

/**
 * The EdgePilot mark, which changes with the palette:
 *
 *   cockpit        → the speedometer gauge, needle sweeping on load
 *   arcade + dark  → a frightened Pac-Man ghost, bobbing
 *   arcade + light → Mario dropping into a warp pipe, on a loop
 *
 * Same store mechanics as the toggles: the <html> attributes are the source
 * of truth, read through useSyncExternalStore so the mark re-renders the
 * moment either toggle flips, with no shared React state and no effects.
 */
import { useSyncExternalStore } from "react";

import {
  getScrollServerSnapshot,
  getScrollSnapshot,
  parseScroll,
  subscribeScroll,
} from "./scrollStore";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-palette", "data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): string {
  const root = document.documentElement;
  const palette =
    root.getAttribute("data-palette") === "arcade" ? "arcade" : "cockpit";
  const theme = root.getAttribute("data-theme") === "light" ? "light" : "dark";
  return `${palette}:${theme}`;
}

function getServerSnapshot(): string {
  return "cockpit:dark";
}

export function BrandMark({ className }: { className?: string }) {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [palette, theme] = snapshot.split(":");

  if (palette === "arcade") {
    return theme === "light" ? (
      <MarioPipeMark className={className} />
    ) : (
      <ScaredGhostMark className={className} />
    );
  }
  return <GaugeMark className={className} />;
}

/** Full-scale needle travel, in degrees clockwise from its parked position. */
const NEEDLE_SWEEP_DEG = 140;

/**
 * Cockpit: a speedometer that reads the page.
 *
 * Scrolling down winds the needle up — scroll progress maps straight onto
 * needle angle, so the gauge shows how far into the page you are. Scrolling
 * back up puts the car in reverse: the needle is replaced by a lit R, the way
 * a dash shows the selected gear. Reaching the top parks it again.
 *
 * Before the first scroll the needle keeps its startup sweep animation from
 * globals.css; once scrolling begins the angle is driven directly and the
 * animation would fight it, so the class swaps to a transition-only one.
 */
export function GaugeMark({ className }: { className?: string }) {
  const { progress, reverse } = parseScroll(
    useSyncExternalStore(
      subscribeScroll,
      getScrollSnapshot,
      getScrollServerSnapshot,
    ),
  );
  const moving = progress > 0.001;

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#211b12" />
      <path
        d="M 14 44 A 20 20 0 1 1 50 44"
        fill="none"
        stroke="#453b29"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M 14 44 A 20 20 0 0 1 32 12"
        fill="none"
        stroke="#e8a33d"
        strokeWidth="5"
        strokeLinecap="round"
        opacity={reverse ? 0.4 : 1}
      />

      {reverse ? (
        <text
          className="gauge-reverse"
          x="32"
          y="45"
          textAnchor="middle"
        >
          R
        </text>
      ) : (
        <>
          <line
            className={moving ? "gauge-needle-live" : "gauge-needle"}
            x1="32"
            y1="42"
            x2="21"
            y2="24"
            stroke="#efe9dc"
            strokeWidth="4"
            strokeLinecap="round"
            style={
              moving
                ? {
                    transform: `rotate(${(progress * NEEDLE_SWEEP_DEG).toFixed(1)}deg)`,
                  }
                : undefined
            }
          />
          <circle cx="32" cy="42" r="4.5" fill="#e8a33d" />
        </>
      )}
    </svg>
  );
}

/**
 * The frightened ghost — the blue one you can eat. Dome head, four-bump
 * wavy hem, wide white eyes with blue pupils, and the zigzag mouth the
 * arcade sprite wears while it is running away.
 */
export function ScaredGhostMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#0d0d18" />
      <g className="mark-ghost">
        {/* body: dome plus the wavy hem */}
        <path
          d="M14 34a18 18 0 0 1 36 0v16l-5.5-4.5L39 50l-5.5-4.5L28 50l-5.5-4.5L17 50l-3-2.6z"
          fill="#2121de"
        />
        {/* eyes */}
        <ellipse cx="25" cy="30" rx="5" ry="6" fill="#ffffff" />
        <ellipse cx="39" cy="30" rx="5" ry="6" fill="#ffffff" />
        <circle cx="25" cy="31" r="2.6" fill="#2121de" />
        <circle cx="39" cy="31" r="2.6" fill="#2121de" />
        {/* the scared zigzag mouth */}
        <path
          d="M21 41l3.5-3 3.5 3 3.5-3 3.5 3 3.5-3 3.5 3"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/**
 * Mario dropping into a warp pipe. Painting order does the work: Mario is
 * drawn first, the pipe on top of him, so as he slides down he passes
 * behind the rim and disappears into it — no clip path needed.
 */
export function MarioPipeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#dfefff" />
      {/* a couple of overworld clouds */}
      <circle cx="13" cy="14" r="4" fill="#ffffff" />
      <circle cx="18.5" cy="14" r="3" fill="#ffffff" />
      <circle cx="50" cy="18" r="3.4" fill="#ffffff" />

      {/* Mario — behind the pipe, riding the dip animation */}
      <g className="mark-mario">
        <path
          d="M22 26c0-4 3.3-6.6 8-6.6 4 0 6.9 1.9 7.7 4.7l2.4.9c.9.3.7 1.6-.3 1.6H22z"
          fill="#d8231d"
        />
        <rect x="24" y="27.5" width="12" height="8" rx="3" fill="#f3c091" />
        <rect x="31.4" y="29.4" width="2" height="3.2" rx="1" fill="#2a1a0e" />
        <rect x="25.4" y="32.6" width="8" height="2.6" rx="1.2" fill="#3a2410" />
        <path d="M24 35.6h12l2.2 5H21.8z" fill="#d8231d" />
        <rect x="23" y="40.2" width="14" height="7" rx="2" fill="#2f6cb8" />
      </g>

      {/* The pipe, drawn last so Mario sinks behind it. The body runs to the
          bottom edge on purpose: at the bottom of his dip his overalls reach
          y≈69, and a body stopping short of 64 left a sliver of blue showing
          under the pipe. */}
      <rect x="12" y="40" width="40" height="9" rx="2.5" fill="#3fc14f" />
      <rect x="12" y="40" width="40" height="3" rx="1.5" fill="#7ee68b" />
      <rect x="17" y="49" width="30" height="15" fill="#26a13a" />
      <rect x="20" y="49" width="5" height="15" fill="#3fc14f" />
    </svg>
  );
}
