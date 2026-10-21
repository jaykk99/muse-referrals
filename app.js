// Frontend for the Muse referral board.
'use strict';

const listEl = document.getElementById('list');
const metaEl = document.getElementById('meta');
const filterEl = document.getElementById('filter');
const refreshBtn = document.getElementById('refreshBtn');
const sortBtn = document.getElementById('sortBtn');
const favFilterBtn = document.getElementById('favFilterBtn');
const staleFilterBtn = document.getElementById('staleFilterBtn');
const copyAllBtn = document.getElementById('copyAllBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const histToggle = document.getElementById('histToggle');
const histPanel = document.getElementById('histPanel');
const histBody = document.getElementById('histBody');

let ALL = [];
let sortNewest = true;
let favOnly = false;
let hideStale = false;

// --- local code management: favorites + hidden, stored on this device only ---
function lsGet(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v == null ? fallback : v;
  } catch (e) { return fallback; }
}
function lsSet(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode */ }
}
let FAVS = new Set(lsGet('mr:favs', []));
let HIDDEN = new Set(lsGet('mr:hidden', []));
let TRIED = new Set(lsGet('mr:tried', []));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch (e) { return ''; }
}

function ageLabel(c) {
  if (c.ageDays == null) return '';
  if (c.ageDays === 0) return 'today';
  if (c.ageDays === 1) return 'yesterday';
  return c.ageDays + 'd ago';
}

function card(c) {
  const div = document.createElement('div');
  div.className = 'card codecard';
  const fav = FAVS.has(c.code);
  const tried = TRIED.has(c.code);
  div.innerHTML =
    '<div class="coderow">' +
      '<div class="code">' + esc(c.code) + '</div>' +
      '<div class="cardbtns">' +
        '<button class="iconbtn fav' + (fav ? ' on' : '') + '" type="button" data-code="' + esc(c.code) + '" title="' + (fav ? 'Unfavorite' : 'Favorite') + '" aria-label="favorite">★</button>' +
        '<button class="copy" type="button" data-code="' + esc(c.code) + '">Copy</button>' +
      '</div>' +
    '</div>' +
    '<div class="src">🔗 <a href="' + esc(c.source) + '" target="_blank" rel="noopener nofollow">' + esc(c.sourceTitle || c.source) + '</a></div>' +
    (c.terms ? '<div><span class="terms">' + esc(c.terms) + '</span></div>' : '') +
    (c.context ? '<div class="ctx">“' + esc(c.context) + '”</div>' : '') +
    '<div class="found"><span class="unverified">⚠ publicly posted — not verified</span> · found ' + esc(fmtDate(c.foundAt)) +
      (c.ageDays > 0 ? ' (' + esc(ageLabel(c)) + ')' : '') +
      (c.stale ? ' <span class="stale">🕰 probably used up</span>' : '') +
    '</div>' +
    '<div class="manage">' +
      '<button class="linkbtn" type="button" data-act="tried" data-code="' + esc(c.code) + '">' + (tried ? '✓ marked tried' : 'mark as tried') + '</button>' +
      '<span class="dotsep">·</span>' +
      '<button class="linkbtn" type="button" data-act="hide" data-code="' + esc(c.code) + '">hide</button>' +
    '</div>';
  return div;
}

function visibleItems() {
  const q = (filterEl.value || '').trim().toUpperCase();
  let items = ALL.filter((c) => !HIDDEN.has(c.code));
  if (favOnly) items = items.filter((c) => FAVS.has(c.code));
  if (hideStale) items = items.filter((c) => !c.stale);
  if (q) {
    items = items.filter((c) =>
      c.code.includes(q) ||
      String(c.sourceTitle || '').toUpperCase().includes(q) ||
      String(c.terms || '').toUpperCase().includes(q) ||
      String(c.context || '').toUpperCase().includes(q));
  }
  // Fresh (non-stale) codes first within the chosen sort — newest-first default.
  items.sort((a, b) => {
    if (!!a.stale !== !!b.stale) return a.stale ? 1 : -1;
    const d = String(b.foundAt).localeCompare(String(a.foundAt));
    return sortNewest ? d : -d;
  });
  return items;
}

function render() {
  const items = visibleItems();
  listEl.innerHTML = '';
  const hiddenCount = ALL.filter((c) => HIDDEN.has(c.code)).length;
  if (!items.length) {
    listEl.innerHTML = '<div class="empty">' +
      (favOnly ? 'No favorites yet — tap ★ on a code to save it here.' : 'No codes match. Try refreshing.') +
      '</div>';
  } else {
    for (const c of items) listEl.appendChild(card(c));
  }
  const favCount = FAVS.size;
  favFilterBtn.textContent = '★ Favorites' + (favCount ? ' (' + favCount + ')' : '');
  favFilterBtn.classList.toggle('on', favOnly);
  sortBtn.textContent = sortNewest ? '↓ Newest' : '↑ Oldest';
  staleFilterBtn.classList.toggle('on', hideStale);
  const staleCount = ALL.filter((c) => c.stale && !HIDDEN.has(c.code)).length;
  let t = items.length + ' shown / ' + ALL.length + ' codes';
  if (staleCount) t += ' (' + staleCount + ' stale)';
  if (hiddenCount) t += ' (' + hiddenCount + ' hidden)';
  if (lastMeta) t += ' — ' + lastMeta;
  metaEl.textContent = t;
  const freshCount = ALL.filter((c) => !c.stale).length;
  document.title = freshCount
    ? '(' + freshCount + ' fresh) Muse Referral Codes'
    : 'Muse Referral Codes — Public Code Board';
}

async function copyCode(code, btn) {
  try {
    await navigator.clipboard.writeText(code);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = code; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
  const old = btn.textContent;
  btn.textContent = '✓ Copied';
  setTimeout(() => { btn.textContent = old; }, 1500);
}

listEl.addEventListener('click', (e) => {
  const copy = e.target.closest('.copy');
  if (copy) { copyCode(copy.getAttribute('data-code'), copy); return; }
  const fav = e.target.closest('.fav');
  if (fav) {
    const code = fav.getAttribute('data-code');
    if (FAVS.has(code)) FAVS.delete(code); else FAVS.add(code);
    lsSet('mr:favs', [...FAVS]);
    render();
    return;
  }
  const act = e.target.closest('[data-act]');
  if (act) {
    const code = act.getAttribute('data-code');
    if (act.getAttribute('data-act') === 'hide') {
      HIDDEN.add(code);
      lsSet('mr:hidden', [...HIDDEN]);
    } else {
      if (TRIED.has(code)) TRIED.delete(code); else TRIED.add(code);
      lsSet('mr:tried', [...TRIED]);
    }
    render();
  }
});

filterEl.addEventListener('input', render);
sortBtn.addEventListener('click', () => { sortNewest = !sortNewest; render(); });
favFilterBtn.addEventListener('click', () => { favOnly = !favOnly; render(); });
staleFilterBtn.addEventListener('click', () => { hideStale = !hideStale; render(); });
copyAllBtn.addEventListener('click', async () => {
  const codes = visibleItems().map((c) => c.code).join('\n');
  if (!codes) return;
  try {
    await navigator.clipboard.writeText(codes);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = codes; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
  const old = copyAllBtn.textContent;
  copyAllBtn.textContent = '✓ Copied ' + visibleItems().length;
  setTimeout(() => { copyAllBtn.textContent = old; }, 1500);
});
exportCsvBtn.addEventListener('click', () => { window.location.href = '/api/export?format=csv'; });
exportJsonBtn.addEventListener('click', () => { window.location.href = '/api/export?format=json'; });

function fmtHistTime(iso) {
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }); }
  catch (e) { return ''; }
}

async function loadHistory() {
  histBody.innerHTML = '<div class="hist-empty">loading…</div>';
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    if (!data.ok || !data.history.length) {
      histBody.innerHTML = '<div class="hist-empty">No scrape runs on this instance yet — hit Refresh.</div>';
      return;
    }
    histBody.innerHTML = data.history.map((h) => {
      const srcs = h.stats ? Object.keys(h.stats).map((k) => {
        const s = h.stats[k];
        return k + ': ' + (s.ok ? s.found + ' codes' : 'ERR');
      }).join(' · ') : 'seed/cache';
      return '<div class="hist-row">' +
        '<span class="hist-ok">' + (h.ok ? '✓' : '✗') + '</span>' +
        '<span>' + esc(fmtHistTime(h.at)) + '</span>' +
        '<span class="hist-mut">' + h.found + ' new · ' + h.total + ' total · ' + h.ms + 'ms</span>' +
        '<span class="hist-mut">' + esc(srcs) + '</span>' +
        (h.error ? '<span class="hist-err">' + esc(h.error) + '</span>' : '') +
      '</div>';
    }).join('') + '<div class="hist-note">Per-instance history — each serverless instance tracks its own runs.</div>';
  } catch (e) {
    histBody.innerHTML = '<div class="hist-empty">could not load history</div>';
  }
}

histToggle.addEventListener('click', () => {
  const open = histPanel.classList.toggle('open');
  histToggle.textContent = (open ? '▾' : '▸') + ' Scrape history';
  if (open) loadHistory();
});

async function load(force) {
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = '<span class="spin">↻</span> …';
  metaEl.textContent = force ? 'scraping public sources…' : 'loading…';
  try {
    const res = await fetch('/api/codes' + (force ? '?force=1' : ''));
    const data = await res.json();
    if (data.ok) {
      ALL = data.codes || [];
      // Drop favorites/hidden for codes that no longer exist.
      const known = new Set(ALL.map((c) => c.code));
      FAVS = new Set([...FAVS].filter((c) => known.has(c)));
      render();
      const when = data.fetchedAt ? new Date(data.fetchedAt) : null;
      if (data.throttled) {
        const s = Math.max(1, Math.ceil((data.retryAfterMs || 60000) / 1000));
        lastMeta = 'rate-limited — retry in ' + s + 's';
      } else {
        lastMeta = 'updated ' + (when ? when.toLocaleTimeString() : '?') +
          (data.cached ? ' · cached' : ' · fresh');
      }
      render();
    } else {
      metaEl.textContent = 'error loading codes';
    }
  } catch (e) {
    metaEl.textContent = 'network error — try again';
  }
  refreshBtn.disabled = false;
  refreshBtn.textContent = '↻ Refresh';
}

let lastMeta = '';
refreshBtn.addEventListener('click', () => load(true));
render();
load(false);
