# `docs/pdf/` - the paginated documentation set

**Work package:** shared.

## What this folder is

Fourteen PDFs, 242 pages, built from the 88 `FOLDER.md` files and
`00-PROJECT-RECORD.md`. Same content, laid out for reading away from a screen
with the source tree open.

## What happened here

Generated once and committed. They are **build output, not sources**: if a
`FOLDER.md` changes, the PDF beside it is stale until it is regenerated, and
the markdown is always the authority.

Every page carries a small grey signature in the footer, which is why the
renderer is hand-rolled rather than delegated - pandoc gives no reliable
control over per-page furniture.

## Files

`README.md` lists all fourteen and what each covers. In short: `00` is the
complete 115-page bundle, `01` is the project record on its own, and `02`-`13`
are one volume per area of the tree.

## Connected folders

- [`docs/`](../FOLDER.md) - the written documentation these render.
- [`/`](../../FOLDER.md) - `00-PROJECT-RECORD.md`, the source of volume 01.

<p align="right"><sub><i>Adham Yakout</i></sub></p>
