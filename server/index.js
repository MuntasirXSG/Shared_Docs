import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './db.js';
import { createApp } from './app.js';

const dir = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(dir, { recursive: true });
const port = process.env.PORT || 3001;
createApp(openDb(path.join(dir, 'docs.db'))).listen(port, () => console.log(`Ajaia Docs on :${port}`));
