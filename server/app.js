import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RANK = { viewer: 1, editor: 2, owner: 3 };
const IMPORT_TYPES = ['.txt', '.md', '.docx'];
const MAX_UPLOAD = 2 * 1024 * 1024;

export const clean = (html) =>
  sanitizeHtml(html ?? '', {
    allowedTags: ['h1', 'h2', 'h3', 'p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre'],
    allowedAttributes: {},
  });
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fail = (status, message) => Object.assign(new Error(message), { status });

function validTitle(t) {
  if (typeof t !== 'string' || !t.trim()) throw fail(400, 'Title cannot be empty.');
  if (t.trim().length > 200) throw fail(400, 'Title must be 200 characters or fewer.');
  return t.trim();
}

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD } });
  const now = () => new Date().toISOString();

  // --- mocked auth: a cookie holding the seeded user's id (documented as non-production) ---
  app.use((req, _res, next) => {
    const m = /(?:^|;\s*)uid=(\d+)/.exec(req.headers.cookie || '');
    req.user = m ? db.prepare('SELECT id,name,email FROM users WHERE id=?').get(Number(m[1])) : null;
    next();
  });
  const authed = (req, _res, next) => (req.user ? next() : next(fail(401, 'Please sign in.')));

  // Loads the doc and enforces a minimum role. 403 for no access, 404 for missing.
  const withDoc = (min) => (req, _res, next) => {
    const id = Number(req.params.id);
    const doc = Number.isInteger(id)
      ? db.prepare('SELECT d.*, u.name AS owner_name FROM documents d JOIN users u ON u.id=d.owner_id WHERE d.id=?').get(id)
      : null;
    if (!doc) return next(fail(404, 'Document not found.'));
    const role = doc.owner_id === req.user.id ? 'owner' : db.prepare('SELECT role FROM shares WHERE doc_id=? AND user_id=?').get(id, req.user.id)?.role;
    if (!role) return next(fail(403, 'You do not have access to this document.'));
    if (RANK[role] < RANK[min]) return next(fail(403, `This action needs ${min} access.`));
    req.doc = doc;
    req.role = role;
    next();
  };

  const shareList = (docId) =>
    db.prepare('SELECT s.user_id AS userId, s.role, u.name, u.email FROM shares s JOIN users u ON u.id=s.user_id WHERE s.doc_id=? ORDER BY u.name').all(docId);
  const createDoc = (title, content, ownerId) =>
    Number(db.prepare('INSERT INTO documents (title,content,owner_id,updated_at) VALUES (?,?,?,?)').run(title, clean(content), ownerId, now()).lastInsertRowid);

  // --- auth ---
  app.get('/api/users', (_req, res) => res.json(db.prepare('SELECT id,name,email FROM users').all()));
  app.post('/api/login', (req, res, next) => {
    const user = db.prepare('SELECT id,name,email FROM users WHERE email=?').get(String(req.body?.email || '').toLowerCase());
    if (!user) return next(fail(404, 'No account with that email.'));
    res.setHeader('Set-Cookie', `uid=${user.id}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`);
    res.json(user);
  });
  app.post('/api/logout', (_req, res) => {
    res.setHeader('Set-Cookie', 'uid=; HttpOnly; Path=/; Max-Age=0');
    res.json({ ok: true });
  });
  app.get('/api/me', authed, (req, res) => res.json(req.user));

  // --- documents ---
  app.get('/api/documents', authed, (req, res) => {
    const owned = db.prepare('SELECT id,title,updated_at AS updatedAt FROM documents WHERE owner_id=? ORDER BY updated_at DESC').all(req.user.id);
    const shared = db
      .prepare(`SELECT d.id,d.title,d.updated_at AS updatedAt,s.role,u.name AS ownerName FROM shares s
                JOIN documents d ON d.id=s.doc_id JOIN users u ON u.id=d.owner_id
                WHERE s.user_id=? ORDER BY d.updated_at DESC`)
      .all(req.user.id);
    res.json({ owned, shared });
  });

  app.post('/api/documents', authed, (req, res, next) => {
    try {
      const title = req.body?.title == null ? 'Untitled document' : validTitle(req.body.title);
      res.status(201).json({ id: createDoc(title, req.body?.content, req.user.id) });
    } catch (e) { next(e); }
  });

  app.get('/api/documents/:id', authed, withDoc('viewer'), (req, res) => {
    const { id, title, content, owner_name, updated_at } = req.doc;
    res.json({ id, title, content, ownerName: owner_name, updatedAt: updated_at, role: req.role, shares: req.role === 'owner' ? shareList(id) : undefined });
  });

  app.put('/api/documents/:id', authed, withDoc('editor'), (req, res, next) => {
    try {
      const { title, content } = req.body || {};
      if (title === undefined && content === undefined) throw fail(400, 'Nothing to update.');
      if (content !== undefined && typeof content !== 'string') throw fail(400, 'Content must be a string.');
      db.prepare('UPDATE documents SET title=?, content=?, updated_at=? WHERE id=?').run(
        title === undefined ? req.doc.title : validTitle(title),
        content === undefined ? req.doc.content : clean(content),
        now(),
        req.doc.id
      );
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  app.delete('/api/documents/:id', authed, withDoc('owner'), (req, res) => {
    db.prepare('DELETE FROM documents WHERE id=?').run(req.doc.id);
    res.json({ ok: true });
  });

  // --- sharing (owner only) ---
  app.post('/api/documents/:id/shares', authed, withDoc('owner'), (req, res, next) => {
    try {
      const role = req.body?.role || 'editor';
      if (!['viewer', 'editor'].includes(role)) throw fail(400, 'Role must be viewer or editor.');
      const target = db.prepare('SELECT id FROM users WHERE email=?').get(String(req.body?.email || '').trim().toLowerCase());
      if (!target) throw fail(404, 'No user with that email. Try alice@, bob@ or carol@example.com.');
      if (target.id === req.user.id) throw fail(400, 'You already own this document.');
      db.prepare('INSERT INTO shares (doc_id,user_id,role) VALUES (?,?,?) ON CONFLICT(doc_id,user_id) DO UPDATE SET role=excluded.role').run(req.doc.id, target.id, role);
      res.json({ shares: shareList(req.doc.id) });
    } catch (e) { next(e); }
  });
  app.delete('/api/documents/:id/shares/:userId', authed, withDoc('owner'), (req, res) => {
    db.prepare('DELETE FROM shares WHERE doc_id=? AND user_id=?').run(req.doc.id, Number(req.params.userId));
    res.json({ shares: shareList(req.doc.id) });
  });

  // --- import: .txt / .md / .docx -> new document ---
  app.post('/api/import', authed, upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) throw fail(400, 'Choose a file to import.');
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!IMPORT_TYPES.includes(ext)) throw fail(400, `Unsupported file type. Import ${IMPORT_TYPES.join(', ')} files.`);
      let html;
      if (ext === '.docx') {
        try { html = (await mammoth.convertToHtml({ buffer: req.file.buffer })).value; }
        catch { throw fail(400, 'That .docx could not be read. It may be corrupted.'); }
      } else {
        const text = req.file.buffer.toString('utf8');
        html = ext === '.md' ? marked.parse(text, { async: false }) : text.split(/\n{2,}/).filter((p) => p.trim()).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
      }
      const title = path.basename(req.file.originalname, ext).slice(0, 200) || 'Imported document';
      res.status(201).json({ id: createDoc(title, html, req.user.id) });
    } catch (e) { next(e); }
  });

  // --- static client (production) ---
  const dist = path.join(__dirname, '../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use('/api', (_req, _res, next) => next(fail(404, 'Not found.')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large. The limit is 2 MB.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Something went wrong on our side.' : err.message });
  });
  return app;
}
