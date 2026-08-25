# `src/app/api/v1/session-log/share/` - consent-gated sharing

**Work package:** benchmark and provider layer.

## What this folder is

`GET` previews exactly what sharing would send. `POST` sends it, on an explicit
confirmation.

## What happened here

New, and the two design rules in it are the reason it is a separate route
rather than a flag on the export.

**The preview is not a description of the payload - it IS the payload.** Both
verbs call the same builder. Anything else drifts, and a preview that has
drifted from what actually gets sent is worse than no preview.

**`POST` requires `confirm: true` in the body.** A request without it is refused
and returns the preview instead, so "share" can never happen as a side effect of
some other call. The consent wording the user agreed to is stored on the row,
rather than living only in whatever the interface happened to say that day.

There is **no UI for this endpoint yet**.

## Files

| File | What it is |
|---|---|
| `route.ts` | 170 lines. `GET` preview, `POST` send-on-confirmation |

## Connected folders

- [`src/app/api/v1/session-log/`](../FOLDER.md) - the export it shares.
- [`src/core/logging/`](../../../../../core/logging/FOLDER.md) -
  `buildSharePayload` and `SHARE_CONSENT_STATEMENT`.
- [`prisma/migrations/`](../../../../../../prisma/migrations/FOLDER.md) - the
  migration that created `shared_findings`.

<p align="right"><sub><i>Adham Yakout</i></sub></p>
