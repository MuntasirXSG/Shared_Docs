import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  owner_id INTEGER NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shares (
  doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('viewer','editor')),
  PRIMARY KEY (doc_id, user_id)
);`;

export function openDb(file = ':memory:') {
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

// Seeds only when empty, so a fresh deploy is immediately demo-able.
function seed(db) {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c) return;
  const addUser = db.prepare('INSERT INTO users (name,email) VALUES (?,?)');
  const [alice, bob] = [
    ['Alice Rahman', 'alice@example.com'],
    ['Bob Chen', 'bob@example.com'],
    ['Carol Diaz', 'carol@example.com'],
  ].map((u) => addUser.run(...u).lastInsertRowid);
  const doc = db
    .prepare('INSERT INTO documents (title,content,owner_id,updated_at) VALUES (?,?,?,?)')
    .run(
      'Welcome to Ajaia Docs',
      '<h1>Welcome</h1><p>This document is owned by Alice and <strong>shared with Bob as an editor</strong>.</p><ul><li>Try bold, italic and underline</li><li>Import a .txt, .md or .docx from the dashboard</li></ul>',
      alice,
      new Date().toISOString()
    ).lastInsertRowid;
  db.prepare('INSERT INTO shares (doc_id,user_id,role) VALUES (?,?,?)').run(doc, bob, 'editor');
}
