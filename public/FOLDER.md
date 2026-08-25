# `public/` - statically served files

**Work package:** product UI.

## What this folder is

Files Next.js serves verbatim at the site root. Nothing here is compiled,
type-checked or linted.

## What happened here

Two files were removed: `index.html` and `favicon.svg`. `index.html` was the
more important removal - a static `index.html` in `public/` shadows the App
Router route at `/`, so the application's real home page
(`src/app/page.tsx`) was being served only when that file happened not to
match. Having two definitions of the home page in two different systems is the
kind of thing that works until it silently does not.

`edgepilot-live.html` was kept. It is a single 283 KB self-contained page - a
standalone demo that runs with no server, no build and no database - which is
useful precisely because the rest of the project needs all three.

## Files

| File | What it is |
|---|---|
| `edgepilot-live.html` | Self-contained demo page, 283 KB, all CSS and JS inline. Openable from disk |

## Connected folders

- [`src/app/`](../src/app/FOLDER.md) - where the real routes live, and why
  `index.html` had to go.

<p align="right"><sub><i>Adham Yakout</i></sub></p>
