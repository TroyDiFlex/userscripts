import { REPO } from './common.js';

const TTL_MS = 10 * 60 * 1000;

export async function getInstallStats(filePath) {
  const key = 'jsd:' + REPO.owner + '/' + REPO.name + ':' + filePath;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const { t, v } = JSON.parse(cached);
      if (Date.now() - t < TTL_MS) return v;
    }
  } catch { /* */ }

  const url = `https://data.jsdelivr.com/v1/package/gh/${REPO.owner}/${REPO.name}/stats/file/${filePath}?period=month`;
  let total = 0, month = 0, week = 0;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      total = data?.hits?.total ?? 0;
      const dates = data?.hits?.dates || {};
      const keys = Object.keys(dates).sort();
      month = keys.slice(-30).reduce((a, k) => a + (dates[k] || 0), 0);
      week = keys.slice(-7).reduce((a, k) => a + (dates[k] || 0), 0);
    }
  } catch { /* */ }

  const v = { total, month, week };
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* */ }
  return v;
}

export function clearStatsCache() {
  const keys = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith('jsd:')) keys.push(k);
  }
  keys.forEach((k) => sessionStorage.removeItem(k));
}
