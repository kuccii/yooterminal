const API_BASE = '/api';

let authTokenProvider = null;

export function setAuthTokenProvider(provider) {
  authTokenProvider = provider;
}

async function request(path, options = {}) {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };
  if (authTokenProvider) {
    const token = await authTokenProvider().catch(() => null);
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${response.status})`;
    const error = new Error(message);
    /** @type {any} */ (error).status = response.status;
    throw error;
  }
  return data;
}

function buildQuery(filter, options = {}) {
  const params = new URLSearchParams();
  if (filter && Object.keys(filter).length) params.set('filter', JSON.stringify(filter));
  if (options.sort) params.set('sort', options.sort);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.fields && options.fields.length) params.set('fields', options.fields.join(','));
  const query = params.toString();
  return query ? `?${query}` : '';
}

function entityClient(name) {
  const base = `/entities/${name}`;
  return {
    list: (options = {}) => request(`${base}${buildQuery({}, options)}`),
    filter: (query = {}, options = {}) => request(`${base}${buildQuery(query, options)}`),
    get: (id) => request(`${base}/${encodeURIComponent(id)}`),
    create: (payload) => request(base, { method: 'POST', body: JSON.stringify(payload) }),
    update: (id, payload) =>
      request(`${base}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    delete: (id) => request(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    updateMany: (filter, update) =>
      request(`${base}/update-many`, { method: 'POST', body: JSON.stringify({ filter, update }) }),
    aggregate: (options) => request(`${base}/aggregate`, { method: 'POST', body: JSON.stringify(options) }),
  };
}

async function currentUser() {
  try {
    const data = await request('/me');
    if (!data || !data.email) return null;
    return {
      id: data.id,
      email: data.email,
      role: data.role || 'user',
      full_name: data.full_name || '',
    };
  } catch {
    return null;
  }
}

export const db = {
  // Entities are addressed by name at runtime; keep the surface untyped so
  // call sites like db.entities.Schedule stay ergonomic under checkJs.
  entities: /** @type {any} */ (new Proxy({}, {
    get: (target, name) => entityClient(String(name)),
  })),
  auth: {
    async isAuthenticated() {
      return (await currentUser()) !== null;
    },
    me: currentUser,
  },
};

export default db;
