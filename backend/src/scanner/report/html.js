import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from '../rules.js';

export function writeHtmlReport(run, outDir) {
  const data = JSON.stringify({ ...run, categories: CATEGORIES }).replace(/</g, '\\u003c');
  const html = TEMPLATE.replace('__DATA__', () => data).replace('__TITLE__', () => escapeHtml(new URL(run.url).hostname));
  const file = path.join(outDir, 'report.html');
  fs.writeFileSync(file, html);
  return file;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TEMPLATE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proofline report - __TITLE__</title>
<style>
:root{
  color-scheme:dark;
  --bg:#08090c;--panel:#12151b;--panel2:#1b1f27;--text:#edeff3;--muted:#a1a9b8;--border:rgba(255,255,255,.08);--accent:#a597ff;
  --critical:#f8717a;--high:#fb923c;--medium:#fbbf24;--low:#60a5fa;--ok:#34d399;
  --shadow:0 12px 32px -16px rgba(0,0,0,.6);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
code{font:12px/1.4 ui-monospace,Consolas,monospace;background:var(--panel2);padding:1px 5px;border-radius:4px;word-break:break-all}
header{background:linear-gradient(180deg,rgba(139,123,255,.12),transparent),var(--panel);border-bottom:1px solid var(--border);padding:20px 24px}
header .brand{display:inline-flex;align-items:center;gap:8px;font-weight:650;font-size:13px;letter-spacing:.02em;color:var(--muted);margin-bottom:8px}
header .brand i{width:16px;height:16px;border-radius:5px;background:linear-gradient(135deg,#8b7bff,#5b8cff 55%,#2dd4bf)}
header h1{margin:0;font-size:20px}
header .meta{color:var(--muted);font-size:13px;margin-top:4px}
nav.tabs{display:flex;gap:4px;padding:0 24px;background:var(--panel);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:5;overflow-x:auto}
nav.tabs button{background:none;border:0;border-bottom:3px solid transparent;padding:12px 14px;font:inherit;color:var(--muted);cursor:pointer;white-space:nowrap}
nav.tabs button.active{color:var(--text);border-bottom-color:var(--accent);font-weight:600}
main{padding:20px 24px;max-width:1500px;margin:0 auto}
.grid{display:grid;gap:16px}
.cards{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;box-shadow:var(--shadow)}
.card .num{font-size:28px;font-weight:700;line-height:1.1}
.card .lbl{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.score{display:flex;align-items:center;gap:16px}
.ring{--p:0;width:84px;height:84px;border-radius:50%;background:conic-gradient(var(--c) calc(var(--p)*1%),var(--panel2) 0);display:grid;place-items:center;flex:none}
.ring span{width:66px;height:66px;border-radius:50%;background:var(--panel);display:grid;place-items:center;font-size:22px;font-weight:700}
.sev{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:2px 8px;border-radius:20px;color:#0b0a14;white-space:nowrap}
.sev.ok{background:var(--ok)}.sev.critical{background:var(--critical)}.sev.high{background:var(--high)}.sev.medium{background:var(--medium);color:#1b1f24}.sev.low{background:var(--low)}
.c-critical{color:var(--critical)}.c-high{color:var(--high)}.c-medium{color:var(--medium)}.c-low{color:var(--low)}
.chip{display:inline-block;font-size:12px;padding:2px 8px;border-radius:6px;background:var(--panel2);color:var(--muted);margin:2px 4px 2px 0}
.bars .row{display:grid;grid-template-columns:170px 1fr 40px;gap:10px;align-items:center;margin:6px 0;font-size:13px}
.bars .bar{height:10px;background:var(--panel2);border-radius:5px;overflow:hidden}
.bars .bar i{display:block;height:100%;background:var(--accent);border-radius:5px}
.filters{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 14px}
.filters label{display:inline-flex;gap:5px;align-items:center;cursor:pointer;font-size:13px}
.filters input[type=search],.filters select{font:inherit;padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text)}
.fix{background:var(--panel);border:1px solid var(--border);border-left:5px solid var(--sevc);border-radius:10px;padding:14px 16px;margin-bottom:12px;box-shadow:var(--shadow)}
.fix h3{margin:0 0 6px;font-size:15px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.fix .howto{background:var(--panel2);border-radius:8px;padding:10px 12px;margin-top:8px;white-space:pre-wrap}
.fix .howto b{display:block;margin-bottom:2px}
.where{margin:6px 0 0;padding-left:18px}
.where li{margin:2px 0}
.linkish{color:var(--accent);cursor:pointer;text-decoration:underline}
.pages{display:grid;grid-template-columns:280px 1fr;gap:16px;align-items:start}
.plist{background:var(--panel);border:1px solid var(--border);border-radius:10px;overflow:hidden;position:sticky;top:60px;max-height:calc(100vh - 80px);overflow-y:auto}
.plist div{padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;gap:8px;align-items:center}
.plist div:hover{background:var(--panel2)}
.plist div.active{background:var(--panel2);box-shadow:inset 3px 0 0 var(--accent)}
.plist .path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.dot{width:10px;height:10px;border-radius:50%;flex:none}
.count{font-size:12px;color:var(--muted)}
.vtabs{display:flex;gap:6px;margin:10px 0}
.vtabs button{font:inherit;border:1px solid var(--border);background:var(--panel);color:var(--text);padding:6px 12px;border-radius:8px;cursor:pointer}
.vtabs button.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}
.shot{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:8px;position:sticky;top:60px}
.shot .frame{max-height:calc(100vh - 140px);overflow:auto;border-radius:6px;background:var(--panel2);position:relative}
.shot img{display:block;width:100%;height:auto;cursor:zoom-in}
.shot .tools{display:flex;gap:8px;justify-content:space-between;align-items:center;padding:4px 2px 8px;font-size:12px;color:var(--muted)}
.hl{position:absolute;border:3px solid var(--accent);border-radius:4px;box-shadow:0 0 0 9999px rgba(0,0,0,.35);pointer-events:none;transition:all .2s}
.issue{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;cursor:pointer}
.issue:hover,.issue.sel{border-color:var(--accent)}
.issue .top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.issue .n{font-weight:700;min-width:28px;height:24px;border-radius:12px;display:inline-grid;place-items:center;color:#fff;font-size:12px;padding:0 6px}
.issue .t{font-weight:600}
.issue p{margin:6px 0}
.issue .crop{max-width:100%;max-height:220px;border:1px solid var(--border);border-radius:6px;display:block;margin:8px 0;cursor:zoom-in}
.issue details{margin-top:6px}
.issue details summary{cursor:pointer;color:var(--accent);font-weight:600}
.issue .howto{white-space:pre-wrap;background:var(--panel2);padding:8px 10px;border-radius:8px;margin-top:6px}
.metrics{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 12px}
.metric{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px}
.metric b{font-size:15px;display:block}
.metric.bad b{color:var(--high)}
.ai-sum{background:var(--panel);border:1px dashed var(--accent);border-radius:10px;padding:10px 12px;margin-bottom:12px}
.flow{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px}
.steps{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:10px}
.step{border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--panel2)}
.step img{width:100%;display:block;cursor:zoom-in}
.step .cap{padding:6px 8px;font-size:12px}
.step.fail{border:2px solid var(--critical)}
.empty{color:var(--muted);padding:30px;text-align:center}
#lightbox{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;z-index:50;overflow:auto;padding:20px;cursor:zoom-out}
#lightbox img{max-width:100%;margin:0 auto;display:block}
.hidden{display:none!important}
@media (max-width:1000px){.pages,.split{grid-template-columns:1fr}.plist,.shot{position:static;max-height:none}.bars .row{grid-template-columns:110px 1fr 34px}}
</style>
</head>
<body>
<header>
  <div class="brand"><i></i>Proofline</div>
  <h1 id="h-title"></h1>
  <div class="meta" id="h-meta"></div>
</header>
<nav class="tabs" id="tabs">
  <button data-tab="overview" class="active">Overview</button>
  <button data-tab="fixes">Fix list</button>
  <button data-tab="pages">Pages &amp; screenshots</button>
  <button data-tab="flows" id="tab-flows">User flows</button>
</nav>
<main>
  <section id="overview"></section>
  <section id="fixes" class="hidden"></section>
  <section id="pages" class="hidden"></section>
  <section id="flows" class="hidden"></section>
</main>
<div id="lightbox"><img alt=""></div>
<script>
const RUN = __DATA__;
const SEV = ['critical','high','medium','low'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pathOf = (u) => { try { const x = new URL(u); return (x.pathname + x.search) || '/'; } catch { return u; } };
const sevPill = (s) => '<span class="sev ' + s + '">' + s + '</span>';
const sevVar = (s) => 'var(--' + s + ')';
const $ = (id) => document.getElementById(id);
const S = RUN.summary;

// ---------- header
$('h-title').textContent = 'Proofline report - ' + RUN.url;
$('h-meta').textContent = new Date(RUN.startedAt).toLocaleString() + ' | ' + S.pagesTested + ' pages x ' + RUN.viewports.length + ' devices (' + RUN.viewports.map(v => v.name + ' ' + v.width + 'px').join(', ') + ') | ' + RUN.durationSec + 's'
  + (RUN.ai.enabled ? ' | AI review: ' + (RUN.ai.disabledReason ? 'unavailable' : RUN.ai.model) : '');
if (!RUN.flows.length) $('tab-flows').classList.add('hidden');

// ---------- tabs
function showTab(name) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  ['overview','fixes','pages','flows'].forEach(t => $(t).classList.toggle('hidden', t !== name));
  window.scrollTo(0, 0);
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

// ---------- overview
(function overview() {
  const color = S.score >= 90 ? 'var(--ok)' : S.score >= 75 ? 'var(--low)' : S.score >= 60 ? 'var(--medium)' : 'var(--critical)';
  const cats = Object.entries(S.byCategory).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map(c => c[1]));
  let h = '<div class="grid cards">';
  h += '<div class="card score" style="grid-column:span 2"><div class="ring" style="--p:' + S.score + ';--c:' + color + '"><span>' + S.score + '</span></div><div><div class="lbl">Quality score</div><div class="num" style="font-size:20px">' + esc(S.grade) + '</div><div class="count">' + S.totalIssues + ' issues found</div></div></div>';
  for (const s of SEV) h += '<div class="card"><div class="lbl">' + s + '</div><div class="num c-' + s + '">' + S.bySeverity[s] + '</div></div>';
  if (S.flowsTotal) h += '<div class="card"><div class="lbl">User flows</div><div class="num ' + (S.flowsPassed === S.flowsTotal ? '' : 'c-critical') + '">' + S.flowsPassed + '/' + S.flowsTotal + '</div></div>';
  h += '</div>';
  h += '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr));margin-top:16px">';
  h += '<div class="card"><h3 style="margin-top:0">Issues by area</h3><div class="bars">' + (cats.length ? cats.map(([c, n]) => '<div class="row"><span>' + esc(RUN.categories[c] || c) + '</span><div class="bar"><i style="width:' + (n / maxCat * 100) + '%"></i></div><b>' + n + '</b></div>').join('') : '<div class="empty">No issues found</div>') + '</div></div>';
  h += '<div class="card"><h3 style="margin-top:0">Fix these first</h3><ol style="padding-left:20px;margin:0">' + S.topFixes.slice(0, 8).map(f => '<li style="margin:6px 0">' + sevPill(f.severity) + ' ' + esc(f.title) + ' <span class="count">- ' + f.pages + ' page(s)</span></li>').join('') + '</ol>' + (S.topFixes.length > 8 ? '<p><span class="linkish" onclick="showTab(\\'fixes\\')">See all ' + S.topFixes.length + ' -></span></p>' : '') + '</div>';
  h += '</div>';
  if (RUN.ai.disabledReason) h += '<div class="card" style="margin-top:16px;border-color:var(--medium)">Warning: ' + esc(RUN.ai.disabledReason) + '</div>';
  $('overview').innerHTML = h;
})();

// ---------- fix list
function renderFixes() {
  const f = window.__fixFilter || { sev: new Set(SEV), q: '', cat: '' };
  let h = '<div class="filters">' + SEV.map(s => '<label><input type="checkbox" data-sev="' + s + '" ' + (f.sev.has(s) ? 'checked' : '') + '> ' + sevPill(s) + '</label>').join('')
    + '<select id="fx-cat"><option value="">All areas</option>' + Object.keys(S.byCategory).map(c => '<option value="' + c + '"' + (f.cat === c ? ' selected' : '') + '>' + esc(RUN.categories[c] || c) + '</option>').join('') + '</select>'
    + '<input type="search" id="fx-q" placeholder="Search issues..." value="' + esc(f.q) + '"></div>';
  const list = S.topFixes.filter(g => f.sev.has(g.severity) && (!f.cat || g.category === f.cat) && (!f.q || (g.title + ' ' + g.description + ' ' + g.fix).toLowerCase().includes(f.q.toLowerCase())));
  if (!list.length) h += '<div class="empty">No issues match the filters.</div>';
  list.forEach((g, i) => {
    h += '<div class="fix" style="--sevc:' + sevVar(g.severity) + '"><h3>' + (i + 1) + '. ' + esc(g.title) + ' ' + sevPill(g.severity) + '<span class="chip">' + esc(RUN.categories[g.category] || g.category) + '</span><span class="chip">' + g.count + 'x on ' + g.pages + ' page(s)</span><span class="chip">' + esc(g.viewports.join(', ')) + '</span></h3>'
      + '<div>' + esc(g.description) + '</div><b style="display:block;margin-top:8px">Where:</b><ul class="where">'
      + g.examples.map(e => '<li>' + (e.flow ? 'User flow "' + esc(e.flow) + '"' : '<span class="linkish" data-goto="' + esc(e.url) + '|' + esc(e.viewport) + '|' + e.n + '">' + esc(pathOf(e.url)) + ' (' + esc(e.viewport) + ') #' + e.n + '</span>') + (e.selector ? ' -> <code>' + esc(e.selector) + '</code>' : '') + '</li>').join('')
      + (g.pages > new Set(g.examples.map(e => e.url)).size ? '<li class="count">...and more pages</li>' : '') + '</ul>'
      + '<div class="howto"><b>How to fix</b>' + esc(g.fix) + '</div></div>';
  });
  $('fixes').innerHTML = h;
  $('fixes').querySelectorAll('[data-sev]').forEach(cb => cb.onchange = () => { cb.checked ? f.sev.add(cb.dataset.sev) : f.sev.delete(cb.dataset.sev); window.__fixFilter = f; renderFixes(); });
  $('fx-cat').onchange = (e) => { f.cat = e.target.value; window.__fixFilter = f; renderFixes(); };
  const q = $('fx-q');
  q.oninput = (e) => { f.q = e.target.value; window.__fixFilter = f; clearTimeout(window.__qt); window.__qt = setTimeout(() => { renderFixes(); const n = $('fx-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  bindGoto($('fixes'));
}
renderFixes();

function bindGoto(root) {
  root.querySelectorAll('[data-goto]').forEach(el => el.onclick = () => { const [u, v, n] = el.dataset.goto.split('|'); openPage(u, v, Number(n)); });
}

// ---------- pages
const urls = [...new Set(RUN.pages.map(p => p.url))];
const worst = (issues) => SEV.find(s => issues.some(i => i.severity === s));
let cur = { url: urls[0], vp: RUN.viewports[0]?.name };

function openPage(url, vp, n) {
  cur = { url, vp: vp || cur.vp };
  showTab('pages');
  renderPages();
  if (n) setTimeout(() => selectIssue(n, true), 60);
}

function renderPages() {
  if (!urls.length) { $('pages').innerHTML = '<div class="empty">No pages were tested.</div>'; return; }
  let side = '<div class="plist">';
  for (const u of urls) {
    const all = RUN.pages.filter(p => p.url === u).flatMap(p => p.issues);
    const w = worst(all);
    side += '<div data-url="' + esc(u) + '" class="' + (u === cur.url ? 'active' : '') + '"><span class="dot" style="background:' + (w ? sevVar(w) : 'var(--ok)') + '"></span><span class="path" title="' + esc(u) + '">' + esc(pathOf(u)) + '</span><span class="count">' + all.length + '</span></div>';
  }
  side += '</div>';
  const variants = RUN.pages.filter(p => p.url === cur.url);
  const p = variants.find(v => v.viewport === cur.vp) || variants[0];
  cur.vp = p.viewport;
  let main = '<div><h2 style="margin:0 0 2px;font-size:18px">' + esc(p.title || pathOf(p.url)) + '</h2><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.url) + '</a>'
    + (p.status ? ' <span class="chip">HTTP ' + p.status + '</span>' : '')
    + '<div class="vtabs">' + variants.map(v => '<button data-vp="' + esc(v.viewport) + '" class="' + (v.viewport === p.viewport ? 'active' : '') + '">' + esc(v.viewport) + ' (' + v.issues.length + ')</button>').join('') + '</div>';
  if (p.perf) {
    const t = (ms) => ms == null ? '-' : (ms / 1000).toFixed(2) + 's';
    const m = [['Load', t(p.perf.loadMs), p.perf.loadMs > 3000], ['LCP', t(p.perf.lcpMs), p.perf.lcpMs > 2500], ['CLS', p.perf.cls, p.perf.cls > 0.1], ['TTFB', t(p.perf.ttfbMs), p.perf.ttfbMs > 800], ['Requests', p.perf.requests, p.perf.requests > 120], ['Weight', (p.perf.pageWeightKb / 1024).toFixed(2) + ' MB', p.perf.pageWeightKb > 3000]];
    main += '<div class="metrics">' + m.map(([k, v, bad]) => '<div class="metric' + (bad ? ' bad' : '') + '">' + k + '<b>' + esc(v) + '</b></div>').join('') + '</div>';
  }
  if (p.aiSummary) main += '<div class="ai-sum"><b>AI design review:</b> ' + esc(p.aiSummary) + '</div>';
  const img = p.screenshots.annotated || p.screenshots.clean;
  main += '<div class="split"><div class="shot"><div class="tools"><span>Numbered boxes = issues -></span><span>'
    + (p.screenshots.clean ? '<a href="' + esc(p.screenshots.clean) + '" target="_blank">clean</a> | ' : '')
    + (p.screenshots.annotated ? '<a href="' + esc(p.screenshots.annotated) + '" target="_blank">annotated</a>' : '')
    + (p.screenshots.diff ? ' | <a href="' + esc(p.screenshots.diff) + '" target="_blank">visual diff</a>' : '') + '</span></div>'
    + '<div class="frame" id="frame">' + (img ? '<img id="shot" src="' + esc(img) + '" alt="Screenshot of ' + esc(pathOf(p.url)) + '">' : '<div class="empty">No screenshot</div>') + '<div class="hl hidden" id="hl"></div></div>'
    + (p.truncatedScreenshot ? '<div class="count">Screenshot truncated to the first 16000px of the page.</div>' : '') + '</div><div id="ilist">';
  if (!p.issues.length) main += '<div class="empty">No issues found on this page at ' + esc(p.viewport) + '.</div>';
  for (const i of p.issues) {
    main += '<div class="issue" data-n="' + i.n + '"><div class="top"><span class="n" style="background:' + sevVar(i.severity) + '">#' + i.n + '</span>' + sevPill(i.severity) + '<span class="t">' + esc(i.title) + '</span><span class="chip">' + esc(RUN.categories[i.category] || i.category) + '</span></div>'
      + '<p>' + esc(i.description) + '</p>'
      + (i.selector ? '<div>Element: <code>' + esc(i.selector) + '</code></div>' : '')
      + (i.element ? '<div class="count" style="margin-top:4px"><code>' + esc(i.element) + '</code></div>' : '')
      + (i.crop ? '<img class="crop" loading="lazy" src="' + esc(i.crop) + '" alt="close-up of issue ' + i.n + '">' : '')
      + (i.screenshot ? '<img class="crop" loading="lazy" src="' + esc(i.screenshot) + '" alt="screenshot">' : '')
      + (!i.rect && !i.crop ? '<div class="count">Page-level issue (no single element to highlight).</div>' : '')
      + (i.detail && i.detail.approximate ? '<div class="count">Location estimated by AI.</div>' : '')
      + '<details open><summary>How to fix</summary><div class="howto">' + esc(i.fix) + '</div></details></div>';
  }
  main += '</div></div></div>';
  $('pages').innerHTML = '<div class="pages">' + side + main + '</div>';
  $('pages').querySelectorAll('.plist [data-url]').forEach(d => d.onclick = () => { cur.url = d.dataset.url; renderPages(); window.scrollTo(0, 0); });
  $('pages').querySelectorAll('[data-vp]').forEach(b => b.onclick = () => { cur.vp = b.dataset.vp; renderPages(); });
  $('pages').querySelectorAll('.issue').forEach(el => el.onclick = (e) => { if (e.target.tagName === 'IMG' || e.target.tagName === 'SUMMARY') return; selectIssue(Number(el.dataset.n), false); });
  bindZoom($('pages'));
}

function selectIssue(n, scrollList) {
  const p = RUN.pages.find(x => x.url === cur.url && x.viewport === cur.vp);
  const iss = p && p.issues.find(i => i.n === n);
  document.querySelectorAll('.issue').forEach(el => el.classList.toggle('sel', Number(el.dataset.n) === n));
  const card = document.querySelector('.issue[data-n="' + n + '"]');
  if (scrollList && card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const img = $('shot'), hl = $('hl'), frame = $('frame');
  if (!iss || !iss.rect || !img) { hl && hl.classList.add('hidden'); return; }
  const place = () => {
    const pageW = (p.pageSize && p.pageSize.width) || img.naturalWidth;
    const k = img.clientWidth / pageW;
    hl.style.left = (iss.rect.x * k - 4) + 'px';
    hl.style.top = (iss.rect.y * k - 4) + 'px';
    hl.style.width = (Math.max(iss.rect.w, 8) * k + 8) + 'px';
    hl.style.height = (Math.max(iss.rect.h, 8) * k + 8) + 'px';
    hl.classList.remove('hidden');
    frame.scrollTo({ top: Math.max(0, iss.rect.y * k - frame.clientHeight / 3), behavior: 'smooth' });
  };
  img.complete ? place() : img.addEventListener('load', place, { once: true });
}

// ---------- flows
(function flows() {
  if (!RUN.flows.length) return;
  let h = '';
  for (const f of RUN.flows) {
    h += '<div class="flow"><h3 style="margin:0">' + (f.ok ? '<span class="sev ok">pass</span>' : '<span class="sev critical">fail</span>') + ' ' + esc(f.name) + ' <span class="chip">' + esc(f.viewport) + '</span></h3>';
    for (const i of f.issues) h += '<div class="fix" style="--sevc:' + sevVar(i.severity) + ';margin-top:10px"><b>' + sevPill(i.severity) + ' ' + esc(i.title) + '</b><div>' + esc(i.description) + '</div><div class="howto"><b>How to fix</b>' + esc(i.fix) + '</div></div>';
    h += '<div class="steps">' + f.steps.map(s => '<div class="step' + (s.ok ? '' : ' fail') + '">' + (s.screenshot ? '<img loading="lazy" src="' + esc(s.screenshot) + '" alt="step ' + s.n + '">' : '') + '<div class="cap">' + (s.ok ? '' : 'Failed: ') + s.n + '. ' + esc(s.label) + (s.error ? '<div class="c-critical">' + esc(s.error) + '</div>' : '') + '</div></div>').join('') + '</div></div>';
  }
  $('flows').innerHTML = h;
  bindZoom($('flows'));
})();

// ---------- lightbox
function bindZoom(root) {
  root.querySelectorAll('img').forEach(img => img.addEventListener('click', (e) => {
    if (img.id === 'shot' || img.classList.contains('crop') || img.closest('.step')) { e.stopPropagation(); const lb = $('lightbox'); lb.querySelector('img').src = img.src; lb.style.display = 'block'; lb.scrollTop = 0; }
  }));
}
$('lightbox').onclick = () => { $('lightbox').style.display = 'none'; };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('lightbox').style.display = 'none'; });

renderPages();
</script>
</body>
</html>`;
