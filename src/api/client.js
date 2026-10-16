const API_BASE = '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
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
      logo_path: data.logo_path || null,
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
  profile: {
    async get() {
      return request('/profile');
    },
    async update({ fullName }) {
      return request('/profile', { method: 'PATCH', body: JSON.stringify({ full_name: fullName }) });
    },
    async changePassword({ currentPassword, newPassword }) {
      return request('/profile/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
    },
    async uploadLogo({ contentType, dataBase64 }) {
      return request('/profile/logo', {
        method: 'POST',
        body: JSON.stringify({ content_type: contentType, data_base64: dataBase64 }),
      });
    },
    async removeLogo() {
      return request('/profile/logo', { method: 'DELETE' });
    },
  },
  siteContent: {
    async get() {
      return request('/site-content');
    },
  },
  uploads: {
    async list() {
      return request('/admin/uploads');
    },
    async upload({ contentType, dataBase64 }) {
      return request('/admin/uploads', {
        method: 'POST',
        body: JSON.stringify({ content_type: contentType, data_base64: dataBase64 }),
      });
    },
    async remove(filename) {
      return request(`/admin/uploads/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    },
  },
  auth: {
    async isAuthenticated() {
      return (await currentUser()) !== null;
    },
    me: currentUser,
    async loginViaEmailPassword(email, password) {
      await request('/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      return currentUser();
    },
    async register({ email, password, name }) {
      await request('/auth/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({ email, password, name: name || email.split('@')[0] }),
      });
      return currentUser();
    },
    async logout() {
      await request('/auth/sign-out', { method: 'POST' });
    },
    async resetPasswordRequest(email) {
      await request('/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      });
    },
    async resetPassword({ resetToken, newPassword }) {
      await request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
    },
    async loginWithProvider(provider, returnTo) {
      const data = await request('/auth/sign-in/social', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          callbackURL: returnTo || '/',
        }),
      });
      if (data && data.url) {
        window.location.href = data.url;
      }
    },
  },
};

export default db;
