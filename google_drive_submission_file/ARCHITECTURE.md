# Architecture note

**Shape:** a single Express service exposes a JSON API under `/api` and serves the built React client. One deployable, no CORS, no external services.

**Data model (SQLite):** `users`, `documents` (HTML content, owner, updated_at), `shares` (doc, user, role: viewer|editor). The owner is implicit via `documents.owner_id`. Effective role = owner, else the share row, else none.

**Access logic:** one middleware, `withDoc(minRole)`, loads the document, computes the role and enforces a minimum (viewer < editor < owner). Every document route declares its required role, so permissions live in one place. Non-shared users get 403.

**Editor:** TipTap (ProseMirror) outputs HTML. The server sanitizes it with an allowlist of tags before storing, which closes the stored-XSS path from imports and direct API calls. Autosave is debounced (700 ms) and flushed when leaving the page.

**Import:** `.txt` becomes paragraphs, `.md` goes through `marked`, `.docx` through `mammoth`, then the same sanitizer. The result is a new owned document, so import reuses the normal create path.

**What I prioritized**: a correct permission model with tests, an editing flow that feels reliable (autosave state is always visible), and a one-command deploy.

**Deliberately cut:** real auth (cookie holds a seeded user id), real-time collaboration (last write wins when two editors save), version history, attachments, comments.

