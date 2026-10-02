const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4123';

export async function api(path, { method = 'GET', body, token, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!formData) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data;
}

export async function uploadAdminImage(file, token) {
  const fd = new FormData();
  fd.append('file', file);
  return api('/api/admin/upload', { method: 'POST', token, formData: fd });
}

export { API };
