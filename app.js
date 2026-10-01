// Frontend for the Muse referral board.
'use strict';

const listEl = document.getElementById('list');
const metaEl = document.getElementById('meta');
const filterEl = document.getElementById('filter');
const refreshBtn = document.getElementById('refreshBtn');

let ALL = [];

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

function card(c) {
  const div = document.createElement('div');
  div.className = 'card codecard';
  div.innerHTML =
    '<div class="coderow">' +
      '<div class="code">' + esc(c.code) + '</div>' +
      '<button class="copy" type="button" data-code="' + esc(c.code) + '">Copy</button>' +
    '</div>' +
    '<div class="src">🔗 <a href="' + esc(c.source) + '" target="_blank" rel="noopener nofollow">' + esc(c.sourceTitle || c.source) + '</a></div>' +
    (c.terms ? '<div><span class="terms">' + esc(c.terms) + '</span></div>' : '') +
    (c.context ? '<div class="ctx">“' + esc(c.context) + '”</div>' : '') +
    '<div class="found"><span class="unverified">⚠ publicly posted — not verified</span> · found ' + esc(fmtDate(c.foundAt)) + '</div>';
  return div;
}

function render() {
  const q = (filterEl.value || '').trim().toUpperCase();
  const items = ALL
    .filter((c) => !q || c.code.includes(q))
    .sort((a, b) => String(b.foundAt).localeCompare(String(a.foundAt)));
  listEl.innerHTML = '';
  if (!items.length) {
    listEl.innerHTML = '<div class="empty">No codes match. Try refreshing.</div>';
    return;
  }
  for (const c of items) listEl.appendChild(card(c));
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
  const b = e.target.closest('.copy');
  if (b) copyCode(b.getAttribute('data-code'), b);
});

filterEl.addEventListener('input', render);

async function load(force) {
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = '<span class="spin">↻</span> …';
  metaEl.textContent = force ? 'scraping public sources…' : 'loading…';
  try {
    const res = await fetch('/api/codes' + (force ? '?force=1' : ''));
    const data = await res.json();
    if (data.ok) {
      ALL = data.codes || [];
      render();
      const when = data.fetchedAt ? new Date(data.fetchedAt) : null;
      metaEl.textContent = ALL.length + ' codes' +
        (when ? ' · updated ' + when.toLocaleTimeString() : '') +
        (data.cached ? ' · cached' : '');
    } else {
      metaEl.textContent = 'error loading codes';
    }
  } catch (e) {
    metaEl.textContent = 'network error — try again';
  }
  refreshBtn.disabled = false;
  refreshBtn.textContent = '↻ Refresh';
}

refreshBtn.addEventListener('click', () => load(true));
load(false);
