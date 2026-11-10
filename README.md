# Ajaia Docs

A lightweight collaborative document editor: rich-text editing, file import, and owner/editor/viewer sharing.

**Stack:** React + Vite + TipTap, Node/Express, SQLite (`better-sqlite3`). One service serves the API and the built client.

## Run locally (Node 20+)
```bash
npm install
npm run build          # installs and builds the client
npm start              # http://localhost:3001
```
Development with hot reload: `npm run dev:server` and `npm run dev:client` in two terminals (client on http://localhost:5173).

Tests: `npm test`

## Test accounts (seeded on first boot)
| User | Email |
|---|---|
| Alice Rahman | alice@example.com |
| Bob Chen | bob@example.com |
| Carol Diaz | carol@example.com |

Sign-in is **mocked**: pick an account on the login screen. There are no passwords. This is deliberate for the exercise and not production auth.

**Try sharing:** sign in as Alice in one browser profile and Bob in another (cookies are per profile). Alice's "Welcome" document is already shared with Bob as an editor. Share any document by email, choose "Can edit" or "View only", and check Bob's "Shared with me" tab.

## Features
- Create, rename (click the title), edit, autosave, reopen. Formatting: bold, italic, underline, H1/H2, bulleted and numbered lists. Content is stored as sanitized HTML.
- Import `.txt`, `.md`, `.docx` (max 2 MB) into a new document. Other types are rejected with a message.
- Sharing with viewer/editor roles, "My documents" vs "Shared with me" tabs with badges. Viewers get a read-only editor.
- Validation and errors: empty/long titles, bad file types and sizes, 401/403/404 responses surfaced in the UI.

## Deploy (Render, free tier)
New Web Service from this repo, Runtime: Docker. Port 8080 is set in the Dockerfile. Free-tier disks are ephemeral, so the database resets on redeploy or restart; seed data is recreated on boot. To keep data, attach a persistent disk at `/app/data`.

## Known limits
No real-time collaboration, real auth, version history, or attachments. Docx import keeps headings, bold/italic, and lists; images and tables are dropped.
