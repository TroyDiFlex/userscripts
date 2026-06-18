// Тонкая обёртка над GitHub Contents API.

export function getToken() { return localStorage.getItem('gh_pat') || ''; }
export function getRepo() {
  const r = localStorage.getItem('gh_repo') || '';
  const [owner, name] = r.split('/');
  return { owner: owner || '', name: name || '' };
}
export function setAuth(token, repo) {
  localStorage.setItem('gh_pat', token);
  localStorage.setItem('gh_repo', repo);
}
export function clearAuth() {
  localStorage.removeItem('gh_pat');
  localStorage.removeItem('gh_repo');
}

async function api(path, { method = 'GET', body = null } = {}) {
  const res = await fetch('https://api.github.com' + path, {
    method,
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : null,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* */ }
  if (!res.ok) {
    const msg = data?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function checkAuth() {
  const { owner, name } = getRepo();
  if (!getToken() || !owner || !name) throw new Error('Не настроено');
  return await api(`/repos/${owner}/${name}`);
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
export function abToBase64(ab) {
  const bytes = new Uint8Array(ab);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function encPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export async function getFile(path) {
  const { owner, name } = getRepo();
  try {
    const data = await api(`/repos/${owner}/${name}/contents/${encPath(path)}`);
    return { sha: data.sha, content: base64ToUtf8(data.content), raw: data };
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

export async function getSha(path) {
  const f = await getFile(path);
  return f ? f.sha : null;
}

export async function putFileText(path, text, message, sha = null) {
  return putFileBase64(path, utf8ToBase64(text), message, sha);
}

export async function putFileBase64(path, base64, message, sha = null) {
  const { owner, name } = getRepo();
  const body = { message, content: base64 };
  if (sha) body.sha = sha;
  return await api(`/repos/${owner}/${name}/contents/${encPath(path)}`, { method: 'PUT', body });
}

export async function deleteFile(path, sha, message) {
  const { owner, name } = getRepo();
  return await api(`/repos/${owner}/${name}/contents/${encPath(path)}`, {
    method: 'DELETE', body: { message, sha },
  });
}

export async function upsertText(path, text, message) {
  const sha = await getSha(path);
  return putFileText(path, text, message, sha);
}
export async function upsertBase64(path, base64, message) {
  const sha = await getSha(path);
  return putFileBase64(path, base64, message, sha);
}

export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(abToBase64(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
