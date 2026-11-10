import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { openDb } from './db.js';
import { createApp } from './app.js';

let app;
const as = async (email) => {
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email });
  return agent;
};

beforeEach(() => { app = createApp(openDb(':memory:')); });

describe('sharing and access control', () => {
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/documents')).status).toBe(401);
  });

  it('blocks users the document is not shared with', async () => {
    const [alice, carol] = [await as('alice@example.com'), await as('carol@example.com')];
    const { id } = (await alice.post('/api/documents').send({ title: 'Private' })).body;
    expect((await carol.get(`/api/documents/${id}`)).status).toBe(403);
  });

  it('viewer can read but not edit; editor can edit; only owner can share', async () => {
    const [alice, bob, carol] = [await as('alice@example.com'), await as('bob@example.com'), await as('carol@example.com')];
    const { id } = (await alice.post('/api/documents').send({ title: 'Plan' })).body;

    await alice.post(`/api/documents/${id}/shares`).send({ email: 'bob@example.com', role: 'viewer' }).expect(200);
    const read = await bob.get(`/api/documents/${id}`);
    expect(read.status).toBe(200);
    expect(read.body.role).toBe('viewer');
    expect((await bob.put(`/api/documents/${id}`).send({ content: '<p>x</p>' })).status).toBe(403);
    expect((await bob.post(`/api/documents/${id}/shares`).send({ email: 'carol@example.com' })).status).toBe(403);

    await alice.post(`/api/documents/${id}/shares`).send({ email: 'bob@example.com', role: 'editor' }).expect(200);
    await bob.put(`/api/documents/${id}`).send({ content: '<p><strong>hi</strong></p>' }).expect(200);
    expect((await alice.get(`/api/documents/${id}`)).body.content).toBe('<p><strong>hi</strong></p>');

    const list = (await bob.get('/api/documents')).body;
    expect(list.shared.map((d) => d.id)).toContain(id);
    expect(list.owned.map((d) => d.id)).not.toContain(id);
    expect((await carol.get('/api/documents')).body.shared).toHaveLength(0);
  });

  it('strips scripts from saved content', async () => {
    const alice = await as('alice@example.com');
    const { id } = (await alice.post('/api/documents').send({ content: '<p>ok</p><script>alert(1)</script>' })).body;
    expect((await alice.get(`/api/documents/${id}`)).body.content).toBe('<p>ok</p>');
  });
});

describe('validation and import', () => {
  it('rejects empty titles', async () => {
    const alice = await as('alice@example.com');
    const { id } = (await alice.post('/api/documents').send({})).body;
    expect((await alice.put(`/api/documents/${id}`).send({ title: '  ' })).status).toBe(400);
  });

  it('imports a markdown file as a new document', async () => {
    const alice = await as('alice@example.com');
    const res = await alice.post('/api/import').attach('file', Buffer.from('# Hello\n\nworld'), 'notes.md');
    expect(res.status).toBe(201);
    const doc = (await alice.get(`/api/documents/${res.body.id}`)).body;
    expect(doc.title).toBe('notes');
    expect(doc.content).toContain('<h1>Hello</h1>');
  });

  it('rejects unsupported file types', async () => {
    const alice = await as('alice@example.com');
    const res = await alice.post('/api/import').attach('file', Buffer.from('x'), 'virus.exe');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unsupported/);
  });
});
