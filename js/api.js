/* ============================================================
   KONEKSI KE BACKEND GAS (REST API) — fetch() murni, tanpa google.script.run
   ------------------------------------------------------------
   - POST body JSON { action, args } dengan Content-Type text/plain
     (WAJIB: application/json memicu CORS preflight yang ditolak GAS)
   - Token sesi dikirim di body (argumen pertama), tidak pernah di URL
   - Respons GAS: { success, data, code, message }
   ============================================================ */
'use strict';

/** URL backend sudah diisi di js/config.js? */
function gasConfigured() {
  return typeof GAS_URL === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]{20,}\/exec$/.test(GAS_URL.trim());
}

const NET_MSG = 'Tidak dapat terhubung ke server Apps Script. Periksa koneksi internet Anda; bila berulang, hubungi Tata Usaha.';

/** fetch dengan batas waktu (AbortController). */
async function gasFetch(url, init, timeoutMs) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs || 90000) : null;
  try {
    const res = await fetch(url, Object.assign({ redirect: 'follow', cache: 'no-store' }, init || {}, ctl ? { signal: ctl.signal } : {}));
    const text = await res.text();
    let out;
    try { out = JSON.parse(text); }
    catch (e) {
      // GAS mengembalikan HTML (bukan JSON) bila deployment salah: akses bukan "Anyone", URL /dev, atau fungsi error
      throw { code: 'NETWORK', message: 'Server Apps Script tidak mengembalikan JSON. Pastikan deployment Web App memakai akses "Anyone" dan URL /exec terbaru sudah diisi di js/config.js.' };
    }
    return out;
  } catch (e) {
    if (e && e.code) throw e;
    throw { code: 'NETWORK', message: e && e.name === 'AbortError' ? 'Server terlalu lama merespons. Coba lagi beberapa saat lagi.' : NET_MSG };
  } finally { if (t) clearTimeout(t); }
}

/** GET publik (?action=boot / ping). */
function gasGet(action) {
  return gasFetch(GAS_URL + '?action=' + encodeURIComponent(action || 'boot'), { method: 'GET' }, 30000);
}

/** POST aksi api* ke GAS. */
function gasPost(action, args, timeoutMs) {
  return gasFetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: action, args: args || [] })
  }, timeoutMs);
}

// Aksi yang wajar berjalan lama (unggah besar, impor, kirim massal, PDF)
const LONG_ACTIONS = { apiUploadRekap: 1, apiImportPegawai: 1, apiRunBatch: 1, apiStartDispatch: 1, apiDownloadSlip: 1, apiDeletePegawai: 1, apiSendCredentials: 1, apiUploadLogo: 1 };

// ── SERVER CALL (Promise) — antarmuka sama seperti versi google.script.run ──
let __inflight = 0;
function netBusy(on, text) {
  __inflight += on ? 1 : -1;
  if (__inflight < 0) __inflight = 0;
  const bar = document.getElementById('netBar');
  if (bar) bar.hidden = __inflight === 0;
  if (text && document.getElementById('netText')) document.getElementById('netText').textContent = text;
}
async function call(fn, args, opts) {
  opts = opts || {};
  if (!gasConfigured()) throw { code: 'CONFIG', message: 'URL backend belum diisi. Edit js/config.js → GAS_URL dengan URL /exec Apps Script.' };
  if (!opts.silent) netBusy(true, opts.text || 'Menyinkronkan…');
  try {
    const out = await gasPost(fn, args, LONG_ACTIONS[fn] ? 330000 : 90000);
    if (!out) throw { message: 'Respons server kosong.' };
    if (out.success) return out.data;
    if (out.code === 'SESSION') { endSession(out.message); }
    else if (out.code === 'MUST_CHANGE') { App.user.mustChange = true; navigateTo('keamanan'); }
    throw out;
  } finally {
    if (!opts.silent) netBusy(false);
  }
}
const api = (fn, ...args) => call(fn, [App.token].concat(args));
const apiSilent = (fn, ...args) => call(fn, [App.token].concat(args), { silent: true });
