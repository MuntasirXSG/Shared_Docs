import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { api } from './api.js';

const useHash = () => {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
};
const fmt = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = loading, null = signed out
  const hash = useHash();
  useEffect(() => { api.me().then(setMe, () => setMe(null)); }, []);
  if (me === undefined) return null;
  if (!me) return <Login onLogin={setMe} />;
  const docId = /^#\/doc\/(\d+)$/.exec(hash)?.[1];
  const signOut = async () => { await api.logout(); location.hash = ''; setMe(null); };
  return (
    <>
      <header className="bar">
        <a className="brand" href="#/">Ajaia Docs</a>
        <span className="who">{me.name}</span>
        <button className="link" onClick={signOut}>Switch user</button>
      </header>
      {docId ? <Editor key={docId} id={docId} /> : <Dashboard />}
    </>
  );
}

function Login({ onLogin }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api.users().then(setUsers, (e) => setError(e.message)); }, []);
  return (
    <main className="login">
      <h1>Ajaia Docs</h1>
      <p className="muted">Demo sign-in. Pick a seeded account; open a second browser profile to try sharing as another user.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {users.map((u) => (
        <button key={u.id} className="user" onClick={() => api.login(u.email).then(onLogin, (e) => setError(e.message))}>
          <strong>{u.name}</strong><span>{u.email}</span>
        </button>
      ))}
    </main>
  );
}

function Dashboard() {
  const [lists, setLists] = useState(null);
  const [tab, setTab] = useState('owned');
  const [error, setError] = useState('');
  const fileRef = useRef();
  useEffect(() => { api.list().then(setLists, (e) => setError(e.message)); }, []);
  const open = (id) => { location.hash = `#/doc/${id}`; };
  const run = (p) => p.then(({ id }) => open(id), (e) => setError(e.message));
  const rows = lists?.[tab] ?? [];
  return (
    <main className="wrap">
      <div className="actions">
        <button className="primary" onClick={() => run(api.create())}>New document</button>
        <button onClick={() => fileRef.current.click()}>Import file</button>
        <span className="muted">Import supports .txt, .md and .docx (max 2 MB)</span>
        <input ref={fileRef} type="file" hidden accept=".txt,.md,.docx" onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) run(api.importFile(f)); }} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="tabs" role="tablist">
        {[['owned', 'My documents'], ['shared', 'Shared with me']].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}{lists ? ` (${lists[k].length})` : ''}
          </button>
        ))}
      </div>
      {lists && !rows.length && (
        <p className="empty">{tab === 'owned' ? 'No documents yet. Create one or import a file.' : 'Nothing has been shared with you yet.'}</p>
      )}
      <ul className="docs">
        {rows.map((d) => (
          <li key={d.id}>
            <button className="doc" onClick={() => open(d.id)}>
              <span className="doc-title">{d.title}</span>
              {tab === 'shared'
                ? <span className="badge shared">{d.role === 'editor' ? 'Can edit' : 'View only'} · from {d.ownerName}</span>
                : <span className="badge owned">Owned by you</span>}
              <span className="muted">{fmt(d.updatedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Editor({ id }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get(id).then(setDoc, (e) => setError(e.message)); }, [id]);
  if (error) return <main className="wrap"><p className="error" role="alert">{error}</p><a href="#/">Back to documents</a></main>;
  return doc ? <DocEditor doc={doc} /> : null;
}

function DocEditor({ doc }) {
  const canEdit = doc.role !== 'viewer';
  const [title, setTitle] = useState(doc.title);
  const [status, setStatus] = useState('Saved');
  const timer = useRef();
  const pending = useRef(null);

  const save = useCallback(async (patch) => {
    setStatus('Saving…');
    try { await api.update(doc.id, patch); setStatus('Saved'); }
    catch (e) { setStatus(`Not saved: ${e.message}`); }
  }, [doc.id]);

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), Underline],
    content: doc.content,
    editable: canEdit,
    onUpdate: ({ editor }) => {
      pending.current = editor.getHTML();
      setStatus('Unsaved changes');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { const content = pending.current; pending.current = null; save({ content }); }, 700);
    },
  });

  // flush any unsaved edit when leaving the page
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (pending.current != null) api.update(doc.id, { content: pending.current }).catch(() => {});
  }, [doc.id]);

  const commitTitle = () => {
    if (!title.trim()) return setTitle(doc.title);
    if (title.trim() !== doc.title) { doc.title = title.trim(); save({ title: title.trim() }); }
  };

  return (
    <main className="wrap">
      <a href="#/" className="back">All documents</a>
      <div className="titlebar">
        <input className="title" aria-label="Document title" value={title} disabled={!canEdit} maxLength={200}
          onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
        <span className={`status ${status.startsWith('Not') ? 'error' : ''}`} role="status">{canEdit ? status : 'View only'}</span>
      </div>
      <p className="muted">
        {doc.role === 'owner' ? 'You own this document' : `Owned by ${doc.ownerName} · you can ${doc.role === 'editor' ? 'edit' : 'only view'}`}
      </p>
      {canEdit && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="page" />
      {doc.role === 'owner' && <SharePanel doc={doc} />}
    </main>
  );
}

function Toolbar({ editor }) {
  if (!editor) return null;
  const items = [
    ['B', 'Bold', () => editor.chain().focus().toggleBold().run(), 'bold'],
    ['I', 'Italic', () => editor.chain().focus().toggleItalic().run(), 'italic'],
    ['U', 'Underline', () => editor.chain().focus().toggleUnderline().run(), 'underline'],
    ['H1', 'Heading 1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), ['heading', { level: 1 }]],
    ['H2', 'Heading 2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), ['heading', { level: 2 }]],
    ['• List', 'Bulleted list', () => editor.chain().focus().toggleBulletList().run(), 'bulletList'],
    ['1. List', 'Numbered list', () => editor.chain().focus().toggleOrderedList().run(), 'orderedList'],
  ];
  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      {items.map(([label, name, run, active]) => (
        <button key={name} title={name} aria-label={name} aria-pressed={editor.isActive(...[].concat(active))}
          className={editor.isActive(...[].concat(active)) ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={run}>
          {label}
        </button>
      ))}
    </div>
  );
}

function SharePanel({ doc }) {
  const [shares, setShares] = useState(doc.shares || []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState('');
  const act = (p) => p.then((r) => { setShares(r.shares); setError(''); }, (e) => setError(e.message));
  return (
    <section className="share">
      <h2>Sharing</h2>
      <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) act(api.share(doc.id, email, role)).then(() => setEmail('')); }}>
        <input type="email" placeholder="Email, e.g. bob@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email to share with" />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Access level">
          <option value="editor">Can edit</option>
          <option value="viewer">View only</option>
        </select>
        <button className="primary">Share</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <ul>
        {shares.map((s) => (
          <li key={s.userId}>
            <span>{s.name} <span className="muted">{s.email}</span></span>
            <span className="badge shared">{s.role === 'editor' ? 'Can edit' : 'View only'}</span>
            <button className="link" onClick={() => act(api.unshare(doc.id, s.userId))}>Remove</button>
          </li>
        ))}
        {!shares.length && <li className="muted">Not shared with anyone yet.</li>}
      </ul>
    </section>
  );
}
