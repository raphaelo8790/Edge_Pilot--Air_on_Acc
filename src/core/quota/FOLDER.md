# `src/core/quota/` - the cloud-run allowance

**Work package:** shared.

## What this folder is

A cap on how much of the server's cloud quota one visitor may spend.

## What happened here

New with hosting. A cloud vision run is 21 requests to Gemini or Groq. With
the visitor's own key that is their business; with the key the operator
configured, an ungated button is an invitation to spend it all evening. So a
visitor gets `CLOUD_RUNS_PER_HOUR` server-key runs an hour, keyed on their
session id, and a message that says when to try again and where to add their
own key.

It is in-memory and per process. On a serverless host each instance keeps
its own count, so it turns "unlimited" into "a handful" rather than into a
hard wall. That is stated in the file rather than implied.

## Files

| File | What it is |
|---|---|
| `cloudRunQuota.ts` | `takeCloudRun` records a run against the session's bucket if there is room and returns a verdict; `resetCloudRunQuota` for tests |

## Connected folders

- [`src/app/vision-benchmark/`](../../app/vision-benchmark/FOLDER.md) - the
  server action that calls it.
- [`tests/core/`](../../../tests/core/FOLDER.md) - its tests.

## Referenced from

These folders point here. Each link below resolves in both directions.

- [`src/core/`](../FOLDER.md)

<p align="right"><sub><i>Adham Yakout</i></sub></p>
