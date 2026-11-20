/* ============================================================
   SLIP GAJI TERPUSAT — Frontend SPA (js/app.js) · v2.0 (Vercel: https://slipgaji-blush.vercel.app)
   Koneksi ke backend GAS lewat fetch() di js/api.js (call/api/apiSilent)
   Prinsip gas-instant-ux:
   1) Semua halaman dimuat sekali; navigasi = tampil/sembunyi section (0 ms)
   2) Optimistic UI + localStorage (preferensi) + sessionStorage (sesi & data)
   3) Server memakai CacheService; klien merender dari state lokal
   4) Satu panggilan server mengembalikan data lengkap (bootstrap batch)
   Tanpa ?page=; satu-satunya parameter URL adalah tautan pribadi ?s= yang langsung dihapus.
   ============================================================ */
'use strict';

// ── STATE ─────────────────────────────────────────────────────
const App = {
  token: null, user: null, role: null, d: null,
  idx: { peg: {}, per: {}, slipsByPer: {}, akun: {} },
  ui: { page: null, pages: {}, currentPeriode: null, pinResolve: null, slipCurrent: null, upload: null, worker: false, sensor: false },
  charts: {}
};
const ROLE = { Y: 'AdminYayasan', S: 'AdminSekolah', P: 'Pegawai' };
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BLN3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const JENIS_LABEL = { BULANAN: 'Gaji Reguler', THR: 'Gaji THR', BONUS: 'Gaji Bonus 13', REVISI: 'Revisi Gaji Reguler' };
const JENIS_SHORT = { THR: 'THR', BONUS: 'Bonus 13', REVISI: 'Rev' };
const revNo = id => { const m = String(id || '').match(/-REVISI-(\d+)$/); return m ? ' #' + m[1] : ''; };
const UNIT_COLORS = ['#1E4D36', '#3A7A5A', '#6FAF8C', '#A8D5BA', '#F2C14E', '#D9A520', '#7A8B99']; // urutan = UNITS (ke-7: Non Pendidikan)
const PAGE_SIZE = 12;

// ── UTIL ──────────────────────────────────────────────────────
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = n => Math.round(Number(n) || 0).toLocaleString('id-ID');
const fmtRp = n => 'Rp ' + fmtNum(n);
const fmtShortRp = n => { n = Number(n) || 0; if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(2).replace('.', ',') + ' M'; if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(1).replace('.', ',') + ' jt'; return fmtRp(n); };
const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
/** "1985-03-12" → "12 Mar 1985" (tanpa konversi zona waktu) */
const fmtYmd = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? (+m[3]) + ' ' + BLN3[+m[2] - 1] + ' ' + m[1] : '-'; };
const ymdToDmy = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[3] + '/' + m[2] + '/' + m[1] : (s || ''); };
/** Lama kerja = tahun sekarang − tahun masuk (rumus sama dengan server) */
function lamaKerja(tahunMasuk) {
  if (!/^\d{4}$/.test(String(tahunMasuk || ''))) return '';
  const n = new Date().getFullYear() - Number(tahunMasuk);
  return n < 0 ? 'Belum mulai bertugas' : n === 0 ? 'Kurang dari 1 tahun' : n + ' Tahun';
}
/** Usia pensiun dari Pengaturan: Guru 60, Karyawan 58 (bawaan) */
function usiaPensiun(jenis) { const st = (App.d && App.d.settings) || {}; return jenis === 'Guru' ? (st.pensiunGuru || 60) : (st.pensiunKaryawan || 58); }
function tanggalPensiun(tglLahir, jenis) {
  const m = String(tglLahir || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return '';
  const y = +m[1] + usiaPensiun(jenis); let d = +m[3];
  if (+m[2] === 2 && d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) d = 28;
  return y + '-' + m[2] + '-' + String(d).padStart(2, '0');
}
/** Sisa waktu menuju tanggal (yyyy-mm-dd) → {txt, bulan} */
function sisaWaktu(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return { txt: '', bulan: null };
  const n = new Date();
  let b = (+m[1] - n.getFullYear()) * 12 + (+m[2] - (n.getMonth() + 1)) - (+m[3] < n.getDate() ? 1 : 0);
  if (ymd <= n.toISOString().slice(0, 10)) return { txt: 'Sudah memasuki usia pensiun', bulan: -1 };
  const th = Math.floor(b / 12), bl = b % 12;
  return { txt: (th ? th + ' tahun ' : '') + (bl ? bl + ' bulan ' : '') + (b < 1 ? 'kurang dari 1 bulan ' : '') + 'lagi', bulan: b };
}
/** Jenis pegawai (Guru/Karyawan) — sama dengan tebakan server bila kosong */
function jenisPegawai(p) {
  if (p.JenisPegawai === 'Guru' || p.JenisPegawai === 'Karyawan') return p.JenisPegawai;
  const st = String(p.StatusKepegawaian || '').toLowerCase(), jb = String(p.Jabatan || '').toLowerCase();
  if (/tendik/.test(st)) return 'Karyawan';
  if (/guru|wali kelas|kepala sekolah|pengajar|ustad|ustaz|wakasek/.test(jb)) return 'Guru';
  if (/staf|tata usaha|laboran|satpam|operator|bendahara|pustakawan|sarpras|cleaning|admin/.test(jb)) return 'Karyawan';
  return /^gt[yt]/.test(st) ? 'Guru' : 'Karyawan';
}
const fmtWA = n => { const d = String(n || ''); if (!/^62\d{8,}$/.test(d)) return d; const r = '0' + d.slice(2); return r.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3'); };
/** Normalisasi No. WhatsApp di browser (aturan sama dengan normWA_ di server) → '62…' atau '' bila tidak valid. */
const normWAClient = v => { let d = String(v || '').replace(/\D/g, ''); if (!d) return ''; if (d.indexOf('00') === 0) d = d.slice(2); if (d.indexOf('620') === 0) d = '62' + d.slice(3); if (d[0] === '0') d = '62' + d.slice(1); else if (d[0] === '8') d = '62' + d; return /^62\d{8,13}$/.test(d) ? d : ''; };
const waLink = (n, text) => n ? '<a class="btn btn-ghost btn-xs" target="_blank" rel="noopener" href="https://wa.me/' + esc(n) + (text ? '?text=' + encodeURIComponent(text) : '') + '" title="WhatsApp ' + esc(fmtWA(n)) + '" aria-label="WhatsApp ' + esc(fmtWA(n)) + '"><i class="bi bi-whatsapp" style="color:#25D366"></i></a>' : '';
function usia(tgl) { const m = String(tgl || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return ''; const n = new Date(); let u = n.getFullYear() - +m[1]; if (n.getMonth() + 1 < +m[2] || (n.getMonth() + 1 === +m[2] && n.getDate() < +m[3])) u--; return u; }
const fmtDate = (iso, withTime) => { if (!iso) return '-'; const d = new Date(iso); if (isNaN(d)) return '-'; const s = d.getDate() + ' ' + BLN3[d.getMonth()] + ' ' + d.getFullYear(); return withTime ? s + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : s; };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms || 250); }; };
const initials = n => String(n || '?').replace(/^(Drs?\.|Dra\.|Hj?\.|Ust\.|Ir\.)\s*/gi, '').split(/[\s,]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const store = { get(k, d) { try { const v = localStorage.getItem('sg_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('sg_' + k, JSON.stringify(v)); } catch (e) { } } };
const sess = { get(k) { try { return JSON.parse(sessionStorage.getItem('sg_' + k)); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem('sg_' + k, JSON.stringify(v)); } catch (e) { } }, clear() { try { Object.keys(sessionStorage).filter(k => k.indexOf('sg_') === 0).forEach(k => sessionStorage.removeItem(k)); } catch (e) { } } };
function terbilang(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  const s = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  const f = x => x < 12 ? s[x] : x < 20 ? f(x - 10) + ' Belas' : x < 100 ? f(Math.floor(x / 10)) + ' Puluh' + (x % 10 ? ' ' + f(x % 10) : '') : x < 200 ? 'Seratus' + (x - 100 ? ' ' + f(x - 100) : '') : x < 1000 ? f(Math.floor(x / 100)) + ' Ratus' + (x % 100 ? ' ' + f(x % 100) : '') : x < 2000 ? 'Seribu' + (x - 1000 ? ' ' + f(x - 1000) : '') : x < 1e6 ? f(Math.floor(x / 1000)) + ' Ribu' + (x % 1000 ? ' ' + f(x % 1000) : '') : x < 1e9 ? f(Math.floor(x / 1e6)) + ' Juta' + (x % 1e6 ? ' ' + f(x % 1e6) : '') : f(Math.floor(x / 1e9)) + ' Miliar' + (x % 1e9 ? ' ' + f(x % 1e9) : '');
  return n === 0 ? 'Nol Rupiah' : f(n) + ' Rupiah';
}
function deviceInfo() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Perangkat';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return br + ' · ' + os;
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.target = '_self'; a.rel = 'noopener'; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}
function b64ToBlob(b64, type) { const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type: type }); }
function csvDownload(name, rows) {
  const csv = rows.map(r => r.map(c => '"' + String(c === undefined || c === null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), name);
}

// ── TOAST ─────────────────────────────────────────────────────
function toast(msg, type, title) {
  const icon = type === 'danger' ? 'bi-x-octagon-fill' : type === 'warning' ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill';
  const el = document.createElement('div');
  el.className = 'toast-app ' + (type || 'success');
  el.setAttribute('role', type === 'danger' ? 'alert' : 'status');
  el.innerHTML = '<i class="bi ' + icon + ' ti"></i><div>' + (title ? '<strong class="d-block">' + esc(title) + '</strong>' : '') + esc(msg) + '</div>';
  $('#toastStack').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, type === 'danger' ? 6500 : 3800);
}

// ── SERVER CALL: call(), api(), apiSilent(), netBusy() ada di js/api.js (fetch ke GAS) ──
function fail(e) { if (e && e.code !== 'SESSION') toast((e && e.message) || 'Terjadi kesalahan.', 'danger', 'Gagal'); }
function busy(btn, on, text) {
  if (!btn) return;
  if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-inline"></span> ' + esc(text || 'Memproses…'); }
  else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
}

// ── DATA & INDEKS ─────────────────────────────────────────────
function applyBoot(boot) {
  if (!boot) return;
  App.d = boot;
  const ix = App.idx = { peg: {}, per: {}, slipsByPer: {}, akun: {}, slip: {} };
  (boot.pegawai || []).forEach(p => ix.peg[p.NRP] = p);
  (boot.periode || []).forEach(p => ix.per[p.id] = p);
  (boot.akun || []).forEach(a => ix.akun[String(a.id).toLowerCase()] = a);
  (boot.slips || []).forEach(s => { (ix.slipsByPer[s.p] = ix.slipsByPer[s.p] || []).push(s); ix.slip[s.id] = s; });
  (boot.mySlips || []).forEach(s => { ix.slip[s.id] = ix.slip[s.id] || s; });
  App.d.periode = (boot.periode || []).sort(perSort);
  App.ui.htmlCache = {}; // pratinjau HTML bisa berubah setelah koreksi
  sess.set('boot', boot);
  updateChrome();
}
const perSort = (a, b) => (b.tahun - a.tahun) || (b.bulan - a.bulan) || String(b.id).localeCompare(String(a.id));
function latestPeriode(filterFn) { return (App.d.periode || []).find(p => !filterFn || filterFn(p)) || null; }
function periodeShort(p) { return p ? BULAN[p.bulan - 1] + ' ' + p.tahun + (p.jenis !== 'BULANAN' ? ' · ' + (JENIS_LABEL[p.jenis] || p.jenis) + revNo(p.id) : '') : '-'; }
function slipCounts(list) {
  const c = { total: list.length, terkirim: 0, gagal: 0, menunggu: 0, draft: 0, valid: 0, kritis: 0, ringan: 0, thp: 0 };
  list.forEach(s => {
    if (s.sk === 'Terkirim') c.terkirim++; else if (s.sk === 'Gagal') c.gagal++; else if (s.sk === 'Menunggu') c.menunggu++; else c.draft++;
    if (s.sv === 'VALID') { c.valid++; c.thp += s.thp || 0; } else if (s.sv === 'KRITIS') c.kritis++; else c.ringan++;
  });
  return c;
}
function unitOptions(sel, withAll, value) {
  const units = App.d.units || [];
  sel.innerHTML = (withAll ? '<option value="">Semua Unit (' + units.length + ')</option>' : '') + units.map(u => '<option value="' + u + '">' + esc(App.d.unitNames[u] || u) + '</option>').join('');
  if (value !== undefined) sel.value = value;
}
function periodeOptions(sel, list, value, allLabel) {
  sel.innerHTML = (allLabel ? '<option value="">' + esc(allLabel) + '</option>' : '') + list.map(p => '<option value="' + esc(p.id) + '">' + esc(periodeShort(p)) + ' — ' + esc(p.status) + '</option>').join('');
  if (value !== undefined && value !== null) sel.value = value;
}
function statusKirim(sk, err) {
  if (sk === 'Terkirim') return '<span class="status ok"><i class="bi bi-check2-circle"></i> Terkirim</span>';
  if (sk === 'Gagal') return '<span class="status bad" title="' + esc(err) + '"><i class="bi bi-x-circle"></i> Gagal</span>';
  if (sk === 'Menunggu') return '<span class="status wait"><i class="bi bi-hourglass-split"></i> Antrean</span>';
  return '<span class="status wait">Draft</span>';
}
function statusValid(sv) {
  if (sv === 'VALID') return '<span class="status ok"><i class="bi bi-check2-circle"></i> Valid & Terdaftar</span>';
  if (sv === 'KRITIS') return '<span class="status bad"><i class="bi bi-x-circle"></i> Anomali Kritis</span>';
  return '<span class="status warn"><i class="bi bi-exclamation-triangle"></i> Anomali Ringan</span>';
}
// ── Kanal pengiriman: Surel (Gmail) & WhatsApp (gateway Fonnte) ──
const METODE = {
  'Email': { ic: 'bi-envelope', lbl: 'Email', kanal: ['email'] },
  'WhatsApp': { ic: 'bi-whatsapp', lbl: 'WhatsApp', kanal: ['wa'] },
  'Email + WhatsApp': { ic: 'bi-send-check', lbl: 'Email + WhatsApp', kanal: ['email', 'wa'] }
};
const CH = { email: { k: 'se', e: 'ee', t: 'te', ic: 'bi-envelope', lbl: 'Surel' }, wa: { k: 'sw', e: 'ew', t: 'tw', ic: 'bi-whatsapp', lbl: 'WhatsApp' } };
const TYPO_DOM = ['gmial.com', 'gmaill.com', 'gmai.com', 'gamil.com', 'gmail.co', 'gmail.con', 'gmal.com', 'yahooo.com', 'yaho.com', 'hotmial.com', 'outlok.com', 'gmail.cm'];
function metodeNow() { const m = (App.d.settingsFull && App.d.settingsFull.MetodeKirim) || (App.d.settings && App.d.settings.metode) || 'Email'; return METODE[m] ? m : 'Email'; }
const kanalAktif = m => METODE[m || metodeNow()].kanal;
function kontakOk(s, ch) {
  if (ch === 'email') { const e = String(s.email || '').toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.indexOf('..') < 0 && TYPO_DOM.indexOf(e.split('@')[1]) < 0; }
  const p = App.idx.peg[s.nrp]; return !!(p && /^62\d{8,13}$/.test(String(p.NoWA || '')));
}
/** Kanal yang masih perlu dikirim untuk slip ini (metode aktif). Email + WhatsApp: kanal tanpa kontak dilewati. */
function kanalPerlu(s, m) {
  if (s.sv !== 'VALID') return [];
  const list = kanalAktif(m), both = list.length > 1;
  return list.filter(ch => { const v = s[CH[ch].k]; return v !== 'Terkirim' && v !== 'Menunggu' && (!both || kontakOk(s, ch)); });
}
function chBadge(ch, v, err) {
  const c = CH[ch], cls = v === 'Terkirim' ? 'ok' : v === 'Gagal' ? 'bad' : v === 'Dilewati' ? 'skip' : 'wait';
  return '<span class="status ' + cls + '" title="' + esc(c.lbl + ': ' + v + (err ? ' — ' + err : '')) + '"><i class="bi ' + c.ic + '"></i> ' + esc(v === 'Menunggu' ? 'Antrean' : v) + '</span>';
}
/** Status per kanal (ikon surel / WhatsApp); bila belum pernah dikirim → status gabungan. */
function statusKanal(x) {
  const a = [];
  if (x.se && x.se !== 'Draft') a.push(chBadge('email', x.se, x.ee));
  if (x.sw && x.sw !== 'Draft') a.push(chBadge('wa', x.sw, x.ew));
  if (x.lihat) a.push(lihatBadge(x));
  return a.length ? '<span class="ch-badges">' + a.join('') + '</span>' : statusKirim(x.sk, x.err);
}
/** Slip sudah dibuka pemiliknya (tautan WhatsApp / portal / unduh). */
const lihatBadge = x => '<span class="status ok" title="Pertama dilihat pegawai ' + esc(fmtDate(x.lihat, true)) + (x.nl ? ' · ' + x.nl + '× via tautan' : '') + '"><i class="bi bi-eye"></i> Dilihat</span>';
const kanalTxt = list => list.map(ch => CH[ch].lbl).join(' + ');
const unitPill = u => '<span class="unit-pill">' + esc(u) + '</span>';
const secret = '<span class="status wait" title="Kebijakan Zero-Salary"><i class="bi bi-lock"></i> [Dirahasiakan / UU PDP]</span>';

// ── TABEL + PAGINASI ──────────────────────────────────────────
/**
 * cols: [{h:'Judul', cls:'num', l:'Label mobile', main:true, r: row => html}]
 */
function renderTable(key, tableEl, pagerEl, cols, rows, opts) {
  opts = opts || {};
  const st = App.ui.pages[key] = App.ui.pages[key] || { page: 1 };
  const size = opts.size || PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  if (st.page > pages) st.page = pages;
  const start = (st.page - 1) * size;
  const slice = rows.slice(start, start + size);
  tableEl.classList.add('stack');
  tableEl.innerHTML = '<thead><tr>' + cols.map(c => '<th class="' + (c.cls || '') + '" scope="col">' + c.h + '</th>').join('') + '</tr></thead><tbody>' +
    (slice.length ? slice.map(r => '<tr class="' + (opts.rowCls ? opts.rowCls(r) : '') + '">' + cols.map(c => '<td class="' + (c.cls || '') + (c.main ? ' t-main' : '') + '" data-l="' + esc(c.l || c.h.replace(/<[^>]+>/g, '')) + '">' + c.r(r) + '</td>').join('') + '</tr>').join('')
      : '<tr><td class="empty" colspan="' + cols.length + '"><i class="bi bi-inbox d-block fs-3 mb-1"></i>' + esc(opts.empty || 'Tidak ada data.') + '</td></tr>') + '</tbody>';
  if (!pagerEl) return;
  let btns = '';
  const mk = (p, label, dis, on) => '<button type="button" ' + (dis ? 'disabled' : '') + ' class="' + (on ? 'on' : '') + '" data-page-key="' + key + '" data-page="' + p + '" aria-label="Halaman ' + p + '">' + label + '</button>';
  btns += mk(st.page - 1, '<i class="bi bi-chevron-left"></i>', st.page <= 1);
  const win = []; for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - st.page) <= 1) win.push(p);
  let prev = 0; win.forEach(p => { if (p - prev > 1) btns += '<button disabled>…</button>'; btns += mk(p, p, false, p === st.page); prev = p; });
  btns += mk(st.page + 1, '<i class="bi bi-chevron-right"></i>', st.page >= pages);
  pagerEl.innerHTML = '<span>Menampilkan <b>' + (rows.length ? start + 1 : 0) + '–' + Math.min(start + size, rows.length) + '</b> dari <b>' + fmtNum(rows.length) + '</b> data</span><div class="pg">' + btns + '</div>';
  pagerEl.dataset.render = opts.render || '';
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-page-key]');
  if (!b || b.disabled) return;
  App.ui.pages[b.dataset.pageKey].page = Number(b.dataset.page);
  const fn = RENDER[App.ui.page];
  if (fn) fn();
});

// ── CHART HELPERS ─────────────────────────────────────────────
function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  return { text: cs.getPropertyValue('--text-2').trim(), grid: cs.getPropertyValue('--border').trim(), main: cs.getPropertyValue('--chart-main').trim(), gold: cs.getPropertyValue('--gold').trim(), danger: cs.getPropertyValue('--danger').trim(), surface: cs.getPropertyValue('--surface').trim() };
}
function makeChart(id, cfg) {
  if (!window.Chart) return;
  const first = !App.charts[id];
  if (App.charts[id]) { App.charts[id].destroy(); }
  const el = document.getElementById(id); if (!el) return;
  const c = themeColors();
  cfg.options = cfg.options || {};
  cfg.options.animation = first ? { duration: 380 } : false; // render ulang = instan
  Chart.defaults.font.family = "'Inter', sans-serif"; Chart.defaults.color = c.text;
  App.charts[id] = new Chart(el, cfg);
}

// ── NAVIGASI (SPA instan) ─────────────────────────────────────
const NAV = {
  AdminYayasan: {
    main: [['dashboard', 'bi-grid-1x2', 'Dasbor Yayasan', 'W-03'], ['upload', 'bi-file-earmark-arrow-up', 'Unggah Rekap Gaji', 'W-04'], ['preview', 'bi-send-check', 'Pratinjau & Kirim', 'W-05'], ['progress', 'bi-envelope-paper', 'Progress Pengiriman', 'W-06'], ['pegawai', 'bi-people', 'Data Pegawai', 'W-07'], ['riwayat', 'bi-clock-history', 'Riwayat Pengiriman', 'W-09'], ['akun', 'bi-person-lock', 'Kelola Akun & RBAC', 'W-10'], ['monitoring', 'bi-bank', 'Monitoring Unit', 'W-11'], ['portal', 'bi-person-vcard', 'Portal Pegawai', 'W-12']],
    foot: [['pengaturan', 'bi-gear', 'Pengaturan', 'W-14'], ['keamanan', 'bi-shield-lock', 'Ganti Sandi', 'W-02']]
  },
  AdminSekolah: {
    main: [['monitoring', 'bi-grid-1x2', 'Dasbor Unit', 'W-11'], ['riwayat', 'bi-clock-history', 'Riwayat Pengiriman', 'W-09'], ['pegawai', 'bi-people', 'Data Guru & Tendik', ''], ['portal', 'bi-person-vcard', 'Portal Mandiri', '']],
    foot: [['keamanan', 'bi-key', 'Ganti Sandi', 'W-02']]
  },
  Pegawai: {
    main: [['portal', 'bi-receipt', 'Slip Saya', 'W-12'], ['keamanan', 'bi-shield-lock', 'Keamanan & PIN', 'W-02'], ['bantuan', 'bi-question-circle', 'Bantuan TU', '']],
    foot: []
  }
};
const LANDING = { AdminYayasan: 'dashboard', AdminSekolah: 'monitoring', Pegawai: 'portal' };
const ALLOWED = {
  AdminYayasan: ['dashboard', 'upload', 'preview', 'progress', 'pegawai', 'riwayat', 'akun', 'monitoring', 'portal', 'pengaturan', 'keamanan'],
  AdminSekolah: ['monitoring', 'riwayat', 'pegawai', 'portal', 'keamanan'],
  Pegawai: ['portal', 'keamanan', 'bantuan']
};

function renderNav() {
  const cfg = NAV[App.role];
  const li = it => '<li><a href="javascript:void(0)" class="nav-link-app" data-nav="' + it[0] + '"><i class="bi ' + it[1] + '"></i><span>' + esc(it[2]) + '</span>' + (it[0] === 'preview' ? '<span class="nav-badge" id="draftBadge" hidden></span>' : '') + (it[3] ? '<span class="code">' + it[3] + '</span>' : '') + '</a></li>';
  let main = cfg.main;
  if (App.role === ROLE.S && !App.user.nrp) main = main.filter(m => m[0] !== 'portal');
  $('#navMain').innerHTML = main.map(li).join('');
  $('#navFoot').innerHTML = cfg.foot.map(li).join('') + '<li><a href="javascript:void(0)" class="nav-link-app" data-action="logout"><i class="bi bi-box-arrow-left"></i><span>Keluar Sesi</span></a></li>';
  const tag = $('#portalTag');
  if (App.role === ROLE.S) { tag.hidden = false; tag.innerHTML = '<span>PORTAL ADMIN</span><b>UNIT ' + esc(App.user.unit) + '</b>'; }
  else if (App.role === ROLE.P) { tag.hidden = false; tag.innerHTML = '<span>PORTAL PEGAWAI</span><b>' + esc(App.user.nrp) + '</b>'; }
  else tag.hidden = true;
  $('#brandSub').textContent = App.role === ROLE.Y ? 'Slip Gaji Terpusat' : App.role === ROLE.S ? 'Sistem Penggajian Unit' : 'Slip Gaji Saya';
  const bn = $('#bottomNav');
  if (App.role === ROLE.P) {
    bn.hidden = false;
    bn.innerHTML = [['portal', 'bi-receipt', 'Slip Saya'], ['keamanan', 'bi-shield-lock', 'Keamanan'], ['bantuan', 'bi-question-circle', 'Bantuan']].map(x => '<a href="javascript:void(0)" data-nav="' + x[0] + '"><i class="bi ' + x[1] + '"></i>' + x[2] + '</a>').join('') + '<a href="javascript:void(0)" data-action="logout"><i class="bi bi-box-arrow-right"></i>Keluar</a>';
  } else bn.hidden = true;
}

function navigateTo(page, opts) {
  opts = opts || {};
  if (!App.role) return;
  if (App.user.mustChange && page !== 'keamanan') { page = 'keamanan'; toast('Silakan buat kata sandi baru terlebih dahulu.', 'warning'); }
  if (ALLOWED[App.role].indexOf(page) < 0) page = LANDING[App.role];
  App.ui.page = page;
  $$('.content-section').forEach(s => s.classList.toggle('active', s.id === 'section-' + page));
  $$('[data-nav]').forEach(a => { const on = a.dataset.nav === page; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const sec = $('#section-' + page);
  document.title = (sec ? sec.dataset.title : 'Portal') + ' — Slip Gaji';
  closeSidebar();
  if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  store.set('lastPage_' + App.role, page);
  const fn = RENDER[page];
  if (fn) { try { fn(opts); } catch (err) { console.error(err); toast('Gagal merender halaman: ' + err.message, 'danger'); } }
}
function rerender() { const fn = RENDER[App.ui.page]; if (fn) fn({ keepScroll: true }); }
function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebarBackdrop').hidden = false; }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').hidden = true; }

function updateChrome() {
  if (!App.d || !App.user) return;
  const st = App.d.settings || {};
  $$('[data-bind="singkatan"]').forEach(e => e.textContent = String(st.singkatan || 'YASMA PB. SOEDIRMAN').toUpperCase());
  if (st.logo !== undefined) applyLogo(st.logo);
  const lp = latestPeriode();
  const ms = (App.d.mySlips || [])[0];
  $('#chipPeriode span').textContent = 'PERIODE: ' + (lp ? periodeShort(lp).toUpperCase() : ms ? (BULAN[ms.bulan - 1] + ' ' + ms.tahun).toUpperCase() : '-');
  const aktif = (App.d.pegawai || []).filter(p => p.Status === 'Aktif').length;
  $('#chipAktif span:last-child').textContent = App.role === ROLE.P ? 'STATUS: AKTIF' : 'AKTIF (' + aktif + ' PEGAWAI)';
  $('#chipRole').textContent = App.role === ROLE.Y ? '● ADMIN YAYASAN' : App.role === ROLE.S ? '● ADMIN UNIT ' + App.user.unit : '● PEGAWAI';
  $('#chipUji').classList.toggle('d-none', !(App.role === ROLE.Y && st.modeUji === 'Ya'));
  $('#userName').textContent = App.user.nama;
  $('#userRoleText').textContent = App.role === ROLE.Y ? 'Admin Yayasan' : App.role === ROLE.S ? 'Admin ' + App.user.unit : 'NRP ' + App.user.nrp;
  $('#userAvatar').textContent = initials(App.user.nama);
  const drafts = (App.d.periode || []).filter(p => p.status === 'Draft').length;
  const db = $('#draftBadge'); if (db) { db.hidden = !drafts; db.textContent = drafts + ' Draft'; }
}

// ── AUTENTIKASI ───────────────────────────────────────────────
function showLogin(msg) {
  $('#view-app').hidden = true; $('#view-login').hidden = false;
  if (msg) $('#loginErr').textContent = msg;
  setTimeout(() => $('#loginId').focus(), 50);
}
function enterApp(res) {
  App.token = res.token || App.token;
  App.user = res.user; App.role = res.user.role;
  sess.set('tok', App.token); sess.set('user', App.user);
  if (res.boot) applyBoot(res.boot);
  else if (!App.d) App.d = { settings: (App.boot || {}), units: (App.boot || {}).units || [], unitNames: (App.boot || {}).unitNames || {}, periode: [], pegawai: [], slips: [] };
  $('#view-login').hidden = true; $('#view-app').hidden = false; $('#linkNote').hidden = true;
  renderNav(); updateChrome();
  const last = store.get('lastPage_' + App.role, null);
  navigateTo(App.user.mustChange ? 'keamanan' : App.ui.pendingSlip ? 'portal' : (last && ALLOWED[App.role].indexOf(last) >= 0 ? last : LANDING[App.role]));
  if (App.role === ROLE.Y && App.d.dispatch && App.d.dispatch.job && App.d.dispatch.job.status === 'BERJALAN') startWorker();
  if (App.ui.pendingSlip) setTimeout(openPendingSlip, 150);
}
// ── TAUTAN PRIBADI WHATSAPP (?s=…) ───────────────────────────
/** Baca parameter tautan pribadi ?s=… dari alamat halaman (https://slipgaji-blush.vercel.app/?s=…). */
function readLinkParam(cb) {
  let v = '';
  try { v = new URLSearchParams(location.search).get('s') || ''; } catch (e) { }
  cb(/^[A-Za-z0-9_-]{20,64}$/.test(v) ? v : '');
}
/** Hapus ?s= dari bilah alamat agar tautan tidak tersimpan di riwayat/penanda. */
function clearLinkParam() { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { } }
/** Buka slip yang dituju tautan (setelah masuk / setelah membuat sandi). */
function openPendingSlip() {
  const id = App.ui.pendingSlip;
  if (!id || !App.user || App.user.mustChange) return false;
  App.ui.pendingSlip = null;
  if (!App.idx.slip[id]) { toast('Slip dari tautan tidak ditemukan di akun ini. Pastikan Anda masuk dengan NRP pemilik slip.', 'warning', 'Slip tidak ditemukan'); return false; }
  if (App.ui.page !== 'portal') navigateTo('portal');
  previewSlip(id);
  return true;
}
async function openFromLink(tok, hide) {
  const msg = $('#bootLoader p'); if (msg) msg.textContent = 'Membuka slip gaji Anda…';
  clearLinkParam();
  const prevTok = sess.get('tok'), prevUser = sess.get('user');
  // Muat ulang halaman dari tautan yang sama → cukup pulihkan sesi
  if (prevTok && prevUser && sess.get('linkTok') === tok) { restoreSession(hide); return; }
  try {
    const r = await call('apiOpenLink', [tok, deviceInfo()], { silent: true });
    if (r.status === 'ok') {
      if (prevTok && prevTok !== r.token) { call('apiLogout', [prevTok], { silent: true }).catch(() => { }); sess.clear(); App.d = null; }
      App.ui.linkSlip = r.slip; App.ui.pendingSlip = r.slip;
      enterApp(r); sess.set('linkTok', tok); hide();
      toast('Slip ' + (r.label || '') + ' dibuka dari tautan pribadi Anda.', 'success', 'Assalamu\'alaikum, ' + String(r.user.nama || '').split(',')[0]);
      return;
    }
    if (prevTok && prevUser && r.nrp && String(prevUser.nrp) === String(r.nrp)) { App.ui.pendingSlip = r.slip; restoreSession(hide); return; }
    showLinkNote(r); hide();
  } catch (e) { showLinkNote({ status: 'error', message: e.message }); hide(); }
}
/** Pesan di halaman masuk untuk tautan yang butuh sandi / kedaluwarsa / tidak valid. */
function showLinkNote(r) {
  const per = r.label ? '<b>' + esc(r.label) + '</b>' : 'gaji';
  const nama = r.nama ? 'Bapak/Ibu <b>' + esc(r.nama) + '</b>, s' : 'S';
  const masa = (App.boot && App.boot.masaTautan) || 14;
  const v = {
    login: ['', 'bi-whatsapp', nama + 'lip ' + per + ' sudah terbit. Masukkan kata sandi Anda untuk melihatnya — slip langsung terbuka setelah masuk.'],
    expired: ['warn', 'bi-hourglass-bottom', 'Tautan pribadi untuk slip ' + per + ' sudah melewati masa berlaku (' + masa + ' hari). Slip tetap tersedia: masuk dengan NRP & kata sandi, slip langsung dibuka.'],
    invalid: ['warn', 'bi-link-45deg', 'Tautan tidak dikenali atau sudah diganti tautan yang lebih baru (kirim ulang). Buka tautan terbaru di WhatsApp, atau masuk dengan NRP & kata sandi.'],
    error: ['bad', 'bi-shield-exclamation', esc(r.message || 'Tautan tidak dapat dibuka.')]
  }[r.status] || ['warn', 'bi-info-circle', 'Silakan masuk dengan NRP & kata sandi.'];
  $('#linkNote').innerHTML = '<div class="link-note ' + v[0] + '" role="status"><i class="bi ' + v[1] + '"></i><div>' + v[2] + '</div></div>';
  $('#linkNote').hidden = false;
  if (r.nrp) $('#loginId').value = r.nrp;
  if (r.slip && (r.status === 'login' || r.status === 'expired')) App.ui.pendingSlip = r.slip;
  showLogin();
  setTimeout(() => (r.nrp ? $('#loginPass') : $('#loginId')).focus(), 120);
}
function endSession(msg) {
  App.ui.worker = false;
  App.token = null; App.user = null; App.role = null; App.d = null;
  sess.clear();
  Object.values(App.charts).forEach(c => c && c.destroy()); App.charts = {};
  showLogin(msg || '');
  if (msg) toast(msg, 'warning', 'Sesi berakhir');
}
async function doLogin(e) {
  e.preventDefault();
  const id = $('#loginId').value.trim(), pw = $('#loginPass').value;
  $('#loginErr').textContent = '';
  if (!id || !pw) { $('#loginErr').textContent = 'NRP/ID dan kata sandi wajib diisi.'; return; }
  const btn = $('#loginBtn'); busy(btn, true, 'Memverifikasi…');
  try {
    const res = await call('apiLogin', [id, pw, deviceInfo()], { silent: true });
    $('#loginPass').value = '';
    enterApp(res);
    toast('Selamat datang, ' + res.user.nama + '.', 'success', 'Assalamu\'alaikum');
  } catch (err) { $('#loginErr').textContent = err.message; $('#loginPass').select(); }
  finally { busy(btn, false); }
}
// ── Login Google (Google Identity Services) — aktif bila Admin menyimpan Client ID OAuth ──
let __gsiReady = false;
function setupGoogleLogin(clientId) {
  const wrap = $('#googleWrap'), div = $('#googleDivider');
  if (App.ui.gsiFor === clientId) return; // sudah dipasang untuk Client ID ini
  App.ui.gsiFor = clientId;
  if (!clientId) { wrap.hidden = true; div.hidden = true; return; }
  wrap.hidden = false; div.hidden = false;
  const render = () => {
    try {
      google.accounts.id.initialize({ client_id: clientId, callback: onGoogleCredential, ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true });
      google.accounts.id.renderButton($('#gsiBtn'), { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'id', width: Math.min(360, ($('#gsiBtn').clientWidth || 320)) });
      __gsiReady = true; $('#googleBtn').hidden = true;
    } catch (e) { $('#googleBtn').hidden = false; }
  };
  if (window.google && google.accounts && google.accounts.id) return render();
  if (document.getElementById('gsiScript')) return;
  const sc = document.createElement('script');
  sc.id = 'gsiScript'; sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.defer = true;
  sc.onload = render;
  sc.onerror = () => { $('#googleBtn').hidden = false; };
  document.head.appendChild(sc);
}
async function onGoogleCredential(resp) {
  $('#loginErr').textContent = '';
  const btn = $('#loginBtn'); busy(btn, true, 'Memeriksa akun Google…');
  try { const res = await call('apiLoginGoogle', [resp && resp.credential, deviceInfo()], { silent: true }); enterApp(res); toast('Masuk sebagai ' + res.user.nama, 'success'); }
  catch (err) { $('#loginErr').textContent = err.message; }
  finally { busy(btn, false); }
}
function doGoogleLogin() {
  if (__gsiReady && window.google && google.accounts) { google.accounts.id.prompt(); return; }
  $('#loginErr').textContent = 'Layanan login Google tidak termuat (mungkin diblokir peramban). Gunakan NRP & kata sandi.';
}
function logout() {
  const tok = App.token;
  App.ui.pendingSlip = null; App.ui.linkSlip = null; sess.set('linkTok', null);
  endSession('');
  if (tok) call('apiLogout', [tok], { silent: true }).catch(() => { });
  toast('Anda telah keluar dengan aman.', 'success');
}
async function refreshAll(btn) {
  if (btn) btn.querySelector('i').classList.add('spin');
  try { applyBoot(await api('apiRefresh')); rerender(); toast('Data diperbarui.', 'success'); }
  catch (e) { fail(e); }
  finally { if (btn) btn.querySelector('i').classList.remove('spin'); }
}

// ============================================================
// HALAMAN
// ============================================================
const RENDER = {};

// ── W-03 DASBOR YAYASAN ───────────────────────────────────────
RENDER.dashboard = function () {
  const d = App.d;
  const sel = $('#dashPeriodSel');
  const cur = App.ui.dashPer && App.idx.per[App.ui.dashPer] ? App.ui.dashPer : (latestPeriode() || {}).id;
  periodeOptions(sel, d.periode, cur);
  const per = App.idx.per[cur];
  const slips = App.idx.slipsByPer[cur] || [];
  const c = slipCounts(slips);
  const aktif = d.pegawai.filter(p => p.Status === 'Aktif').length;
  const drafts = d.periode.filter(p => p.status === 'Draft');
  const dr = drafts[0];
  $('#dashAlert').innerHTML = dr ? '<div class="card-app d-flex gap-3 align-items-center flex-wrap mb-3" style="border-left:4px solid var(--emerald-800)"><span class="confirm-icon ok"><i class="bi bi-bell"></i></span><div class="flex-grow-1"><span class="tag mono">' + esc(dr.id) + '</span><span class="tiny text-muted-2">' + esc(dr.oleh) + ' · ' + fmtDate(dr.tgl, true) + '</span><div>Rekap gaji periode <b>' + esc(periodeShort(dr)) + '</b> telah diunggah. ' + (dr.anomali ? 'Terdapat <b class="text-danger">' + dr.anomali + ' anomali data</b> yang memerlukan review sebelum pengiriman massal.' : 'Semua baris valid dan siap dikirim.') + '</div></div><button class="btn btn-primary-app" data-action="openPeriode" data-id="' + esc(dr.id) + '">Buka Pratinjau & Kirim (W-05) <i class="bi bi-arrow-right"></i></button></div>' : '';
  const brutoEst = slips.filter(s => s.sv === 'VALID').reduce((a, s) => a + (s.bruto || 0), 0);
  $('#dashKpi').innerHTML =
    kpi('Total Pegawai Terdaftar', fmtNum(d.pegawai.length), 'bi-people', '<span>● Aktif: <b>' + aktif + '</b></span><span class="text-muted-3">○ Nonaktif: <b>' + (d.pegawai.length - aktif) + '</b></span>', '', '<span class="chip chip-info">' + d.units.length + ' UNIT</span>') +
    kpi('Slip Terkirim (' + (per ? periodeShort(per) : '-') + ')', fmtNum(c.terkirim) + ' <small>/ ' + fmtNum(c.valid || c.total) + '</small>', 'bi-send-check', '<div class="k-bar w-100"><span style="width:' + pct(c.terkirim, c.valid || 1) + '%"></span></div><span>Target: ' + fmtNum(c.valid) + ' valid</span><span>Sisa: <b>' + Math.max(0, c.valid - c.terkirim) + '</b></span>') +
    kpi('Slip Gagal / Anomali', String(c.gagal + c.kritis + c.ringan).padStart(2, '0'), 'bi-exclamation-triangle', (c.gagal ? '<span>' + c.gagal + ' gagal kirim</span>' : '') + (c.kritis + c.ringan ? '<span>' + (c.kritis + c.ringan) + ' anomali data</span>' : '') + (c.gagal + c.kritis + c.ringan ? '<a href="javascript:void(0)" data-action="openPeriode" data-id="' + esc(cur || '') + '">Audit ›</a>' : '<span>Tidak ada kendala</span>'), (c.gagal + c.kritis + c.ringan) ? 'alert' : '') +
    kpi('Total Beban Payroll (THP)', fmtShortRp(c.thp), 'bi-wallet2', '<span>Estimasi bruto: ' + fmtShortRp(brutoEst) + '</span>', 'gold', per ? '<span class="chip chip-gold">' + esc(per.status) + '</span>' : '');

  // Bar per unit
  const units = d.units;
  const tc = themeColors();
  const sent = units.map(u => slips.filter(s => s.unit === u && s.sk === 'Terkirim').length);
  const target = units.map(u => slips.filter(s => s.unit === u && s.sv === 'VALID').length || d.pegawai.filter(p => p.Unit === u && p.Status === 'Aktif').length);
  makeChart('chartUnit', {
    type: 'bar',
    data: { labels: units, datasets: [{ label: 'Terkirim', data: sent, backgroundColor: tc.main, borderRadius: 4, maxBarThickness: 46 }, { label: 'Target', data: target, type: 'line', borderColor: tc.gold, borderDash: [5, 4], pointRadius: 3, pointBackgroundColor: tc.gold, fill: false, tension: 0 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 12 } }, tooltip: { callbacks: { afterBody: it => { const i = it[0].dataIndex; return 'Capaian: ' + pct(sent[i], target[i]) + '%'; } } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: tc.grid }, ticks: { precision: 0 } } } }
  });
  // Donut THP per unit
  const thpU = units.map(u => slips.filter(s => s.unit === u && s.sv === 'VALID').reduce((a, s) => a + (s.thp || 0), 0));
  const tot = thpU.reduce((a, b) => a + b, 0);
  makeChart('chartDonut', { type: 'doughnut', data: { labels: units, datasets: [{ data: thpU, backgroundColor: UNIT_COLORS, borderColor: tc.surface, borderWidth: 3 }] }, options: { maintainAspectRatio: false, cutout: '66%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: it => it.label + ': ' + fmtRp(it.raw) + ' (' + pct(it.raw, tot) + '%)' } } } } });
  $('#donutCenter').innerHTML = '<div><span>TOTAL 100%</span><b>' + fmtShortRp(tot) + '</b><span>' + esc((d.settings.singkatan || '').split(' ').pop().toUpperCase()) + '</span></div>';
  $('#donutLegend').innerHTML = units.map((u, i) => '<div class="legend-item"><span class="sw" style="background:' + UNIT_COLORS[i] + '"></span>' + u + '<b>' + pct(thpU[i], tot) + '%</b><span class="text-muted-3">(' + fmtShortRp(thpU[i]).replace('Rp ', '') + ')</span></div>').join('');

  // Tren 12 periode
  const hist = d.periode.slice(0, 12).reverse();
  const tr = hist.map(p => (App.idx.slipsByPer[p.id] || []).filter(s => s.sk === 'Terkirim').length);
  const avg = tr.length ? Math.round(tr.reduce((a, b) => a + b, 0) / tr.length) : 0;
  $('#trendAvg').textContent = 'Rata-rata: ' + avg + ' slip';
  makeChart('chartTrend', {
    type: 'line',
    data: { labels: hist.map(p => BLN3[p.bulan - 1] + ' ' + String(p.tahun).slice(2) + (p.jenis !== 'BULANAN' ? ' (' + (JENIS_SHORT[p.jenis] || p.jenis) + ')' : '')), datasets: [{ label: 'Slip terkirim', data: tr, borderColor: tc.main, backgroundColor: 'rgba(30,77,54,.10)', fill: true, tension: .3, pointBackgroundColor: hist.map(p => p.jenis === 'BULANAN' ? tc.main : tc.gold), pointRadius: hist.map(p => p.jenis === 'BULANAN' ? 4 : 6), pointStyle: hist.map(p => p.jenis === 'BULANAN' ? 'circle' : 'rectRot') }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: tc.grid }, ticks: { precision: 0 } } } }
  });

  // Insight otomatis
  const ins = [];
  if (per) {
    ins.push('Periode <b>' + esc(periodeShort(per)) + '</b>: ' + c.terkirim + ' dari ' + c.valid + ' slip valid terkirim (' + pct(c.terkirim, c.valid) + '%).');
    if (tot) { const top = thpU.indexOf(Math.max.apply(null, thpU)); ins.push('Unit <b>' + units[top] + '</b> menyerap anggaran terbesar: ' + pct(thpU[top], tot) + '% (' + fmtShortRp(thpU[top]) + ').'); }
    const prev = d.periode.find(p => p.jenis === per.jenis && perSort(per, p) < 0 && p.id !== per.id);
    if (prev) { const pt = (App.idx.slipsByPer[prev.id] || []).filter(s => s.sv === 'VALID').reduce((a, s) => a + (s.thp || 0), 0); if (pt) { const ch = (c.thp - pt) / pt * 100; ins.push('Beban THP ' + (ch >= 0 ? 'naik' : 'turun') + ' <b>' + Math.abs(ch).toFixed(1).replace('.', ',') + '%</b> dibanding ' + esc(periodeShort(prev)) + '.'); } }
    if (c.kritis + c.ringan) ins.push('<b>' + (c.kritis + c.ringan) + ' baris anomali</b> (' + c.kritis + ' kritis, ' + c.ringan + ' ringan) tidak ikut dikirim sampai diperbaiki.');
    if (c.gagal) ins.push('<b>' + c.gagal + ' slip gagal</b> dikirim — periksa alamat surel lalu kirim ulang.');
  }
  const locked = (d.akun || []).filter(a => a.kunci).length;
  if (locked) ins.push('<b>' + locked + ' akun</b> sedang terkunci karena salah sandi berulang.');
  const noPin = (d.akun || []).filter(a => a.peran === ROLE.P && !a.pin && a.status === 'Aktif').length;
  if (noPin) ins.push(noPin + ' pegawai belum membuat PIN dokumen (belum pernah login).');
  if (per && c.terkirim) { const lh = slips.filter(s => s.lihat).length; ins.push('<b>' + lh + ' dari ' + c.terkirim + '</b> pegawai sudah membuka slip ' + esc(periodeShort(per)) + ' (tautan WhatsApp / portal).'); }
  if (d.settings.modeUji === 'Ya') ins.push('<b>Mode Uji aktif</b>: surel slip dialihkan ke pemilik skrip dan hanya ' + (d.settings.ujiWaMax || 5) + ' WhatsApp pertama dikirim ke nomor uji. Matikan di Pengaturan sebelum produksi.');
  $('#insightList').innerHTML = ins.map(x => '<li>' + x + '</li>').join('') || '<li>Belum ada data periode.</li>';

  // Tabel periode
  const q = $('#dashSearch').value.trim().toLowerCase();
  const rows = d.periode.filter(p => !q || (p.id + ' ' + periodeShort(p)).toLowerCase().indexOf(q) >= 0);
  renderTable('dash', $('#dashTable'), null, [
    { h: 'ID Periode', main: true, r: p => '<span class="tag mono">' + esc(p.id) + '</span>' },
    { h: 'Bulan / Tahun', r: p => '<b>' + BULAN[p.bulan - 1] + ' ' + p.tahun + '</b>' },
    { h: 'Jenis Slip', r: p => p.jenis === 'BULANAN' ? JENIS_LABEL.BULANAN : '<span style="color:var(--gold-ink)">' + esc(JENIS_LABEL[p.jenis] + revNo(p.id)) + '</span>' },
    { h: 'Total Penerima', r: p => fmtNum(p.n) + ' Pegawai' },
    { h: 'Status Batch', r: p => periodeStatus(p) },
    { h: 'Tgl Eksekusi', r: p => '<span class="tiny">' + fmtDate(p.selesai || p.mulai || p.tgl, true) + '</span>' },
    { h: 'Aksi', cls: 'actions', r: p => p.status === 'Selesai' ? '<button class="btn btn-ghost btn-xs" data-action="openRiwayat" data-id="' + esc(p.id) + '">Lihat Arsip <i class="bi bi-box-arrow-up-right"></i></button>' : '<button class="btn btn-primary-app btn-xs" data-action="openPeriode" data-id="' + esc(p.id) + '">Buka Pratinjau</button>' }
  ], rows.slice(0, 8), { empty: 'Belum ada periode. Mulai dengan Unggah Rekap Gaji.' });
};
function periodeStatus(p) {
  const sl = App.idx.slipsByPer[p.id] || [];
  const g = sl.filter(s => s.sk === 'Gagal').length;
  if (p.status === 'Selesai') return g ? '<span class="status warn">● Selesai (' + g + ' gagal)</span>' : '<span class="status ok">● Sukses 100%</span>';
  if (p.status === 'Sedang Dikirim') return '<span class="status gold"><span class="spinner-inline"></span> Sedang dikirim</span>';
  return p.anomali ? '<span class="status bad">● Butuh review (' + p.anomali + ')</span>' : '<span class="status wait">● Draft siap kirim</span>';
}
function kpi(label, value, icon, foot, cls, extra) {
  return '<div class="kpi ' + (cls || '') + '"><div class="k-label">' + esc(label) + '</div><span class="k-icon"><i class="bi ' + icon + '"></i></span>' + (extra ? '<div class="mt-1">' + extra + '</div>' : '') + '<div class="k-value">' + value + '</div><div class="k-foot">' + (foot || '') + '</div></div>';
}

// ── STEPPER ───────────────────────────────────────────────────
function renderStepper() {
  const per = App.idx.per[App.ui.currentPeriode];
  $$('.stepper').forEach(el => {
    const cur = Number(el.dataset.step);
    const steps = [['1. Unggah Berkas & Parameter', per ? 'Selesai · ' + fmtDate(per.tgl, true) : 'Sedang aktif', 'upload'], ['2. Pratinjau & Validasi Anomali', per ? (per.anomali ? 'Perlu tindakan (' + per.anomali + ')' : 'Siap kirim') : 'Menunggu unggahan', 'preview'], ['3. Eksekusi Pengiriman Massal', per && per.status !== 'Draft' ? per.status : 'Tahap final', 'progress']];
    el.innerHTML = steps.map((s, i) => { const n = i + 1; const done = n < cur || (per && n === 1 && cur > 1) || (per && per.status === 'Selesai'); return (i ? '<span class="step-line ' + (n <= cur ? 'done' : '') + '"></span>' : '') + '<div class="step ' + (n === cur ? 'cur' : '') + (done && n !== cur ? ' done' : '') + '" data-nav="' + s[2] + '" role="button" tabindex="0"><span class="n">' + (done && n !== cur ? '<i class="bi bi-check-lg"></i>' : n) + '</span><div><b>' + s[0] + '</b><small>' + esc(s[1]) + '</small></div></div>'; }).join('');
  });
}

// ── W-04 UNGGAH REKAP ─────────────────────────────────────────
RENDER.upload = function () {
  renderStepper();
  const now = new Date();
  const bs = $('#upBulan'), ts = $('#upTahun');
  if (!bs.options.length) {
    bs.innerHTML = BULAN.map((b, i) => '<option value="' + (i + 1) + '">' + b + '</option>').join(''); bs.value = now.getMonth() + 1;
    let y = ''; for (let t = now.getFullYear() + 1; t >= now.getFullYear() - 3; t--) y += '<option>' + t + '</option>';
    ts.innerHTML = y; ts.value = now.getFullYear();
  }
  upHint();
  $('#flowGrid').innerHTML = [['STEP 01', 'bi-file-earmark-arrow-up', 'Upload Excel .xlsx', 'Unggah master file dan registrasi ID batch rekap.'], ['STEP 02', 'bi-cpu', 'Parser & Validasi', 'Pemisahan kolom penghasilan/potongan, cek NRP & kontak (surel / WhatsApp).'], ['STEP 03', 'bi-table', 'Simpan Sheet DB', 'Periode berstatus Draft + arsip berkas asli di Drive.'], ['STEP 04', 'bi-send-check', 'Siap Dispatch', 'Pembuatan PDF & pengiriman slip via ' + metodeNow() + '.']]
    .map((f, i) => { const st = App.ui.upload; const on = st ? (st.state === 'done' ? true : i === 0) : i === 0; const lbl = st && st.state === 'done' ? (i < 3 ? 'Selesai' : 'Menunggu konfirmasi') : i === 0 ? 'Sedang berlangsung' : 'Antrean'; return '<div class="flow ' + (on ? 'on' : '') + '"><div class="f-step"><span>' + f[0] + '</span><i class="bi ' + f[1] + '"></i></div><b>' + f[2] + '</b>' + f[3] + '<div class="f-state">● ' + lbl + '</div></div>'; }).join('');
  renderUploadResult();
};
function upPeriodId() {
  const b = Number($('#upBulan').value), t = $('#upTahun').value, j = $('#upJenis').value;
  return t + '-' + String(b).padStart(2, '0') + '-' + j;
}
function upHint() {
  const id = upPeriodId(); const ex = App.idx.per[id];
  const j = $('#upJenis').value;
  let h = '<i class="bi bi-hash"></i> ID Periode: <span class="mono fw-semibold">' + (j === 'REVISI' ? id + '-n (otomatis)' : id) + '</span>';
  if (ex && j !== 'REVISI') h += ex.status === 'Draft' ? ' · <span style="color:var(--warn)"><i class="bi bi-arrow-repeat"></i> Draft sudah ada — unggahan baru akan menggantikannya.</span>' : ' · <span class="text-danger"><i class="bi bi-lock"></i> Periode sudah ' + esc(ex.status.toLowerCase()) + '. Pilih jenis "Revisi" untuk koreksi.</span>';
  const desc = { BULANAN: 'gaji pokok & tunjangan bulanan sesuai komponen di Pengaturan', THR: 'Tunjangan Hari Raya — templat berisi kolom THR', BONUS: 'gaji ke-13 — templat berisi kolom Bonus 13', REVISI: 'koreksi slip Gaji Reguler yang sudah terkirim; slip lama tetap tersimpan' }[j];
  h += '<div class="tiny text-muted-2 mt-1"><i class="bi bi-info-circle"></i> <b>' + esc(JENIS_LABEL[j]) + '</b>: ' + esc(desc) + '.</div>';
  $('#upPeriodHint').innerHTML = h;
  $('#upDocId').textContent = 'DOC-ID: REKAP-' + id;
}
function renderUploadResult() {
  const st = App.ui.upload; const box = $('#uploadResult');
  $('#toPreviewBtn').disabled = !(st && st.state === 'done');
  if (!st) { box.innerHTML = ''; return; }
  const fileCard = '<div class="card-app mt-3"><div class="file-card"><div class="file-icon"><i class="bi bi-file-earmark-spreadsheet"></i></div><div class="flex-grow-1 min-w-0"><div class="d-flex gap-2 flex-wrap align-items-center"><b class="text-truncate">' + esc(st.name) + '</b><span class="chip chip-info">' + (st.size / 1048576).toFixed(1) + ' MB</span>' + (st.cols ? '<span class="chip chip-success"><i class="bi bi-check2-circle"></i> ' + st.cols + ' kolom terbaca</span>' : '') + '</div><div class="tiny text-muted-2 mono mt-1">' + (st.rows ? st.rows + ' baris · ' : '') + 'STATUS: ' + esc(st.label) + '</div></div>' + (st.state !== 'busy' ? '<label class="btn btn-ghost btn-sm mb-0" for="fileInput"><i class="bi bi-arrow-repeat"></i> Ganti Berkas</label><button class="btn btn-danger-soft btn-sm" data-action="resetUpload"><i class="bi bi-trash3"></i> Hapus</button>' : '') + '</div><div class="d-flex justify-content-between tiny mt-3 mb-1 serif"><b>Verifikasi Struktur & Skema Data</b><b>' + st.progress + '%</b></div><div class="progress-thin"><span style="width:' + st.progress + '%"></span></div></div>';
  if (st.state !== 'done') { box.innerHTML = fileCard + (st.state === 'error' ? '<div class="alert-soft danger mt-2"><i class="bi bi-x-octagon"></i> ' + esc(st.error) + '</div>' : ''); return; }
  const r = st.result; const per = App.idx.per[r.periode]; const slips = App.idx.slipsByPer[r.periode] || [];
  const units = Array.from(new Set(slips.map(s => s.unit).filter(Boolean)));
  const bad = slips.filter(s => s.sv !== 'VALID');
  box.innerHTML = fileCard +
    '<div class="kpi-grid mt-3">' + kpi('Total Baris Data', r.report.total + ' <small>Baris Pegawai</small>', 'bi-list-ol', '<span class="serif">Header & formula terfilter</span>') +
    kpi('Unit Terdeteksi', units.length + ' <small>Unit</small>', 'bi-bank', units.map(unitPill).join(' ')) +
    kpi('Siap Kirim', r.report.valid + ' <small>Baris Valid (' + pct(r.report.valid, r.report.total) + '%)</small>', 'bi-patch-check', '<span class="serif">● Kredensial & surel sinkron</span>') +
    kpi('Perlu Perhatian', r.report.anomali + ' <small>Baris Anomali</small>', 'bi-exclamation-triangle', r.report.anomali ? '<span class="text-danger serif">● Harus diperiksa sebelum dispatch</span>' : '<span class="serif">Tidak ada anomali</span>', r.report.anomali ? 'alert' : '') + '</div>' +
    '<div class="card-app mt-3"><div class="card-head"><h3><i class="bi bi-shield-check text-danger"></i> Hasil Audit Pra-Validasi Parser (' + bad.length + ' Catatan)</h3><span class="tiny serif text-muted-2">' + esc(per ? per.id : '') + '</span></div>' +
    '<div class="small mb-2"><b>Kolom penghasilan:</b> ' + r.report.columns.penghasilan.map(c => '<span class="chip chip-success me-1 mb-1">' + esc(c) + '</span>').join('') + '<br><b>Kolom potongan:</b> ' + (r.report.columns.potongan.map(c => '<span class="chip chip-danger me-1 mb-1">' + esc(c) + '</span>').join('') || '-') + (r.report.columns.diabaikan.length ? '<br><b>Diabaikan:</b> <span class="text-muted-2">' + esc(r.report.columns.diabaikan.join(', ')) + '</span>' : '') + ((r.report.columns.subtotal || []).length ? '<br><b>Subtotal (dihitung, tidak dijumlah ulang):</b> ' + r.report.columns.subtotal.map(c => '<span class="chip chip-gold me-1">' + esc(c) + '</span>').join('') : '') + (r.report.columns.thp ? '<br><b>Kolom pembanding THP:</b> ' + esc(r.report.columns.thp) : '') + '</div>' +
    (bad.length ? bad.slice(0, 6).map(s => '<div class="audit-row ' + (s.sv === 'KRITIS' ? 'bad' : 'warn') + '"><span class="lvl">ANOMALI ' + (s.sv === 'KRITIS' ? 'KRITIS' : 'RINGAN') + '</span><div class="flex-grow-1 min-w-0"><b>NRP ' + esc(s.nrp || '(kosong)') + ' (' + esc(s.unit || '-') + ' — ' + esc(s.nama || '-') + ')</b><div class="small">' + esc(s.cv) + '</div></div><button class="btn btn-ghost btn-xs bg-white" data-action="seeRow" data-id="' + esc(s.nrp) + '"><i class="bi bi-eye"></i> Lihat Baris</button></div>').join('') + (bad.length > 6 ? '<p class="small text-muted-2 mt-2 mb-0">+' + (bad.length - 6) + ' catatan lain di halaman Pratinjau.</p>' : '') : '<div class="alert-soft ok"><i class="bi bi-check2-circle"></i> Semua baris lolos validasi.</div>') + '</div>';
}
async function handleRekapFile(file) {
  if (!file) return;
  if (!/\.(xlsx|xls)$/i.test(file.name)) { toast('Format berkas harus .xlsx atau .xls', 'danger'); return; }
  if (file.size > 25 * 1048576) { toast('Ukuran berkas melebihi 25 MB.', 'danger'); return; }
  if (!window.XLSX) { toast('Pustaka Excel masih dimuat, coba sesaat lagi.', 'warning'); return; }
  const meta = { bulan: $('#upBulan').value, tahun: $('#upTahun').value, jenis: $('#upJenis').value };
  const ex = App.idx.per[upPeriodId()];
  if (ex && meta.jenis !== 'REVISI' && ex.status !== 'Draft') { toast('Periode sudah ' + ex.status.toLowerCase() + '. Pilih jenis "Revisi Gaji Reguler".', 'danger'); return; }
  App.ui.upload = { name: file.name, size: file.size, state: 'busy', label: 'MEMBACA BERKAS DI BROWSER…', progress: 15 };
  renderUploadResult();
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
    let hr = aoa.findIndex((r, i) => i < 15 && r.some(c => /^\s*(nrp|nip)\s*$/i.test(String(c))));
    if (hr < 0) throw new Error('Baris judul dengan kolom "NRP" tidak ditemukan pada sheet pertama. Gunakan templat resmi.');
    const headers = aoa[hr].map(h => String(h).trim());
    const rows = aoa.slice(hr + 1).map(r => { const o = {}; headers.forEach((h, i) => { if (h) o[h] = typeof r[i] === 'string' ? r[i].trim() : r[i]; }); return o; })
      .filter(o => Object.values(o).some(v => String(v).trim() !== ''));
    if (!rows.length) throw new Error('Tidak ada baris data di bawah judul kolom.');
    Object.assign(App.ui.upload, { cols: headers.filter(Boolean).length, rows: rows.length, label: 'MENGIRIM KE GAS ENGINE & VALIDASI…', progress: 55 });
    renderUploadResult();
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(file); });
    const out = await api('apiUploadRekap', meta, { headers: headers.filter(Boolean), rows: rows, fileName: file.name, fileB64: b64 });
    applyBoot(out.boot);
    App.ui.currentPeriode = out.periode;
    Object.assign(App.ui.upload, { state: 'done', label: 'PARSED OK · ' + out.periode, progress: 100, result: out });
    toast(out.report.valid + ' baris valid, ' + out.report.anomali + ' anomali.', out.report.anomali ? 'warning' : 'success', 'Rekap tervalidasi');
    if (App.ui.page === 'upload') RENDER.upload();
  } catch (e) {
    Object.assign(App.ui.upload, { state: 'error', label: 'GAGAL', progress: 100, error: e.message || String(e) });
    renderUploadResult();
    if (e.code === 'SESSION') return;
  } finally { $('#fileInput').value = ''; }
}
function downloadTemplate() {
  if (!window.XLSX) { toast('Pustaka Excel masih dimuat, coba sesaat lagi.', 'warning'); return; }
  const st = App.d.settingsFull || {};
  const j = $('#upJenis') ? $('#upJenis').value : 'BULANAN';
  const split = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  const subL = split(st.KomponenSubtotal).map(x => x.toLowerCase());
  let pen = split(st.KomponenPenghasilan).filter(x => !/^(thr|bonus|lembur|honor)$/i.test(x));
  if (j === 'THR') pen = ['THR']; if (j === 'BONUS') pen = ['Bonus 13'];
  const pot = j === 'THR' || j === 'BONUS' ? [] : split(st.KomponenPotongan);
  const ID_COLS = 5; // NRP, Nama, Unit, Email, Jabatan
  const head = ['NRP', 'Nama', 'Unit', 'Email', 'Jabatan'].concat(pen, pot, ['THP (opsional)']);
  const rows = App.d.pegawai.filter(p => p.Status === 'Aktif').sort((a, b) => a.Unit.localeCompare(b.Unit) || a.Nama.localeCompare(b.Nama)).map(p => [String(p.NRP), p.Nama, p.Unit, p.Email, p.Jabatan].concat(pen.map(() => ''), pot.map(() => ''), ['']));
  const ws = XLSX.utils.aoa_to_sheet([head].concat(rows));
  ws['!cols'] = head.map((h, i) => ({ wch: i === 1 ? 32 : i === 3 ? 30 : Math.max(12, h.length + 2) }));
  // Rumus Excel: subtotal (Gaji Kotor) = komponen di kirinya; THP = penghasilan (tanpa subtotal) − potongan
  const L = c => XLSX.utils.encode_col(c);
  const penIdx = pen.map((h, i) => ({ h: h, c: ID_COLS + i, sub: subL.indexOf(h.toLowerCase()) >= 0 }));
  const potCols = pot.map((h, i) => ID_COLS + pen.length + i);
  const thpCol = ID_COLS + pen.length + pot.length;
  for (let r = 1; r <= rows.length; r++) {
    const n = r + 1;
    const c0 = ws[XLSX.utils.encode_cell({ r: r, c: 0 })]; if (c0) { c0.t = 's'; c0.z = '@'; }
    penIdx.forEach(x => { if (!x.sub) return; const src = penIdx.filter(y => !y.sub && y.c < x.c).map(y => L(y.c) + n); if (src.length) ws[XLSX.utils.encode_cell({ r: r, c: x.c })] = { t: 'n', f: 'SUM(' + src.join(',') + ')' }; });
    const plus = penIdx.filter(y => !y.sub).map(y => L(y.c) + n), minus = potCols.map(c => L(c) + n);
    ws[XLSX.utils.encode_cell({ r: r, c: thpCol })] = { t: 'n', f: 'SUM(' + plus.join(',') + ')' + (minus.length ? '-SUM(' + minus.join(',') + ')' : '') };
  }
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Rekap');
  const subNames = penIdx.filter(x => x.sub).map(x => x.h);
  const info = XLSX.utils.aoa_to_sheet([['PETUNJUK TEMPLAT REKAP GAJI'], ['1. Jangan ubah nama kolom. NRP diperlakukan sebagai teks (nol di depan aman).'], ['2. Isi nominal tanpa titik/Rp, atau format angka Excel. Komponen yang tidak ada boleh dikosongkan (tampil "-" di slip).'],
    ['3. Komponen penghasilan: ' + pen.join(', ') + '.'], ['4. Komponen potongan: ' + (pot.join(', ') || '-') + '.'],
    [subNames.length ? '5. Kolom ' + subNames.join(', ') + ' terisi rumus otomatis (jumlah komponen di sebelah kirinya) dan TIDAK dijumlahkan lagi. Total penghasilan = ' + penIdx.filter(x => !x.sub && x.c > (penIdx.find(y => y.sub) || { c: 1e9 }).c).map(x => x.h).concat(subNames).reverse().join(' + ') + '.' : '5. Total penghasilan = jumlah seluruh komponen penghasilan.'],
    ['6. Kolom "THP (opsional)" berisi rumus = total penghasilan − total potongan, dipakai untuk mencocokkan hitungan sistem.'], ['7. Kolom Unit/Email boleh dikosongkan — sistem memakai data Master Pegawai.']]);
  XLSX.utils.book_append_sheet(wb, info, 'Petunjuk');
  XLSX.writeFile(wb, 'Templat_Rekap_' + j + '_' + (App.d.settings.singkatan || 'YASMA').replace(/\W+/g, '_') + '.xlsx');
  toast('Templat berisi ' + rows.length + ' pegawai aktif diunduh.', 'success');
}

// ── W-05 PRATINJAU & KIRIM ────────────────────────────────────
RENDER.preview = function () {
  const d = App.d;
  const sel = $('#pvPeriodSel');
  let cur = App.ui.currentPeriode && App.idx.per[App.ui.currentPeriode] ? App.ui.currentPeriode : ((d.periode.find(p => p.status !== 'Selesai') || d.periode[0]) || {}).id;
  App.ui.currentPeriode = cur;
  periodeOptions(sel, d.periode, cur);
  renderStepper();
  if (!$('#pvUnit').options.length) unitOptions($('#pvUnit'), true, '');
  const per = App.idx.per[cur];
  if (!per) { $('#pvKpi').innerHTML = ''; $('#pvBanner').innerHTML = '<div class="empty-state card-app"><i class="bi bi-inbox"></i>Belum ada rekap. <a href="javascript:void(0)" data-nav="upload">Unggah rekap gaji</a> terlebih dahulu.</div>'; $('#pvTable').innerHTML = ''; $('#pvPager').innerHTML = ''; $('#pvSendBtn').disabled = true; return; }
  $('#pvPeriodLabel').textContent = '· ' + per.id + ' · ' + per.label;
  const slips = App.idx.slipsByPer[cur] || [];
  const c = slipCounts(slips);
  const pend = slips.filter(s => kanalPerlu(s).length).length;
  $('#pvKpi').innerHTML = kpi('Total Data Terbaca', c.total + ' <small>Pegawai</small>', 'bi-file-earmark-text', '<span class="tiny"><i class="bi bi-paperclip"></i> ' + esc(per.file || '-') + '</span>') +
    kpi('Validasi Sukses', c.valid + ' <small>Pegawai</small>', 'bi-check2-circle', '<span class="status ok">' + pct(c.valid, c.total) + '% siap kirim</span>') +
    kpi('Anomali Terdeteksi', (c.kritis + c.ringan) + ' <small>Pegawai</small>', 'bi-exclamation-circle', '<span class="status bad">' + c.kritis + ' kritis · ' + c.ringan + ' ringan</span>', (c.kritis + c.ringan) ? 'alert' : '') +
    kpi('Total Beban THP Valid', fmtShortRp(c.thp), 'bi-wallet2', '<span>Akumulasi ' + new Set(slips.map(s => s.unit)).size + ' unit · ' + c.terkirim + ' terkirim</span>', 'gold');
  const an = c.kritis + c.ringan;
  $('#pvBanner').innerHTML = an ? '<div class="card-app mt-3 d-flex gap-3 align-items-center flex-wrap" style="background:var(--warn-soft);border-color:transparent"><span class="confirm-icon" style="background:var(--gold);color:#3a2a00"><i class="bi bi-exclamation-triangle"></i></span><div class="flex-grow-1"><b class="serif" style="letter-spacing:.06em">PEMBERITAHUAN KARANTINA PAYROLL</b> <span class="chip chip-gold">Aksi disarankan</span><div>Ditemukan ' + an + ' anomali data. Anda dapat mengisolasi baris ini dan tetap memproses ' + pend + ' slip valid tanpa hambatan, atau memperbaikinya langsung dari tabel.</div></div><button class="btn btn-ghost" data-action="isolate"><i class="bi bi-shield"></i> ' + ($('#pvHide').checked ? 'Tampilkan semua' : 'Isolir ' + an + ' baris anomali') + '</button></div>' :
    (per.status === 'Selesai' ? '<div class="alert-soft ok mt-3"><i class="bi bi-check2-all"></i> Periode ini sudah selesai dikirim. Anda tetap dapat mengirim ulang slip tertentu' + (pend ? ' atau mengirim ' + pend + ' slip lewat kanal lain (pilih metode di bawah)' : '') + '.</div>' : '');
  renderMetode(per, slips);
  // Filter lokal (instan)
  const q = $('#pvSearch').value.trim().toLowerCase(), u = $('#pvUnit').value, s = $('#pvStatus').value, hide = $('#pvHide').checked;
  const kanal = kanalAktif();
  const rows = slips.filter(x => (!q || (x.nrp + ' ' + x.nama + ' ' + x.email + ' ' + ((App.idx.peg[x.nrp] || {}).NoWA || '')).toLowerCase().indexOf(q) >= 0) && (!u || x.unit === u) && (!s || x.sv === s || x.sk === s) && (!hide || x.sv === 'VALID'))
    .sort((a, b) => (a.sv === 'VALID') - (b.sv === 'VALID') || a.unit.localeCompare(b.unit) || a.nama.localeCompare(b.nama));
  renderTable('pv', $('#pvTable'), $('#pvPager'), [
    { h: 'NRP', r: x => '<span class="nrp ' + (x.sv === 'KRITIS' ? 'text-danger' : '') + '">' + esc(x.nrp || '—') + '</span>' },
    { h: 'Nama Lengkap & Jabatan', main: true, r: x => '<div class="t-name">' + esc(x.nama || '(tanpa nama)') + (x.sv === 'KRITIS' && /tidak ditemukan/i.test(x.cv) ? ' <span class="status bad">Unregistered</span>' : '') + (x.rev ? ' <span class="status gold">Rev #' + x.rev + '</span>' : '') + '</div><div class="t-sub">' + esc(x.jab || '') + '</div>' + (x.cv ? '<div class="tiny ' + (x.sv === 'VALID' ? 'text-muted-2' : x.sv === 'KRITIS' ? 'text-danger' : '') + '" style="' + (x.sv === 'RINGAN' ? 'color:var(--warn)' : '') + '"><i class="bi bi-info-circle"></i> ' + esc(x.cv) + '</div>' : '') },
    { h: 'Unit', r: x => unitPill(x.unit || '-') },
    { h: 'Kontak Tujuan', r: x => pvKontak(x, kanal) },
    { h: 'Gaji Bersih (THP)', cls: 'num', r: x => fmtRp(x.thp) },
    { h: 'Status', r: x => statusValid(x.sv) + (x.sk !== 'Draft' || x.se === 'Dilewati' || x.sw === 'Dilewati' ? '<div class="mt-1">' + statusKanal(x) + '</div>' : '') },
    { h: 'Aksi', cls: 'actions', r: pvAction }
  ], rows, { rowCls: x => x.sv === 'KRITIS' ? 'row-bad' : x.sv === 'RINGAN' ? 'row-warn' : '', empty: 'Tidak ada baris sesuai filter.' });
  const btn = $('#pvSendBtn');
  btn.disabled = !pend || per.status === 'Sedang Dikirim';
  btn.querySelector('i').className = 'bi ' + METODE[metodeNow()].ic;
  btn.querySelector('span').textContent = per.status === 'Sedang Dikirim' ? 'Pengiriman sedang berjalan…' : pend ? 'Kirim ' + pend + ' Slip via ' + METODE[metodeNow()].lbl + (an ? ' (' + an + ' anomali ditahan)' : '') : 'Semua slip valid sudah terkirim via ' + METODE[metodeNow()].lbl;
  $('#pvDeleteBtn').hidden = per.status !== 'Draft';
};
function pvAction(x) {
  const pv = '<button class="btn btn-ghost btn-xs" data-action="previewSlip" data-id="' + esc(x.id) + '"><i class="bi bi-eye"></i> Pratinjau A4</button>';
  if (x.sv === 'KRITIS' && /tidak ditemukan/i.test(x.cv)) return '<button class="btn btn-primary-app btn-xs" data-action="registerPeg" data-id="' + esc(x.id) + '"><i class="bi bi-person-plus"></i> Daftarkan</button>';
  if (x.sv === 'KRITIS') return pv;
  const fixE = '<button class="btn btn-primary-app btn-xs" data-action="fixEmail" data-id="' + esc(x.id) + '"><i class="bi bi-pencil"></i> Perbaiki Surel</button>';
  const fixW = '<button class="btn btn-primary-app btn-xs" data-action="fixWA" data-id="' + esc(x.id) + '"><i class="bi bi-whatsapp"></i> Perbaiki No. WA</button>';
  if (x.sv === 'RINGAN' && (/surel/i.test(x.cv) || /WhatsApp/.test(x.cv))) return (/surel/i.test(x.cv) ? fixE + ' ' : '') + (/WhatsApp/.test(x.cv) ? fixW : '');
  if (x.sv === 'RINGAN') return '<button class="btn btn-gold btn-xs" data-action="approveSlip" data-id="' + esc(x.id) + '"><i class="bi bi-check2"></i> Setujui</button> ' + pv;
  const resend = ' <button class="btn btn-ghost btn-xs" data-action="resendSlip" data-id="' + esc(x.id) + '" title="Kirim ulang" aria-label="Kirim ulang"><i class="bi bi-arrow-repeat"></i></button>';
  if (x.sw === 'Gagal' || x.sw === 'Dilewati') return fixW + resend;
  if (x.se === 'Gagal' && /surel|550/i.test(x.ee)) return fixE + resend;
  const msg = ' <button class="btn btn-ghost btn-xs" data-action="previewMsg" data-id="' + esc(x.id) + '" title="Pratinjau isi pesan" aria-label="Pratinjau isi pesan"><i class="bi bi-chat-square-text"></i></button>';
  if (x.sk === 'Gagal' || x.sk === 'Terkirim') return pv + msg + resend;
  return pv + msg;
}
/** Kontak tujuan sesuai metode aktif (surel dan/atau No. WhatsApp dari Master Pegawai). */
function pvKontak(x, kanal) {
  const p = App.idx.peg[x.nrp] || {};
  return '<div class="kontak">' + kanal.map(ch => {
    const ok = kontakOk(x, ch), val = ch === 'email' ? (x.email || '(kosong)') : (p.NoWA ? fmtWA(p.NoWA) : '(kosong)');
    return '<span class="small ' + (ok ? '' : 'text-danger text-decoration-underline') + '"><i class="bi ' + CH[ch].ic + '"' + (ch === 'wa' && ok ? ' style="color:#25D366"' : '') + '></i> ' + esc(val) + '</span>';
  }).join('') + '</div>';
}
/** Kartu pilihan metode kirim (W-05). Pilihan disimpan ke Pengaturan & validasi kontak diperbarui. */
function renderMetode(per, slips) {
  const d = App.d, m = metodeNow(), gw = d.waGateway || {}, st = d.settingsFull || {}, q = d.quota;
  const running = per.status === 'Sedang Dikirim' && d.dispatch && d.dispatch.job && d.dispatch.job.idPeriode === per.id && d.dispatch.job.status === 'BERJALAN';
  const base = slips.filter(s => s.sv !== 'KRITIS'), n = base.length;
  const nEm = base.filter(s => kontakOk(s, 'email')).length, nWa = base.filter(s => kontakOk(s, 'wa')).length, nAny = base.filter(s => kontakOk(s, 'email') || kontakOk(s, 'wa')).length;
  const sub = {
    'Email': 'Lampiran PDF via Gmail · ' + nEm + '/' + n + ' surel valid',
    'WhatsApp': (gw.ready ? 'Fonnte · pemberitahuan + tautan pribadi' : 'Token Fonnte belum diatur') + ' · ' + nWa + '/' + n + ' No. WA',
    'Email + WhatsApp': 'Dua kanal sekaligus · ' + nAny + '/' + n + ' terjangkau'
  };
  const kanal = kanalAktif(m), uji = d.settings.modeUji === 'Ya';
  const info = [];
  if (kanal.indexOf('email') >= 0) info.push('<span><i class="bi bi-envelope"></i> Surel: lampiran PDF · sisa kuota ' + (q < 0 ? 'tidak terbaca' : fmtNum(q)) + (uji ? ' · <b>uji → pemilik skrip</b>' : '') + '</span>');
  if (kanal.indexOf('wa') >= 0 && gw.ready) info.push('<span><i class="bi bi-whatsapp"></i> WhatsApp: pemberitahuan + tautan pribadi ke akun (tanpa nominal & PDF, berlaku ' + esc(d.settings.masaTautan || 14) + ' hari) · jeda ±' + esc(st.JedaWA || 3) + ' dtk/pesan' + (uji ? ' · <b>uji → ' + esc(fmtWA(st.NomorUjiWA || d.settings.wa)) + ' (maks. ' + (d.settings.ujiWaMax || 5) + ' pesan)</b>' : '') + '</span>');
  if (m === 'Email + WhatsApp') info.push('<span><i class="bi bi-info-circle"></i> Pegawai tanpa surel/No. WA tetap menerima lewat kanal lainnya.</span>');
  $('#pvMetode').innerHTML = '<div class="card-app mt-3"><div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3"><div><p class="eyebrow mb-1">Metode Pengiriman Slip</p><h3 class="mb-0">Kirim slip melalui</h3></div>' + (running ? '<span class="chip chip-warn"><i class="bi bi-lock"></i> Terkunci selama pengiriman berjalan</span>' : uji ? '<span class="chip chip-gold"><i class="bi bi-cone-striped"></i> Mode Uji</span>' : '') + '</div>' +
    '<div class="metode-grid" role="radiogroup" aria-label="Metode pengiriman slip">' + Object.keys(METODE).map(k => {
      const o = METODE[k], on = k === m;
      return '<button type="button" role="radio" aria-checked="' + on + '" class="metode-opt' + (on ? ' active' : '') + '" data-action="setMetode" data-id="' + esc(k) + '"' + (running ? ' disabled' : '') + '><span class="m-ic' + (k === 'WhatsApp' ? ' wa' : k === 'Email' ? '' : ' both') + '"><i class="bi ' + o.ic + '"></i></span><span class="m-txt"><b>' + esc(o.lbl) + '</b><small>' + esc(sub[k]) + '</small></span><i class="bi ' + (on ? 'bi-check-circle-fill' : 'bi-circle') + ' m-check" aria-hidden="true"></i></button>';
    }).join('') + '</div>' +
    (kanal.indexOf('wa') >= 0 && !gw.ready ? '<div class="alert-soft warn mt-3 d-flex flex-wrap gap-2 align-items-center"><i class="bi bi-exclamation-triangle"></i><span class="flex-grow-1">Token perangkat WhatsApp gateway (Fonnte) belum diatur, slip belum bisa dikirim lewat WhatsApp.</span><button class="btn btn-gold btn-sm" data-nav="pengaturan"><i class="bi bi-gear"></i> Atur Token WhatsApp</button></div>' : '') +
    (kanal.indexOf('wa') >= 0 && !d.webUrl ? '<div class="alert-soft warn mt-3 d-flex flex-wrap gap-2 align-items-center"><i class="bi bi-link-45deg"></i><span class="flex-grow-1">URL aplikasi belum diketahui, sehingga tautan pribadi WhatsApp belum bisa dibuat. Isi di Pengaturan → URL Aplikasi.</span><button class="btn btn-gold btn-sm" data-nav="pengaturan"><i class="bi bi-gear"></i> Isi URL Aplikasi</button></div>' : '') +
    '<div class="d-flex flex-wrap gap-2 align-items-center justify-content-between mt-3">' + (info.length ? '<div class="metode-info">' + info.join('') + '</div>' : '<span></span>') +
    '<button type="button" class="btn btn-ghost btn-sm" data-action="previewMsg" data-id="' + esc((slips.find(s => s.sv === 'VALID') || slips[0] || {}).id || '') + '"><i class="bi bi-chat-square-text"></i> Pratinjau isi pesan</button></div></div>';
}
/** Ubah teks berformat WhatsApp (*tebal*, _miring_, tautan) menjadi HTML aman. */
function waFormat(t) {
  return esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,])/gm, '$1<i>$2</i>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
}
function pickSlipPreview() {
  const cur = (App.idx.slipsByPer[App.ui.currentPeriode] || []).find(s => s.sv === 'VALID');
  return (cur || (App.d.slips || []).find(s => s.pub) || (App.d.slips || [])[0] || {}).id || '';
}
function msgTab(tab) {
  $$('#msgModal [data-action="msgTab"]').forEach(b => { const on = b.dataset.id === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  $('#msgEmail').hidden = tab !== 'email'; $('#msgWa').hidden = tab !== 'wa';
}
function renderMsgPreview(r, s) {
  const jam = new Date().toTimeString().slice(0, 5);
  const att = '<span class="att-chip"><i class="bi bi-file-earmark-pdf"></i> ' + esc(r.fileName) + '</span>';
  $('#msgEmail').innerHTML = '<div class="msg-head"><div><span>Kepada</span><b>' + esc(r.email || '(surel kosong)') + '</b></div><div><span>Subjek</span><b>' + esc(r.subject) + '</b></div><div><span>Lampiran</span>' + att + '</div></div><iframe class="msg-frame" id="msgFrame" title="Pratinjau surel" sandbox="allow-same-origin"></iframe>';
  const fr = $('#msgFrame');
  fr.onload = () => { try { fr.style.height = Math.max(420, fr.contentDocument.documentElement.scrollHeight + 8) + 'px'; } catch (e) { } };
  fr.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"></head><body style="margin:0;padding:16px;background:#F3F5F4">' + r.html + '</body></html>';
  $('#msgWa').innerHTML = '<div class="msg-head"><div><span>Kepada</span><b>' + esc(r.noWA ? fmtWA(r.noWA) : '(No. WA kosong)') + '</b></div><div><span>Format</span><span>Pesan teks: pemberitahuan + tautan pribadi ke akun pegawai — <b>tanpa nominal gaji & tanpa lampiran</b></span></div><div><span>Tautan</span><span>' + (r.akses === 'Sandi' ? 'Mengisi NRP, pegawai memasukkan kata sandi' : 'Langsung membuka slip di akun pegawai') + ' · berlaku ' + esc(r.masa) + ' hari · token unik per pegawai</span></div></div>' +
    '<div class="wa-chat"><div class="wa-bubble">' + waFormat(r.wa) + '<span class="wa-time">' + jam + '</span></div></div>' +
    '<p class="tiny text-muted-2 mt-2 mb-0"><i class="bi bi-info-circle"></i> Tautan di atas hanya contoh. Saat dikirim, setiap pegawai mendapat tautan pribadinya sendiri' + (r.url ? ' (' + esc(r.url) + '?s=…)' : '') + '.</p>';
  $('#msgModalTitle').textContent = (s ? s.nama + ' · ' : '') + 'Pratinjau Pesan';
  $('#msgMeta').textContent = 'Surel: ' + (r.rincian ? 'memuat rincian gaji & THP + PDF' : 'pemberitahuan + PDF') + ' · WhatsApp: pemberitahuan + tautan saja' + (r.modeUji ? ' · Mode Uji: dikirim ke penerima uji' : '');
}
function confirmDispatch() {
  const per = App.idx.per[App.ui.currentPeriode]; if (!per) return;
  const d = App.d, m = metodeNow(), kanal = kanalAktif(m), st = d.settingsFull || {};
  if (kanal.indexOf('wa') >= 0 && !(d.waGateway || {}).ready) {
    confirmBox({ title: 'Token WhatsApp belum diatur', sub: 'Metode ' + m, icon: 'bi-whatsapp', ok: 'Buka Pengaturan', body: '<p class="mb-0">Simpan token perangkat Fonnte di <b>Pengaturan → WhatsApp Gateway</b> terlebih dahulu, atau pilih metode <b>Email</b>.</p>' }).then(ok => { if (ok) navigateTo('pengaturan'); });
    return;
  }
  const slips = App.idx.slipsByPer[per.id] || [];
  const pend = slips.filter(s => kanalPerlu(s, m).length);
  const nE = pend.filter(s => kanalPerlu(s, m).indexOf('email') >= 0).length, nW = pend.filter(s => kanalPerlu(s, m).indexOf('wa') >= 0).length;
  const an = slips.filter(s => s.sv !== 'VALID').length;
  const q = d.quota, uji = d.settings.modeUji === 'Ya', ujiMax = d.settings.ujiWaMax || 5;
  const perUnit = d.units.map(u => [u, pend.filter(s => s.unit === u).length]).filter(x => x[1]);
  // ± (jeda acak rata-rata 1,25× + kirim/PDF ±1,5 dtk) per pesan; Mode Uji hanya beberapa pesan sungguhan
  const menit = Math.max(1, Math.ceil((uji ? Math.min(nW, ujiMax) : nW) * ((Number(st.JedaWA) || 3) * 1.25 + 1.5) / 60));
  confirmBox({
    title: 'Kirim Slip ke Pegawai', sub: 'Tindakan massal via ' + m + ' — mohon periksa kembali', icon: METODE[m].ic, ok: 'Ya, Kirim ' + pend.length + ' Slip', okCls: 'btn-primary-app',
    body: '<div class="kv-list"><div><span>Periode</span><b>' + esc(periodeShort(per)) + '</b></div><div><span>Jenis</span><b>' + esc(JENIS_LABEL[per.jenis]) + '</b></div><div><span>Metode</span><b><i class="bi ' + METODE[m].ic + '"></i> ' + esc(m) + '</b></div><div><span>Jumlah penerima</span><b>' + pend.length + ' pegawai</b></div>' +
      (kanal.indexOf('email') >= 0 ? '<div><span>Via surel (lampiran PDF)</span><b>' + (nE ? nE + ' slip' : '0 — sudah terkirim / tanpa surel') + '</b></div>' : '') +
      (kanal.indexOf('wa') >= 0 ? '<div><span>Via WhatsApp (pemberitahuan + tautan pribadi)</span><b>' + (nW ? nW + ' nomor' : '0 — sudah terkirim / tanpa No. WA') + '</b></div>' : '') +
      '<div><span>Total THP</span><b>' + fmtRp(pend.reduce((a, s) => a + (s.thp || 0), 0)) + '</b></div><div><span>Anomali ditahan</span><b>' + an + ' baris</b></div>' +
      (kanal.indexOf('email') >= 0 ? '<div><span>Sisa kuota surel hari ini</span><b>' + (q < 0 ? 'tidak terbaca' : fmtNum(q)) + '</b></div>' : '') +
      (nW ? '<div><span>Perkiraan durasi WhatsApp</span><b>± ' + menit + ' menit</b></div>' : '') + '</div>' +
      '<div class="d-flex flex-wrap gap-1 mt-2">' + perUnit.map(x => '<span class="chip chip-info">' + x[0] + ': ' + x[1] + '</span>').join('') + '</div>' +
      (kanal.indexOf('email') >= 0 && q >= 0 && q < nE ? '<div class="alert-soft warn mt-3"><i class="bi bi-hourglass"></i> Kuota surel tidak cukup untuk semua. Sisa surel otomatis dilanjutkan setelah kuota direset' + (nW ? '; WhatsApp tetap berjalan' : '') + '.</div>' : '') +
      (nW ? '<div class="alert-soft info mt-3"><i class="bi bi-whatsapp"></i> Pesan WhatsApp hanya berisi <b>pemberitahuan + tautan pribadi</b> ke akun masing-masing (tanpa nominal gaji). Dikirim satu per satu dengan jeda acak ±' + esc(st.JedaWA || 3) + ' detik agar nomor pengirim aman dari pemblokiran' + (nW > 60 ? '. Browser boleh ditutup — pemicu server melanjutkan tiap menit.' : '.') + '</div>' : '') +
      (uji ? '<div class="alert-soft warn mt-3"><i class="bi bi-cone-striped"></i> <b>Mode Uji aktif</b> — ' + [kanal.indexOf('email') >= 0 ? 'surel ke pemilik skrip' : '', kanal.indexOf('wa') >= 0 ? 'hanya ' + ujiMax + ' WhatsApp pertama ke ' + esc(fmtWA(st.NomorUjiWA || d.settings.wa)) + ' (sisanya disimulasikan, tidak dikirim)' : ''].filter(Boolean).join(', ') + ', bukan ke pegawai.</div>' : '') +
      '<p class="small text-muted-2 mt-3 mb-0">Slip yang sudah terkirim di kanal yang sama tidak akan dikirim ganda. PDF arsip disimpan di folder Drive privat per unit; pegawai melihat slip di akunnya.</p>'
  }).then(ok => { if (ok) startDispatch(per.id, 'valid'); });
}
async function startDispatch(idPeriode, scope, idSlip) {
  try {
    const st = await api('apiStartDispatch', idPeriode, scope, idSlip || '');
    applyDispatch(st);
    if (scope !== 'single') navigateTo('progress');
    else toast('Slip dijadwalkan untuk dikirim ulang.', 'success');
    startWorker();
  } catch (e) { fail(e); }
}

// ── W-06 PROGRESS (worker berbasis browser + pemicu server) ───
function applyDispatch(st) {
  if (!st) return;
  App.d.dispatch = st;
  if (st.quota !== undefined) App.d.quota = st.quota;
  (st.updates || []).forEach(u => { const s = App.idx.slip[u.id]; if (s) Object.assign(s, u); });
  const per = App.idx.per[st.job.idPeriode];
  if (per) per.status = st.job.status === 'SELESAI' ? 'Selesai' : 'Sedang Dikirim';
  updateChrome();
  if (App.ui.page === 'progress' || App.ui.page === 'preview' || App.ui.page === 'dashboard') rerender();
}
async function startWorker() {
  if (App.ui.worker) return;
  App.ui.worker = true;
  let errors = 0;
  while (App.ui.worker && App.token) {
    const st = App.d.dispatch;
    if (!st || !st.job || st.job.status !== 'BERJALAN') break;
    try {
      const res = await apiSilent('apiRunBatch');
      errors = 0;
      if (!res || !res.job) break;
      applyDispatch(res);
      if (res && res.job && res.job.status === 'SELESAI') {
        toast(res.counts.terkirim + ' slip terkirim, ' + res.counts.gagal + ' gagal.', res.counts.gagal ? 'warning' : 'success', 'Pengiriman selesai');
        apiSilent('apiRefresh').then(b => { applyBoot(b); rerender(); }).catch(() => { });
        break;
      }
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      if (e.code === 'SESSION') break;
      if (++errors > 4) { toast('Koneksi pengiriman terputus. Proses tetap dilanjutkan oleh pemicu server setiap menit.', 'warning'); break; }
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  App.ui.worker = false;
}
/** Pesan jeda gateway WhatsApp terakhir (bila job dijeda karena WA). */
function waPaused(j) { if (!j || j.status !== 'JEDA') return ''; const l = (j.log || []).slice(-1)[0]; return l && l[1] === 'WA_ERR' ? String(l[2]).replace(/^Gateway WhatsApp: /, '') : ''; }
RENDER.progress = function () {
  renderStepper();
  const st = App.d.dispatch;
  if (!st || !st.job) {
    $('#progBody').hidden = true; $('#progActions').innerHTML = ''; $('#runtimeBox').innerHTML = '';
    $('#progEmpty').innerHTML = '<div class="card-app empty-state"><i class="bi bi-envelope-paper"></i><b>Belum ada pengiriman berjalan.</b><p class="mb-2">Mulai dari halaman Pratinjau & Kirim.</p><button class="btn btn-primary-app" data-nav="preview">Buka Pratinjau & Kirim</button></div>';
    return;
  }
  $('#progEmpty').innerHTML = ''; $('#progBody').hidden = false;
  const j = st.job, c = st.counts, per = App.idx.per[j.idPeriode];
  App.ui.currentPeriode = j.idPeriode;
  const done = c.terkirim + c.gagal, p = c.total ? Math.round(c.terkirim / c.total * 100) : 0;
  const stLbl = { BERJALAN: ['BERJALAN', 'chip-success'], JEDA: ['DIJEDA', 'chip-warn'], KUOTA: ['MENUNGGU KUOTA', 'chip-warn'], SELESAI: ['SELESAI', 'chip-info'] }[j.status] || [j.status, 'chip-info'];
  $('#runtimeBox').innerHTML = '<i class="bi bi-terminal"></i><div><div class="tiny text-muted-2">RUNTIME TARGET</div><b>' + c.total + ' Slip (' + esc(periodeShort(per)) + ')</b></div>';
  $('#progWorker').innerHTML = '<div class="d-flex gap-3 align-items-start"><span class="file-icon" style="width:44px;height:44px;font-size:1.2rem"><i class="bi bi-layers"></i></span><div class="flex-grow-1"><p class="eyebrow mb-0">Eksekusi GAS Worker</p><h3 class="fs-4">Putaran #' + (j.batchNo || 0) + ' <small class="text-muted-2 fs-6">· ' + done + ' / ' + c.total + ' diproses</small></h3></div><span class="chip ' + stLbl[1] + '">' + stLbl[0] + '</span></div><p class="small text-muted-2 mt-2">Surel diproses <b>' + (j.batchSize || 30) + ' slip per putaran</b>; WhatsApp berjalan terus ±4 menit per putaran pemicu (±50 pesan) dan progres disimpan tiap 5 slip, sehingga aman dari batas 6 menit Apps Script. Login & tautan pegawai tetap lancar selama pengiriman.</p><div class="alert-soft info small d-flex justify-content-between"><span><i class="bi bi-arrow-repeat"></i> ' + (App.ui.worker ? 'Worker browser aktif' : 'Worker browser tidak aktif — pemicu server tiap 1 menit') + '</span><span class="mono">' + esc(j.by || '') + '</span></div>' + (waPaused(j) ? '<div class="alert-soft danger small mt-2 d-flex flex-wrap gap-2 align-items-center"><i class="bi bi-whatsapp"></i><span class="flex-grow-1"><b>WhatsApp dijeda:</b> ' + esc(waPaused(j)) + '</span><button class="btn btn-ghost btn-xs" data-nav="pengaturan"><i class="bi bi-gear"></i> Pengaturan</button></div>' : '');
  const q = st.quota, chs = st.channels || { email: Object.assign({ dilewati: 0 }, c), wa: { total: 0, terkirim: 0, gagal: 0, menunggu: 0, dilewati: 0 } };
  const stf = App.d.settingsFull || {};
  const chRow = (k, x, sub, chip) => '<div class="ch-row"><span class="ch-ic ' + k + '"><i class="bi ' + CH[k].ic + '"></i></span><div class="flex-grow-1 min-w-0"><div class="d-flex justify-content-between gap-2 flex-wrap"><b>' + (k === 'wa' ? 'WhatsApp · Fonnte' : 'Surel · Gmail') + '</b>' + chip + '</div><div class="progress-thin mt-2"><span style="width:' + pct(x.terkirim, x.total) + '%' + (k === 'wa' ? ';background:#25D366' : '') + '"></span></div><div class="d-flex justify-content-between flex-wrap gap-2 tiny text-muted-2 mt-1"><span><b class="text-body">' + x.terkirim + '/' + x.total + '</b> terkirim' + (x.gagal ? ' · <span class="text-danger">' + x.gagal + ' gagal</span>' : '') + (x.menunggu ? ' · ' + x.menunggu + ' antre' : '') + (x.dilewati ? ' · ' + x.dilewati + ' dilewati (kontak kosong)' : '') + '</span><span>' + sub + '</span></div></div></div>';
  const rowsCh = [];
  if (chs.email.total || chs.email.dilewati || !chs.wa.total) rowsCh.push(chRow('email', chs.email, q < 0 ? 'Kuota tidak terbaca' : 'Sisa kuota hari ini: <b>' + fmtNum(q) + '</b>', '<span class="chip ' + (q === 0 ? 'chip-danger' : 'chip-success') + '">' + (q === 0 ? 'KUOTA HABIS' : 'KUOTA AMAN') + '</span>'));
  if (chs.wa.total || chs.wa.dilewati) rowsCh.push(chRow('wa', chs.wa, 'Pemberitahuan + tautan pribadi · jeda ±' + esc(stf.JedaWA || 3) + ' dtk' + (App.d.settings.modeUji === 'Ya' ? ' · uji maks. ' + (App.d.settings.ujiWaMax || 5) : ''), '<span class="chip ' + (st.waReady === false ? 'chip-danger' : 'chip-success') + '">' + (st.waReady === false ? 'TOKEN KOSONG' : 'GATEWAY AKTIF') + '</span>'));
  $('#progQuota').innerHTML = '<div class="d-flex gap-3 align-items-start mb-2"><span class="file-icon" style="width:44px;height:44px;font-size:1.2rem;background:var(--gold);color:#3a2a00"><i class="bi ' + METODE[METODE[j.metode] ? j.metode : 'Email'].ic + '"></i></span><div class="flex-grow-1"><p class="eyebrow mb-0">Kanal Pengiriman</p><h3 class="fs-4">' + esc(j.metode || 'Email') + '</h3></div></div>' + rowsCh.join('') + '<div class="tiny serif mt-2 text-muted-2">Surel: Workspace ±1.500/hari · Gmail gratis ±100/hari (reset ±14:00–15:00 WIB). WhatsApp mengikuti kuota paket Fonnte.</div>';
  $('#progAgg').innerHTML = '<div class="d-flex flex-wrap justify-content-between gap-3 align-items-end mb-3"><div><p class="eyebrow"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--emerald-800)"></span> Agregasi Distribusi Dokumen</p><h2 class="fw-bold mb-1">Status Pengiriman Real-Time</h2><p class="text-muted-2 mb-0">PDF slip disimpan di Drive privat per unit, lalu dikirim via ' + esc(j.metode || 'Email') + '.</p></div><div class="d-flex align-items-end gap-2"><span class="big-pct">' + p + '%</span><span class="eyebrow mb-2">SELESAI TERVERIFIKASI</span></div></div>' +
    '<div class="seg-bar"><span class="s-ok" style="width:' + pct(c.terkirim, c.total) + '%">' + (c.terkirim ? c.terkirim + ' Terkirim (' + pct(c.terkirim, c.total) + '%)' : '') + '</span><span class="s-bad" style="width:' + pct(c.gagal, c.total) + '%"></span><span class="s-wait" style="width:' + pct(c.menunggu, c.total) + '%">' + (c.menunggu ? c.menunggu + ' Antrean' : '') + '</span></div>' +
    '<div class="d-flex flex-wrap gap-3 small mt-2"><span><i class="bi bi-square-fill" style="color:var(--emerald-800)"></i> ' + c.terkirim + ' Terkirim</span><span><i class="bi bi-square" ></i> ' + c.menunggu + ' Dalam Antrean</span><span class="text-danger"><i class="bi bi-square-fill"></i> ' + c.gagal + ' Gagal Transmisi</span><span class="ms-auto serif fw-bold">Total Target: ' + c.total + ' Slip</span></div>' +
    '<div class="row g-2 mt-2"><div class="col-md-4"><div class="stat-tile ok"><span class="serif small">Sukses Terkirim</span><b>' + c.terkirim + ' Slip</b><span class="small">PDF tersimpan di Drive & slip terkirim.</span></div></div><div class="col-md-4"><div class="stat-tile"><span class="serif small">Dalam Antrean</span><b>' + c.menunggu + ' Slip</b><span class="small">Menunggu putaran berikutnya.</span></div></div><div class="col-md-4"><div class="stat-tile bad"><span class="serif small">Gagal / Perlu Review</span><b>' + c.gagal + ' Slip</b><span class="small">' + (c.gagal ? 'Lihat daftar di bawah.' : 'Tidak ada kegagalan.') + '</span></div></div></div>';
  const log = j.log || [];
  $('#consoleBody').innerHTML = '<div class="t">// Engine pengiriman Slip Gaji (Google Apps Script)</div>' + log.map(l => '<div class="ln"><span class="t">[' + esc(l[0]) + ']</span><span class="k k-' + esc(l[1]) + '">[' + esc(l[1]) + ']</span><span>' + esc(l[2]) + '</span></div>').join('');
  $('#consoleBody').scrollTop = 1e6;
  const pu = st.perUnit || {};
  let tuntas = 0, proses = 0, antre = 0;
  $('#unitProg').innerHTML = App.d.units.map((u, i) => {
    const x = pu[u] || { total: 0, terkirim: 0, gagal: 0, menunggu: 0 };
    if (!x.total) return '';
    const state = x.menunggu === 0 ? 'SELESAI' : x.terkirim + x.gagal > 0 ? 'MEMPROSES' : 'ANTREAN';
    if (state === 'SELESAI') tuntas++; else if (state === 'MEMPROSES') proses++; else antre++;
    const pc = pct(x.terkirim, x.total);
    return '<div class="unit-card ' + (state === 'MEMPROSES' ? 'proc' : '') + '"><div class="u-top"><span>UNIT ' + u + '</span><span class="status ' + (state === 'SELESAI' ? 'ok' : state === 'MEMPROSES' ? 'gold' : 'wait') + '">' + state + '</span></div><b>' + esc(App.d.unitNames[u] || u) + '</b><div class="u-num"><span>' + x.terkirim + ' / ' + x.total + ' Slip' + (x.gagal ? ' <span class="text-danger">· ' + x.gagal + ' gagal</span>' : '') + '</span><span>' + pc + '%</span></div><div class="progress-thin mt-1"><span style="width:' + pc + '%"></span></div></div>';
  }).join('');
  $('#unitProgSum').textContent = tuntas + ' Tuntas / ' + proses + ' Proses / ' + antre + ' Antrean';
  $('#progFailures').innerHTML = st.failures && st.failures.length ? '<div class="card-app mt-3"><div class="card-head"><h3 class="text-danger"><i class="bi bi-exclamation-triangle"></i> Tercatat ' + st.failures.length + ' Kendala Transmisi</h3>' + (j.status === 'SELESAI' ? '<button class="btn btn-primary-app btn-sm" data-action="resendFailed"><i class="bi bi-arrow-repeat"></i> Kirim Ulang Semua yang Gagal</button>' : '<span class="chip chip-info">Kirim ulang tersedia setelah batch tuntas</span>') + '</div><div class="table-responsive"><table class="table-app compact" id="failTable"></table></div></div>' : '';
  if (st.failures && st.failures.length) renderTable('fail', $('#failTable'), null, [
    { h: 'NRP', r: x => '<span class="nrp">' + esc(x.nrp) + '</span>' }, { h: 'Nama', main: true, r: x => '<b>' + esc(x.nama) + '</b>' }, { h: 'Unit', r: x => unitPill(x.unit) }, { h: 'Kanal', r: x => chBadge(x.ch || 'email', 'Gagal', x.err) }, { h: 'Alasan', r: x => '<span class="small text-danger">' + esc(x.err) + '</span>' },
    { h: 'Aksi', cls: 'actions', r: x => (x.ch === 'wa' ? (/Nomor|nomor/.test(x.err) ? '<button class="btn btn-ghost btn-xs" data-action="fixWA" data-id="' + esc(x.id) + '"><i class="bi bi-whatsapp"></i> Perbaiki No. WA</button> ' : '') : /surel/i.test(x.err) ? '<button class="btn btn-ghost btn-xs" data-action="fixEmail" data-id="' + esc(x.id) + '"><i class="bi bi-pencil"></i> Perbaiki Surel</button> ' : '') + '<button class="btn btn-ghost btn-xs" data-action="resendSlip" data-id="' + esc(x.id) + '"><i class="bi bi-arrow-repeat"></i> Kirim Ulang</button>' }
  ], st.failures, { size: 50 });
  $('#progActions').innerHTML =
    (j.status === 'BERJALAN' ? '<button class="btn btn-ghost" data-action="pauseJob"><i class="bi bi-pause-circle"></i> Jeda Eksekusi Sementara</button>' : (j.status === 'JEDA' || j.status === 'KUOTA') ? '<button class="btn btn-primary-app" data-action="resumeJob"><i class="bi bi-play-circle"></i> Lanjutkan Pengiriman</button>' : '') +
    '<span class="chip chip-info"><i class="bi bi-stopwatch"></i> ' + (j.startedAt ? 'Mulai ' + fmtDate(j.startedAt, true) : '') + (j.finishedAt ? ' · Selesai ' + fmtDate(j.finishedAt, true).split(', ')[1] : '') + '</span>' +
    '<button class="btn btn-ghost" data-action="openRiwayat" data-id="' + esc(j.idPeriode) + '"><i class="bi bi-journal-text"></i> Lihat Log Lengkap di Riwayat (W-09)</button>' +
    '<button class="btn btn-ghost ms-auto" data-action="resendFailed" ' + (j.status === 'SELESAI' && c.gagal ? '' : 'disabled') + '><i class="bi bi-arrow-repeat"></i> Kirim Ulang ' + c.gagal + ' Slip Gagal' + (j.status === 'SELESAI' ? '' : ' (tersedia setelah batch tuntas)') + '</button>';
};

// ── W-07 DATA PEGAWAI ─────────────────────────────────────────
RENDER.pegawai = function () {
  const d = App.d, isY = App.role === ROLE.Y;
  $$('#section-pegawai .admin-only').forEach(e => e.hidden = !isY);
  $('#pegTitle').textContent = isY ? 'Data Pegawai' : 'Data Guru & Tendik — ' + App.user.unit;
  $('#pegSub').textContent = isY ? 'Kelola guru dan tenaga kependidikan seluruh unit. Penghapusan berupa nonaktif agar riwayat slip tetap utuh.' : 'Daftar pegawai unit Anda (tanpa nominal gaji). Perubahan data dilakukan oleh Admin Yayasan.';
  const us = $('#pegUnit');
  if (!us.options.length) { unitOptions(us, true, isY ? '' : App.user.unit); }
  us.hidden = !isY;
  const peg = d.pegawai;
  const akunOf = nrp => App.idx.akun[String(nrp).toLowerCase()] || {};
  const locked = peg.filter(p => akunOf(p.NRP).kunci).length, wajib = peg.filter(p => akunOf(p.NRP).wajib).length;
  $('#pegKpi').innerHTML = kpi('Total Pegawai', fmtNum(peg.length), 'bi-people', '<span>' + (isY ? d.units.length + ' unit · ' + peg.filter(p => p.Status !== 'Aktif').length + ' nonaktif' : 'Unit ' + App.user.unit) + '</span>') +
    (isY ? (() => { const dekat = peg.filter(p => p.Status === 'Aktif' && p.TglLahir).filter(p => { const x = sisaWaktu(tanggalPensiun(p.TglLahir, jenisPegawai(p))).bulan; return x !== null && x < 12; }).length; return kpi('Pensiun ≤ 12 Bulan', fmtNum(dekat), 'bi-calendar2-check', '<span>Guru ' + usiaPensiun('Guru') + ' th · Karyawan ' + usiaPensiun('Karyawan') + ' th</span>', dekat ? 'gold' : ''); })()
      : kpi('Aktif', fmtNum(peg.filter(p => p.Status === 'Aktif').length), 'bi-person-check', '<span>Nonaktif: ' + peg.filter(p => p.Status !== 'Aktif').length + '</span>')) +
    kpi('Belum Ganti Sandi Awal', fmtNum(wajib), 'bi-key', '<span>Belum pernah login</span>') +
    kpi('Akun Terkunci', fmtNum(locked), 'bi-lock', locked ? '<span class="text-danger">Perlu bantuan TU</span>' : '<span>Aman</span>', locked ? 'alert' : '');
  const q = $('#pegSearch').value.trim().toLowerCase(), u = us.value, s = $('#pegStatus').value;
  const rows = peg.filter(p => (!q || (p.NRP + ' ' + p.Nama + ' ' + p.Email + ' ' + p.Jabatan).toLowerCase().indexOf(q) >= 0) && (!u || p.Unit === u) && (!s || p.Status === s)).sort((a, b) => a.Unit.localeCompare(b.Unit) || a.Nama.localeCompare(b.Nama));
  renderTable('peg', $('#pegTable'), $('#pegPager'), [
    { h: 'NRP', r: p => '<span class="nrp">' + esc(p.NRP) + '</span>' },
    { h: 'Nama & Jabatan', main: true, r: p => '<div class="t-name">' + esc(p.Nama) + '</div><div class="t-sub">' + esc(p.Jabatan || '-') + '</div>' },
    { h: 'Unit', r: p => unitPill(p.Unit) },
    { h: 'Email · WhatsApp', r: p => '<span class="small">' + esc(p.Email) + '</span>' + (p.NoWA ? '<div class="small mono mt-1"><i class="bi bi-whatsapp" style="color:#25D366"></i> ' + esc(fmtWA(p.NoWA)) + '</div>' : '<div class="tiny text-muted-3 mt-1">WA -</div>') },
    { h: 'Kepegawaian', r: p => '<span class="status ' + (jenisPegawai(p) === 'Guru' ? 'ok' : 'wait') + '">' + jenisPegawai(p) + '</span><div class="t-sub mt-1">' + esc(p.StatusKepegawaian || '-') + (p.Golongan ? ' · Gol. ' + esc(p.Golongan) : '') + '</div>' },
    { h: isY ? 'Masuk · Pensiun' : 'Tahun Masuk', r: p => { const tp = isY ? tanggalPensiun(p.TglLahir, jenisPegawai(p)) : ''; const sw = sisaWaktu(tp); return '<div class="small fw-semibold" style="color:var(--emerald-700)">' + (p.TahunMasuk ? '<i class="bi bi-box-arrow-in-right"></i> ' + esc(p.TahunMasuk) + ' <span class="fw-normal text-muted-2">(' + esc(lamaKerja(p.TahunMasuk)) + ')</span>' : '<span class="text-muted-3 fw-normal">Masuk -</span>') + '</div>' + (isY ? '<div class="small mt-1" title="Lahir ' + esc(fmtYmd(p.TglLahir)) + ' · usia ' + usia(p.TglLahir) + ' th">' + (tp ? '<i class="bi bi-calendar2-check"></i> ' + fmtYmd(tp) + (sw.bulan !== null && sw.bulan < 12 ? ' <span class="status ' + (sw.bulan < 0 ? 'bad' : 'gold') + '">' + (sw.bulan < 0 ? 'Usia pensiun' : '≤ 1 th') + '</span>' : '') : '<span class="text-muted-3">Pensiun - (tgl lahir kosong)</span>') + '</div>' : ''); } },
    { h: 'Akun Portal', r: p => { const a = akunOf(p.NRP); return a.kunci ? '<span class="status bad"><i class="bi bi-lock"></i> Terkunci</span>' : a.wajib ? '<span class="status warn">Sandi awal</span>' : a.id ? '<span class="status ok">Aktif</span> <span class="status ' + (a.pin ? 'ok' : 'warn') + '" title="PIN dokumen">' + (a.pin ? 'PIN ✓' : 'Tanpa PIN') + '</span>' : '<span class="status wait">Belum ada</span>'; } },
    { h: 'Status', r: p => p.Status === 'Aktif' ? '<span class="status ok">● Aktif</span>' : '<span class="status bad">● Nonaktif</span>' },
    { h: 'Aksi', cls: 'actions', r: p => { const a = akunOf(p.NRP); return waLink(p.NoWA) + ' ' + (isY ? '<button class="btn btn-ghost btn-xs" data-action="editPeg" data-id="' + esc(p.NRP) + '" aria-label="Ubah"><i class="bi bi-pencil"></i></button> ' : '') + (a.kunci ? '<button class="btn btn-danger-soft btn-xs" data-action="unlock" data-id="' + esc(p.NRP) + '"><i class="bi bi-unlock"></i> Buka Kunci</button> ' : '') + (a.id ? '<button class="btn btn-ghost btn-xs" data-action="resetPass" data-id="' + esc(p.NRP) + '" title="Reset sandi"><i class="bi bi-key"></i></button> ' : '') + (a.pin ? '<button class="btn btn-ghost btn-xs" data-action="resetPin" data-id="' + esc(p.NRP) + '" title="Reset PIN dokumen" aria-label="Reset PIN dokumen ' + esc(p.Nama) + '"><i class="bi bi-123"></i></button> ' : '') + (isY ? '<button class="btn btn-ghost btn-xs ' + (p.Status === 'Aktif' ? 'text-danger' : '') + '" data-action="togglePeg" data-id="' + esc(p.NRP) + '" title="' + (p.Status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan') + '"><i class="bi ' + (p.Status === 'Aktif' ? 'bi-person-dash' : 'bi-person-check') + '"></i></button> <button class="btn btn-danger-soft btn-xs" data-action="deletePeg" data-id="' + esc(p.NRP) + '" title="Hapus permanen" aria-label="Hapus permanen ' + esc(p.Nama) + '"><i class="bi bi-trash3"></i></button>' : ''); } }
  ], rows, { rowCls: p => p.Status !== 'Aktif' ? 'opacity-75' : '' });
};
function pegawaiForm(p, prefill) {
  const isNew = !p; p = p || prefill || {};
  const opt = (arr, v) => arr.map(x => '<option ' + (x === v ? 'selected' : '') + '>' + esc(x) + '</option>').join('');
  openForm({
    title: isNew ? 'Tambah Pegawai' : 'Ubah Data Pegawai', submit: isNew ? 'Tambah & Buat Akun' : 'Simpan Perubahan',
    body: '<div class="row g-3"><div class="col-md-4"><label class="form-label" for="fNRP">NRP <span class="req">*</span></label><input id="fNRP" name="NRP" class="form-control mono" required pattern="[A-Za-z0-9.\\-]{4,20}" value="' + esc(p.NRP || '') + '" ' + (isNew ? '' : 'readonly') + '></div>' +
      '<div class="col-md-8"><label class="form-label" for="fNama">Nama Lengkap & Gelar <span class="req">*</span></label><input id="fNama" name="Nama" class="form-control" required minlength="3" value="' + esc(p.Nama || '') + '"></div>' +
      '<div class="col-md-4"><label class="form-label" for="fUnit">Unit <span class="req">*</span></label><select id="fUnit" name="Unit" class="form-select" required>' + opt(App.d.units, p.Unit || App.d.units[0]) + '</select></div>' +
      '<div class="col-md-8"><label class="form-label" for="fEmail">Email (tujuan slip & login Google) <span class="req">*</span></label><input id="fEmail" name="Email" type="email" class="form-control" required value="' + esc(p.Email || '') + '"></div>' +
      '<div class="col-md-5"><label class="form-label" for="fWA">No. WhatsApp</label><div class="input-icon"><i class="bi bi-whatsapp"></i><input id="fWA" name="NoWA" type="tel" inputmode="tel" class="form-control mono" placeholder="0812-3456-7890" value="' + esc(fmtWA(p.NoWA || '')) + '"></div></div>' +
      '<div class="col-md-4"><label class="form-label" for="fJab">Jabatan</label><input id="fJab" name="Jabatan" class="form-control" value="' + esc(p.Jabatan || '') + '"></div>' +
      '<div class="col-md-3"><label class="form-label" for="fJenis">Jenis Pegawai</label><select id="fJenis" name="JenisPegawai" class="form-select">' + opt(['Guru', 'Karyawan'], jenisPegawai(p)) + '</select></div>' +
      '<div class="col-md-3"><label class="form-label" for="fKep">Kepegawaian</label><select id="fKep" name="StatusKepegawaian" class="form-select">' + opt(['GTY (Tetap)', 'GTT (Kontrak)', 'Tendik Tetap', 'Honorer'], p.StatusKepegawaian || 'GTY (Tetap)') + '</select></div>' +
      '<div class="col-md-3"><label class="form-label" for="fGol">Golongan</label><input id="fGol" name="Golongan" class="form-control" value="' + esc(p.Golongan || '') + '"></div>' +
      '<div class="col-md-6"><label class="form-label" for="fLahir">Tanggal Lahir</label><input id="fLahir" name="TglLahir" type="date" class="form-control" max="' + new Date().toISOString().slice(0, 10) + '" value="' + esc(p.TglLahir || '') + '"><div class="tiny text-muted-2 mt-1" id="fUsia">' + (p.TglLahir ? 'Usia ' + usia(p.TglLahir) + ' tahun' : '') + '</div></div>' +
      '<div class="col-md-6"><label class="form-label" for="fMasuk">Tahun Masuk</label><input id="fMasuk" name="TahunMasuk" type="number" inputmode="numeric" min="1950" max="' + (new Date().getFullYear() + 1) + '" class="form-control mono" placeholder="mis. 2008" value="' + esc(p.TahunMasuk || '') + '"><div class="tiny mt-1" id="fLama" style="color:var(--emerald-700)"></div></div>' +
      '<div class="col-12"><div class="alert-soft info small mb-0" id="fPensiun"></div></div>' +
      '<div class="col-md-6"><label class="form-label" for="fRek">Bank & No. Rekening</label><input id="fRek" name="BankRekening" class="form-control mono" placeholder="BSI 7149204819" value="' + esc(p.BankRekening || '') + '"><div class="tiny text-muted-2 mt-1">Ditampilkan tersamar pada slip.</div></div>' +
      (isNew ? '' : '<div class="col-md-6"><label class="form-label" for="fSt">Status</label><select id="fSt" name="Status" class="form-select">' + opt(['Aktif', 'Nonaktif'], p.Status) + '</select></div>') + '</div>' +
      (isNew ? '<div class="alert-soft info mt-3 small"><i class="bi bi-key"></i> Akun portal dibuat otomatis dengan kata sandi sementara (wajib diganti saat login pertama).</div>' : ''),
    onOpen: () => {
      // Pratinjau langsung: usia, lama kerja, tanggal pensiun (guru 60 / karyawan 58)
      const upd = () => {
        const l = $('#fLahir').value, t = $('#fMasuk').value, j = $('#fJenis').value;
        $('#fUsia').textContent = l ? 'Usia ' + usia(l) + ' tahun' : '';
        $('#fLama').innerHTML = /^\d{4}$/.test(t) ? '<i class="bi bi-hourglass-split"></i> Lama kerja: <b>' + esc(lamaKerja(t)) + '</b>' : 'Lama kerja = tahun sekarang − tahun masuk';
        const tp = tanggalPensiun(l, j), sw = sisaWaktu(tp);
        $('#fPensiun').innerHTML = tp ? '<i class="bi bi-calendar2-check"></i> Tanggal pensiun: <b>' + fmtYmd(tp) + '</b> (' + j + ', usia ' + usiaPensiun(j) + ' tahun) — ' + esc(sw.txt) : '<i class="bi bi-calendar2-check"></i> Isi tanggal lahir untuk menghitung tanggal pensiun (' + j + ': usia ' + usiaPensiun(j) + ' tahun).';
      };
      ['#fLahir', '#fMasuk', '#fJenis'].forEach(id => { $(id).addEventListener('input', upd); $(id).addEventListener('change', upd); });
      // Jabatan/status diubah → tebak ulang jenis pegawai (selama belum dipilih manual)
      let manual = false; $('#fJenis').addEventListener('change', () => { manual = true; });
      ['#fJab', '#fKep'].forEach(id => $(id).addEventListener('change', () => { if (!manual) { $('#fJenis').value = jenisPegawai({ Jabatan: $('#fJab').value, StatusKepegawaian: $('#fKep').value }); upd(); } }));
      upd();
    },
    onSubmit: async (data) => {
      const res = await api('apiSavePegawai', data, isNew);
      // Optimistic merge ke state lokal
      const i = App.d.pegawai.findIndex(x => x.NRP === res.pegawai.NRP);
      if (i >= 0) App.d.pegawai[i] = res.pegawai; else App.d.pegawai.push(res.pegawai);
      App.idx.peg[res.pegawai.NRP] = res.pegawai;
      if (res.akun && res.akun.id) { const k = String(res.akun.id).toLowerCase(); const ai = App.d.akun.findIndex(a => String(a.id).toLowerCase() === k); if (ai >= 0) App.d.akun[ai] = res.akun; else App.d.akun.push(res.akun); App.idx.akun[k] = res.akun; }
      sess.set('boot', App.d); updateChrome();
      toast(isNew ? 'Pegawai ditambahkan.' : 'Data pegawai diperbarui.', 'success');
      if (res.tempPassword) showTempPass(res.pegawai.Nama, res.pegawai.NRP, res.tempPassword, false);
      if (prefill && App.ui.currentPeriode) { try { applyBoot(await api('apiRevalidatePeriode', App.ui.currentPeriode)); toast('Rekap divalidasi ulang.', 'success'); } catch (e) { fail(e); } }
      rerender();
    }
  });
}
async function togglePeg(nrp) {
  const p = App.idx.peg[nrp]; if (!p) return;
  const to = p.Status === 'Aktif' ? 'Nonaktif' : 'Aktif';
  if (to === 'Nonaktif' && !(await confirmBox({ title: 'Nonaktifkan pegawai?', sub: p.Nama + ' · ' + p.NRP, body: '<p class="mb-0">Pegawai tidak dapat login dan tidak menerima slip baru. Riwayat slip tetap tersimpan dan dapat diaktifkan kembali.</p>', ok: 'Nonaktifkan', okCls: 'btn-danger-soft' }))) return;
  const prev = p.Status;
  p.Status = to; rerender(); // optimistic
  try { await api('apiSetPegawaiStatus', nrp, to); toast(p.Nama + ' ' + (to === 'Aktif' ? 'diaktifkan.' : 'dinonaktifkan.'), 'success'); const a = App.idx.akun[nrp.toLowerCase()]; if (a) a.status = to; sess.set('boot', App.d); }
  catch (e) { p.Status = prev; rerender(); fail(e); }
}
/**
 * Templat Excel impor Data Pegawai (dibuat di browser, tanpa RTT server).
 * mode 'blank' = kosong + 2 baris contoh (diabaikan saat impor)
 * mode 'data'  = berisi seluruh pegawai saat ini → ubah massal lalu impor kembali (upsert by NRP)
 */
const PEG_COLS = [
  ['NRP *', 'NRP', 14], ['Nama Lengkap *', 'Nama', 34], ['Unit *', 'Unit', 9], ['Email *', 'Email', 32], ['No. WhatsApp', 'NoWA', 16], ['Jabatan', 'Jabatan', 24],
  ['Jenis Pegawai (Guru/Karyawan)', 'JenisPegawai', 16], ['Status Kepegawaian', 'StatusKepegawaian', 18], ['Golongan', 'Golongan', 10],
  ['Tanggal Lahir', 'TglLahir', 14], ['Tahun Masuk', 'TahunMasuk', 12], ['Bank & No. Rekening', 'BankRekening', 22]
];
const PEG_TEXT_KEYS = ['NRP', 'NoWA', 'TglLahir', 'TahunMasuk', 'BankRekening']; // diformat Teks di Excel
const PEG_DATE_KEYS = ['TglLahir'];
const KEPEGAWAIAN = ['GTY (Tetap)', 'GTT (Kontrak)', 'Tendik Tetap', 'Honorer'];
function downloadPegawaiTemplate(mode, list, fileName) {
  if (!window.XLSX) { toast('Pustaka Excel masih dimuat, coba sesaat lagi.', 'warning'); return; }
  const units = App.d.units || [];
  const head = PEG_COLS.map(c => c[0]);
  let rows;
  if (mode === 'data') {
    rows = (list || App.d.pegawai).slice().sort((a, b) => a.Unit.localeCompare(b.Unit) || a.Nama.localeCompare(b.Nama)).map(p => PEG_COLS.map(c => { const v = p[c[1]] === undefined || p[c[1]] === null ? '' : String(p[c[1]]); return PEG_DATE_KEYS.indexOf(c[1]) >= 0 ? ymdToDmy(v) : c[1] === 'NoWA' ? fmtWA(v) : c[1] === 'JenisPegawai' ? jenisPegawai(p) : v; }));
  } else {
    rows = [
      ['CONTOH-1', 'Drs. H. Ahmad Fauzi, M.Pd.', 'SMA', 'ahmad.fauzi@pbsoedirman.sch.id', '0812-3456-7890', 'Guru Fisika', 'Guru', 'GTY (Tetap)', 'IV/a', '12/03/1985', '2008', 'BSI 7149204819'],
      ['CONTOH-2', 'Rahmat Hidayatullah, S.Kom.', 'SD', 'rahmat.h@pbsoedirman.sch.id', '0857-1111-2222', 'Staf Tata Usaha', 'Karyawan', 'Tendik Tetap', '', '15/05/1991', '2019', '']
    ];
  }
  const ws = XLSX.utils.aoa_to_sheet([head].concat(rows));
  // NRP & rekening sebagai TEKS (nol di depan tidak hilang) — termasuk 500 baris kosong siap isi
  const last = Math.max(rows.length + 500, 500);
  const textIdx = PEG_COLS.map((c, i) => PEG_TEXT_KEYS.indexOf(c[1]) >= 0 ? i : -1).filter(i => i >= 0);
  for (let r = 1; r <= last; r++) textIdx.forEach(c => {
    const ref = XLSX.utils.encode_cell({ r: r, c: c });
    if (!ws[ref]) ws[ref] = { t: 's', v: '' };
    ws[ref].t = 's'; ws[ref].z = '@'; ws[ref].v = String(ws[ref].v);
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: last, c: head.length - 1 } });
  ws['!cols'] = PEG_COLS.map(c => ({ wch: c[2] }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, rows.length), c: head.length - 1 } }) };
  const info = XLSX.utils.aoa_to_sheet([
    ['PETUNJUK IMPOR DATA PEGAWAI — ' + String((App.d.settings || {}).singkatan || 'YASMA PB. Soedirman').toUpperCase()],
    [''],
    ['Langkah'],
    ['1', 'Isi sheet "Data Pegawai" mulai baris 2 (satu baris = satu pegawai). Jangan ubah judul kolom.'],
    ['2', mode === 'data' ? 'Ubah sel yang perlu diperbarui. Baris dengan NRP yang sudah ada akan DIPERBARUI; NRP baru akan DITAMBAHKAN.' : 'Hapus atau biarkan baris contoh berawalan "CONTOH-" — baris contoh otomatis diabaikan saat impor.'],
    ['3', 'Simpan sebagai .xlsx, lalu unggah lewat tombol "Impor Excel" di menu Data Pegawai.'],
    ['4', 'Pegawai baru otomatis dibuatkan akun portal dengan sandi sementara. Gunakan tombol "Kirim Kredensial" untuk mengirimkannya via surel.'],
    [''],
    ['Kolom', 'Wajib', 'Aturan'],
    ['NRP', 'Ya', 'Unik, 4–20 karakter (angka/huruf/titik/strip). Diformat TEKS agar nol di depan tidak hilang.'],
    ['Nama Lengkap', 'Ya', 'Lengkap dengan gelar, minimal 3 karakter.'],
    ['Unit', 'Ya', 'Salah satu: ' + units.join(', ') + '.'],
    ['Email', 'Ya', 'Alamat tujuan slip & login Google. Periksa salah ketik (mis. gmial.com).'],
    ['Jabatan', 'Tidak', 'Contoh: Guru Matematika, Wali Kelas 4-A, Staf Tata Usaha.'],
    ['Status Kepegawaian', 'Tidak', 'Salah satu: ' + KEPEGAWAIAN.join(', ') + ' (kosong = GTY (Tetap)).'],
    ['Golongan', 'Tidak', 'Contoh: III/a, IV/a.'],
    ['Tanggal Lahir', 'Tidak', 'Format DD/MM/YYYY (contoh 12/03/1985). Dipakai menghitung TANGGAL PENSIUN dan dicegah dipakai sebagai PIN slip.'],
    ['No. WhatsApp', 'Tidak', 'Contoh: 0812-3456-7890 atau 6281234567890. Disimpan otomatis dalam format 62…'],
    ['Jenis Pegawai', 'Tidak', 'Guru atau Karyawan — menentukan usia pensiun (Guru ' + usiaPensiun('Guru') + ' th, Karyawan ' + usiaPensiun('Karyawan') + ' th). Kosong = ditebak dari jabatan/status.'],
    ['Tahun Masuk', 'Tidak', 'Tahun mulai bekerja (4 digit, mis. 2008). LAMA KERJA = tahun sekarang − tahun masuk (dihitung otomatis).'],
    ['Bank & No. Rekening', 'Tidak', 'Contoh: BSI 7149204819. Ditampilkan tersamar pada slip.'],
    [''],
    ['Catatan', '', 'Status Aktif/Nonaktif tidak diubah lewat impor — gunakan tombol Nonaktifkan di aplikasi (riwayat slip tetap utuh).'],
    [''],
    ['Daftar Unit', 'Nama Lengkap Unit']
  ].concat(units.map(u => [u, App.d.unitNames[u] || u])));
  info['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 100 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Pegawai'); // sheet pertama = yang dibaca saat impor
  XLSX.utils.book_append_sheet(wb, info, 'Petunjuk');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, fileName || ((mode === 'data' ? 'Data_Pegawai_' : 'Templat_Impor_Pegawai_') + stamp + '.xlsx'));
  if (!fileName) toast(mode === 'data' ? 'Data ' + rows.length + ' pegawai diunduh. Ubah lalu impor kembali.' : 'Templat impor pegawai diunduh.', 'success');
}

// ── UNDUH DATA PEGAWAI (Excel / PDF · per unit atau seluruh unit) ─────────
// Dibuat di peramban dari data yang sudah dimuat (tanpa beban GAS). Admin Sekolah hanya unitnya sendiri.
const JSPDF_URL = 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js';
const AUTOTABLE_URL = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@5.0.9/dist/jspdf.plugin.autotable.min.js';
const __scripts = {};
function loadScript(src) {
  if (!__scripts[src]) __scripts[src] = new Promise((resolve, reject) => {
    const el = document.createElement('script'); el.src = src; el.async = true;
    el.onload = () => resolve();
    el.onerror = () => { delete __scripts[src]; el.remove(); reject(new Error('Pustaka PDF gagal dimuat. Periksa koneksi internet lalu coba lagi.')); };
    document.head.appendChild(el);
  });
  return __scripts[src];
}
async function ensurePdfLib() {
  const lib = () => window.jspdf && window.jspdf.jsPDF;
  if (!lib()) await loadScript(JSPDF_URL);
  if (!lib()) { delete __scripts[JSPDF_URL]; throw new Error('Pustaka PDF tidak dapat dijalankan di peramban ini. Perbarui peramban atau gunakan format Excel.'); }
  if (!lib().API.autoTable) await loadScript(AUTOTABLE_URL);
  if (!lib().API.autoTable) { delete __scripts[AUTOTABLE_URL]; throw new Error('Pustaka tabel PDF gagal dimuat. Muat ulang halaman lalu coba lagi.'); }
  return lib();
}
/** Kolom ekspor. y = hanya Admin Yayasan (data tidak dikirim ke Admin Sekolah) · t = teks di Excel · pdf = ikut PDF */
function pegExportCols(isY) {
  const tp = p => tanggalPensiun(p.TglLahir, jenisPegawai(p));
  return [
    { h: 'NRP', v: p => p.NRP, w: 14, t: 1, pdf: 1, pw: 19 },
    { h: 'Nama Lengkap', v: p => p.Nama, w: 34, pdf: 1, pw: 44 },
    { h: 'Unit', v: p => p.Unit, w: 9, unit: 1 },
    { h: 'Jabatan', v: p => p.Jabatan || '', w: 24, pdf: 1, pw: 28 },
    { h: 'Jenis Pegawai', ph: 'Jenis', v: p => jenisPegawai(p), w: 13, pdf: 1, pw: 14 },
    { h: 'Status Kepegawaian', ph: 'Kepegawaian', v: p => p.StatusKepegawaian || '', w: 18, pdf: 1, pw: 19 },
    { h: 'Golongan', ph: 'Gol.', v: p => p.Golongan || '', w: 10, y: 1, pdf: 1, pw: 9 },
    { h: 'Tanggal Lahir', ph: 'Tgl. Lahir', v: p => ymdToDmy(p.TglLahir), w: 13, t: 1, y: 1, pdf: 1, pw: 16 },
    { h: 'Usia', v: p => usia(p.TglLahir), w: 6, y: 1 },
    { h: 'Tahun Masuk', ph: 'Masuk', v: p => p.TahunMasuk || '', w: 12, t: 1, pdf: 1, pw: 11 },
    { h: 'Lama Kerja', v: p => lamaKerja(p.TahunMasuk), w: 18, pdf: 1, pw: 16 },
    { h: 'Tanggal Pensiun', ph: 'Pensiun', v: p => ymdToDmy(tp(p)), w: 15, t: 1, y: 1, pdf: 1, pw: 16 },
    { h: 'Email', v: p => p.Email || '', w: 32, pdf: 1 },
    { h: 'No. WhatsApp', ph: 'No. WhatsApp', v: p => fmtWA(p.NoWA), w: 16, t: 1, pdf: 1, pw: 21 },
    { h: 'Bank & No. Rekening', v: p => p.BankRekening || '', w: 22, t: 1, y: 1 },
    { h: 'Status', v: p => p.Status || '', w: 10, pdf: 1, pw: 13 }
  ].filter(c => isY || !c.y);
}
/** Data sesuai pilihan, urut unit (urutan resmi) lalu nama. */
function pegExportList(unit, status) {
  const order = {}; (App.d.units || []).forEach((u, i) => order[u] = i);
  return (App.d.pegawai || []).filter(p => (!unit || p.Unit === unit) && (!status || p.Status === status))
    .sort((a, b) => ((order[a.Unit] ?? 99) - (order[b.Unit] ?? 99)) || String(a.Nama).localeCompare(String(b.Nama), 'id', { numeric: true, sensitivity: 'base' }));
}
const tglPanjang = d => d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
const pegStatusLabel = s => s === 'Aktif' ? 'Pegawai aktif' : s === 'Nonaktif' ? 'Pegawai nonaktif' : 'Aktif & nonaktif';
const pegFileName = (unit, status, ext) => 'Data_Pegawai_' + (unit || 'Seluruh_Unit').replace(/\W+/g, '_') + (status ? '_' + status : '') + '_' + new Date().toISOString().slice(0, 10) + '.' + ext;
function pegRekap(list, units) {
  const guru = p => jenisPegawai(p) === 'Guru';
  return units.map(u => { const a = list.filter(p => p.Unit === u); return [u, App.d.unitNames[u] || u, a.filter(guru).length, a.filter(p => !guru(p)).length, a.filter(p => p.Status === 'Aktif').length, a.filter(p => p.Status !== 'Aktif').length, a.length]; });
}

function pegExportDialog(fmt) {
  const d = App.d, isY = App.role === ROLE.Y;
  if (!isY && App.role !== ROLE.S) return;
  const units = isY ? d.units : [App.user.unit];
  const curU = isY ? ($('#pegUnit').value || '') : App.user.unit, curS = $('#pegStatus').value || '';
  const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
  const fmtOpt = (v, icon, title, sub) => '<label class="check-row"><input type="radio" name="format" value="' + v + '"' + (v === fmt ? ' checked' : '') + '><i class="bi ' + icon + '"></i><span><b>' + title + '</b><small>' + sub + '</small></span></label>';
  openForm({
    title: 'Unduh Data Pegawai', submit: 'Unduh',
    body: '<div class="row g-3">' +
      '<div class="col-md-7"><label class="form-label" for="exUnit">Unit</label><select id="exUnit" name="unit" class="form-select"' + (isY ? '' : ' disabled') + '>' +
        (isY ? opt('', 'Seluruh Unit (' + units.length + ' unit)', curU) : '') + units.map(u => opt(u, (d.unitNames[u] || u) + ' (' + u + ')', curU)).join('') + '</select>' +
        (isY ? '' : '<div class="tiny text-muted-2 mt-1">Admin Sekolah hanya dapat mengunduh data unitnya sendiri.</div>') + '</div>' +
      '<div class="col-md-5"><label class="form-label" for="exStatus">Status</label><select id="exStatus" name="status" class="form-select">' +
        opt('', 'Aktif & Nonaktif', curS) + opt('Aktif', 'Aktif saja', curS) + opt('Nonaktif', 'Nonaktif saja', curS) + '</select></div>' +
      '<div class="col-12"><span class="form-label d-block">Format</span><div class="ex-fmt">' +
        fmtOpt('xlsx', 'bi-file-earmark-excel', 'Excel (.xlsx)', 'Bisa difilter, diolah & dicetak ulang') +
        fmtOpt('pdf', 'bi-file-earmark-pdf', 'PDF', 'Siap cetak · A4 mendatar · kop yayasan') + '</div></div>' +
      '<div class="col-12"><div class="alert-soft info small mb-0" id="exInfo" aria-live="polite"></div></div></div>',
    onOpen: form => {
      const upd = () => {
        const u = isY ? $('#exUnit').value : App.user.unit, s = $('#exStatus').value, f = (form.querySelector('[name=format]:checked') || {}).value || 'xlsx';
        const n = pegExportList(u, s).length;
        const isi = !n ? '<span class="text-danger"><i class="bi bi-exclamation-circle"></i> Tidak ada pegawai sesuai pilihan.</span>'
          : '<i class="bi bi-people"></i> <b>' + fmtNum(n) + ' pegawai</b> akan diunduh' + (u ? ' dari ' + esc(d.unitNames[u] || u) : ' dari seluruh unit') + '.' +
            (!u ? (f === 'pdf' ? ' Halaman pertama berisi rekap per unit, lalu tiap unit dimulai di halaman baru.' : ' Berisi lembar Rekap, Seluruh Unit, dan satu lembar per unit.') : '') +
            (isY && f === 'pdf' ? '<div class="tiny text-muted-2 mt-1">Nomor rekening tidak dicetak di PDF. Gunakan Excel bila diperlukan.</div>' : '');
        $('#exInfo').innerHTML = isi + '<div class="tiny text-muted-2 mt-1"><i class="bi bi-shield-lock"></i> Berkas memuat data pribadi pegawai. Simpan dengan aman dan jangan disebarkan.</div>';
      };
      form.addEventListener('change', upd); upd();
    },
    onSubmit: async data => {
      const unit = isY ? (data.unit || '') : App.user.unit, status = data.status || '', format = data.format === 'pdf' ? 'pdf' : 'xlsx';
      const list = pegExportList(unit, status);
      if (!list.length) throw new Error('Tidak ada pegawai sesuai pilihan.');
      const o = { unit: unit, status: status, isY: isY, units: unit ? [unit] : d.units };
      if (format === 'pdf') await exportPegawaiPdf(list, o); else exportPegawaiXlsx(list, o);
      apiSilent('apiCatatUnduhPegawai', { format: format, unit: unit, status: status, jumlah: list.length }).catch(() => { });
      toast('Data ' + fmtNum(list.length) + ' pegawai diunduh (' + (format === 'pdf' ? 'PDF' : 'Excel') + ').', 'success');
    }
  });
}

function exportPegawaiXlsx(list, o) {
  if (!window.XLSX) throw new Error('Pustaka Excel masih dimuat, coba sesaat lagi.');
  const d = App.d, st = d.settings || {};
  const cols = pegExportCols(o.isY), head = ['No'].concat(cols.map(c => c.h));
  const judul = 'DATA PEGAWAI — ' + String(st.namaYayasan || st.singkatan || 'YASMA PB. Soedirman').toUpperCase();
  const per = 'Per ' + tglPanjang(new Date()), stLabel = pegStatusLabel(o.status);
  const wb = XLSX.utils.book_new();
  const merge = (r, n) => ({ s: { r: r, c: 0 }, e: { r: r, c: n - 1 } });
  const addSheet = (name, label, rows) => {
    const aoa = [[judul], [label + ' · ' + stLabel + ' · ' + per + ' · ' + rows.length + ' pegawai'], [], head]
      .concat(rows.map((p, i) => [i + 1].concat(cols.map(c => { const v = c.v(p); return v === undefined || v === null ? '' : v; }))));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    cols.forEach((c, ci) => { if (!c.t) return; for (let r = 4; r < aoa.length; r++) { const cell = ws[XLSX.utils.encode_cell({ r: r, c: ci + 1 })]; if (cell) { cell.t = 's'; cell.v = String(cell.v); cell.z = '@'; } } });
    ws['!cols'] = [{ wch: 5 }].concat(cols.map(c => ({ wch: c.w })));
    ws['!merges'] = [merge(0, head.length), merge(1, head.length)];
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3 + Math.max(1, rows.length), c: head.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };
  if (!o.unit) {
    const rk = pegRekap(list, o.units), tot = [2, 3, 4, 5, 6].map(i => rk.reduce((a, r) => a + r[i], 0));
    const rh = ['Kode', 'Nama Unit', 'Guru', 'Karyawan', 'Aktif', 'Nonaktif', 'Jumlah'];
    const ws = XLSX.utils.aoa_to_sheet([[judul], ['Rekap per unit · ' + stLabel + ' · ' + per], [], rh].concat(rk).concat([['', 'TOTAL'].concat(tot)]));
    ws['!cols'] = [{ wch: 11 }, { wch: 32 }, { wch: 9 }, { wch: 10 }, { wch: 9 }, { wch: 10 }, { wch: 9 }];
    ws['!merges'] = [merge(0, rh.length), merge(1, rh.length)];
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap');
    addSheet('Seluruh Unit', 'Seluruh unit (' + o.units.length + ' unit)', list);
    o.units.forEach(u => addSheet(u, 'Unit ' + (d.unitNames[u] || u) + ' (' + u + ')', list.filter(p => p.Unit === u)));
  } else {
    addSheet(o.unit, 'Unit ' + (d.unitNames[o.unit] || o.unit) + ' (' + o.unit + ')', list);
  }
  XLSX.writeFile(wb, pegFileName(o.unit, o.status, 'xlsx'));
}

/** Teks aman untuk font standar PDF (Latin-1). */
const pdfTxt = v => String(v === undefined || v === null ? '' : v).replace(/[–—−]/g, '-').replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[•‧]/g, '·').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');
async function pdfLogo(src) {
  src = String(src || '');
  const fmtOf = u => /^data:image\/png/i.test(u) ? 'PNG' : /^data:image\/jpe?g/i.test(u) ? 'JPEG' : '';
  if (fmtOf(src)) return { data: src, fmt: fmtOf(src) };
  if (!/^https?:\/\//i.test(src)) return null;
  try { // logo dari URL: hanya bila server mengizinkan CORS
    const blob = await (await fetch(src, { mode: 'cors' })).blob();
    const uri = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    return fmtOf(uri) ? { data: uri, fmt: fmtOf(uri) } : null;
  } catch (e) { return null; }
}
async function exportPegawaiPdf(list, o) {
  const JsPDF = await ensurePdfLib();
  const d = App.d, st = d.settings || {};
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 10, TOP = 31;
  const GREEN = [30, 77, 54], GOLD = [217, 165, 32], MUTED = [95, 105, 100];
  const logo = await pdfLogo(st.logo);
  const yayasan = pdfTxt(st.namaYayasan || st.singkatan || 'YASMA PB. Soedirman');
  const now = new Date(), stLabel = pegStatusLabel(o.status);
  const cols = pegExportCols(o.isY).filter(c => c.pdf);
  doc.setProperties({ title: 'Data Pegawai - ' + yayasan, subject: 'Data Pegawai', creator: 'Portal Slip Gaji ' + pdfTxt(st.singkatan || '') });

  const guruN = a => a.filter(p => jenisPegawai(p) === 'Guru').length;
  const ringkas = a => fmtNum(a.length) + ' pegawai  ·  ' + guruN(a) + ' guru, ' + (a.length - guruN(a)) + ' karyawan  ·  ' + a.filter(p => p.Status === 'Aktif').length + ' aktif, ' + a.filter(p => p.Status !== 'Aktif').length + ' nonaktif';
  const at = opts => doc.autoTable(Object.assign({ margin: { top: TOP, left: M, right: M, bottom: 13 }, theme: 'grid' }, opts));
  const tabelPegawai = (rows, startY) => at({
    startY: startY,
    head: [['No'].concat(cols.map(c => pdfTxt(c.ph || c.h)))],
    body: rows.map((p, i) => [i + 1].concat(cols.map(c => pdfTxt(c.v(p))))),
    styles: { font: 'helvetica', fontSize: 7, cellPadding: { top: 1.3, bottom: 1.3, left: 1.2, right: 1.2 }, lineColor: [214, 222, 217], lineWidth: 0.15, textColor: [33, 37, 41], valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold', fontSize: 7, halign: 'left' },
    alternateRowStyles: { fillColor: [245, 249, 246] },
    columnStyles: Object.assign({ 0: { cellWidth: 8, halign: 'right' } }, ...cols.map((c, i) => c.pw ? { [i + 1]: { cellWidth: c.pw } } : {})),
    didParseCell: h => {
      if (h.section !== 'body') return;
      const p = rows[h.row.index];
      if (p && p.Status !== 'Aktif') h.cell.styles.textColor = [150, 150, 150];
      if (h.column.index === 1) h.cell.styles.font = 'courier';
    }
  });
  const judul = (txt, sub, y) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...GREEN); doc.text(pdfTxt(txt), W / 2, y, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED); doc.text(pdfTxt(sub), W / 2, y + 5.5, { align: 'center' });
  };
  const subJudul = (txt, info, y) => {
    doc.setFillColor(...GREEN); doc.rect(M, y - 4.2, 1.4, 5.6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...GREEN); doc.text(pdfTxt(txt), M + 3.5, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(pdfTxt(info), W - M, y, { align: 'right' });
  };

  const unitNama = u => (d.unitNames[u] || u) + ' (' + u + ')';
  judul('DATA PEGAWAI', (o.unit ? '' : 'Seluruh Unit  ·  ') + stLabel + '  ·  Per ' + tglPanjang(now), TOP + 3);
  if (!o.unit) {
    const rk = pegRekap(list, o.units), tot = [2, 3, 4, 5, 6].map(i => rk.reduce((a, r) => a + r[i], 0));
    subJudul('Rekap per Unit', ringkas(list), TOP + 17);
    at({
      startY: TOP + 20, head: [['Kode', 'Nama Unit', 'Guru', 'Karyawan', 'Aktif', 'Nonaktif', 'Jumlah']],
      body: rk.map(r => r.map(pdfTxt)), foot: [['', 'TOTAL'].concat(tot.map(String))], showFoot: 'lastPage',
      styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [214, 222, 217], lineWidth: 0.15, textColor: [33, 37, 41] },
      headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold' }, footStyles: { fillColor: [232, 240, 235], textColor: GREEN, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 22, font: 'courier' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } },
      tableWidth: 170, margin: { top: TOP, left: (W - 170) / 2, right: (W - 170) / 2, bottom: 13 },
      didParseCell: h => { if (h.column.index >= 2) h.cell.styles.halign = 'right'; }
    });
    o.units.forEach(u => {
      const rows = list.filter(p => p.Unit === u);
      if (!rows.length) return;
      doc.addPage();
      subJudul('Unit ' + unitNama(u), ringkas(rows), TOP + 4);
      tabelPegawai(rows, TOP + 7);
    });
  } else {
    subJudul('Unit ' + unitNama(o.unit), ringkas(list), TOP + 17);
    tabelPegawai(list, TOP + 20);
  }

  // Kop & kaki halaman di setiap halaman
  const n = doc.getNumberOfPages();
  const dicetak = 'Dicetak ' + tglPanjang(now) + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ' WIB oleh ' + (App.user.nama || App.user.id || '-');
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    let x = M;
    if (logo) { try { doc.addImage(logo.data, logo.fmt, M, 7, 15, 15, 'logo', 'FAST'); x = M + 18.5; } catch (e) { } }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13.5); doc.setTextColor(...GREEN); doc.text(yayasan, x, 13.2);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
    const kontak = [st.telepon ? 'Telp. ' + st.telepon : '', st.email ? st.email : ''].filter(Boolean).join('   ·   ');
    doc.text(pdfTxt('Data Pegawai Guru & Tenaga Kependidikan' + (kontak ? '   ·   ' + kontak : '')), x, 18.6);
    doc.setDrawColor(...GREEN); doc.setLineWidth(0.7); doc.line(M, 24, W - M, 24);
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.3); doc.line(M, 25.3, W - M, 25.3);
    doc.setDrawColor(214, 222, 217); doc.setLineWidth(0.2); doc.line(M, H - 9.5, W - M, H - 9.5);
    doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text(pdfTxt(dicetak), M, H - 6);
    doc.text('Dokumen internal - memuat data pribadi pegawai', W / 2, H - 6, { align: 'center' });
    doc.text('Halaman ' + i + ' dari ' + n, W - M, H - 6, { align: 'right' });
  }
  downloadBlob(doc.output('blob'), pegFileName(o.unit, o.status, 'pdf'));
}

/**
 * Hapus permanen data pegawai: 'nrp' (per orang) | 'unit' | 'all'.
 * Lapisan pengaman: ringkasan dampak → (unit/semua) ketik teks konfirmasi + kata sandi admin
 * → cadangan Excel diunduh di browser + cadangan CSV di Drive → baru dihapus di server.
 */
async function deletePegawai(scope, value) {
  const d = App.d;
  const job = d.dispatch && d.dispatch.job;
  if (job && (job.status === 'BERJALAN' || job.status === 'KUOTA')) { toast('Pengiriman slip sedang berjalan. Hapus data setelah pengiriman selesai.', 'warning'); return; }
  const unitSel = scope === 'unit' ? '<label class="form-label" for="delUnit">Unit yang dihapus</label><select id="delUnit" class="form-select mb-3">' + d.units.map(u => { const n = d.pegawai.filter(p => p.Unit === u).length; return '<option value="' + u + '"' + (n ? '' : ' disabled') + '>' + esc(d.unitNames[u] || u) + ' — ' + n + ' pegawai</option>'; }).join('') + '</select>' : '';
  const targets = () => {
    if (scope === 'all') return d.pegawai.slice();
    if (scope === 'unit') { const u = $('#delUnit') ? $('#delUnit').value : value; return d.pegawai.filter(p => p.Unit === u); }
    return d.pegawai.filter(p => p.NRP === value);
  };
  if (scope === 'unit' && !value) value = (d.units.find(u => d.pegawai.some(p => p.Unit === u)) || '');
  if (!d.pegawai.length) { toast('Data pegawai sudah kosong.', 'warning'); return; }
  const expectText = () => scope === 'all' ? 'HAPUS SEMUA' : 'HAPUS ' + ($('#delUnit') ? $('#delUnit').value : value);
  const summary = () => {
    const t = targets(); const set = {}; t.forEach(p => set[p.NRP] = 1);
    const slips = (d.slips || []).filter(x => set[x.nrp]).length;
    const akun = (d.akun || []).filter(a => a.peran === ROLE.P && set[a.id]).length;
    const draft = (d.slips || []).filter(x => set[x.nrp] && x.sk !== 'Terkirim' && (App.idx.per[x.p] || {}).status === 'Draft').length;
    return '<div class="kv-list"><div><span>Data pegawai dihapus</span><b class="text-danger">' + t.length + ' orang</b></div><div><span>Akun portal ikut dihapus</span><b class="text-danger">' + akun + ' akun</b></div><div><span>Riwayat slip & PDF</span><b>' + slips + ' slip tetap diarsipkan</b></div></div>' +
      (draft ? '<div class="alert-soft warn small mt-2"><i class="bi bi-exclamation-triangle"></i> ' + draft + ' baris di rekap Draft akan menjadi "NRP tidak terdaftar" saat divalidasi ulang.</div>' : '');
  };
  let body;
  if (scope === 'nrp') {
    const p = d.pegawai.find(x => x.NRP === value); if (!p) return;
    body = '<div class="card-app soft mb-3"><b>' + esc(p.Nama) + '</b><div class="small text-muted-2"><span class="mono">NRP ' + esc(p.NRP) + '</span> · ' + esc(p.Unit) + ' · ' + esc(p.Email) + '</div></div>' + summary() +
      '<div class="alert-soft info small mt-3"><i class="bi bi-lightbulb"></i> Pegawai keluar/pensiun? Gunakan <b>Nonaktifkan</b> <i class="bi bi-person-dash"></i> — data tetap tersimpan dan dapat diaktifkan kembali. Hapus permanen hanya untuk data salah input/duplikat.</div>' +
      '<p class="small text-muted-2 mt-2 mb-0">Cadangan CSV otomatis disimpan di Drive (folder <i>Cadangan Data Pegawai</i>).</p>';
  } else {
    body = unitSel + '<div id="delSummary">' + summary() + '</div>' +
      '<div class="alert-soft danger small mt-3"><i class="bi bi-exclamation-octagon"></i> <b>Tindakan permanen.</b> Pegawai tidak dapat login lagi. Untuk mengembalikan, impor ulang berkas cadangan.</div>' +
      '<label class="check-row mt-3"><input type="checkbox" id="delBackup" checked> <span>Unduh cadangan Excel (format templat impor) sebelum menghapus <span class="tiny text-muted-2 d-block">Cadangan CSV juga otomatis disimpan di Drive.</span></span></label>' +
      '<label class="form-label mt-3" for="delConfirm">Ketik <span class="mono text-danger" id="delExpect">' + esc(expectText()) + '</span> untuk konfirmasi</label><input id="delConfirm" class="form-control mono" autocomplete="off" spellcheck="false">' +
      '<label class="form-label mt-3" for="delPass">Kata sandi Anda (verifikasi Admin Yayasan)</label><div class="input-icon"><i class="bi bi-key"></i><input id="delPass" type="password" class="form-control" autocomplete="current-password"></div>';
  }
  const pending = confirmBox({
    title: scope === 'all' ? 'Hapus SEMUA Data Pegawai' : scope === 'unit' ? 'Hapus Pegawai per Unit' : 'Hapus Pegawai Permanen',
    sub: scope === 'nrp' ? 'Data master & akun portal dihapus' : 'Memerlukan konfirmasi berlapis', icon: 'bi-trash3', ok: 'Hapus Permanen', okCls: 'btn-danger-soft',
    body: body,
    validate: () => {
      if (scope === 'nrp') return true;
      if (!targets().length) return 'Tidak ada pegawai pada pilihan ini.';
      if ($('#delConfirm').value.trim().toUpperCase() !== expectText()) return 'Ketik persis: ' + expectText();
      if (!$('#delPass').value) return 'Masukkan kata sandi Anda.';
      return true;
    },
    collect: () => scope === 'nrp' ? { v: value } : { v: scope === 'unit' ? $('#delUnit').value : '', confirm: $('#delConfirm').value.trim(), pass: $('#delPass').value, backup: $('#delBackup').checked, list: targets() },
    // ringkasan & teks konfirmasi ikut berubah saat unit diganti
    onOpen: () => { const us = $('#delUnit'); if (!us) return; if (value) us.value = value; const upd = () => { $('#delSummary').innerHTML = summary(); $('#delExpect').textContent = expectText(); $('#delConfirm').value = ''; }; upd(); us.addEventListener('change', upd); }
  });
  const r = await pending;
  if (!r) return;
  if (r.backup && r.list && r.list.length) {
    try { downloadPegawaiTemplate('data', r.list, 'Cadangan_Pegawai_' + (scope === 'all' ? 'SEMUA' : r.v) + '_' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + '.xlsx'); }
    catch (e) { if (!(await confirmBox({ title: 'Cadangan gagal diunduh', icon: 'bi-exclamation-triangle', body: 'Lanjutkan penghapusan? Cadangan CSV tetap disimpan di Drive oleh server.', ok: 'Tetap Hapus', okCls: 'btn-danger-soft' }))) return; }
  }
  try {
    const res = await api('apiDeletePegawai', scope, r.v, r.pass || '', r.confirm || '');
    d.pegawai = res.pegawai; d.akun = res.akun; applyBoot(d);
    $('#portalPegList').innerHTML = ''; App.ui.portalNrp = null;
    App.ui.pages.peg = { page: 1 };
    toast(res.deleted + ' pegawai & ' + res.akunDeleted + ' akun dihapus. ' + res.slipsKept + ' slip tetap di arsip. Cadangan: ' + res.backupName, 'success', 'Data dihapus');
    rerender();
  } catch (e) { fail(e); }
}
async function importPegawai(file) {
  if (!file || !window.XLSX) return;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const all = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
    const nrpKey = r => { const k = Object.keys(r).find(x => /^(nrp|nip)\b/i.test(x.trim())); return k ? String(r[k]).trim() : ''; };
    const rows = all.filter(r => Object.values(r).some(v => String(v).trim() !== ''));
    const contoh = rows.filter(r => /^contoh/i.test(nrpKey(r))).length;
    // __baris = nomor baris asli di Excel (agar laporan baris dilewati akurat)
    const real = rows.filter(r => !/^contoh/i.test(nrpKey(r))).map(r => Object.assign({ __baris: (r.__rowNum__ || 0) + 1 }, r));
    if (!real.length) throw new Error(contoh ? 'Berkas hanya berisi baris contoh. Isi data pegawai mulai baris 2 lalu impor lagi.' : 'Berkas kosong atau kolom NRP tidak ditemukan. Gunakan menu Templat Impor.');
    if (!all.length || !Object.keys(all[0]).some(k => /^(nrp|nip)\b/i.test(k.trim()))) throw new Error('Kolom "NRP" tidak ditemukan pada sheet pertama. Gunakan menu Templat Impor.');
    const baru = real.filter(r => nrpKey(r) && !App.idx.peg[nrpKey(r)]).length, ubah = real.filter(r => App.idx.peg[nrpKey(r)]).length;
    if (!(await confirmBox({ title: 'Impor ' + real.length + ' baris pegawai?', sub: file.name, icon: 'bi-file-earmark-arrow-up', iconOk: true,
      body: '<div class="kv-list"><div><span>Pegawai baru (ditambahkan + akun portal)</span><b>' + baru + '</b></div><div><span>NRP sudah ada (diperbarui)</span><b>' + ubah + '</b></div>' + (contoh ? '<div><span>Baris contoh (diabaikan)</span><b>' + contoh + '</b></div>' : '') + '</div><p class="small text-muted-2 mt-3 mb-0">Baris yang tidak valid (NRP/unit/email salah) akan dilewati dan dilaporkan setelah impor.</p>', ok: 'Impor Sekarang' }))) return;
    const res = await api('apiImportPegawai', real);
    App.d.pegawai = res.pegawai; App.d.akun = res.akun; applyBoot(App.d);
    $('#portalPegList').innerHTML = '';
    toast(res.added + ' ditambahkan, ' + res.updated + ' diperbarui, ' + res.skipped.length + ' dilewati.', res.skipped.length ? 'warning' : 'success', 'Impor selesai');
    if (res.skipped.length) confirmBox({ title: 'Baris dilewati', icon: 'bi-info-circle', body: '<div class="table-responsive" style="max-height:50vh"><table class="table-app compact"><thead><tr><th>Baris</th><th>NRP</th><th>Alasan</th></tr></thead><tbody>' + res.skipped.map(s => '<tr><td>' + s.baris + '</td><td class="mono">' + esc(s.nrp) + '</td><td>' + esc(s.alasan) + '</td></tr>').join('') + '</tbody></table></div><p class="small mt-2 mb-0">Gunakan tombol <b>Kirim Kredensial</b> untuk mengirim sandi sementara ke pegawai baru.</p>', ok: 'Mengerti', noCancel: true });
    rerender();
  } catch (e) { fail(e); } finally { $('#importPegInput').value = ''; }
}

// ── W-09 RIWAYAT + AUDIT ──────────────────────────────────────
RENDER.riwayat = function () {
  const d = App.d, isY = App.role === ROLE.Y;
  $('#rwScope').textContent = isY ? '· SEMUA UNIT' : '· UNIT ' + App.user.unit + ' · ZERO-SALARY';
  const ps = $('#rwPeriode');
  const want = App.ui.rwPeriode !== undefined ? App.ui.rwPeriode : ((latestPeriode(p => p.status !== 'Draft') || latestPeriode() || {}).id || '');
  periodeOptions(ps, d.periode, want, 'Semua Periode');
  const us = $('#rwUnit'); if (!us.options.length) unitOptions(us, true, isY ? '' : App.user.unit); us.hidden = !isY;
  const all = (d.slips || []).filter(s => s.sk !== 'Draft' || isY);
  const scope = all.filter(s => !ps.value || s.p === ps.value);
  const c = slipCounts(scope.filter(s => s.sk !== 'Draft'));
  const locked = (d.akun || []).filter(a => a.kunci).length;
  $('#rwKpi').innerHTML = kpi('Total Transmisi', fmtNum(c.terkirim + c.gagal + c.menunggu) + ' <small>/ ' + fmtNum(isY ? scope.length : d.pegawai.length) + '</small>', 'bi-arrow-left-right', '<div class="k-bar w-100"><span style="width:' + pct(c.terkirim, c.total) + '%"></span></div><span>● ' + c.terkirim + ' sah (' + pct(c.terkirim, c.total) + '%)</span><span class="text-danger">● ' + c.gagal + ' kendala</span>') +
    kpi('Tingkat Keberhasilan', pct(c.terkirim, c.total) + '%', 'bi-graph-up-arrow', '<span>' + c.menunggu + ' masih dalam antrean</span>') +
    kpi(isY ? 'Total THP Terkirim' : 'Unduhan Slip (Log)', isY ? fmtShortRp(scope.filter(s => s.sk === 'Terkirim').reduce((a, s) => a + (s.thp || 0), 0)) : fmtNum((d.audit || []).filter(a => /UNDUH SLIP/.test(a.Aksi)).length), isY ? 'bi-wallet2' : 'bi-file-earmark-arrow-down', isY ? '<span>Periode terpilih</span>' : '<span>Dari log audit unit</span>', 'gold') +
    kpi('Tindakan Diperlukan', String(c.gagal + locked).padStart(2, '0') + ' <small>Kasus</small>', 'bi-exclamation-diamond', '<span><i class="bi bi-envelope-x"></i> ' + c.gagal + ' bounce</span><span><i class="bi bi-lock"></i> ' + locked + ' akun terkunci</span>', (c.gagal + locked) ? 'alert' : '');
  const q = $('#rwSearch').value.trim().toLowerCase(), u = us.value, s = $('#rwStatus').value, prob = $('#rwProblem').checked;
  const rows = scope.filter(x => (!q || (x.nrp + ' ' + x.nama).toLowerCase().indexOf(q) >= 0) && (!u || x.unit === u) && (!s || x.sk === s) && (!prob || x.sk === 'Gagal' || (App.idx.akun[String(x.nrp).toLowerCase()] || {}).kunci))
    .sort((a, b) => String(b.tk || '').localeCompare(String(a.tk || '')) || a.nama.localeCompare(b.nama));
  renderTable('rw', $('#rwTable'), $('#rwPager'), [
    { h: 'NRP & Pegawai', main: true, r: x => { const a = App.idx.akun[String(x.nrp).toLowerCase()] || {}, wa = (App.idx.peg[x.nrp] || {}).NoWA; return '<div class="t-name">' + esc(x.nama) + (x.sk === 'Gagal' ? ' <span class="status bad">Butuh koreksi</span>' : '') + (a.kunci ? ' <span class="status gold">Akun terkunci</span>' : '') + '</div><div class="t-sub"><span class="nrp">' + esc(x.nrp) + '</span> ' + esc(x.email) + (x.sw && x.sw !== 'Draft' && wa ? ' · <i class="bi bi-whatsapp"></i> ' + esc(fmtWA(wa)) : '') + '</div>'; } },
    { h: 'Unit · Jabatan', r: x => unitPill(x.unit) + '<div class="t-sub">' + esc(x.jab || '') + '</div>' },
    { h: 'Periode & Jenis', r: x => { const p = App.idx.per[x.p]; return '<span class="small">' + esc(periodeShort(p)) + '</span>' + (x.rev ? ' <span class="status gold">Rev #' + x.rev + '</span>' : ''); } },
    { h: 'Status Pengiriman', r: x => statusKanal(x) + (x.sk === 'Gagal' ? '<div class="tiny text-danger mt-1">' + esc(x.err) + '</div>' : x.tk ? '<div class="tiny text-muted-2 mt-1">' + fmtDate(x.tk, true) + '</div>' : '') },
    { h: 'Nominal Gaji', cls: isY ? 'num' : '', r: x => isY ? fmtRp(x.thp) : secret },
    { h: 'Hash PDF', r: x => x.hash ? '<span class="mono tiny">' + esc(x.hash) + '…</span>' : '<span class="tiny text-muted-3">-</span>' },
    { h: 'Aksi', cls: 'actions', r: x => isY ? '<button class="btn btn-ghost btn-xs" data-action="previewSlip" data-id="' + esc(x.id) + '"><i class="bi bi-eye"></i></button> <button class="btn btn-ghost btn-xs" data-action="resendSlip" data-id="' + esc(x.id) + '" title="Kirim ulang"><i class="bi bi-arrow-repeat"></i></button>' : (x.sk === 'Gagal' ? '<a class="btn btn-ghost btn-xs" target="_blank" rel="noopener" href="https://wa.me/' + esc(App.d.settings.wa) + '?text=' + encodeURIComponent('Mohon koreksi kontak slip NRP ' + x.nrp + ' (' + x.nama + ') unit ' + x.unit + ': ' + x.err) + '"><i class="bi bi-whatsapp"></i> Lapor Yayasan</a>' : '') }
  ], rows, { rowCls: x => x.sk === 'Gagal' ? 'row-bad' : (App.idx.akun[String(x.nrp).toLowerCase()] || {}).kunci ? 'row-warn' : '', empty: 'Belum ada riwayat transmisi.' });
  renderAudit();
};
function renderAudit() {
  const d = App.d, au = d.audit || [];
  const alerts = au.filter(a => a.Tingkat !== 'Info').length;
  $('#auditAlertCount').textContent = alerts;
  const ks = $('#auKategori');
  if (ks.options.length <= 1) ks.innerHTML = '<option value="">Semua Kategori</option>' + Array.from(new Set(au.map(a => a.Kategori))).sort().map(k => '<option>' + esc(k) + '</option>').join('');
  // Insiden penguncian aktif
  const locked = (d.akun || []).filter(a => a.kunci);
  $('#lockIncidents').innerHTML = locked.length ? locked.map(a => {
    const tl = au.filter(x => String(x.Subjek).toLowerCase() === String(a.id).toLowerCase() && /GAGAL|SALAH/.test(x.Aksi)).slice(0, 5).reverse();
    return '<div class="incident"><span class="ic"><i class="bi bi-shield-x"></i></span><div class="flex-grow-1 min-w-0"><div class="text-danger fw-bold">INSIDEN TERKINI: Akun Terkunci (Account Locked)</div><span class="status bad my-1">Kritis / High Alert</span><div><b>' + esc(a.nama) + '</b> — ' + esc(a.peran === ROLE.P ? 'Pegawai' : a.peran) + ' ' + esc(a.unit) + ' (NRP/ID: <span class="mono">' + esc(a.id) + '</span>)</div><div class="small text-muted-2">Terkunci s/d ' + fmtDate(a.kunci, true) + ' WIB</div>' +
      (tl.length ? '<div class="timeline">' + tl.map((x, i) => '<div><b>' + fmtDate(x.Waktu, true).split(', ')[1] + ' WIB</b><div class="' + (i === tl.length - 1 ? 'bad' : 'text-danger') + '">● ' + esc(x.Aksi) + '</div><div class="text-muted-2 text-truncate">' + esc(x.Detail) + '</div></div>').join('') + '</div>' : '') + '</div>' +
      '<div class="d-flex gap-2 flex-wrap"><button class="btn btn-ghost btn-sm" data-action="resetPass" data-id="' + esc(a.id) + '"><i class="bi bi-envelope"></i> Kirim Sandi Sementara</button><button class="btn btn-sm" style="background:var(--danger);color:#fff" data-action="unlock" data-id="' + esc(a.id) + '"><i class="bi bi-unlock"></i> Buka Kunci Akun Segera</button></div></div>';
  }).join('') : (App.ui.lastUnlock ? '<div class="incident ok"><span class="ic"><i class="bi bi-shield-check"></i></span><div class="flex-grow-1"><b>Status Keamanan Terkendali — Tidak Ada Akun Terkunci</b><div><span class="status ok my-1">Pemulihan selesai</span></div><div class="small">' + esc(App.ui.lastUnlock.text) + '</div></div><span class="chip chip-outline mono">' + esc(App.ui.lastUnlock.logId) + '</span></div>' : '');
  const q = $('#auSearch').value.trim().toLowerCase(), k = ks.value, t = $('#auTingkat').value;
  const rows = au.filter(a => (!q || (a.IDLog + ' ' + a.Aktor + ' ' + a.Aksi + ' ' + a.Detail + ' ' + a.Subjek).toLowerCase().indexOf(q) >= 0) && (!k || a.Kategori === k) && (!t || a.Tingkat === t));
  const lv = x => x.Tingkat === 'Kritis' ? 'bad' : x.Tingkat === 'Peringatan' ? 'warn' : 'ok';
  renderTable('au', $('#auTable'), $('#auPager'), [
    { h: 'Timestamp & ID Log', r: a => '<span class="mono tiny">' + fmtDate(a.Waktu, true) + ' WIB</span><div class="mono tiny ' + (a.Tingkat === 'Kritis' ? 'text-danger' : 'text-muted-2') + '">LOG-' + esc(a.IDLog) + '</div>' },
    { h: 'Pelaku / Subjek', main: true, r: a => '<div class="t-name">' + esc(a.Aktor) + '</div><div class="t-sub">' + esc(a.Peran) + (a.Unit && a.Unit !== '-' ? ' · ' + esc(a.Unit) : '') + (a.Subjek ? ' · subjek <span class="mono">' + esc(a.Subjek) + '</span>' : '') + '</div>' },
    { h: 'Peristiwa / Aksi', r: a => '<span class="status ' + lv(a) + '">' + esc(a.Aksi) + '</span><div class="small mt-1 ' + (a.Tingkat === 'Kritis' ? 'text-danger' : '') + '">' + esc(a.Detail) + '</div>' },
    { h: 'Kategori', r: a => '<span class="chip chip-info">' + esc(a.Kategori) + '</span>' }
  ], rows, { rowCls: a => a.Tingkat === 'Kritis' ? 'row-bad' : a.Tingkat === 'Peringatan' ? 'row-warn' : '', empty: 'Belum ada catatan log.' });
}

// ── W-10 KELOLA AKUN ──────────────────────────────────────────
RENDER.akun = function () {
  const rb = [['Unggah file Excel rekap gaji', 1, 0, 0], ['Pratinjau data sebelum kirim', 1, 0, 0], ['Kirim slip ke semua / kirim ulang', 1, 0, 0], ['Kelola data pegawai & akun admin', 1, 0, 0], ['Lihat riwayat pengiriman', 'Semua unit', 'Unit sendiri', 0], ['Dasbor grafik', 'Semua unit', 'Unit sendiri (tanpa nominal)', 0], ['Lihat nominal gaji pegawai lain', 1, 0, 0], ['Buka kunci akun pegawai', 1, 'Unit sendiri', 0], ['Lihat & unduh slip gaji', 'Semua', 0, 'Milik sendiri'], ['Ubah kata sandi & PIN', 1, 1, 1]];
  const cell = v => v === 1 ? '<i class="bi bi-check-circle-fill text-success"></i>' : v === 0 ? '<i class="bi bi-x-circle text-muted-3"></i>' : '<span class="small"><i class="bi bi-check-circle-fill text-success"></i> ' + esc(v) + '</span>';
  $('#rbacTable').innerHTML = '<thead><tr><th>Fitur</th><th>Admin Yayasan</th><th>Admin Sekolah</th><th>Pegawai</th></tr></thead><tbody>' + rb.map(r => '<tr><td>' + esc(r[0]) + '</td><td>' + cell(r[1]) + '</td><td>' + cell(r[2]) + '</td><td>' + cell(r[3]) + '</td></tr>').join('') + '</tbody>';
  const q = $('#akSearch').value.trim().toLowerCase(), pr = $('#akPeran').value, k = $('#akKondisi').value;
  const rows = (App.d.akun || []).filter(a => (!q || (a.id + ' ' + a.nama + ' ' + a.email).toLowerCase().indexOf(q) >= 0) && (!pr || a.peran === pr) && (!k || (k === 'kunci' && a.kunci) || (k === 'wajib' && a.wajib) || (k === 'nonaktif' && a.status === 'Nonaktif')))
    .sort((a, b) => (a.peran === ROLE.P) - (b.peran === ROLE.P) || !!b.kunci - !!a.kunci || a.nama.localeCompare(b.nama));
  const roleLbl = { AdminYayasan: '<span class="status gold">Admin Yayasan</span>', AdminSekolah: '<span class="status ok">Admin Sekolah</span>', Pegawai: '<span class="status wait">Pegawai</span>' };
  renderTable('ak', $('#akTable'), $('#akPager'), [
    { h: 'ID Akun', r: a => '<span class="nrp">' + esc(a.id) + '</span>' },
    { h: 'Nama', main: true, r: a => '<div class="t-name">' + esc(a.nama) + '</div><div class="t-sub">' + esc(a.email || '-') + '</div>' },
    { h: 'Peran', r: a => roleLbl[a.peran] || esc(a.peran) },
    { h: 'Unit', r: a => a.unit ? unitPill(a.unit) : '<span class="tiny text-muted-2">Semua</span>' },
    { h: 'Keamanan', r: a => a.status === 'Nonaktif' ? '<span class="status bad">Nonaktif</span>' : a.kunci ? '<span class="status bad"><i class="bi bi-lock"></i> Terkunci</span>' : a.wajib ? '<span class="status warn">Wajib ganti sandi</span>' : '<span class="status ok">Normal' + (a.gagal ? ' · ' + a.gagal + 'x gagal' : '') + '</span>' + (a.peran === ROLE.P || a.pin ? ' <span class="status ' + (a.pin ? 'ok' : 'warn') + '">' + (a.pin ? 'PIN ✓' : 'Tanpa PIN') + '</span>' : '') },
    { h: 'Login Terakhir', r: a => '<span class="tiny">' + fmtDate(a.login, true) + '</span>' },
    { h: 'Aksi', cls: 'actions', r: a => (a.peran !== ROLE.P ? '<button class="btn btn-ghost btn-xs" data-action="editAkun" data-id="' + esc(a.id) + '" aria-label="Ubah"><i class="bi bi-pencil"></i></button> ' : '') + (a.kunci ? '<button class="btn btn-danger-soft btn-xs" data-action="unlock" data-id="' + esc(a.id) + '"><i class="bi bi-unlock"></i></button> ' : '') + '<button class="btn btn-ghost btn-xs" data-action="resetPass" data-id="' + esc(a.id) + '" title="Reset sandi"><i class="bi bi-key"></i></button> ' + (a.pin ? '<button class="btn btn-ghost btn-xs" data-action="resetPin" data-id="' + esc(a.id) + '" title="Reset PIN dokumen"><i class="bi bi-123"></i></button> ' : '') + (String(a.id).toLowerCase() !== String(App.user.id).toLowerCase() ? '<button class="btn btn-ghost btn-xs" data-action="toggleAkun" data-id="' + esc(a.id) + '" title="' + (a.status === 'Nonaktif' ? 'Aktifkan' : 'Nonaktifkan') + '"><i class="bi ' + (a.status === 'Nonaktif' ? 'bi-toggle-off' : 'bi-toggle-on text-success') + '"></i></button>' : '') }
  ], rows, { rowCls: a => a.kunci ? 'row-bad' : '' });
};
function akunForm(a) {
  const isNew = !a; a = a || { peran: ROLE.S };
  openForm({
    title: isNew ? 'Tambah Akun Admin' : 'Ubah Akun Admin', submit: isNew ? 'Buat Akun' : 'Simpan',
    body: '<div class="row g-3"><div class="col-md-5"><label class="form-label" for="aID">ID Akun <span class="req">*</span></label><input id="aID" name="ID" class="form-control mono" required pattern="[a-z0-9.\\-_]{3,30}" value="' + esc(a.id || '') + '" ' + (isNew ? '' : 'readonly') + ' placeholder="adm-sma"></div>' +
      '<div class="col-md-7"><label class="form-label" for="aNama">Nama <span class="req">*</span></label><input id="aNama" name="Nama" class="form-control" required minlength="3" value="' + esc(a.nama || '') + '"></div>' +
      '<div class="col-md-6"><label class="form-label" for="aPeran">Peran</label><select id="aPeran" name="Peran" class="form-select"><option value="AdminSekolah" ' + (a.peran === ROLE.S ? 'selected' : '') + '>Admin Sekolah</option><option value="AdminYayasan" ' + (a.peran === ROLE.Y ? 'selected' : '') + '>Admin Yayasan</option></select></div>' +
      '<div class="col-md-6"><label class="form-label" for="aUnit">Unit (Admin Sekolah)</label><select id="aUnit" name="Unit" class="form-select">' + App.d.units.map(u => '<option ' + (u === a.unit ? 'selected' : '') + '>' + u + '</option>').join('') + '</select></div>' +
      '<div class="col-md-7"><label class="form-label" for="aEmail">Email (login Google & reset sandi)</label><input id="aEmail" name="Email" type="email" class="form-control" value="' + esc(a.email || '') + '"></div>' +
      '<div class="col-md-5"><label class="form-label" for="aNRP">NRP (opsional)</label><input id="aNRP" name="NRP" class="form-control mono" value="' + esc(a.nrp || '') + '"><div class="tiny text-muted-2 mt-1">Isi agar admin dapat melihat slip pribadinya.</div></div></div>',
    onSubmit: async data => {
      const res = await api('apiSaveAdmin', data, isNew);
      const k = String(res.akun.id).toLowerCase(); const i = App.d.akun.findIndex(x => String(x.id).toLowerCase() === k);
      if (i >= 0) App.d.akun[i] = res.akun; else App.d.akun.push(res.akun); App.idx.akun[k] = res.akun;
      toast('Akun disimpan.', 'success'); rerender();
      if (res.tempPassword) showTempPass(res.akun.nama, res.akun.id, res.tempPassword, false);
    }
  });
}
async function resetPass(id) {
  const a = App.idx.akun[String(id).toLowerCase()] || { id: id, nama: id };
  const choice = await confirmBox({
    title: 'Reset kata sandi?', sub: a.nama + ' · ' + a.id, icon: 'bi-key', ok: 'Reset Sandi',
    body: '<p>Sistem membuat kata sandi sementara baru, membuka kunci, mengeluarkan semua sesi, dan pengguna wajib menggantinya saat login.</p><label class="check-row"><input type="checkbox" id="rpEmail" ' + (a.email ? 'checked' : 'disabled') + '> <span>Kirim sandi sementara ke surel terdaftar <span class="mono small">' + esc(a.email || '(tidak ada surel)') + '</span></span></label>',
    collect: () => ({ email: $('#rpEmail').checked })
  });
  if (!choice) return;
  try {
    const res = await api('apiResetPassword', id, choice.email);
    const k = String(id).toLowerCase(); Object.assign(App.idx.akun[k] || {}, res.akun);
    rerender();
    showTempPass(a.nama, a.id, res.tempPassword, res.emailed);
  } catch (e) { fail(e); }
}
async function unlockAkun(id) {
  const a = App.idx.akun[String(id).toLowerCase()] || { id: id, nama: id };
  const tl = (App.d.audit || []).find(x => String(x.Subjek).toLowerCase() === String(id).toLowerCase() && /LOCKOUT/.test(x.Aksi));
  const choice = await confirmBox({
    title: 'Konfirmasi Pembukaan Kunci Akun', sub: 'Verifikasi identitas & pembukaan status lockout', icon: 'bi-unlock', ok: 'Buka Kunci', okCls: 'btn-primary-app',
    body: '<div class="card-app soft mb-3"><div class="d-flex justify-content-between flex-wrap gap-2"><div><b>' + esc(a.nama) + '</b><div class="small text-muted-2">NRP/ID: <span class="mono">' + esc(a.id) + '</span> · ' + esc(a.unit || '') + '</div></div><span class="status bad"><i class="bi bi-lock"></i> Terkunci otomatis</span></div><div class="row mt-2 small"><div class="col-6"><span class="eyebrow d-block">Email terdaftar</span><span class="mono">' + esc(a.email || '-') + '</span></div><div class="col-6"><span class="eyebrow d-block">Waktu penguncian</span><span class="text-danger">' + (tl ? fmtDate(tl.Waktu, true) : '-') + '</span> (s/d ' + fmtDate(a.kunci, true).split(', ')[1] + ')</div></div>' + (tl ? '<div class="small mt-2"><span class="eyebrow">Telemetri</span> ' + esc(tl.Detail) + '</div>' : '') + '</div>' +
      '<p class="eyebrow">Prosedur Standar Operasional (SOP Tata Usaha)</p><label class="check-row mb-2"><input type="checkbox" class="sop" required> Verifikasi kontak langsung / tatap muka dengan pegawai yang bersangkutan</label><label class="check-row mb-3"><input type="checkbox" class="sop" required> Pastikan perangkat yang digunakan adalah milik pribadi yang sah</label>' +
      '<p class="eyebrow">Pilih Tindakan Akun</p><label class="check-row card-app p-2 mb-2"><input type="radio" name="unl" value="0"> <span><b>Buka kunci akun saja</b><br><span class="small text-muted-2">Pegawai dapat langsung mencoba kata sandi kembali.</span></span></label><label class="check-row card-app p-2" style="border-color:var(--emerald-700)"><input type="radio" name="unl" value="1" checked> <span><b>Buka kunci & kirim sandi sementara</b> <span class="status ok">Direkomendasikan</span><br><span class="small text-muted-2">Sandi sementara dikirim ke surel terdaftar; wajib diganti beserta PIN baru.</span></span></label>' +
      '<div class="alert-soft info small mt-3"><i class="bi bi-shield-check"></i> <b>Log Audit Terintegrasi:</b> tindakan dicatat permanen atas otorisasi ' + esc(App.user.nama) + '.</div>',
    validate: () => $$('#confirmBody .sop').every(x => x.checked) || 'Centang kedua prosedur SOP terlebih dahulu.',
    collect: () => ({ reset: ($('#confirmBody input[name=unl]:checked') || {}).value === '1' })
  });
  if (!choice) return;
  try {
    const res = await api('apiUnlockAccount', id, choice.reset);
    const k = String(id).toLowerCase(); if (App.idx.akun[k]) Object.assign(App.idx.akun[k], res.akun);
    App.ui.lastUnlock = { logId: res.logId, text: 'Akun ' + a.nama + ' (' + a.id + ') telah dibuka' + (choice.reset ? ' dan sandi sementara dikirim' : '') + ' pada ' + fmtDate(new Date().toISOString(), true) + ' WIB.' };
    toast(App.ui.lastUnlock.text, 'success', 'Akun berhasil dibuka');
    if (res.tempPassword) showTempPass(a.nama, a.id, res.tempPassword, res.emailed);
    apiSilent('apiGetAudit').then(au => { App.d.audit = au; if (App.ui.page === 'riwayat') renderAudit(); }).catch(() => { });
    rerender();
  } catch (e) { fail(e); }
}
async function toggleAkun(id) {
  const a = App.idx.akun[String(id).toLowerCase()]; if (!a) return;
  const to = a.status === 'Nonaktif' ? 'Aktif' : 'Nonaktif';
  if (to === 'Nonaktif' && !(await confirmBox({ title: 'Nonaktifkan akun?', sub: a.nama, body: 'Akun tidak dapat login dan semua sesinya dikeluarkan.', ok: 'Nonaktifkan', okCls: 'btn-danger-soft' }))) return;
  const prev = a.status; a.status = to; rerender();
  try { const r = await api('apiSetAkunStatus', id, to); Object.assign(a, r.akun); toast('Akun ' + (to === 'Aktif' ? 'diaktifkan' : 'dinonaktifkan') + '.', 'success'); }
  catch (e) { a.status = prev; rerender(); fail(e); }
}
function showTempPass(nama, id, pass, emailed) {
  confirmBox({ title: 'Kata Sandi Sementara', sub: nama + ' · ' + id, icon: 'bi-key', iconOk: true, noCancel: true, ok: 'Selesai',
    body: '<div class="temp-pass">' + esc(pass) + '</div><button class="btn btn-ghost btn-sm w-100 mt-2" type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(\'' + esc(pass) + '\').then(()=>toast(\'Disalin.\',\'success\'))"><i class="bi bi-copy"></i> Salin</button><p class="small mt-3 mb-0">' + (emailed ? '<i class="bi bi-envelope-check text-success"></i> Juga telah dikirim ke surel terdaftar.' : 'Sampaikan secara langsung/pribadi.') + ' Kata sandi ini hanya ditampilkan sekali dan wajib diganti saat login pertama.</p>' });
}

// ── W-11 MONITORING / DASBOR UNIT ─────────────────────────────
RENDER.monitoring = function () {
  const d = App.d, isY = App.role === ROLE.Y;
  const us = $('#monUnit');
  if (!us.options.length) unitOptions(us, false, isY ? (store.get('monUnit', d.units[3] || d.units[0])) : App.user.unit);
  us.hidden = !isY; if (!isY) us.value = App.user.unit;
  const unit = us.value; store.set('monUnit', unit);
  const ps = $('#monPeriode');
  const pl = d.periode.filter(p => p.status !== 'Draft');
  periodeOptions(ps, pl, App.ui.monPer && App.idx.per[App.ui.monPer] ? App.ui.monPer : (pl[0] || {}).id);
  const per = App.idx.per[ps.value];
  $('#monTitle').textContent = isY ? 'Monitoring Unit — ' + (d.unitNames[unit] || unit) : 'Dasbor Pemantauan Slip Gaji — ' + (d.unitNames[unit] || unit);
  $('#monScope').textContent = '· ' + (d.unitNames[unit] || unit).toUpperCase();
  $('#monPolicy').hidden = isY; $('#monIsoUnit').textContent = unit + ' SAJA';
  const pegU = d.pegawai.filter(p => p.Unit === unit);
  const slips = per ? (App.idx.slipsByPer[per.id] || []).filter(s => s.unit === unit) : [];
  const c = slipCounts(slips);
  const akunU = (d.akun || []).filter(a => a.unit === unit && a.peran === ROLE.P);
  const locked = akunU.filter(a => a.kunci);
  const downloads = new Set((d.audit || []).filter(a => /UNDUH SLIP/.test(a.Aksi) && per && String(a.Detail).indexOf(per.id) === 0).map(a => a.Subjek));
  const dilihat = slips.filter(s => s.lihat || downloads.has(s.nrp)).length; // dibuka via tautan WhatsApp / portal / unduh
  $('#monKpi').innerHTML = kpi('Total Guru & Tendik', pegU.length + ' <small>Pegawai</small>', 'bi-people', '<span>' + pegU.filter(p => /GTY|Tetap/.test(p.StatusKepegawaian)).length + ' tetap · ' + pegU.filter(p => !/GTY|Tetap/.test(p.StatusKepegawaian)).length + ' non-tetap</span>') +
    kpi('Slip Terkirim (' + (per ? BLN3[per.bulan - 1] + ' ' + per.tahun : '-') + ')', c.terkirim + ' <small>/ ' + c.total + ' Slip</small>', 'bi-send-check', '<div class="k-bar w-100"><span style="width:' + pct(c.terkirim, c.total) + '%"></span></div><span class="status ok">' + pct(c.terkirim, c.total) + '% sukses</span>') +
    kpi('Slip Sudah Dilihat', dilihat + ' <small>/ ' + c.terkirim + ' Pegawai</small>', 'bi-eye', '<div class="k-bar w-100"><span style="width:' + pct(dilihat, c.terkirim) + '%"></span></div><span>Dibuka via tautan WhatsApp / portal</span><span>Belum: <b>' + Math.max(0, c.terkirim - dilihat) + '</b></span>') +
    kpi('Butuh Tindakan / Kendala', String(c.gagal + locked.length).padStart(2, '0') + ' <small>Kasus</small>', 'bi-exclamation-triangle', '<span>' + c.gagal + ' gagal kirim + ' + locked.length + ' akun terkunci</span>', (c.gagal + locked.length) ? 'alert' : '');
  // Tren 6 periode
  const hist = pl.slice(0, 6).reverse();
  $('#monTrend').innerHTML = hist.length ? hist.map(p => { const s = (App.idx.slipsByPer[p.id] || []).filter(x => x.unit === unit); const ok = s.filter(x => x.sk === 'Terkirim').length, bad = s.filter(x => x.sk === 'Gagal').length; const w = pct(ok, s.length); return '<div class="hbar"><span>' + BLN3[p.bulan - 1] + ' ' + p.tahun + (p.jenis !== 'BULANAN' ? '*' : '') + '</span><div class="bar"><span class="ok" style="width:' + w + '%">' + ok + '/' + s.length + '</span><span class="bad" style="width:' + pct(bad, s.length) + '%"></span></div><b>' + w + '%</b></div>'; }).join('') + '<p class="tiny text-muted-2 mb-0 mt-1">* THR / Bonus / Revisi. Penyelesaian kendala maks. 1×24 jam sejak dispatch.</p>' : '<div class="empty-state">Belum ada riwayat.</div>';
  const tc = themeColors();
  const vals = [c.terkirim - Math.min(c.terkirim, dilihat), Math.min(c.terkirim, dilihat), c.gagal, c.menunggu + c.draft];
  makeChart('chartMon', { type: 'doughnut', data: { labels: ['Terkirim, belum dilihat', 'Sudah dilihat pegawai', 'Kendala', 'Antrean/Draft'], datasets: [{ data: vals, backgroundColor: [tc.main, tc.gold, tc.danger, '#C9D2CE'], borderColor: tc.surface, borderWidth: 3 }] }, options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } } });
  $('#monDonutCenter').innerHTML = '<div><b>' + c.total + '</b><span>TOTAL SLIP</span></div>';
  $('#monLegend').innerHTML = ['Terkirim, belum dilihat', 'Sudah dilihat pegawai', 'Kendala', 'Antrean/Draft'].map((l, i) => '<div class="legend-item"><span class="sw" style="background:' + [tc.main, tc.gold, tc.danger, '#C9D2CE'][i] + '"></span>' + l + '<b>' + vals[i] + '</b></div>').join('');
  // Kendala
  const kend = slips.filter(s => s.sk === 'Gagal').map(s => ({ t: 'mail', s: s })).concat(locked.map(a => ({ t: 'lock', a: a })));
  $('#monActions').innerHTML = kend.length ? '<div class="d-flex justify-content-between align-items-center mb-2"><h3 class="text-danger"><i class="bi bi-exclamation-octagon"></i> Tindakan Diperlukan Unit (' + kend.length + ' Kendala Aktif)</h3><span class="chip chip-danger">SLA Penanganan Hari Ini</span></div><div class="row g-3">' + kend.slice(0, 6).map((k, i) => k.t === 'mail' ?
    '<div class="col-md-6"><div class="kendala bad"><div class="kh"><span class="lbl">KENDALA ' + String(i + 1).padStart(2, '0') + ' // ' + (k.s.sw === 'Gagal' && k.s.se !== 'Gagal' ? 'WHATSAPP GAGAL' : 'EMAIL BOUNCE') + '</span><span>' + (k.s.sw === 'Gagal' && k.s.se !== 'Gagal' ? 'Gateway' : 'SMTP') + '</span></div><b>' + esc(k.s.nama) + '</b><div class="small mono">NRP ' + esc(k.s.nrp) + '</div><div class="small mt-2"><b class="text-danger">Penyebab:</b> ' + esc(k.s.err) + (k.s.se === 'Gagal' ? ' (' + esc(k.s.email) + ')' : '') + '</div><div class="d-flex gap-2 mt-2 flex-wrap">' + (isY ? (k.s.sw === 'Gagal' ? '<button class="btn btn-primary-app btn-xs" data-action="fixWA" data-id="' + esc(k.s.id) + '"><i class="bi bi-whatsapp"></i> Perbarui No. WA</button>' : '') + (k.s.se === 'Gagal' ? '<button class="btn btn-primary-app btn-xs" data-action="fixEmail" data-id="' + esc(k.s.id) + '"><i class="bi bi-pencil"></i> Perbarui Surel & Kirim Ulang</button>' : '') : '<a class="btn btn-primary-app btn-xs" target="_blank" rel="noopener" href="https://wa.me/' + esc(d.settings.wa) + '?text=' + encodeURIComponent('Koreksi kontak slip NRP ' + k.s.nrp + ' (' + k.s.nama + '): ' + k.s.err) + '"><i class="bi bi-whatsapp"></i> Lapor ke Yayasan</a>') + '</div></div></div>' :
    '<div class="col-md-6"><div class="kendala warn"><div class="kh"><span class="lbl">KENDALA ' + String(i + 1).padStart(2, '0') + ' // AKUN TERKUNCI</span><span>Security Lockout (5x gagal)</span></div><b>' + esc(k.a.nama) + '</b><div class="small mono">NRP ' + esc(k.a.id) + '</div><div class="small mt-2"><b>Penyebab:</b> salah sandi/PIN 5 kali berturut-turut. Terkunci s/d ' + fmtDate(k.a.kunci, true) + '.</div><div class="d-flex gap-2 mt-2 flex-wrap"><button class="btn btn-primary-app btn-xs" data-action="unlock" data-id="' + esc(k.a.id) + '"><i class="bi bi-unlock"></i> Buka Kunci</button><button class="btn btn-ghost btn-xs" data-action="resetPass" data-id="' + esc(k.a.id) + '"><i class="bi bi-key"></i> Reset Sandi</button>' + waLink((App.idx.peg[k.a.id] || {}).NoWA, 'Assalamu\'alaikum, akun portal slip gaji Anda terkunci. Silakan hubungi TU untuk pemulihan.') + '</div></div></div>').join('') + '</div>' : '';
  // Tabel
  const sMap = {}; slips.forEach(s => sMap[s.nrp] = s);
  renderTable('mon', $('#monTable'), $('#monPager'), [
    { h: 'NRP', r: p => '<span class="nrp ' + (sMap[p.NRP] && sMap[p.NRP].sk === 'Gagal' ? 'text-danger' : '') + '">' + esc(p.NRP) + '</span>' },
    { h: 'Nama Lengkap & Jabatan', main: true, r: p => '<div class="t-name">' + esc(p.Nama) + '</div><div class="t-sub">' + esc(p.Jabatan) + (p.NoWA ? ' · <span class="mono">' + esc(fmtWA(p.NoWA)) + '</span>' : '') + '</div>' },
    { h: 'Kepegawaian', r: p => '<span class="status wait">' + esc(p.StatusKepegawaian) + '</span>' + (p.TahunMasuk ? '<div class="t-sub mt-1"><i class="bi bi-box-arrow-in-right"></i> Masuk ' + esc(p.TahunMasuk) + ' · ' + esc(lamaKerja(p.TahunMasuk)) + '</div>' : '') },
    { h: '<i class="bi bi-lock"></i> Nominal THP', cls: isY ? 'num' : '', r: p => isY ? (sMap[p.NRP] ? fmtRp(sMap[p.NRP].thp) : '-') : '<span class="status wait"><i class="bi bi-lock"></i> [Dirahasiakan]</span>' },
    { h: 'Transmisi', r: p => { const s = sMap[p.NRP]; return s ? statusKanal(s) + (s.tk ? '<div class="tiny text-muted-2">' + fmtDate(s.tk, true) + '</div>' : '') : '<span class="tiny text-muted-3">Tidak ada slip</span>'; } },
    { h: 'Akses Portal', r: p => { const a = App.idx.akun[String(p.NRP).toLowerCase()] || {}; return a.kunci ? '<span class="status gold"><i class="bi bi-lock"></i> Terkunci</span>' : a.login ? '<span class="tiny">Login ' + fmtDate(a.login, true) + '</span>' : '<span class="tiny text-muted-3">Belum pernah login</span>'; } },
    { h: 'Dilihat Pegawai', r: p => { const s = sMap[p.NRP]; return s && s.lihat ? '<span class="status ok"><i class="bi bi-eye"></i> Dilihat</span><div class="tiny text-muted-2 mt-1">' + fmtDate(s.lihat, true) + (s.nl ? ' · via tautan' : '') + '</div>' : downloads.has(p.NRP) ? '<span class="status ok">✓ Diunduh</span>' : s && s.sk === 'Terkirim' ? '<span class="tiny text-muted-3">Belum dibuka</span>' : '<span class="tiny text-muted-3">-</span>'; } },
    { h: 'Aksi TU', cls: 'actions', r: p => { const s = sMap[p.NRP], a = App.idx.akun[String(p.NRP).toLowerCase()] || {}; const wa = waLink(p.NoWA, 'Assalamu\'alaikum ' + p.Nama + ', '); if (a.kunci) return '<button class="btn btn-gold btn-xs" data-action="unlock" data-id="' + esc(p.NRP) + '">Reset/Buka</button>'; if (s && s.sk === 'Gagal') { const w = s.sw === 'Gagal' && s.se !== 'Gagal'; return isY ? '<button class="btn btn-danger-soft btn-xs" data-action="' + (w ? 'fixWA' : 'fixEmail') + '" data-id="' + esc(s.id) + '">' + (w ? 'Koreksi No. WA' : 'Koreksi Surel') + '</button>' : '<span class="status bad">Lapor Yayasan</span>'; } return wa + ' <button class="btn btn-ghost btn-xs" data-action="auditFor" data-id="' + esc(p.NRP) + '">Detail Log</button>'; } }
  ], pegU.sort((a, b) => ((sMap[b.NRP] || {}).sk === 'Gagal') - ((sMap[a.NRP] || {}).sk === 'Gagal') || a.Nama.localeCompare(b.Nama)), { rowCls: p => (sMap[p.NRP] || {}).sk === 'Gagal' ? 'row-bad' : (App.idx.akun[String(p.NRP).toLowerCase()] || {}).kunci ? 'row-warn' : '' });
};

// ── W-12 PORTAL PEGAWAI ───────────────────────────────────────
RENDER.portal = function () {
  const isY = App.role === ROLE.Y;
  $('#portalAdminPick').hidden = !isY;
  let list, prof;
  if (isY) {
    const dl = $('#portalPegList'); if (!dl.options.length) dl.innerHTML = App.d.pegawai.map(p => '<option value="' + esc(p.NRP) + '">' + esc(p.Nama + ' · ' + p.Unit) + '</option>').join('');
    const nrp = App.ui.portalNrp || ($('#portalPeg').value = App.ui.portalNrp = (App.d.pegawai[0] || {}).NRP || '');
    prof = App.idx.peg[nrp];
    if (!prof) { $('#portalBody').innerHTML = '<div class="empty-state card-app"><i class="bi bi-person-vcard"></i>Pilih pegawai untuk melihat slipnya.</div>'; return; }
    list = (App.d.slips || []).filter(s => s.nrp === nrp && s.pub).map(s => { const p = App.idx.per[s.p] || {}; return Object.assign({}, s, { bulan: p.bulan, tahun: p.tahun, jenis: p.jenis }); }).sort((a, b) => (b.tahun - a.tahun) || (b.bulan - a.bulan) || (b.rev - a.rev));
    prof = { NRP: prof.NRP, Nama: prof.Nama, Unit: prof.Unit, UnitNama: App.d.unitNames[prof.Unit], Jabatan: prof.Jabatan, StatusKepegawaian: prof.StatusKepegawaian, Rekening: prof.BankRekening, Email: prof.Email, TglLahir: prof.TglLahir, TahunMasuk: prof.TahunMasuk, NoWA: prof.NoWA, JenisPegawai: prof.JenisPegawai };
  } else { list = App.d.mySlips || []; prof = App.d.profile || { Nama: App.user.nama, NRP: App.user.nrp, Unit: App.user.unit }; }
  const sensor = App.ui.sensor = store.get('sensor', false);
  const blur = v => sensor ? '<span class="blurred">' + v + '</span>' : v;
  const latest = list[0];
  const yr = new Date().getFullYear();
  const ytd = list.filter(s => s.tahun === (latest ? latest.tahun : yr)).reduce((a, s) => a + (s.thp || 0), 0);
  const f = App.ui.portalFilter = App.ui.portalFilter || { tab: 'all', q: '' };
  const years = Array.from(new Set(list.map(s => s.tahun))).sort((a, b) => b - a);
  const shown = list.filter(s => (f.tab === 'all' || (f.tab === 'y' + s.tahun) || (f.tab === s.jenis) || (f.tab === 'REV' && s.rev)) && (!f.q || (BULAN[s.bulan - 1] + ' ' + s.tahun + ' ' + s.id + ' ' + (JENIS_LABEL[s.jenis] || '')).toLowerCase().indexOf(f.q) >= 0));
  const hasPin = App.role === ROLE.Y ? true : App.user.hasPin;
  $('#portalBody').innerHTML =
    '<div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3"><div><p class="eyebrow mb-1"><span class="tag">W-12 // PORTAL LAYANAN MANDIRI PEGAWAI</span> UNIT KERJA: ' + esc(prof.Unit || '-') + '</p><span class="chip chip-success mb-1">Assalamu\'alaikum Warahmatullah</span><h1 class="mb-0">' + esc(prof.Nama) + '</h1><div class="d-flex gap-2 flex-wrap mt-1"><span class="chip chip-outline"><i class="bi bi-mortarboard"></i> ' + esc(prof.UnitNama || prof.Unit || '') + '</span><span class="chip chip-info mono">NRP: ' + esc(prof.NRP) + '</span><span class="chip chip-gold">' + esc(jenisPegawai(prof)) + '</span></div></div><button class="btn btn-ghost" data-action="toggleSensor"><i class="bi ' + (sensor ? 'bi-eye' : 'bi-eye-slash') + '"></i> ' + (sensor ? 'Tampilkan Nominal' : 'Sensor Nominal') + '</button></div>' +
    (isY ? '' : linkBanner()) +
    '<div class="row g-3"><div class="col-lg-7">' + (latest ? '<div class="hero-slip"><div class="pattern"></div><div class="d-flex justify-content-between flex-wrap gap-2"><span class="lbl">Periode: ' + esc(BULAN[latest.bulan - 1] + ' ' + latest.tahun) + ' · ' + esc(JENIS_LABEL[latest.jenis] || '') + '</span><span class="chip" style="background:var(--gold);color:#3a2a00">● Terbaru</span></div><div class="lbl mt-3">Penerimaan Bersih (Take Home Pay)</div><div class="amt">' + blur(fmtRp(latest.thp)) + '</div><div class="terb">' + blur('"' + terbilang(latest.thp) + '"') + '</div>' +
      '<div class="hero-meta"><div><span>Tgl Cair</span>' + fmtDate(latest.tk) + '</div><div><span>Rekening</span>' + esc(prof.Rekening ? String(prof.Rekening).replace(/(\d{3})\d+(\d{3})/, '$1••••$2') : '-') + '</div><div><span>Validasi</span>' + (latest.hash ? '<i class="bi bi-check2-circle"></i> SHA-256' : '<i class="bi bi-check2-circle"></i> Sah') + '</div></div>' +
      '<div class="hero-actions"><button class="btn btn-w" data-action="previewSlip" data-id="' + esc(latest.id) + '"><i class="bi bi-eye"></i> Pratinjau A4</button><button class="btn btn-gold" data-action="downloadSlip" data-id="' + esc(latest.id) + '"><i class="bi bi-lock"></i> Unduh PDF</button></div></div>' : '<div class="card-app empty-state h-100"><i class="bi bi-receipt"></i>Belum ada slip gaji yang diterbitkan untuk Anda.</div>') + '</div>' +
    '<div class="col-lg-5 d-grid gap-3"><div class="card-app"><div class="d-flex gap-3"><span class="slip-ic thr"><i class="bi bi-lock"></i></span><div class="flex-grow-1"><div class="d-flex justify-content-between gap-2 flex-wrap"><b>Keamanan & PIN Buka PDF</b><span class="status ' + (hasPin ? 'ok' : 'warn') + '">' + (hasPin ? 'PIN Kustom Aktif' : 'Belum ada PIN') + '</span></div><p class="small text-muted-2 mb-2">' + (isY ? 'Admin Yayasan mengunduh tanpa PIN (tercatat di log audit).' : hasPin ? 'Unduhan PDF dilindungi PIN 6 digit yang Anda buat sendiri. Verifikasi berlaku 15 menit.' : 'Buat PIN 6 digit di menu Keamanan untuk dapat mengunduh slip.') + '</p>' + (!isY && !hasPin ? '<button class="btn btn-primary-app btn-sm" data-nav="keamanan">Buat PIN Sekarang</button>' : '<span class="tiny text-muted-2"><i class="bi bi-shield-check"></i> Kerahasiaan sesuai UU PDP No. 27/2022</span>') + '</div></div></div>' +
    '<div class="card-app d-flex justify-content-between align-items-center"><div><p class="eyebrow">Total Bersih YTD ' + (latest ? latest.tahun : yr) + '</p><div class="serif fw-bold fs-3">' + blur(fmtRp(ytd)) + '</div></div><span class="chip chip-info"><i class="bi bi-archive"></i> ' + list.length + ' Slip Terarsip</span></div></div></div>' +
    infoKepegawaian(prof) +
    '<div class="card-app mt-3 p-2"><div class="filter-bar"><div class="search-box grow"><i class="bi bi-search"></i><input id="portalSearch" class="form-control" placeholder="Cari bulan, jenis slip, atau no ref…" value="' + esc(f.q) + '" aria-label="Cari slip"></div></div><div class="seg mt-2" role="tablist">' +
    [['all', 'Semua (' + list.length + ')']].concat(years.map(y => ['y' + y, 'Tahun ' + y]), [['BULANAN', 'Gaji Reguler'], ['THR', 'Gaji THR'], ['BONUS', 'Gaji Bonus 13'], ['REV', 'Revisi Gaji Reguler']]).map(t => '<button class="' + (f.tab === t[0] ? 'on' : '') + '" data-action="portalTab" data-id="' + t[0] + '">' + esc(t[1]) + '</button>').join('') + '</div></div>' +
    '<p class="eyebrow mt-3 mb-2">Daftar Dokumen Gaji Resmi Terbit (menampilkan ' + shown.length + ' dari ' + list.length + ' arsip)</p>' +
    '<div class="d-grid gap-2">' + (shown.length ? shown.map(s => '<article class="slip-item"><span class="slip-ic ' + (s.jenis === 'THR' || s.jenis === 'BONUS' ? 'thr' : s.rev ? 'rev' : '') + '"><i class="bi ' + (s.jenis === 'THR' ? 'bi-stars' : s.jenis === 'BONUS' ? 'bi-gift' : s.rev ? 'bi-pencil-square' : 'bi-receipt') + '"></i></span><div><div class="d-flex gap-2 align-items-center flex-wrap"><b class="fs-6">' + BULAN[s.bulan - 1] + ' ' + s.tahun + '</b>' + (s === latest ? '<span class="status ok">Terbaru</span>' : '') + (s.jenis !== 'BULANAN' ? '<span class="status ' + (s.jenis === 'REVISI' ? 'wait' : 'gold') + '">' + esc(JENIS_LABEL[s.jenis] || s.jenis) + (s.rev ? ' #' + s.rev : '') + '</span>' : '') + (s.id === App.ui.linkSlip ? '<span class="status ok"><i class="bi bi-whatsapp"></i> Dari tautan</span>' : '') + '</div><div class="tiny text-muted-2 mono">' + esc(JENIS_LABEL[s.jenis] || '') + ' · Ref ' + esc(s.id) + '</div><div class="tiny text-muted-2"><i class="bi bi-clock"></i> Dikirim ' + fmtDate(s.tk) + (s.se === 'Terkirim' ? ' · <i class="bi bi-envelope"></i> Surel' : '') + (s.sw === 'Terkirim' ? ' · <i class="bi bi-whatsapp"></i> WhatsApp' : '') + '</div></div>' +
      '<div class="slip-nums"><div><span>Bruto</span><b>' + blur(fmtNum(s.bruto)) + '</b></div><div><span>Potongan</span><b class="neg">' + blur('-' + fmtNum(s.pot)) + '</b></div><div><span>THP Bersih</span><b>' + blur(fmtNum(s.thp)) + '</b></div></div>' +
      '<div class="slip-acts"><button class="btn btn-ghost btn-sm" data-action="previewSlip" data-id="' + esc(s.id) + '"><i class="bi bi-eye"></i> Pratinjau</button><button class="btn btn-primary-app btn-sm" data-action="downloadSlip" data-id="' + esc(s.id) + '"><i class="bi bi-download"></i> Unduh PDF</button></div></article>').join('') : '<div class="card-app empty-state"><i class="bi bi-search"></i>Tidak ada slip sesuai filter.</div>') + '</div>' +
    helpCard();
  const ps = $('#portalSearch'); ps.oninput = debounce(() => { f.q = ps.value.trim().toLowerCase(); const pos = ps.selectionStart; RENDER.portal(); const n = $('#portalSearch'); n.focus(); n.setSelectionRange(pos, pos); }, 250);
};
/** Info untuk pegawai yang masuk lewat tautan pribadi WhatsApp (dan ajakan aktivasi akun bila belum pernah login). */
function linkBanner() {
  const u = App.user || {};
  if (u.via !== 'tautan') return '';
  if (u.aktivasi) return '<div class="link-note mb-3 flex-wrap"><i class="bi bi-person-check"></i><div class="flex-grow-1"><b>Anda masuk lewat tautan pribadi WhatsApp.</b><div class="small">Akun Anda belum diaktifkan. Buat kata sandi & PIN dokumen agar bisa masuk langsung ke Portal Pegawai kapan saja (tanpa tautan) dan mengunduh slip PDF.</div></div><button class="btn btn-primary-app btn-sm" data-nav="keamanan"><i class="bi bi-shield-lock"></i> Aktifkan Akun</button></div>';
  return '<div class="link-note mb-3"><i class="bi bi-whatsapp"></i><div><b>Anda masuk lewat tautan pribadi WhatsApp.</b><div class="small">Lain kali Anda juga bisa masuk langsung dengan NRP & kata sandi. Jangan teruskan tautan ini kepada orang lain.</div></div></div>';
}
/** Kartu dasbor pegawai: Tahun Masuk & Lama Kerja, Tanggal Pensiun, No. WhatsApp */
function infoKepegawaian(prof) {
  const jenis = jenisPegawai(prof);
  const tp = tanggalPensiun(prof.TglLahir, jenis), sw = sisaWaktu(tp);
  const tile = (icon, label, value, sub, cls) => '<div class="col-sm-6 col-xl-3"><div class="stat-tile h-100 ' + (cls || '') + '"><span class="serif small text-muted-2"><i class="bi ' + icon + '"></i> ' + label + '</span><b>' + value + '</b><span class="small">' + sub + '</span></div></div>';
  return '<div class="card-app mt-3"><div class="card-head mb-2"><div><p class="eyebrow mb-0">Info Kepegawaian</p><h3>Lama Kerja & Pensiun</h3></div><span class="chip chip-outline">' + esc(jenis) + ' · pensiun usia ' + usiaPensiun(jenis) + ' th</span></div><div class="row g-2">' +
    tile('bi-box-arrow-in-right', 'Tahun Masuk', prof.TahunMasuk ? esc(prof.TahunMasuk) : '-', prof.TahunMasuk ? 'Tercatat di data kepegawaian' : 'Belum diisi — hubungi Tata Usaha') +
    tile('bi-hourglass-split', 'Lama Kerja', prof.TahunMasuk ? esc(lamaKerja(prof.TahunMasuk)) : '-', prof.TahunMasuk ? new Date().getFullYear() + ' − ' + esc(prof.TahunMasuk) : '&nbsp;', 'ok') +
    tile('bi-calendar2-check', 'Tanggal Pensiun', tp ? fmtYmd(tp) : '-', tp ? esc(sw.txt) : 'Tanggal lahir belum diisi — hubungi Tata Usaha', sw.bulan !== null && sw.bulan < 12 ? 'bad' : '') +
    tile('bi-whatsapp', 'No. WhatsApp', prof.NoWA ? '<span class="mono fs-6">' + esc(fmtWA(prof.NoWA)) + '</span>' : '-', prof.TglLahir ? 'Lahir ' + fmtYmd(prof.TglLahir) + ' · usia ' + usia(prof.TglLahir) + ' th' : 'Kontak untuk informasi slip') +
    '</div></div>';
}
function helpCard() {
  const s = App.d.settings || {};
  return '<div class="card-app mt-3 d-flex gap-3 flex-wrap align-items-center" style="background:var(--info-soft)"><span class="slip-ic"><i class="bi bi-headset"></i></span><div class="flex-grow-1"><b>Butuh Klarifikasi Gaji?</b><div class="small text-muted-2">Bila terdapat selisih jam mengajar, insentif, atau potongan, hubungi Tata Usaha / Bendahara sebelum tanggal 20 bulan berjalan.</div></div><a class="btn btn-ghost" href="tel:' + esc(String(s.telepon || '').replace(/[^\d+]/g, '')) + '"><i class="bi bi-telephone"></i> ' + esc(s.telepon || 'Telepon TU') + '</a><a class="btn btn-primary-app" target="_blank" rel="noopener" href="https://wa.me/' + esc(s.wa || '') + '"><i class="bi bi-whatsapp"></i> WhatsApp TU</a></div>';
}

// ── PRATINJAU & UNDUH SLIP (modal, bukan tab baru) ────────────
let slipModal, pinModal, formModal, confirmModal, msgModal;
async function previewSlip(id) {
  App.ui.slipCurrent = id;
  const s = App.idx.slip[id] || {};
  $('#slipModalTitle').textContent = 'Slip ' + (s.nama || '') ;
  $('#slipModalEyebrow').textContent = 'W-13 // INSPEKSI DOKUMEN // ' + id;
  $('#slipModalMeta').textContent = s.hash ? 'SHA-256 ' + s.hash + '…' : (s.pub ? 'Terkirim ' + fmtDate(s.tk, true) : 'Pratinjau draft — belum terkirim');
  $('#slipLoading').hidden = false; $('#slipFrame').srcdoc = '';
  slipModal.show();
  try {
    App.ui.htmlCache = App.ui.htmlCache || {};
    let r = App.ui.htmlCache[id];
    if (!r) { r = await api('apiPreviewSlip', id); App.ui.htmlCache[id] = r; }
    $('#slipFrame').srcdoc = r.html;
  } catch (e) { slipModal.hide(); fail(e); }
  finally { $('#slipLoading').hidden = true; }
}
async function downloadSlip(id) {
  try {
    const r = await api('apiDownloadSlip', id);
    downloadBlob(b64ToBlob(r.b64, 'application/pdf'), r.name);
    toast('PDF ' + r.name + ' diunduh.', 'success');
  } catch (e) {
    if (e.code === 'PIN_REQUIRED' || e.code === 'NO_PIN') {
      // Belum punya PIN (baru dibuat / direset TU) → langsung ke menu Keamanan untuk membuat PIN
      if (e.code === 'NO_PIN' || (App.role !== ROLE.Y && !App.user.hasPin)) { toast('Buat PIN dokumen 6 digit terlebih dahulu untuk mengunduh slip.', 'warning', 'PIN belum dibuat'); navigateTo('keamanan'); return; }
      const ok = await askPin(App.idx.slip[id]);
      if (ok) return downloadSlip(id);
    } else fail(e);
  }
}
function askPin(slip) {
  const p = slip ? App.idx.per[slip.p] : null;
  $('#pinDesc').innerHTML = 'Berkas slip ' + (slip && slip.bulan ? '<b>' + BULAN[slip.bulan - 1] + ' ' + slip.tahun + '</b>' : (p ? '<b>' + esc(periodeShort(p)) + '</b>' : '')) + ' dilindungi PIN dokumen Anda.';
  $('#pinErr').textContent = '';
  App.ui.pinBuf = '';
  drawPin();
  pinModal.show();
  return new Promise(res => { App.ui.pinResolve = res; });
}
function drawPin() { $$('#pinDots i').forEach((d, i) => d.classList.toggle('on', i < App.ui.pinBuf.length)); }
async function pinKey(k) {
  if (App.ui.pinBusy) return;
  if (k === 'del') App.ui.pinBuf = App.ui.pinBuf.slice(0, -1);
  else if (App.ui.pinBuf.length < 6) App.ui.pinBuf += k;
  drawPin();
  if (App.ui.pinBuf.length === 6) {
    App.ui.pinBusy = true;
    try {
      await api('apiVerifyPin', App.ui.pinBuf);
      const r = App.ui.pinResolve; App.ui.pinResolve = null; pinModal.hide(); r && r(true);
    } catch (e) {
      $('#pinErr').textContent = e.message; $('#pinDots').classList.add('shake'); setTimeout(() => $('#pinDots').classList.remove('shake'), 400);
      App.ui.pinBuf = ''; drawPin();
    } finally { App.ui.pinBusy = false; }
  }
}

// ── W-02 KEAMANAN ─────────────────────────────────────────────
/**
 * Kolom PIN 6 kotak yang tangguh:
 * - ketik di kotak berisi → langsung menimpa; fokus pindah ke kotak berikutnya
 * - Backspace (hapus & mundur), Delete, ←/→, Home/End
 * - tempel 6 digit sekaligus, isi otomatis, keyboard ponsel (keyCode 229) via event input
 * - huruf/simbol diabaikan; dapat disamarkan/ditampilkan
 */
function PinInput(container, onChange) {
  container.innerHTML = Array.from({ length: 6 }, (_, i) => '<input class="form-control masked" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Digit ' + (i + 1) + ' dari 6">').join('');
  const boxes = Array.from(container.querySelectorAll('input'));
  const supportsMask = window.CSS && CSS.supports && CSS.supports('-webkit-text-security', 'disc');
  let masked = true;
  const paint = () => boxes.forEach(b => b.classList.toggle('filled', !!b.value));
  const changed = () => { paint(); onChange && onChange(); };
  const fill = (from, digits) => { let k = from; digits.split('').forEach(d => { if (k < 6) boxes[k++].value = d; }); (boxes[Math.min(k, 5)]).focus(); changed(); };
  boxes.forEach((b, i) => {
    // select() di Chrome ikut memindahkan fokus → hanya jika kotak ini MASIH aktif (cegah fokus 'melompat' saat mengetik cepat)
    b.addEventListener('focus', () => setTimeout(() => { if (document.activeElement === b) b.select(); }, 0));
    b.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); b.value = e.key; changed(); if (boxes[i + 1]) boxes[i + 1].focus(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); if (b.value) b.value = ''; else if (boxes[i - 1]) { boxes[i - 1].value = ''; boxes[i - 1].focus(); } changed(); return; }
      if (e.key === 'Delete') { e.preventDefault(); b.value = ''; changed(); return; }
      if (e.key === 'ArrowLeft' && boxes[i - 1]) { e.preventDefault(); boxes[i - 1].focus(); return; }
      if (e.key === 'ArrowRight' && boxes[i + 1]) { e.preventDefault(); boxes[i + 1].focus(); return; }
      if (e.key === 'Home') { e.preventDefault(); boxes[0].focus(); return; }
      if (e.key === 'End') { e.preventDefault(); boxes[5].focus(); return; }
      if (e.key.length === 1) e.preventDefault(); // huruf/simbol diabaikan
    });
    // Keyboard ponsel & isi otomatis (keydown tidak membawa angka)
    b.addEventListener('input', e => {
      const typed = (e.inputType === 'insertText' || e.inputType === 'insertCompositionText') && e.data ? String(e.data).replace(/\D/g, '') : '';
      const all = b.value.replace(/\D/g, '');
      if (typed.length === 1) { b.value = typed; changed(); if (boxes[i + 1]) boxes[i + 1].focus(); return; }
      if (all.length > 1) { b.value = ''; fill(i, all.slice(0, 6 - i)); return; } // tempel/isi otomatis → sebar ke kotak berikutnya
      b.value = all.slice(-1); changed(); if (b.value && boxes[i + 1]) boxes[i + 1].focus();
    });
    b.addEventListener('paste', e => {
      const t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '');
      e.preventDefault(); if (t) fill(t.length >= 6 ? 0 : i, t.slice(0, 6));
    });
  });
  const api = {
    value: () => boxes.map(b => b.value).join(''),
    clear: () => { boxes.forEach(b => b.value = ''); changed(); },
    focus: () => (boxes.find(b => !b.value) || boxes[5]).focus(),
    setMasked: m => { masked = m; boxes.forEach(b => { b.classList.toggle('masked', m); if (!supportsMask) b.type = m ? 'password' : 'text'; }); },
    setState: st => { container.classList.toggle('ok', st === 'ok'); container.classList.toggle('bad', st === 'bad'); }
  };
  api.setMasked(true);
  return api;
}
let PIN1 = null, PIN2 = null;
function pinWeak(pin) {
  if (/^(\d)\1{5}$/.test(pin) || '0123456789'.indexOf(pin) >= 0 || '9876543210'.indexOf(pin) >= 0) return 'PIN terlalu mudah ditebak (angka berulang/berurutan).';
  const tl = ((App.d && App.d.profile) || {}).TglLahir || App.user.tglLahir;
  if (tl) { const Y = tl.slice(0, 4), y = Y.slice(2), M = tl.slice(5, 7), D = tl.slice(8, 10); if ([D + M + y, y + M + D, M + D + y, D + M + Y.slice(0, 2), Y + M, M + Y].indexOf(pin) >= 0) return 'PIN tidak boleh memakai tanggal lahir Anda.'; }
  return '';
}
function pinCheck() {
  const a = PIN1.value(), b = PIN2.value();
  const weak = a.length === 6 ? pinWeak(a) : '';
  $('#pinState1').innerHTML = !a ? '<span class="text-muted-2">0/6</span>' : a.length < 6 ? '<span class="text-muted-2">' + a.length + '/6</span>' : weak ? '<span class="text-danger"><i class="bi bi-x-circle"></i> ' + esc(weak.replace(' (angka berulang/berurutan)', '')) + '</span>' : '<span class="text-success"><i class="bi bi-check2-circle"></i> 6/6</span>';
  $('#pinState2').innerHTML = !b ? '' : b.length < 6 ? '<span class="text-muted-2">' + b.length + '/6</span>' : b === a ? '<span class="text-success"><i class="bi bi-check2-circle"></i> PIN cocok</span>' : '<span class="text-danger"><i class="bi bi-x-circle"></i> Belum cocok</span>';
  PIN1.setState(a.length === 6 ? (weak ? 'bad' : 'ok') : '');
  PIN2.setState(b.length === 6 ? (b === a && !weak ? 'ok' : 'bad') : '');
  return { a: a, b: b, weak: weak };
}
RENDER.keamanan = function () {
  const u = App.user, prof = (App.d && App.d.profile) || {};
  $('#pwSuccess').hidden = true; $('#pwForm').hidden = false;
  const needPin = u.role === ROLE.P && !u.hasPin;
  const bebas = !!(u.mustChange || u.aktivasi); // tanpa kata sandi lama
  $('#mustChangeNote').innerHTML = u.aktivasi ? '<div class="link-note mb-3"><i class="bi bi-person-check"></i><div><b>Aktivasi akun Portal Pegawai</b><div class="small">Anda masuk lewat tautan pribadi WhatsApp dan akun ini belum pernah diaktifkan. Buat kata sandi baru' + (needPin ? ' dan PIN dokumen' : '') + ' — setelah itu Anda dapat masuk langsung dengan NRP & kata sandi kapan saja, tanpa tautan.</div></div></div>' : u.mustChange ?'<div class="card-app mb-3" style="border-left:4px solid var(--gold)"><div class="d-flex justify-content-between flex-wrap gap-2"><span class="mono tiny">AUDIT: LOG-SEC-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '</span><span class="status gold">Wajib</span></div><p class="mb-0 mt-2 small"><i class="bi bi-info-circle"></i> Anda masuk dengan <b>kata sandi sementara</b> yang dibuat Tata Usaha. Buat kata sandi baru' + (needPin ? ' dan PIN dokumen' : '') + ' untuk melanjutkan.</p></div>'
    : needPin ? '<div class="card-app mb-3" style="border-left:4px solid var(--gold)"><p class="mb-0 small"><i class="bi bi-file-earmark-lock"></i> <b>Buat PIN dokumen</b> untuk dapat mengunduh slip gaji PDF. Cukup isi kata sandi saat ini dan PIN baru — kata sandi tidak perlu diganti.</p></div>' : '';
  $('#pwIdentity').innerHTML = '<div class="profile-card"><span class="profile-av">' + esc(initials(u.nama)) + '</span><div class="min-w-0"><h2 class="h5 fw-bold mb-1">' + esc(u.nama) + '</h2><div class="d-flex gap-2 flex-wrap align-items-center"><span class="nrp">' + esc(u.nrp ? 'NRP ' + u.nrp : 'ID ' + u.id) + '</span><span class="small text-muted-2">' + esc(prof.Jabatan || (u.role === ROLE.Y ? 'Admin Yayasan' : u.role === ROLE.S ? 'Admin Sekolah' : '')) + '</span></div><div class="small mt-1">Unit: <b>' + esc(prof.UnitNama || (App.d && App.d.unitNames && App.d.unitNames[u.unit]) || u.unit || 'Yayasan Pusat') + '</b></div><div class="d-flex gap-2 flex-wrap mt-2"><span class="status ' + (bebas ? 'warn' : 'ok') + '"><i class="bi bi-key"></i> ' + (u.aktivasi ? 'Belum diaktifkan' : u.mustChange ? 'Sandi sementara' : 'Sandi aktif') + '</span>' + (u.role === ROLE.P || u.nrp ? '<span class="status ' + (u.hasPin ? 'ok' : 'warn') + '"><i class="bi bi-file-earmark-lock"></i> ' + (u.hasPin ? 'PIN aktif' : 'Belum ada PIN') + '</span>' : '') + '</div></div></div>' + (u.email ? '<div class="alert-soft info mt-3 d-flex justify-content-between gap-2 mono small"><span class="text-break min-w-0"><i class="bi bi-envelope"></i> ' + esc(u.email) + '</span><i class="bi bi-check-circle flex-shrink-0"></i></div>' : '');
  $('#oldPassWrap').hidden = bebas;
  $('#pwOptional').textContent = bebas ? '(wajib)' : '(kosongkan bila tidak diganti)';
  $('#pinOptional').textContent = needPin ? '(wajib dibuat)' : u.role === ROLE.P || u.hasPin ? '(kosongkan bila tidak diganti)' : '(opsional)';
  $('#pwSubmit span').textContent = u.aktivasi ? 'Aktifkan Akun' : u.mustChange ? 'Simpan & Masuk ke Portal' : 'Simpan Perubahan';
  const tl = prof.TglLahir || u.tglLahir;
  $('#pinHint').innerHTML = '<i class="bi bi-shield-exclamation"></i> Hindari tanggal lahir' + (tl ? ' (<span class="mono">' + tl.slice(8, 10) + tl.slice(5, 7) + tl.slice(2, 4) + '</span>)' : '') + ', angka berulang (111111), atau berurutan (123456).';
  $('#pwDevice').innerHTML = '<b>' + esc(deviceInfo()) + '</b> · perangkat ini';
  if (!PIN1) {
    PIN1 = PinInput($('#pinBoxes'), pinCheck);
    PIN2 = PinInput($('#pinBoxes2'), pinCheck);
    $('#pinShow').addEventListener('click', () => {
      const show = $('#pinShow').getAttribute('aria-pressed') !== 'true';
      $('#pinShow').setAttribute('aria-pressed', show); $('#pinShow').innerHTML = '<i class="bi ' + (show ? 'bi-eye-slash' : 'bi-eye') + '"></i> <span>' + (show ? 'Sembunyikan' : 'Tampilkan') + '</span>';
      PIN1.setMasked(!show); PIN2.setMasked(!show);
    });
  }
  pinCheck();
  pwCheck();
  if (needPin && !bebas) setTimeout(() => $('#pwOld').focus(), 300);
};
function pwCheck() {
  const p = $('#pwNew').value, c = $('#pwConfirm').value;
  const r = { len: p.length >= 8, case: /[A-Z]/.test(p) && /[a-z]/.test(p), num: /\d/.test(p), sym: /[^A-Za-z0-9]/.test(p) };
  Object.keys(r).forEach(k => { const el = $('#pwRules [data-rule="' + k + '"]'); el.classList.toggle('ok', r[k]); el.querySelector('i').className = 'bi ' + (r[k] ? 'bi-check-circle-fill' : 'bi-circle'); });
  const score = Object.values(r).filter(Boolean).length + (p.length >= 12 ? 1 : 0);
  const lv = [['-', 'var(--danger)', 0], ['Lemah', 'var(--danger)', 25], ['Lemah', 'var(--danger)', 35], ['Cukup', 'var(--gold-600)', 60], ['Kuat', 'var(--emerald-700)', 85], ['Sangat Kuat', 'var(--emerald-800)', 100]][p ? score : 0];
  $('#pwBar').style.width = lv[2] + '%'; $('#pwBar').style.background = lv[1]; $('#pwStrengthTag').textContent = lv[0]; $('#pwStrengthTag').classList.toggle('d-none', !p);
  $('#pwMatch').innerHTML = c ? (c === p ? '<span class="text-success"><i class="bi bi-check2"></i> Cocok</span>' : '<span class="text-danger">Belum cocok</span>') : '';
  return r;
}
async function submitPassword(e) {
  e.preventDefault();
  const u = App.user, r = pwCheck(), pc = pinCheck(), err = $('#pwErr'); err.textContent = '';
  const fail = (msg, focusEl) => { err.textContent = msg; if (focusEl) focusEl.focus(); return false; };
  const bebas = !!(u.mustChange || u.aktivasi);
  const changePw = bebas || $('#pwNew').value !== '';
  const changePin = pc.a !== '' || pc.b !== '';
  const f = { oldPassword: bebas ? '' : $('#pwOld').value, newPassword: $('#pwNew').value, confirmPassword: $('#pwConfirm').value, pin: pc.a, pinConfirm: pc.b, logoutOthers: $('#pwLogoutOthers').checked };
  if (!changePw && !changePin) return fail(u.role === ROLE.P && !u.hasPin ? 'Isi PIN baru (6 digit) dan ulangi PIN.' : 'Tidak ada perubahan. Isi kata sandi baru dan/atau PIN baru.', $('#pwNew'));
  if (!bebas && !f.oldPassword) return fail('Masukkan kata sandi saat ini untuk verifikasi.', $('#pwOld'));
  if (changePw) {
    if (!r.len || !r.case || !r.num) return fail('Kata sandi baru belum memenuhi syarat (min. 8 karakter, huruf besar & kecil, angka).', $('#pwNew'));
    if (f.newPassword !== f.confirmPassword) return fail('Ulangi kata sandi baru belum cocok.', $('#pwConfirm'));
  }
  if (changePin) {
    if (pc.a.length !== 6) return fail('PIN baru harus 6 digit (baru ' + pc.a.length + ' digit).', $('#pinBoxes input'));
    if (pc.weak) return fail(pc.weak, $('#pinBoxes input'));
    if (pc.b !== pc.a) return fail(pc.b.length < 6 ? 'Ulangi PIN 6 digit untuk konfirmasi.' : 'Ulangi PIN belum cocok dengan PIN baru.', $('#pinBoxes2 input'));
  } else if (u.role === ROLE.P && !u.hasPin) return fail('PIN dokumen 6 digit wajib dibuat.', $('#pinBoxes input'));
  const btn = $('#pwSubmit'); busy(btn, true, 'Menyimpan…');
  try {
    const res = await api('apiChangePassword', f);
    App.user = res.user; sess.set('user', App.user);
    if (res.boot) applyBoot(res.boot);
    ['pwOld', 'pwNew', 'pwConfirm'].forEach(i => $('#' + i).value = ''); PIN1.clear(); PIN2.clear(); pwCheck();
    renderNav(); updateChrome();
    const ch = res.changed || { password: changePw, pin: changePin };
    const judul = ch.password && ch.pin ? 'Kata Sandi & PIN Berhasil Diperbarui' : ch.pin ? 'PIN Dokumen Berhasil Diperbarui' : 'Kata Sandi Berhasil Diperbarui';
    $('#pwForm').hidden = true; $('#pwSuccess').hidden = false; $('#mustChangeNote').innerHTML = '';
    const land = LANDING[App.role];
    $('#pwSuccess').innerHTML = '<div class="card-app success-hero mt-3"><div class="ic"><i class="bi bi-shield-check"></i></div><span class="status gold">Otorisasi Sukses</span><h2 class="fw-bold mt-2">' + judul + '</h2><p class="text-muted-2">' + (ch.pin ? 'Gunakan PIN baru saat mengunduh slip PDF. ' : '') + 'Kredensial tersimpan dalam bentuk hash di server.</p>' +
      '<div class="card-app soft text-start mt-3"><div class="d-flex justify-content-between mb-2"><b><i class="bi bi-card-checklist"></i> Status Kredensial</b><span class="status ok">Aktif & Aman</span></div><div class="kv-list"><div><span>Identitas</span><b>' + esc(App.user.nama) + '</b></div><div><span>NRP / ID</span><b class="mono">' + esc(App.user.nrp || App.user.id) + '</b></div><div><span>Kata sandi portal</span><b>' + (ch.password ? 'Diperbarui' : 'Tidak diubah') + '</b></div><div><span>PIN dokumen</span><b>' + (ch.pin ? 'Diperbarui (6 digit)' : App.user.hasPin ? 'Tidak diubah' : '-') + '</b></div><div><span>Manajemen sesi</span><b class="' + (f.logoutOthers ? 'text-danger' : '') + '">' + (f.logoutOthers ? 'Sesi perangkat lain dikeluarkan' : 'Sesi lain tetap aktif') + '</b></div></div><div class="alert-soft info mono tiny mt-2">NOMOR BUKTI AUDIT: ' + esc(res.auditId) + '</div></div>' +
      '<div class="d-grid gap-2 mt-3"><button class="btn btn-primary-app btn-lg" data-nav="' + land + '">Masuk ke ' + (App.role === ROLE.P ? 'Slip Gaji Saya' : 'Dasbor') + ' <i class="bi bi-arrow-right"></i></button><button class="btn btn-ghost" data-action="againSecurity"><i class="bi bi-arrow-counterclockwise"></i> Ubah lagi</button></div></div>';
    toast((u.aktivasi ? 'Akun aktif. Lain kali masuk dengan NRP & kata sandi baru Anda. ' : '') + judul + '.', 'success');
    openPendingSlip(); // datang dari tautan & baru membuat sandi → langsung buka slip tujuan
  } catch (e2) { err.textContent = e2.message || 'Gagal menyimpan.'; }
  finally { busy(btn, false); }
}

// ── W-14 PENGATURAN ───────────────────────────────────────────
const SET_FIELDS = [
  ['Identitas Yayasan', [['NamaYayasan', 'Nama resmi yayasan', 'text', 8], ['Singkatan', 'Nama singkat', 'text', 4], ['AlamatYayasan', 'Alamat (kop slip)', 'text', 12], ['Telepon', 'Telepon TU', 'text', 4], ['WhatsAppTU', 'WhatsApp TU (62…)', 'text', 4], ['EmailKeuangan', 'Surel keuangan', 'email', 4], ['URLAplikasi', 'URL Aplikasi — dasar tautan pribadi WhatsApp (kosong = https://slipgaji-blush.vercel.app/)', 'url', 12]]],
  ['Penanda Tangan Slip', [['NamaBendahara', 'Nama bendahara', 'text', 5], ['JabatanBendahara', 'Jabatan', 'text', 5], ['KotaTerbit', 'Kota terbit', 'text', 2]]],
  ['Templat Surel Slip', [['SubjekEmail', 'Subjek', 'text', 12], ['IsiEmail', 'Isi surel', 'textarea', 12]]],
  ['Komponen Gaji (nama kolom Excel & urutan di slip)', [['KomponenPenghasilan', 'Komponen penghasilan, urut kiri→kanan (pisahkan koma)', 'textarea', 6], ['KomponenPotongan', 'Komponen potongan, urut (pisahkan koma)', 'textarea', 6], ['KomponenSubtotal', 'Kolom subtotal — dihitung otomatis dari komponen di kirinya, tidak dijumlah ulang', 'text', 12]]],
  ['Kepegawaian', [['UsiaPensiunGuru', 'Usia pensiun guru (tahun)', 'number', 4], ['UsiaPensiunKaryawan', 'Usia pensiun karyawan / tendik (tahun)', 'number', 4]]],
  ['Pengiriman', [['MetodeKirim', 'Metode kirim slip', 'select', 4], ['RincianDiPesan', 'Isi SUREL memuat jumlah gaji', 'select', 4], ['ModeUji', 'Mode Uji', 'select', 4], ['BatchSize', 'Slip per putaran pemicu (5–60)', 'number', 4]]],
  ['WhatsApp Gateway (Fonnte) — pemberitahuan + tautan pribadi', [['AksesTautan', 'Tautan pribadi di WhatsApp', 'select', 5], ['MasaTautan', 'Masa berlaku tautan (hari, 1–90)', 'number', 3], ['JedaWA', 'Jeda antarpesan (detik, 1–15)', 'number', 4], ['NomorUjiWA', 'Nomor penerima saat Mode Uji', 'tel', 5], ['IsiWA', 'Isi pesan WhatsApp (tanpa nominal gaji)', 'textarea', 12]]]
];
const SET_OPTS = {
  ModeUji: [['Ya', 'Ya — surel ke pemilik skrip, WA ke nomor uji'], ['Tidak', 'Tidak — kirim ke pegawai (produksi)']],
  MetodeKirim: [['Email', 'Email (Gmail, lampiran PDF)'], ['WhatsApp', 'WhatsApp (Fonnte · pemberitahuan + tautan pribadi)'], ['Email + WhatsApp', 'Email + WhatsApp']],
  RincianDiPesan: [['Ya', 'Ya — surel memuat rincian gaji, total & THP'], ['Tidak', 'Tidak — surel berisi pemberitahuan + PDF saja']],
  AksesTautan: [['Langsung', 'Langsung buka slip di akun pegawai (tanpa sandi)'], ['Sandi', 'Wajib sandi — tautan mengisi NRP, pegawai masuk dengan sandi']]
};
/** Jendela hasil Uji Kirim WhatsApp yang gagal / sebagian: penyebab, langkah perbaikan, data teknis + salin. */
function waTestDialog(r) {
  const tk = r.teknis || {};
  const detailTxt = Object.keys(tk).map(k => k + ': ' + tk[k]).join('\n');
  const rows = Object.keys(tk).map(k => '<div class="d-flex justify-content-between gap-3 py-1 border-bottom"><span class="text-muted-2">' + esc(k) + '</span><b class="mono text-end text-break">' + esc(tk[k]) + '</b></div>').join('');
  const body = r.sebagian
    ? '<div class="alert-soft warn mb-3"><i class="bi bi-exclamation-triangle"></i> ' + esc(r.peringatan || '') + '</div>'
    : '<p class="mb-2">' + esc(r.penyebab || '') + '</p>' +
      '<p class="eyebrow mb-1 mt-3">Langkah perbaikan</p><ol class="small ps-3 mb-3">' + (r.langkah || []).map(l => '<li class="mb-1">' + esc(l) + '</li>').join('') + '</ol>';
  confirmBox({
    title: r.sebagian ? 'Uji kirim berhasil sebagian' : (r.judul || 'Uji kirim WhatsApp gagal'),
    sub: 'Tujuan ' + fmtWA(r.to || '') + ' · Fonnte',
    icon: r.sebagian ? 'bi-exclamation-triangle' : 'bi-whatsapp',
    ok: 'Tutup', noCancel: true,
    body: body + '<details class="small"><summary class="mb-2">Data teknis (untuk CS Fonnte)</summary>' + rows + '</details>' +
      '<button type="button" class="btn btn-ghost btn-sm mt-3" id="waCopyDiag"><i class="bi bi-clipboard"></i> Salin detail</button>',
    onOpen: () => {
      const b = $('#waCopyDiag');
      if (b) b.onclick = () => {
        const t = (r.judul || r.peringatan || '') + '\n' + (r.penyebab || '') + '\n\n' + detailTxt;
        if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('Detail disalin. Tempel di chat CS Fonnte.', 'success'), () => toast('Gagal menyalin.', 'warning'));
        else toast('Browser tidak mendukung salin otomatis.', 'warning');
      };
    }
  });
}
function waTokenCard() {
  const gw = App.d.waGateway || {};
  return '<div class="wa-token mt-3"><div class="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-2"><b><i class="bi bi-key"></i> Token perangkat Fonnte</b>' + (gw.ready ? '<span class="status ok"><i class="bi bi-shield-check"></i> Tersimpan ' + esc(gw.masked) + '</span>' : '<span class="status warn"><i class="bi bi-exclamation-triangle"></i> Belum diatur</span>') + '</div>' +
    '<div class="d-flex flex-wrap gap-2"><div class="input-icon flex-grow-1" style="min-width:220px"><i class="bi bi-key"></i><input type="password" id="waTokenIn" class="form-control" autocomplete="off" spellcheck="false" placeholder="' + (gw.ready ? 'Tempel token baru untuk mengganti' : 'Tempel token dari dasbor Fonnte → Device') + '" aria-label="Token perangkat Fonnte"></div>' +
    '<button type="button" class="btn btn-primary-app" data-action="saveWAToken"><i class="bi bi-save"></i> Simpan Token</button><button type="button" class="btn btn-ghost" data-action="testWA"' + (gw.ready ? '' : ' disabled') + '><i class="bi bi-send"></i> Uji Kirim</button>' + (gw.ready ? '<button type="button" class="btn btn-ghost text-danger" data-action="clearWAToken" aria-label="Hapus token"><i class="bi bi-trash3"></i></button>' : '') + '</div>' +
    '<p class="tiny text-muted-2 mt-2 mb-0"><i class="bi bi-cpu"></i> Versi Kode.gs di server: <b class="mono">' + esc(gw.versi || 'lama (belum ter-deploy ulang)') + '</b></p>' + '<ol class="tiny text-muted-2 mt-2 mb-0 ps-3"><li>Daftar di fonnte.com → <b>Add Device</b> dengan nomor WhatsApp pengirim (disarankan nomor khusus TU).</li><li>Pindai QR (Connect) dari aplikasi WhatsApp di HP, lalu salin <b>Token</b> perangkat.</li><li>Tempel di sini → Simpan Token → Uji Kirim. Token disimpan di Script Properties dan tidak tampil lagi.</li></ol></div>';
}
RENDER.pengaturan = function () {
  const st = App.d.settingsFull || {};
  $('#setForm').innerHTML = SET_FIELDS.map(g => '<div class="col-12"><div class="card-app"><h3 class="mb-3">' + esc(g[0]) + '</h3><div class="row g-3">' + g[1].map(f => '<div class="col-md-' + f[3] + '"><label class="form-label" for="set_' + f[0] + '">' + esc(f[1]) + '</label>' +
    (f[2] === 'textarea' ? '<textarea class="form-control" rows="' + (f[0] === 'IsiEmail' || f[0] === 'IsiWA' ? 9 : 3) + '" id="set_' + f[0] + '" name="' + f[0] + '">' + esc(st[f[0]]) + '</textarea>' :
      f[2] === 'select' ? '<select class="form-select" id="set_' + f[0] + '" name="' + f[0] + '">' + SET_OPTS[f[0]].map(o => '<option value="' + esc(o[0]) + '"' + (String(st[f[0]]) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>' :
        '<input class="form-control" type="' + f[2] + '" id="set_' + f[0] + '" name="' + f[0] + '" value="' + esc(f[0] === 'NomorUjiWA' && st[f[0]] ? fmtWA(st[f[0]]) : st[f[0]]) + '"' + (f[0] === 'NomorUjiWA' ? ' inputmode="tel" placeholder="Kosong = WhatsApp TU (' + esc(fmtWA(st.WhatsAppTU)) + ')"' : '') + '>') + '</div>').join('') + '</div>' +
    (g[0] === 'Templat Surel Slip' ? '<div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mt-2"><p class="tiny text-muted-2 mb-0">Placeholder: {{nama}} {{nrp}} {{unit}} {{periode}} {{jenis}} {{link}} (tautan pribadi ke akun) {{url}} (portal) {{yayasan}} {{thp}} {{bruto}} {{potongan}} · <b>{{rincian}}</b> = kartu rincian gaji & THP · <b>{{pdf}}</b> = keterangan lampiran PDF + tombol ke akun</p><button type="button" class="btn btn-ghost btn-sm" data-action="previewMsg" data-id=""><i class="bi bi-chat-square-text"></i> Pratinjau Pesan</button></div>' : '') +
    (g[0] === 'Identitas Yayasan' ? urlHint() + logoCard() + googleCard() : '') +
    (g[0] === 'Pengiriman' ? '<p class="tiny text-muted-2 mt-2 mb-0">Sisa kuota surel hari ini: <b>' + (App.d.quota < 0 ? 'tidak terbaca' : fmtNum(App.d.quota)) + '</b>. Disarankan memakai akun Google Workspace yayasan. Metode juga bisa dipilih langsung di halaman Pratinjau & Kirim.</p>' : '') +
    (g[0].indexOf('WhatsApp Gateway') === 0 ? '<div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mt-2"><p class="tiny text-muted-2 mb-0">Placeholder: {{nama}} {{nrp}} {{unit}} {{periode}} {{jenis}} <b>{{link}}</b> (tautan pribadi, wajib — otomatis ditambahkan bila tidak ada) {{masa}} (hari berlaku) {{url}} {{yayasan}} {{tu}}. Baris berisi {{rincian}}, {{pdf}}, {{thp}}, {{bruto}}, {{potongan}} otomatis dibuang — <b>nominal gaji tidak pernah dikirim lewat WhatsApp</b>. Format: *tebal*, _miring_. Teks saja, jadi jalan di paket gratis Fonnte.</p><button type="button" class="btn btn-ghost btn-sm" data-action="previewMsg" data-id=""><i class="bi bi-chat-square-text"></i> Pratinjau Pesan</button></div>' + waTokenCard() : '') + '</div></div>').join('');
};
/** URL dasar tautan pribadi WhatsApp yang dipakai server. */
function urlHint() {
  const u = App.d.webUrl || '';
  return '<p class="tiny text-muted-2 mt-2 mb-0"><i class="bi bi-link-45deg"></i> Tautan pribadi WhatsApp & surel memakai: ' + (u ? '<span class="mono text-break">' + esc(u) + (u.indexOf('?') >= 0 ? '&' : '?') + 's=…</span>' : '<b class="text-danger">URL belum diketahui — isi kolom di atas</b>') + '. Kosongkan kolom di atas untuk memakai alamat bawaan <span class="mono">https://slipgaji-blush.vercel.app/</span>. Backend API: <span class="mono text-break">' + esc(typeof GAS_URL === 'string' ? GAS_URL : '-') + '</span></p>';
}
/** Kartu Client ID OAuth Google (opsional) — tombol "Masuk dengan Google" di halaman login. */
function googleCard() {
  const gl = App.d.googleLogin || {};
  return '<div class="wa-token mt-3"><div class="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-2"><b><i class="bi bi-google"></i> Login Google (opsional)</b>' + (gl.ready ? '<span class="status ok"><i class="bi bi-shield-check"></i> Aktif</span>' : '<span class="status warn"><i class="bi bi-dash-circle"></i> Nonaktif</span>') + '</div>' +
    '<div class="d-flex flex-wrap gap-2"><div class="input-icon flex-grow-1" style="min-width:220px"><i class="bi bi-person-badge"></i><input type="text" id="gcidIn" class="form-control" autocomplete="off" spellcheck="false" value="' + esc(gl.clientId || '') + '" placeholder="1234567890-abc….apps.googleusercontent.com" aria-label="Client ID OAuth Google"></div>' +
    '<button type="button" class="btn btn-primary-app" data-action="saveGoogleId"><i class="bi bi-save"></i> Simpan Client ID</button>' + (gl.ready ? '<button type="button" class="btn btn-ghost text-danger" data-action="clearGoogleId" aria-label="Nonaktifkan login Google"><i class="bi bi-trash3"></i></button>' : '') + '</div>' +
    '<ol class="tiny text-muted-2 mt-2 mb-0 ps-3"><li>Google Cloud Console → APIs & Services → Credentials → <b>Create OAuth client ID</b> (Web application).</li><li><b>Authorized JavaScript origins</b>: <span class="mono">' + esc(location.origin) + '</span></li><li>Salin Client ID ke sini → Simpan. Pengguna masuk dengan akun Google yang emailnya terdaftar di Data Pegawai / Kelola Akun.</li></ol></div>';
}
// ── Logo yayasan ──
const BRAND_ICON = '<i class="bi bi-bank2"></i>';
/** Terapkan logo ke semua tanda merek (sidebar, halaman masuk, topbar ponsel). Kosong = emblem bawaan. */
function applyLogo(src) {
  src = src || '';
  if (App.ui.logoApplied === src) return;
  App.ui.logoApplied = src;
  $$('.brand-mark').forEach(el => { el.classList.toggle('has-logo', !!src); el.innerHTML = src ? '<img src="' + esc(src) + '" alt="Logo yayasan">' : BRAND_ICON; });
}
function logoCard() {
  const st = App.d.settings || {}, src = st.logo || '', sumber = st.logoSumber || (src ? 'url' : 'bawaan');
  const slipId = pickSlipPreview();
  return '<div class="logo-card mt-3"><div class="logo-prev' + (src ? ' has-logo' : '') + '">' + (src ? '<img src="' + esc(src) + '" alt="Logo yayasan saat ini">' : BRAND_ICON) + '</div>' +
    '<div class="flex-grow-1 min-w-0"><div class="d-flex flex-wrap gap-2 align-items-center mb-1"><b>Logo Yayasan</b><span class="status ' + (sumber === 'unggah' ? 'ok' : 'wait') + '">' + ({ unggah: 'Logo unggahan', url: 'URL eksternal', bawaan: 'Emblem bawaan' }[sumber] || '') + '</span></div>' +
    '<p class="small text-muted-2 mb-2">Tampil di sidebar, halaman masuk, kop slip PDF, dan kepala surel. Format PNG, JPG, atau WebP (maks. 5 MB) — otomatis dibuat persegi & dioptimalkan. Gunakan PNG berlatar transparan agar rapi.</p>' +
    '<div class="d-flex flex-wrap gap-2"><label class="btn btn-primary-app btn-sm mb-0" for="logoFile" tabindex="0"><i class="bi bi-upload"></i> ' + (src ? 'Ganti Logo' : 'Unggah Logo') + '</label><input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp" class="visually-hidden">' +
    (src ? '<button type="button" class="btn btn-ghost btn-sm text-danger" data-action="removeLogo"><i class="bi bi-trash3"></i> Hapus Logo</button>' : '') +
    (slipId ? '<button type="button" class="btn btn-ghost btn-sm" data-action="previewSlip" data-id="' + esc(slipId) + '"><i class="bi bi-eye"></i> Lihat di Slip</button>' : '') + '</div></div></div>';
}
/** Gambar → kanvas persegi ≤ 320 px (PNG; bila terlalu besar → JPEG berlatar putih). */
function prepLogo(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const S = 320, k = Math.min(1, S / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k)), side = Math.max(w, h);
      const c = document.createElement('canvas'); c.width = side; c.height = side;
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
      URL.revokeObjectURL(url);
      let d = c.toDataURL('image/png');
      if (d.length > 500000) { const c2 = document.createElement('canvas'); c2.width = c2.height = side; const g2 = c2.getContext('2d'); g2.fillStyle = '#fff'; g2.fillRect(0, 0, side, side); g2.drawImage(c, 0, 0); d = c2.toDataURL('image/jpeg', 0.88); }
      res({ dataUrl: d, b64: d.split(',')[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Gambar tidak terbaca')); };
    img.src = url;
  });
}
async function uploadLogo(input) {
  const f = input.files && input.files[0]; input.value = '';
  if (!f) return;
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast('Pilih gambar PNG, JPG, atau WebP.', 'warning', 'Format tidak didukung');
  if (f.size > 5 * 1024 * 1024) return toast('Ukuran gambar maksimal 5 MB.', 'warning');
  let out; try { out = await prepLogo(f); } catch (e) { return toast('Gambar tidak dapat dibaca. Coba berkas lain.', 'danger'); }
  const st = App.d.settings, prev = { logo: st.logo, logoSumber: st.logoSumber };
  st.logo = out.dataUrl; st.logoSumber = 'unggah'; applyLogo(out.dataUrl); RENDER.pengaturan(); // instan
  try { const r = await api('apiUploadLogo', { b64: out.b64, name: f.name }); st.logo = r.logo; App.ui.htmlCache = {}; sess.set('boot', App.d); applyLogo(r.logo); toast('Slip PDF, surel, dan tampilan aplikasi kini memakai logo baru.', 'success', 'Logo yayasan tersimpan'); }
  catch (e) { Object.assign(st, prev); applyLogo(prev.logo); RENDER.pengaturan(); fail(e); }
}

async function saveSettings(btn) {
  const fd = new FormData($('#setForm')); const obj = {}; fd.forEach((v, k) => obj[k] = v);
  if (obj.ModeUji === 'Tidak' && App.d.settingsFull.ModeUji !== 'Tidak' && !(await confirmBox({ title: 'Matikan Mode Uji?', sub: 'Slip akan dikirim langsung ke pegawai', body: 'Pastikan alamat surel dan No. WhatsApp pegawai sudah benar. Pengiriman berikutnya akan diterima oleh pegawai.', ok: 'Ya, Mode Produksi' }))) return;
  const prev = Object.assign({}, App.d.settingsFull);
  Object.assign(App.d.settingsFull, obj); App.d.settings.modeUji = obj.ModeUji; App.d.settings.singkatan = obj.Singkatan; updateChrome(); // optimistic
  busy(btn, true, 'Menyimpan…');
  try {
    const st = await api('apiSaveSettings', obj); App.d.settingsFull = st; App.d.settings = Object.assign(App.d.settings, { singkatan: st.Singkatan, namaYayasan: st.NamaYayasan, telepon: st.Telepon, wa: st.WhatsAppTU, email: st.EmailKeuangan, modeUji: st.ModeUji, metode: st.MetodeKirim, pensiunGuru: Number(st.UsiaPensiunGuru) || 60, pensiunKaryawan: Number(st.UsiaPensiunKaryawan) || 58, aksesTautan: st.AksesTautan, masaTautan: Number(st.MasaTautan) || 14 }); sess.set('boot', App.d); updateChrome(); toast('Pengaturan disimpan.', 'success');
    if (prev.MetodeKirim !== st.MetodeKirim || prev.URLAplikasi !== st.URLAplikasi) apiSilent('apiRefresh').then(b => { applyBoot(b); rerender(); }).catch(() => { }); // validasi kontak draft ikut berubah
    RENDER.pengaturan();
  }
  catch (e) { App.d.settingsFull = prev; App.d.settings.modeUji = prev.ModeUji; updateChrome(); fail(e); }
  finally { busy(btn, false); }
}

// ── BANTUAN (Pegawai) ─────────────────────────────────────────
RENDER.bantuan = function () {
  const masa = (App.d && App.d.settings && App.d.settings.masaTautan) || 14;
  const faq = [['Kapan slip gaji terbit?', 'Slip diterbitkan setelah Bendahara Yayasan memvalidasi rekap gaji, biasanya pada tanggal pencairan. Anda menerima surel dan/atau pesan WhatsApp dari Bendahara, dan slip juga tersedia di menu Slip Saya.'],
    ['Bagaimana cara melihat slip gaji?', 'Dua cara: (1) ketuk tautan pribadi di pesan WhatsApp dari Bendahara — slip langsung terbuka di akun Anda (tautan berlaku ' + masa + ' hari); atau (2) buka Portal Pegawai dan masuk dengan NRP & kata sandi. Pesan WhatsApp tidak memuat nominal gaji demi kerahasiaan.'],
    ['Tautan WhatsApp saya tidak bisa dibuka.', 'Tautan berlaku ' + masa + ' hari dan diganti bila slip dikirim ulang. Setelah kedaluwarsa, buka tautan yang sama lalu masuk dengan NRP & kata sandi — slip tetap tersedia. Jangan meneruskan tautan kepada orang lain.'], ['Mengapa saya diminta PIN saat mengunduh?', 'PIN 6 digit melindungi unduhan PDF dari orang lain yang memegang perangkat Anda. Verifikasi berlaku 15 menit.'], ['Saya lupa kata sandi / PIN.', 'Hubungi Tata Usaha unit Anda. Petugas akan mereset dan memberikan kata sandi sementara, lalu Anda membuat sandi & PIN baru.'], ['Akun saya terkunci.', 'Akun terkunci 15 menit setelah 5 kali salah sandi/PIN. Tunggu atau minta Tata Usaha membuka kunci.'], ['Nominal slip tidak sesuai.', 'Gunakan tombol WhatsApp TU di bawah sebelum tanggal 20 bulan berjalan. Koreksi akan diterbitkan sebagai slip Revisi.']];
  $('#helpBody').innerHTML = '<p class="eyebrow">Bantuan & Akun</p><h1>Pusat Bantuan Tata Usaha</h1><p class="text-muted-2">Pertanyaan umum seputar slip gaji digital.</p>' + faq.map(f => '<details class="card-app mb-2"><summary class="fw-semibold" style="cursor:pointer;min-height:28px">' + esc(f[0]) + '</summary><p class="small text-muted-2 mt-2 mb-0">' + esc(f[1]) + '</p></details>').join('') + helpCard() + '<button class="btn btn-ghost w-100 mt-3 text-danger" data-action="logout"><i class="bi bi-box-arrow-right"></i> Keluar Sesi</button>';
};

// ── MODAL GENERIK ─────────────────────────────────────────────
/** Tunggu hingga tidak ada modal lain yang terbuka (hindari modal bertumpuk). */
function whenNoModal() {
  return new Promise(res => { let n = 0; (function chk() { if (!document.querySelector('.modal.show, .modal-backdrop') || n++ > 25) res(); else setTimeout(chk, 100); })(); });
}
async function confirmBox(o) {
  await whenNoModal();
  $('#confirmTitle').textContent = o.title || 'Konfirmasi';
  $('#confirmSub').textContent = o.sub || '';
  $('#confirmIcon').className = 'confirm-icon' + (o.iconOk || o.okCls === 'btn-primary-app' ? ' ok' : '');
  $('#confirmIcon').innerHTML = '<i class="bi ' + (o.icon || 'bi-question-lg') + '"></i>';
  $('#confirmBody').innerHTML = o.body || '';
  if (o.onOpen) o.onOpen();
  const ok = $('#confirmOk'); ok.className = 'btn ' + (o.okCls || 'btn-primary-app'); ok.textContent = o.ok || 'Ya, Lanjutkan';
  $('#confirmModal .modal-footer .btn-ghost').hidden = !!o.noCancel;
  return new Promise(res => {
    let decided = false;
    ok.onclick = () => {
      if (o.validate) { const v = o.validate(); if (v !== true) { toast(v, 'warning'); return; } }
      decided = true; const val = o.collect ? o.collect() : true; confirmModal.hide(); res(val);
    };
    $('#confirmModal').addEventListener('hidden.bs.modal', () => { if (!decided) res(false); }, { once: true });
    confirmModal.show();
  });
}
function openForm(o) {
  $('#formModalTitle').textContent = o.title; $('#formModalBody').innerHTML = o.body; $('#formModalErr').textContent = '';
  const sb = $('#formModalSubmit'); sb.textContent = o.submit || 'Simpan';
  const form = $('#formModalForm');
  form.onsubmit = async e => {
    e.preventDefault();
    if (!form.checkValidity()) { form.classList.add('was-validated'); const bad = form.querySelector(':invalid'); $('#formModalErr').textContent = 'Periksa kolom: ' + (bad && bad.labels && bad.labels[0] ? bad.labels[0].textContent.replace('*', '').trim() : 'wajib'); bad && bad.focus(); return; }
    const data = {}; new FormData(form).forEach((v, k) => data[k] = String(v).trim());
    busy(sb, true, 'Menyimpan…');
    try { await o.onSubmit(data); formModal.hide(); }
    catch (err) { $('#formModalErr').textContent = err.message || 'Gagal menyimpan.'; }
    finally { busy(sb, false); }
  };
  form.classList.remove('was-validated');
  if (o.onOpen) o.onOpen(form);
  formModal.show();
  setTimeout(() => { const f = form.querySelector('input:not([readonly]),select'); f && f.focus(); }, 300);
}

// ── AKSI (event delegation) ───────────────────────────────────
const ACTIONS = {
  logout: () => logout(),
  downloadTemplate: () => downloadTemplate(),
  resetUpload: () => { App.ui.upload = null; RENDER.upload(); },
  seeRow: (id) => { $('#pvSearch').value = id; App.ui.pages.pv = { page: 1 }; navigateTo('preview'); },
  openPeriode: (id) => { App.ui.currentPeriode = id; $('#pvSearch').value = ''; App.ui.pages.pv = { page: 1 }; const p = App.idx.per[id]; navigateTo(p && p.status === 'Sedang Dikirim' ? 'progress' : 'preview'); },
  openRiwayat: (id) => { App.ui.rwPeriode = id; navigateTo('riwayat'); },
  isolate: () => { $('#pvHide').checked = !$('#pvHide').checked; RENDER.preview(); },
  exportValidasi: () => { const sl = App.idx.slipsByPer[App.ui.currentPeriode] || []; csvDownload('Validasi_' + App.ui.currentPeriode + '.csv', [['NRP', 'Nama', 'Unit', 'Email', 'No. WhatsApp', 'Bruto', 'Potongan', 'THP', 'Status Validasi', 'Catatan', 'Status Surel', 'Status WhatsApp']].concat(sl.map(s => [s.nrp, s.nama, s.unit, s.email, (App.idx.peg[s.nrp] || {}).NoWA || '', s.bruto, s.pot, s.thp, s.sv, s.cv, s.se, s.sw || '-']))); },
  deleteDraft: async () => { const id = App.ui.currentPeriode; if (!(await confirmBox({ title: 'Hapus draft periode?', sub: id, body: 'Seluruh baris slip draft dan berkas Excel arsip periode ini akan dihapus.', ok: 'Hapus Draft', okCls: 'btn-danger-soft' }))) return; try { applyBoot(await api('apiDeletePeriodeDraft', id)); App.ui.currentPeriode = null; App.ui.upload = null; toast('Draft dihapus.', 'success'); rerender(); } catch (e) { fail(e); } },
  confirmDispatch: () => confirmDispatch(),
  previewSlip: id => previewSlip(id),
  downloadSlip: id => downloadSlip(id),
  downloadCurrentSlip: () => downloadSlip(App.ui.slipCurrent),
  printSlip: () => { try { $('#slipFrame').contentWindow.print(); } catch (e) { toast('Cetak tidak tersedia di peramban ini — unduh PDF lalu cetak.', 'warning'); } },
  registerPeg: id => { const s = App.idx.slip[id]; pegawaiForm(null, { NRP: s.nrp, Nama: s.nama, Unit: App.d.units.indexOf(s.unit) >= 0 ? s.unit : '', Email: s.email, Jabatan: s.jab }); },
  fixEmail: async id => {
    const s = App.idx.slip[id]; if (!s) return;
    const r = await confirmBox({ title: 'Perbaiki Alamat Surel', sub: s.nama + ' · NRP ' + s.nrp, icon: 'bi-envelope-exclamation', ok: 'Simpan & Validasi', body: (s.cv || s.err ? '<div class="alert-soft warn small mb-3">' + esc(s.cv || s.err) + '</div>' : '') + '<label class="form-label" for="fixEm">Alamat surel yang benar</label><input id="fixEm" type="email" class="form-control" value="' + esc(String(s.email || '').replace(/gmial|gmaill|gamil|gmai\.\.?/i, 'gmail').replace(/\.\.+/g, '.')) + '"><label class="check-row mt-3"><input type="checkbox" id="fixMaster" checked> <span>Perbarui juga di <b>Master Data Pegawai</b></span></label>' + (s.sk === 'Gagal' ? '<label class="check-row mt-2"><input type="checkbox" id="fixResend" checked> <span>Kirim ulang slip setelah disimpan</span></label>' : ''),
      validate: () => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($('#fixEm').value.trim()) || 'Format surel belum valid.', collect: () => ({ email: $('#fixEm').value.trim(), master: $('#fixMaster').checked, resend: $('#fixResend') ? $('#fixResend').checked : false }) });
    if (!r) return;
    const prev = { email: s.email, sv: s.sv, cv: s.cv };
    s.email = r.email; s.sv = 'VALID'; s.cv = ''; rerender(); // optimistic
    try { applyBoot(await api('apiFixSlipEmail', id, r.email, r.master)); toast('Surel diperbarui.', 'success'); if (r.resend) startDispatch(s.p, 'single', id); rerender(); }
    catch (e) { Object.assign(s, prev); rerender(); fail(e); }
  },
  approveSlip: async id => { const s = App.idx.slip[id]; if (!(await confirmBox({ title: 'Setujui anomali ringan?', sub: s.nama, body: '<div class="alert-soft warn small">' + esc(s.cv) + '</div><p class="small mt-2 mb-0">Baris akan ditandai valid (tercatat di log audit dengan nama Anda).</p>', ok: 'Setujui' }))) return; try { applyBoot(await api('apiApproveSlip', id)); toast('Baris disetujui.', 'success'); rerender(); } catch (e) { fail(e); } },
  resendSlip: async id => {
    const s = App.idx.slip[id]; if (!s) return;
    const gagal = ['email', 'wa'].filter(ch => s[CH[ch].k] === 'Gagal'), kanal = gagal.length ? gagal : kanalAktif();
    if (kanal.indexOf('wa') >= 0 && !(App.d.waGateway || {}).ready) return toast('Simpan token WhatsApp gateway di Pengaturan terlebih dahulu.', 'warning', 'Token belum diatur');
    const p = App.idx.peg[s.nrp] || {};
    const tujuan = kanal.map(ch => ch === 'email' ? s.email : fmtWA(p.NoWA) || '(No. WA kosong)').join(' · ');
    if (!(await confirmBox({ title: 'Kirim ulang slip?', sub: s.nama + ' · ' + tujuan, icon: 'bi-arrow-repeat', body: 'PDF dibuat ulang dan dikirim ulang via <b>' + esc(kanalTxt(kanal)) + '</b>' + (gagal.length ? ' (kanal yang gagal)' : '') + '. Slip lama di Drive dipindahkan ke sampah.', ok: 'Kirim Ulang' }))) return;
    kanal.forEach(ch => s[CH[ch].k] = 'Menunggu'); s.sk = 'Menunggu'; rerender(); startDispatch(s.p, 'single', id);
  },
  previewMsg: async id => {
    id = id || pickSlipPreview();
    if (!id) return toast('Belum ada slip untuk dipratinjau. Unggah rekap gaji terlebih dahulu.', 'warning');
    await whenNoModal();
    const s = App.idx.slip[id];
    $('#msgEmail').innerHTML = '<div class="text-center py-5 text-muted-2" role="status"><span class="spinner-border text-success"></span><p class="mt-2 mb-0">Menyusun isi pesan…</p></div>'; $('#msgWa').innerHTML = '';
    msgTab(metodeNow() === 'WhatsApp' ? 'wa' : 'email');
    msgModal.show();
    try { renderMsgPreview(await api('apiPreviewPesan', id), s); }
    catch (e) { msgModal.hide(); fail(e); }
  },
  msgTab: id => msgTab(id),
  msgEditTpl: () => { msgModal.hide(); navigateTo('pengaturan'); },
  setMetode: async id => {
    if (!METODE[id] || id === metodeNow()) return;
    const prev = metodeNow();
    App.d.settingsFull.MetodeKirim = id; App.d.settings.metode = id; rerender(); // instan
    try { applyBoot(await api('apiSetMetodeKirim', id, App.ui.currentPeriode || '')); rerender(); toast('Slip akan dikirim via ' + METODE[id].lbl + '. Validasi kontak diperbarui.', 'success', 'Metode pengiriman'); }
    catch (e) { App.d.settingsFull.MetodeKirim = prev; App.d.settings.metode = prev; rerender(); fail(e); }
  },
  fixWA: async id => {
    const s = App.idx.slip[id]; if (!s) return;
    const p = App.idx.peg[s.nrp] || {};
    const why = s.sw === 'Gagal' || s.sw === 'Dilewati' ? s.ew : /WhatsApp/.test(s.cv || '') ? s.cv : '';
    const r = await confirmBox({ title: 'Perbaiki No. WhatsApp', sub: s.nama + ' · NRP ' + s.nrp, icon: 'bi-whatsapp', ok: 'Simpan & Validasi',
      body: (why ? '<div class="alert-soft warn small mb-3">' + esc(why) + '</div>' : '') + '<label class="form-label" for="fixWa">Nomor WhatsApp aktif pegawai</label><div class="input-icon"><i class="bi bi-whatsapp"></i><input id="fixWa" type="tel" inputmode="tel" autocomplete="off" class="form-control" placeholder="0812-3456-7890" value="' + esc(p.NoWA ? fmtWA(p.NoWA) : '') + '"></div><p class="tiny text-muted-2 mt-2 mb-0">Disimpan di Master Data Pegawai (format 62…), dipakai untuk pengiriman berikutnya.</p>' + (s.sw === 'Gagal' ? '<label class="check-row mt-3"><input type="checkbox" id="fixWaResend" checked> <span>Kirim ulang slip via WhatsApp setelah disimpan</span></label>' : ''),
      validate: () => { const d = $('#fixWa').value.replace(/\D/g, ''); return /^(0|62|8)\d{8,13}$/.test(d) || 'Nomor WhatsApp belum valid (contoh 0812-3456-7890).'; },
      collect: () => ({ wa: $('#fixWa').value.trim(), resend: $('#fixWaResend') ? $('#fixWaResend').checked : false }) });
    if (!r) return;
    try {
      applyBoot(await api('apiFixSlipWA', id, r.wa)); rerender();
      toast('No. WhatsApp ' + s.nama + ' diperbarui.', 'success');
      if (r.resend) { if ((App.d.waGateway || {}).ready) startDispatch(s.p, 'single', id); else toast('Simpan token WhatsApp di Pengaturan untuk mengirim ulang.', 'warning'); }
    } catch (e) { fail(e); }
  },
  removeLogo: async () => {
    if (!(await confirmBox({ title: 'Hapus logo yayasan?', sub: 'Kembali ke emblem bawaan', icon: 'bi-image', okCls: 'btn-danger', ok: 'Hapus Logo', body: 'Slip PDF, surel, dan tampilan aplikasi akan memakai emblem bawaan. Berkas logo dipindahkan ke sampah Drive.' }))) return;
    try { await api('apiRemoveLogo'); Object.assign(App.d.settings, { logo: '', logoSumber: 'bawaan' }); if (App.d.settingsFull) App.d.settingsFull.LogoUrl = ''; App.ui.htmlCache = {}; sess.set('boot', App.d); applyLogo(''); RENDER.pengaturan(); toast('Logo dihapus.', 'success'); } catch (e) { fail(e); }
  },
  saveGoogleId: async (id, btn) => {
    const v = $('#gcidIn').value.trim();
    if (!v) return toast('Tempel Client ID OAuth dari Google Cloud Console.', 'warning');
    busy(btn, true, 'Menyimpan…');
    try { App.d.googleLogin = await api('apiSaveGoogleClientId', v); sess.set('boot', App.d); RENDER.pengaturan(); toast('Login Google aktif. Tombol "Masuk dengan Google" tampil di halaman masuk.', 'success', 'Login Google'); }
    catch (e) { fail(e); } finally { busy(btn, false); }
  },
  clearGoogleId: async () => {
    if (!(await confirmBox({ title: 'Nonaktifkan login Google?', sub: 'Client ID OAuth', icon: 'bi-google', okCls: 'btn-danger', ok: 'Nonaktifkan', body: 'Tombol "Masuk dengan Google" disembunyikan. Pengguna tetap bisa masuk dengan NRP & kata sandi.' }))) return;
    try { App.d.googleLogin = await api('apiSaveGoogleClientId', ''); sess.set('boot', App.d); RENDER.pengaturan(); toast('Login Google dinonaktifkan.', 'success'); } catch (e) { fail(e); }
  },
  saveWAToken: async (id, btn) => {
    const v = $('#waTokenIn').value.trim();
    if (!v) return toast('Tempel token perangkat dari dasbor Fonnte.', 'warning');
    busy(btn, true, 'Menyimpan…');
    try { App.d.waGateway = await api('apiSaveWAToken', v); $('#waTokenIn').value = ''; sess.set('boot', App.d); RENDER.pengaturan(); toast('Token WhatsApp tersimpan di Script Properties (' + App.d.waGateway.masked + ').', 'success', 'WhatsApp Gateway'); }
    catch (e) { fail(e); } finally { busy(btn, false); }
  },
  clearWAToken: async () => {
    if (!(await confirmBox({ title: 'Hapus token WhatsApp?', sub: 'Gateway Fonnte', icon: 'bi-trash3', okCls: 'btn-danger', ok: 'Hapus Token', body: 'Pengiriman lewat WhatsApp tidak dapat dilakukan sampai token baru disimpan.' }))) return;
    try { App.d.waGateway = await api('apiSaveWAToken', ''); sess.set('boot', App.d); RENDER.pengaturan(); toast('Token WhatsApp dihapus.', 'success'); } catch (e) { fail(e); }
  },
  testWA: async (id, btn) => {
    const no = ($('#set_NomorUjiWA') && $('#set_NomorUjiWA').value.trim()) || '';
    const tu = ($('#set_WhatsAppTU') && $('#set_WhatsAppTU').value.trim()) || '';
    if (no && !normWAClient(no)) {
      const f = $('#set_NomorUjiWA'); if (f) { f.classList.add('is-invalid'); f.focus(); setTimeout(() => f.classList.remove('is-invalid'), 4000); }
      return toast('Nomor penerima uji "' + no + '" tidak valid. Contoh: 0812-3456-7890 atau 6281234567890.', 'warning', 'Periksa nomor uji');
    }
    busy(btn, true, 'Mengirim uji…');
    let r = null;
    try { r = await api('apiTestWA', no, tu); }
    catch (e) { fail(e); return; } finally { busy(btn, false); }
    if (r && (r.ok === false || r.sebagian)) return waTestDialog(r);
    toast('Pesan uji masuk antrean gateway ke ' + fmtWA(r.to) + '. Periksa WhatsApp di nomor tersebut' + (r.url ? '' : ' — URL aplikasi belum diketahui, isi di Identitas Yayasan') + '.', r.url ? 'success' : 'warning', 'Uji WhatsApp berhasil');
  },
  resendFailed: () => { const j = App.d.dispatch && App.d.dispatch.job; if (j) startDispatch(j.idPeriode, 'failed'); },
  pauseJob: async () => { App.ui.worker = false; try { applyDispatch(await api('apiPauseDispatch', true)); toast('Pengiriman dijeda.', 'warning'); } catch (e) { fail(e); } },
  resumeJob: async () => { try { applyDispatch(await api('apiPauseDispatch', false)); startWorker(); toast('Pengiriman dilanjutkan.', 'success'); } catch (e) { fail(e); } },
  copyLog: () => { const t = $('#consoleBody').innerText; if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('Log disalin.', 'success')); },
  addPegawai: () => pegawaiForm(null),
  pegTemplate: mode => downloadPegawaiTemplate(mode),
  pegExport: fmt => pegExportDialog(fmt),
  deletePeg: id => deletePegawai('nrp', id),
  deletePegUnit: () => deletePegawai('unit', ($('#pegUnit') && $('#pegUnit').value) || ''),
  deletePegAll: () => deletePegawai('all', ''),
  editPeg: id => pegawaiForm(App.idx.peg[id]),
  togglePeg: id => togglePeg(id),
  sendCredBulk: async () => {
    const target = (App.d.akun || []).filter(a => a.peran === ROLE.P && a.wajib && a.status === 'Aktif');
    if (!target.length) return toast('Semua pegawai sudah mengganti sandi awal.', 'success');
    if (!(await confirmBox({ title: 'Kirim kredensial awal?', sub: target.length + ' pegawai belum pernah login', icon: 'bi-envelope-at', body: '<p>Sandi sementara baru dibuat dan dikirim ke surel masing-masing (maks. 150 per proses).</p>' + (App.d.settings.modeUji === 'Ya' ? '<div class="alert-soft warn small">Mode Uji aktif: surel dialihkan ke pemilik skrip.</div>' : ''), ok: 'Kirim ' + Math.min(150, target.length) + ' Surel' }))) return;
    try { const r = await api('apiSendCredentials', target.map(a => a.id)); App.d.akun = r.akun; applyBoot(App.d); toast(r.sent + ' kredensial terkirim' + (r.gagal.length ? ', ' + r.gagal.length + ' gagal' : '') + '.', r.gagal.length ? 'warning' : 'success'); rerender(); } catch (e) { fail(e); }
  },
  exportRiwayat: () => { const isY = App.role === ROLE.Y; const ps = $('#rwPeriode').value; const sl = (App.d.slips || []).filter(s => !ps || s.p === ps); csvDownload('Riwayat_' + (ps || 'semua') + '.csv', [['Periode', 'NRP', 'Nama', 'Unit', 'Email', 'Status Kirim', 'Status Surel', 'Tgl Surel', 'Status WhatsApp', 'Tgl WhatsApp', 'Dilihat Pegawai', 'Keterangan'].concat(isY ? ['THP'] : [])].concat(sl.map(s => [s.p, s.nrp, s.nama, s.unit, s.email, s.sk, s.se, s.te, s.sw || '-', s.tw, s.lihat || '', s.err].concat(isY ? [s.thp] : [])))); },
  reloadAudit: async () => { try { App.d.audit = await api('apiGetAudit'); renderAudit(); toast('Log audit diperbarui.', 'success'); } catch (e) { fail(e); } },
  auditFor: id => { App.ui.page = 'riwayat'; navigateTo('riwayat'); $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'rw-audit')); $$('.tab-pane-app').forEach(p => p.classList.toggle('active', p.id === 'rw-audit')); $('#auSearch').value = id; renderAudit(); },
  addAkun: () => akunForm(null),
  editAkun: id => akunForm(App.idx.akun[String(id).toLowerCase()]),
  toggleAkun: id => toggleAkun(id),
  resetPass: id => resetPass(id),
  unlock: id => unlockAkun(id),
  saveSettings: (id, btn) => saveSettings(btn),
  toggleSensor: () => { store.set('sensor', !store.get('sensor', false)); RENDER.portal(); },
  portalTab: id => { App.ui.portalFilter.tab = id; RENDER.portal(); },
  forgotPin: () => { pinModal.hide(); confirmBox({ title: 'Lupa PIN dokumen?', icon: 'bi-headset', iconOk: true, noCancel: true, ok: 'Mengerti', body: '<ol class="small ps-3"><li>Hubungi Tata Usaha unit Anda dan minta <b>Reset PIN</b>.</li><li>Setelah direset, buka menu <b>Keamanan</b> → isi kata sandi saat ini → buat PIN baru (kata sandi tidak perlu diganti).</li><li>Unduh slip dengan PIN baru.</li></ol><p class="small text-muted-2">Masih ingat PIN lama? Anda juga bisa menggantinya sendiri kapan saja di menu Keamanan.</p>' + helpCard() }); },
  againSecurity: () => { RENDER.keamanan(); window.scrollTo({ top: 0 }); },
  resetPin: async id => {
    const a = App.idx.akun[String(id).toLowerCase()] || { id: id, nama: id };
    if (!(await confirmBox({ title: 'Reset PIN dokumen?', sub: a.nama + ' · ' + a.id, icon: 'bi-123', ok: 'Reset PIN',
      body: '<p>PIN lama dihapus. Pegawai lalu membuat PIN baru sendiri di menu <b>Keamanan</b> (cukup dengan kata sandinya — kata sandi tidak berubah).</p><div class="alert-soft info small"><i class="bi bi-shield-check"></i> Pastikan permintaan berasal dari pegawai yang bersangkutan. Tindakan dicatat di log audit.</div>' }))) return;
    try { const r = await api('apiResetPin', id); const k = String(id).toLowerCase(); if (App.idx.akun[k]) Object.assign(App.idx.akun[k], r.akun); toast('PIN ' + a.nama + ' direset. Minta pegawai membuat PIN baru di menu Keamanan.', 'success'); rerender(); }
    catch (e) { fail(e); }
  }
};
document.addEventListener('click', e => {
  const nav = e.target.closest('[data-nav]');
  if (nav) { e.preventDefault(); navigateTo(nav.dataset.nav); return; }
  const act = e.target.closest('[data-action]');
  if (act && ACTIONS[act.dataset.action]) { e.preventDefault(); ACTIONS[act.dataset.action](act.dataset.id, act); }
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.step[data-nav]')) { e.preventDefault(); navigateTo(e.target.dataset.nav); } });

// ── INISIALISASI ──────────────────────────────────────────────
function bindStatic() {
  slipModal = new bootstrap.Modal('#slipModal'); pinModal = new bootstrap.Modal('#pinModal'); formModal = new bootstrap.Modal('#formModal'); confirmModal = new bootstrap.Modal('#confirmModal'); msgModal = new bootstrap.Modal('#msgModal');
  document.addEventListener('change', e => { if (e.target.id === 'logoFile') uploadLogo(e.target); });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('label[for="logoFile"]')) { e.preventDefault(); $('#logoFile').click(); } });
  $('#pinModal').addEventListener('hidden.bs.modal', () => { if (App.ui.pinResolve) { App.ui.pinResolve(false); App.ui.pinResolve = null; } });
  $('#keypad').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(k => k ? '<button type="button" data-k="' + k + '" aria-label="' + (k === 'del' ? 'Hapus' : k) + '">' + (k === 'del' ? '<i class="bi bi-backspace"></i>' : k) + '</button>' : '<span></span>').join('');
  $('#keypad').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) pinKey(b.dataset.k); });
  document.addEventListener('keydown', e => { if ($('#pinModal').classList.contains('show')) { if (/^\d$/.test(e.key)) pinKey(e.key); else if (e.key === 'Backspace') pinKey('del'); } });
  $('#loginForm').addEventListener('submit', doLogin);
  $('#googleBtn').addEventListener('click', doGoogleLogin);
  $$('[data-toggle-pass]').forEach(b => b.addEventListener('click', () => { const i = $('#' + b.dataset.togglePass); i.type = i.type === 'password' ? 'text' : 'password'; b.querySelector('i').className = 'bi ' + (i.type === 'password' ? 'bi-eye' : 'bi-eye-slash'); }));
  $('#menuBtn').addEventListener('click', openSidebar); $('#sidebarBackdrop').addEventListener('click', closeSidebar);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });
  $('#themeBtn').addEventListener('click', () => { const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', t); store.set('theme', t); try { localStorage.setItem('sg_theme', t); } catch (e) { } $('#themeBtn i').className = 'bi ' + (t === 'dark' ? 'bi-sun' : 'bi-moon-stars'); if (App.role) rerender(); });
  $('#themeBtn i').className = 'bi ' + (document.documentElement.getAttribute('data-theme') === 'dark' ? 'bi-sun' : 'bi-moon-stars');
  $('#refreshBtn').addEventListener('click', e => refreshAll(e.currentTarget));
  // Filter lokal (debounce, tanpa server)
  const rr = debounce(() => { Object.keys(App.ui.pages).forEach(k => App.ui.pages[k].page = 1); rerender(); }, 200);
  ['#dashSearch', '#pvSearch', '#pegSearch', '#rwSearch', '#akSearch'].forEach(s => $(s).addEventListener('input', rr));
  $('#auSearch').addEventListener('input', debounce(() => { App.ui.pages.au = { page: 1 }; renderAudit(); }, 200));
  ['#pvUnit', '#pvStatus', '#pvHide', '#pegUnit', '#pegStatus', '#rwUnit', '#rwStatus', '#rwProblem', '#akPeran', '#akKondisi', '#monUnit', '#monPeriode', '#dashPeriodSel'].forEach(s => $(s).addEventListener('change', rr));
  ['#auKategori', '#auTingkat'].forEach(s => $(s).addEventListener('change', () => { App.ui.pages.au = { page: 1 }; renderAudit(); }));
  $('#rwPeriode').addEventListener('change', e => { App.ui.rwPeriode = e.target.value; rr(); });
  $('#dashPeriodSel').addEventListener('change', e => { App.ui.dashPer = e.target.value; });
  $('#monPeriode').addEventListener('change', e => { App.ui.monPer = e.target.value; });
  $('#pvPeriodSel').addEventListener('change', e => { App.ui.currentPeriode = e.target.value; App.ui.pages.pv = { page: 1 }; RENDER.preview(); });
  ['#upBulan', '#upTahun', '#upJenis'].forEach(s => $(s).addEventListener('change', upHint));
  $('#fileInput').addEventListener('change', e => handleRekapFile(e.target.files[0]));
  $('#importPegInput').addEventListener('change', e => importPegawai(e.target.files[0]));
  const dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => handleRekapFile(e.dataTransfer.files[0]));
  $$('.tab').forEach(t => t.addEventListener('click', () => { $$('.tab').forEach(x => x.classList.toggle('active', x === t)); $$('.tab-pane-app').forEach(p => p.classList.toggle('active', p.id === t.dataset.tab)); }));
  $('#portalPeg').addEventListener('change', e => { const v = e.target.value.trim(); const p = App.idx.peg[v] || App.d.pegawai.find(x => x.Nama.toLowerCase() === v.toLowerCase()); if (p) { App.ui.portalNrp = p.NRP; App.ui.portalFilter = { tab: 'all', q: '' }; RENDER.portal(); } });
  $('#pwForm').addEventListener('submit', submitPassword);
  ['#pwNew', '#pwConfirm'].forEach(s => $(s).addEventListener('input', pwCheck));
  window.addEventListener('beforeunload', e => { if (App.ui.worker) { e.preventDefault(); e.returnValue = ''; } });
}

/** Terapkan data publik (nama yayasan, logo, Login Google) ke halaman masuk & kerangka. */
function applyPublicBoot(B) {
  App.boot = B || {};
  $$('[data-bind="singkatan"]').forEach(e => e.textContent = String(App.boot.singkatan || 'YASMA PB. SOEDIRMAN').toUpperCase());
  applyLogo(App.boot.logo);
  setupGoogleLogin(App.boot.googleClientId || '');
}
function setupWarn(html) { const w = $('#setupWarn'); w.hidden = !html; w.innerHTML = html || ''; }

async function init() {
  bindStatic();
  const hide = () => { const l = $('#bootLoader'); if (!l) return; l.classList.add('hide'); setTimeout(() => l.remove(), 350); };
  if (!gasConfigured()) {
    applyPublicBoot(store.get('pubBoot', {}));
    setupWarn('<div class="api-warn"><i class="bi bi-plug"></i> <b>URL backend belum diisi.</b> Edit <code>js/config.js</code> → isi <code>GAS_URL</code> dengan URL Web App Apps Script (berakhiran <code>/exec</code>), lalu push ulang ke GitHub.</div>');
    showLogin(); hide(); return;
  }
  // Tampilkan instan dari cache, lalu segarkan dari API (boot publik: tanpa data rahasia)
  const cached = store.get('pubBoot', null);
  if (cached) applyPublicBoot(cached);
  let B = cached;
  const fresh = gasGet('boot').then(r => {
    const b = r && r.data ? r.data : null;
    if (r && r.success && b) { store.set('pubBoot', b); applyPublicBoot(b); setupWarn(''); }
    else if (b && b.ready === false) setupWarn('<i class="bi bi-tools"></i> ' + esc(b.error || r.message || 'Aplikasi belum siap.'));
    return b;
  }).catch(e => { if (!cached) setupWarn('<i class="bi bi-wifi-off"></i> ' + esc(e.message || NET_MSG)); return null; });
  if (!cached) B = await fresh;
  // Dibuka dari tautan pribadi WhatsApp/surel? → verifikasi tautan dulu; selain itu pulihkan sesi / tampilkan login
  readLinkParam(tok => { if (tok && !(B && B.ready === false)) openFromLink(tok, hide); else restoreSession(hide); });
}
function restoreSession(hide) {
  // Ada slip tujuan dari tautan → tunggu data segar dari server (bukan salinan sessionStorage)
  const tok = sess.get('tok'), user = sess.get('user'), boot = App.ui.pendingSlip ? null : sess.get('boot');
  if (tok && user) {
    // Render instan dari sessionStorage, lalu validasi sesi di latar belakang
    App.token = tok;
    if (boot) { enterApp({ token: tok, user: user, boot: boot }); hide(); }
    call('apiResume', [tok], { silent: !!boot }).then(res => {
      if (!boot) { enterApp({ token: tok, user: res.user, boot: res.boot }); hide(); }
      else { App.user = res.user; sess.set('user', res.user); if (res.boot) applyBoot(res.boot); renderNav(); updateChrome(); navigateTo(res.user.mustChange ? 'keamanan' : App.ui.page, { keepScroll: true }); }
    }).catch(() => { hide(); });
  } else { showLogin(); hide(); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
