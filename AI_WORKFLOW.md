# AI workflow note

> DRAFT: replace every bracketed item with what actually happened. Reviewers value specifics over volume.

**Tools used:** Claude (planning, code generation) [add others, e.g. Copilot, Cursor].

**Where AI sped me up:** scaffolding the Express routes, SQLite schema and seed, the TipTap toolbar, and the first pass of tests and docs. [Add an estimate of time saved.]

**What I changed or rejected:** [Fill in honestly. Examples to check against your own review: tightened sanitizer allowlist; decided to return 403 vs 404 for unshared documents; any bugs you hit on first run, such as dependency versions or the Dockerfile build.]

**How I verified:** ran `npm test`; walked through the owner/editor/viewer flows in two browser profiles; tried a bad file type, an oversized file, an empty title, and a corrupted .docx; refreshed to confirm persistence; smoke-tested the deployed URL. [Edit to match what you really did.]
