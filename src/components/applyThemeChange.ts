/**
 * Applies a theme/palette attribute change with transitions suppressed.
 *
 * WHY THIS EXISTS. Both toggles work by swapping a `data-*` attribute on
 * <html>, which re-resolves the CSS custom properties every colour reads
 * from. That works for plain properties — but an element carrying a CSS
 * `transition` on `background-color` keeps painting its OLD colour when the
 * change arrives through a custom property: the browser does not restart the
 * transition, so the stale value sticks indefinitely.
 *
 * Observed directly: with `bg-pulse-500` + `transition`, clicking the
 * palette toggle left the hero call-to-action Pac-Man yellow on a cockpit
 * page, still yellow 900 ms later, while untransitioned surfaces around it
 * had already changed. A fresh element with the same class painted the
 * correct colour, which is what pinned the cause on the transition rather
 * than on specificity or a stale stylesheet.
 *
 * So: kill transitions for one frame, flip the attribute, then let them
 * back. Two nested rAF calls are deliberate — one frame to apply the new
 * colours with transitions off, the next to restore them, so nothing
 * animates from the old palette to the new one on the way through.
 */
const SUPPRESS_CLASS = "ep-theme-switching";

export function applyThemeChange(mutate: () => void): void {
  const root = document.documentElement;
  root.classList.add(SUPPRESS_CLASS);
  mutate();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove(SUPPRESS_CLASS);
    });
  });
}
