async function call(method, url, body) {
  const isForm = body instanceof FormData;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Check your connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { status: res.status });
  return data;
}

export const api = {
  users: () => call('GET', '/api/users'),
  me: () => call('GET', '/api/me'),
  login: (email) => call('POST', '/api/login', { email }),
  logout: () => call('POST', '/api/logout'),
  list: () => call('GET', '/api/documents'),
  create: () => call('POST', '/api/documents', {}),
  get: (id) => call('GET', `/api/documents/${id}`),
  update: (id, patch) => call('PUT', `/api/documents/${id}`, patch),
  remove: (id) => call('DELETE', `/api/documents/${id}`),
  share: (id, email, role) => call('POST', `/api/documents/${id}/shares`, { email, role }),
  unshare: (id, userId) => call('DELETE', `/api/documents/${id}/shares/${userId}`),
  importFile: (file) => {
    const f = new FormData();
    f.append('file', file);
    return call('POST', '/api/import', f);
  },
};
