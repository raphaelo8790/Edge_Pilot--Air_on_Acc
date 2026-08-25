"use client";

/**
 * Navigation interstitials: clicking a nav link plays a short bit before the
 * route changes, and every palette has its own.
 *
 *   arcade + dark  → PAC-MAN chases a ghost down a corridor, clearing the
 *                    pellets, then his mouth opens over the screen.
 *   arcade + light → MARIO runs in, jumps onto a warp pipe, drops into it,
 *                    then the pipe mouth opens over the screen.
 *
 * Pressing BACK plays the matching sequence in reverse, as an arrival
 * animation — see backTransition.ts for why it cannot run beforehand.
 *
 * COCKPIT HAS NONE. Its links are plain and navigate instantly: it is the
 * half of the product meant to read as an instrument, and a benchmark tool
 * that makes you watch a cartoon before every page is one people stop
 * clicking around in.
 *
 * With reduced motion these are ordinary links and navigation is instant.
 * Modified clicks (ctrl/cmd/shift/middle) are never hijacked — new-tab
 * behaviour belongs to the browser.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import {
  gameFor,
  GAME_RUN_MS,
  isBackwardNavigation,
  type Game,
} from "./arcadeGame";
import {
  getBackServerSnapshot,
  getBackSnapshot,
  parseBack,
  playBackTransition,
  subscribeBack,
} from "./backTransition";

export interface ArcadeNavItem {
  href: string;
  label: string;
}

const PELLET_COUNT = 14;

export function ArcadeNavLinks({ items }: { items: ArcadeNavItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [run, setRun] = useState<{ href: string; game: Game } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Going back plays the same sequence in reverse, as an arrival animation.
  const back = parseBack(
    useSyncExternalStore(
      subscribeBack,
      getBackSnapshot,
      getBackServerSnapshot,
    ),
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Reduced motion: a link is a link.
    if (reduced) return;
    // Never steal modified clicks.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    const game = gameFor(
      root.getAttribute("data-palette"),
      root.getAttribute("data-theme"),
    );
    // Cockpit has no interstitial: let the link be a link. This has to be
    // decided BEFORE preventDefault, or the click is swallowed and the page
    // never changes.
    if (game === null) return;

    e.preventDefault();
    if (run) return; // one game at a time

    /*
      Going UP the site (usually "home") plays the reverse sequence instead.
      It runs as an arrival animation, exactly as the back button's does, so
      the navigation happens immediately and the sequence plays on the page
      we land on. Starting it before the push is deliberate: the wipe opens
      at full screen, which covers the page swap rather than exposing it.
    */
    if (isBackwardNavigation(pathname, href)) {
      playBackTransition();
      router.push(href);
      return;
    }

    setRun({ href, game });
    timer.current = setTimeout(() => router.push(href), GAME_RUN_MS[game]);
  };

  return (
    <>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={(e) => onClick(e, item.href)}
          className="pac-coin-text rounded-md px-3 py-1.5 text-sm text-mist-400 transition hover:bg-ink-800 hover:text-mist-100"
        >
          {item.label}
        </Link>
      ))}

      {/*
        Portaled to <body> rather than rendered in place. These links live in
        a responsive container (`hidden sm:flex` in the site header), and CSS
        animations DO NOT RUN inside a `display: none` subtree — the overlay
        mounted, inherited the hidden ancestor at small widths, and the sprite
        sat frozen at x=0 with getAnimations() empty. A fullscreen fixed
        overlay has no business inheriting a nav's layout anyway.
      */}
      {run
        ? createPortal(
            run.game === "pacman" ? <PacManRun /> : <MarioRun />,
            document.body,
          )
        : null}

      {/* The reverse, played on arrival after the browser's back button. */}
      {back.active && !run
        ? createPortal(
            back.game === "pacman" ? <PacManBack /> : <MarioBack />,
            document.body,
          )
        : null}
    </>
  );
}

/* Geometry of the maze run, shared between the CSS and the pellet timing
   below. These have to agree: the pellets vanish on a delay, so if Pac-Man's
   travel changes and these do not, he eats them from a distance. */
const PAC_START_VW = -14;
const PAC_END_VW = 99;
const PAC_TRAVEL_MS = 1150;
const PELLET_FIRST_VW = 5;
const PELLET_SPAN_VW = 90;

/** When Pac-Man's mouth reaches the nth pellet, in ms from the start. */
function pelletEatenAt(index: number): number {
  const positionVw =
    PELLET_FIRST_VW + ((index + 0.5) / PELLET_COUNT) * PELLET_SPAN_VW;
  const progress = (positionVw - PAC_START_VW) / (PAC_END_VW - PAC_START_VW);
  return Math.round(progress * PAC_TRAVEL_MS);
}

/**
 * The maze run: a ghost flees down a corridor, Pac-Man chases it and clears
 * the pellets on the way, the ghost turns frightened as he closes, and once
 * he takes it his mouth opens over the whole screen and you arrive at the
 * next page.
 *
 * Nesting again, for the same reason as the pipe: travel, bob and the
 * eaten-shrink all write `transform`, and two animations on one element do
 * not compose — the later one silently wins.
 */
function PacManRun() {
  return (
    <div className="maze-overlay" aria-hidden="true">
      <span className="maze-corridor">
        {Array.from({ length: PELLET_COUNT }, (_, i) => (
          <span
            key={i}
            className="pac-pellet"
            style={{ animationDelay: `${pelletEatenAt(i)}ms` }}
          />
        ))}

        <span className="maze-lane ghost-lane">
          <span className="ghost-eaten">
            <span className="ghost-bob">
              <GhostSvg className="ghost-normal" body="#ff4d4d" />
              <GhostSvg className="ghost-scared" body="#2121de" frightened />
            </span>
          </span>
        </span>

        <span className="maze-lane pac-lane">
          <span className="pac-man">
            <span className="pac-eye" />
          </span>
        </span>
      </span>

      <span className="maze-iris" />
    </div>
  );
}

/** A ghost: dome, wavy hem, and eyes that look the way it is running. */
function GhostSvg({
  className,
  body,
  frightened = false,
  strong = false,
  size = 30,
}: {
  className?: string;
  body: string;
  frightened?: boolean;
  /** Angled brows — the one you run from rather than the one you eat. */
  strong?: boolean;
  size?: number;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 28 28"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path
        d="M2 15a12 12 0 0 1 24 0v11l-4-3.4-3.8 3.4-4.2-3.4L9.8 26 6 22.6 2 26z"
        fill={body}
      />
      {frightened ? (
        <>
          <circle cx="10" cy="13" r="2.4" fill="#fdf6dd" />
          <circle cx="18" cy="13" r="2.4" fill="#fdf6dd" />
          <path
            d="M7 19.5l2.4-2 2.4 2 2.4-2 2.4 2 2.4-2 2 1.7"
            fill="none"
            stroke="#fdf6dd"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <ellipse cx="10.5" cy="12.5" rx="3.4" ry="4" fill="#ffffff" />
          <ellipse cx="18.5" cy="12.5" rx="3.4" ry="4" fill="#ffffff" />
          {/* pupils point the way it is travelling */}
          <circle cx={strong ? 9 : 12} cy="12.8" r="1.7" fill="#2121de" />
          <circle cx={strong ? 17 : 20} cy="12.8" r="1.7" fill="#2121de" />
          {strong ? (
            <>
              <path
                d="M6.6 8.4l5 1.8"
                stroke="#7a0d0d"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M21.4 8.4l-5 1.8"
                stroke="#7a0d0d"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </>
          ) : null}
        </>
      )}
    </svg>
  );
}

/**
 * The warp pipe. Mario runs in along the ground, stops on top of the pipe,
 * drops into it, and the pipe mouth irises open to swallow the screen — the
 * wipe finishes exactly as the route changes, so the new page is what you
 * come out into.
 *
 * Four nested elements because four different things move, and each of them
 * writes `transform`: run across, sink down, stride bounce, iris out. Two
 * animations on one element do not compose — the later one silently wins.
 *
 * DOM order matters here and is not incidental: the runner comes BEFORE the
 * pipe so the pipe paints on top of him, which is what makes him disappear
 * into the mouth instead of sliding down its face.
 */
function MarioRun() {
  return (
    <div className="warp-overlay" aria-hidden="true">
      <span className="warp-ground" />
      <span className="warp-stage">
        <span className="warp-runner">
          <span className="warp-jumper">
            <span className="warp-sinker">
              <span className="warp-stride">
                <MarioSvg size={44} />
              </span>
            </span>
          </span>
        </span>
        <PipeSvg />
      </span>
      <span className="warp-iris" />
    </div>
  );
}

/**
 * Coming back out of the pipe. Same set pieces as MarioRun, run backwards:
 * the iris closes down to the pipe mouth, Mario rises out of it, and he runs
 * off to the left — the direction he originally came from.
 */
function MarioBack() {
  return (
    <div className="warp-overlay warp-back" aria-hidden="true">
      <span className="warp-ground" />
      <span className="warp-stage">
        <span className="warp-runner-back">
          <span className="warp-riser">
            <span className="warp-hopper">
              <span className="warp-stride-back">
                <MarioSvg size={44} />
              </span>
            </span>
          </span>
        </span>
        <PipeSvg />
      </span>
      <span className="warp-iris-close" />
    </div>
  );
}

/**
 * Fleeing the ghost. The mirror of the maze run: the iris closes, and this
 * time the ghost is the one doing the chasing — bigger, glowing, and not
 * frightened at all — while Pac-Man runs right to left with his mouth facing
 * the way he is going.
 */
function PacManBack() {
  return (
    <div className="maze-overlay" aria-hidden="true">
      <span className="maze-corridor">
        <span className="maze-lane pac-lane-back">
          <span className="pac-man pac-flip">
            <span className="pac-eye" />
          </span>
        </span>

        <span className="maze-lane ghost-lane-back">
          <span className="ghost-bob">
            <GhostSvg body="#ff2d2d" size={40} className="ghost-strong" strong />
          </span>
        </span>
      </span>

      <span className="maze-iris-close" />
    </div>
  );
}


function PipeSvg() {
  return (
    <svg
      className="warp-pipe"
      viewBox="0 0 120 68"
      width="120"
      height="68"
      aria-hidden="true"
    >
      {/* rim */}
      <rect x="0" y="0" width="120" height="18" rx="4" fill="#3fc14f" />
      <rect x="0" y="0" width="120" height="5" rx="2.5" fill="#7ee68b" />
      <rect x="0" y="14" width="120" height="4" fill="#1c7c2c" />
      {/* body */}
      <rect x="13" y="18" width="94" height="50" fill="#26a13a" />
      <rect x="22" y="18" width="12" height="50" fill="#3fc14f" />
      <rect x="96" y="18" width="7" height="50" fill="#1c7c2c" />
    </svg>
  );
}

function MarioSvg({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {/* cap and brim */}
      <path
        d="M6.2 7.4c0-2.4 2.3-4.1 5.4-4.1 2.7 0 4.7 1.2 5.3 3.1l1.7.6c.6.2.5 1.1-.2 1.1H6.2z"
        fill="#d8231d"
      />
      {/* face */}
      <rect x="7.6" y="8.2" width="7.8" height="5" rx="2" fill="#f3c091" />
      {/* eye */}
      <rect x="12.3" y="9.3" width="1.3" height="2.1" rx="0.6" fill="#2a1a0e" />
      {/* moustache */}
      <rect x="8.4" y="11.4" width="5.6" height="1.7" rx="0.8" fill="#3a2410" />
      {/* shirt */}
      <path d="M7.6 13.4h8l1.5 3.2H6.1z" fill="#d8231d" />
      {/* overalls */}
      <rect x="6.9" y="16.2" width="9.5" height="4" rx="1.2" fill="#2f6cb8" />
      {/* shoes */}
      <rect x="6.2" y="19.9" width="4.2" height="2.1" rx="1" fill="#6b3410" />
      <rect x="12.9" y="19.9" width="4.2" height="2.1" rx="1" fill="#6b3410" />
    </svg>
  );
}
