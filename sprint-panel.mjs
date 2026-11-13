#!/usr/bin/env node
/**
 * sprint-panel.mjs — render a self-contained SPRINT.html dashboard for a sprint.
 *
 * The file is standalone (inline CSS/SVG, no network, no external fonts) so the
 * DSH right-sidebar HTML preview can open it directly. Regenerate after every
 * board change: node sprint-panel.mjs --dir .gstack/sprint/<id>
 */
import fs from 'node:fs'
import path from 'node:path'

const PHASES = ['intake', 'design', 'plan', 'plan-review', 'build', 'review', 'qa', 'ship', 'done']
const ARTIFACTS = ['design.md', 'plan.md', 'review.json', 'security.md', 'qa.md', 'ship.md']

const dir = path.resolve(arg('--dir', '.gstack/sprint'))
const boardPath = path.join(dir, 'board.json')
if (!fs.existsSync(boardPath)) {
  console.error(`no board.json in ${dir}`)
  process.exit(2)
}
const board = JSON.parse(fs.readFileSync(boardPath, 'utf8'))
const exists = (rel) => fs.existsSync(path.resolve(dir, rel))
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const phaseIdx = Math.max(0, PHASES.indexOf(board.phase))
const tasks = Array.isArray(board.tasks) ? board.tasks : []
const done = tasks.filter((t) => t.state === 'done').length
const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0

let review = null
try { review = JSON.parse(fs.readFileSync(path.join(dir, 'review.json'), 'utf8')) } catch {}
const findings = Array.isArray(review) ? review : Array.isArray(review?.findings) ? review.findings : []
const bySev = findings.reduce((acc, f) => { const s = String(f.severity || 'unknown').toLowerCase(); acc[s] = (acc[s] || 0) + 1; return acc }, {})
const artifactRows = ARTIFACTS.map((a) => `<li class="${exists(a) ? 'ok' : 'miss'}"><span>${exists(a) ? '✓' : '○'}</span>${esc(a)}</li>`).join('')

const seatColor = (s) => s === 'done' ? 'ok' : s === 'in_progress' || s === 'ready' ? 'run' : s === 'blocked' ? 'bad' : 'idle'
const taskRows = tasks.map((t) => {
  const deps = (t.dependsOn || []).join(', ') || '—'
  const art = t.artifact ? `${t.artifact} ${exists(t.artifact) ? '✓' : '✗'}` : '—'
  return `<tr>
    <td><code>${esc(t.id)}</code></td>
    <td>${esc(t.owner || '—')}</td>
    <td><span class="chip ${seatColor(t.state)}">${esc(t.state || '?')}</span></td>
    <td class="muted">${esc(deps)}</td>
    <td class="muted">${esc(art)}</td>
  </tr>`
}).join('')

const findingRows = findings.slice(0, 30).map((f) => {
  const sev = String(f.severity || 'unknown').toLowerCase()
  return `<tr>
    <td><span class="chip ${sev === 'blocker' || sev === 'critical' ? 'bad' : sev === 'major' ? 'warn' : 'idle'}">${esc(sev)}</span></td>
    <td class="mono">${esc(f.file || '?')}${f.line ? ':' + esc(f.line) : ''}</td>
    <td>${esc(String(f.issue || '').slice(0, 220))}</td>
  </tr>`
}).join('')

const stepper = PHASES.map((p, i) => `<li class="${i < phaseIdx ? 'done' : i === phaseIdx ? 'now' : 'todo'}">
  <span class="dot"></span><span class="label">${esc(p)}</span></li>`).join('')

const ring = (() => {
  const r = 34, c = 2 * Math.PI * r, off = c - (pct / 100) * c
  return `<svg viewBox="0 0 80 80" class="ring" role="img" aria-label="${pct}% tasks done">
    <circle cx="40" cy="40" r="${r}" class="ring-bg"/>
    <circle cx="40" cy="40" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
    <text x="40" y="45" text-anchor="middle" class="ring-text">${pct}%</text>
  </svg>`
})()

const next = tasks.filter((t) => t.state !== 'done').map((t) => `<li><code>${esc(t.id)}</code> <span class="muted">${esc(t.state)}</span></li>`).join('') || '<li class="muted">all tasks done</li>'

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sprint ${esc(board.id || '')}</title>
<style>
:root{--bg:#f3f4f6;--card:#fff;--text:#111827;--muted:#6b7280;--line:#e5e7eb;--accent:#2563eb;--ok:#16a34a;--warn:#d97706;--bad:#dc2626;--chip:#f3f4f6}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a21;--text:#e5e7eb;--muted:#9ca3af;--line:#2a2f3a;--accent:#60a5fa;--ok:#34d399;--warn:#fbbf24;--bad:#f87171;--chip:#1f2430}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:1020px;margin:0 auto;padding:26px}
header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:20px}
h1{font-size:24px;margin:0 0 4px;letter-spacing:-.02em}
.goal{color:var(--muted);max-width:640px}
.badges{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.badge{font-size:12px;padding:4px 10px;border-radius:999px;background:var(--chip);color:var(--muted);border:1px solid var(--line)}
.badge.now{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 40%,transparent)}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}
.kpi .k{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.kpi .v{font-size:26px;font-weight:650;margin-top:4px}
.kpi .s{font-size:12px;color:var(--muted);margin-top:2px}
.ring{width:80px;height:80px}
.ring-bg{fill:none;stroke:var(--line);stroke-width:8}
.ring-fg{fill:none;stroke:var(--accent);stroke-width:8;stroke-linecap:round;transform:rotate(-90deg);transform-origin:40px 40px;transition:stroke-dashoffset .4s}
.ring-text{fill:var(--text);font-size:15px;font-weight:650}
h2{font-size:15px;margin:26px 0 10px;letter-spacing:.01em}
.stepper{display:flex;list-style:none;padding:0;margin:0;gap:4px;flex-wrap:wrap}
.stepper li{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid var(--line);color:var(--muted);font-size:12px}
.stepper .dot{width:7px;height:7px;border-radius:50%;background:var(--line)}
.stepper li.done{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 35%,transparent)}
.stepper li.done .dot{background:var(--ok)}
.stepper li.now{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 45%,transparent);background:color-mix(in srgb,var(--accent) 8%,transparent)}
.stepper li.now .dot{background:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 20%,transparent)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);background:var(--chip)}
tr:last-child td{border-bottom:none}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.muted{color:var(--muted)}
.chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;background:var(--chip);color:var(--muted);border:1px solid var(--line)}
.chip.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 35%,transparent)}
.chip.run{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 40%,transparent)}
.chip.warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,transparent)}
.chip.bad{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 40%,transparent)}
ul.artifacts{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
ul.artifacts li{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;gap:8px;align-items:center}
ul.artifacts li span{color:var(--ok)}
ul.artifacts li.miss{color:var(--muted)}
ul.artifacts li.miss span{color:var(--muted)}
footer{margin-top:26px;color:var(--muted);font-size:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media (max-width:760px){.grid{grid-template-columns:repeat(2,1fr)}ul.artifacts{grid-template-columns:1fr}}
</style></head>
<body><div class="wrap">
<header>
  <div>
    <h1>Sprint ${esc(board.id || '?')}</h1>
    <div class="goal">${esc(board.goal || '(no goal)')}</div>
    <div class="badges">
      <span class="badge now">phase ${esc(board.phase || '?')}</span>
      <span class="badge">gate ${esc(board.gate || 'none')}</span>
      <span class="badge">${tasks.length} tasks · ${done} done</span>
    </div>
  </div>
  ${ring}
</header>

<div class="grid">
  <div class="card kpi"><div class="k">Tasks</div><div class="v">${done}/${tasks.length}</div><div class="s">${pct}% complete</div></div>
  <div class="card kpi"><div class="k">Findings</div><div class="v">${findings.length}</div><div class="s">${bySev.critical || bySev.blocker ? `${bySev.critical || bySev.blocker} critical` : 'no critical'} · ${bySev.major || 0} major</div></div>
  <div class="card kpi"><div class="k">Contract</div><div class="v" style="font-size:18px">${esc(review?.contract || 'missing')}</div><div class="s">${Array.isArray(review?.specialists) ? review.specialists.join(', ') || 'no specialists' : 'no review.json'}</div></div>
  <div class="card kpi"><div class="k">Artifacts</div><div class="v">${ARTIFACTS.filter(exists).length}/${ARTIFACTS.length}</div><div class="s">phase evidence</div></div>
</div>

<h2>Phase</h2>
<ol class="stepper">${stepper}</ol>

<h2>Tasks</h2>
<table><thead><tr><th>id</th><th>owner</th><th>state</th><th>depends on</th><th>artifact</th></tr></thead>
<tbody>${taskRows || '<tr><td colspan="5" class="muted">no tasks</td></tr>'}</tbody></table>

<h2>Findings</h2>
<table><thead><tr><th>severity</th><th>file</th><th>issue</th></tr></thead>
<tbody>${findingRows || '<tr><td colspan="3" class="muted">no findings</td></tr>'}</tbody></table>

<h2>Artifacts</h2>
<ul class="artifacts">${artifactRows}</ul>

<h2>Next</h2>
<ul>${next}</ul>

<footer>
  <span>generated ${esc(new Date().toISOString())}</span>
  <span>${esc(path.join(dir, 'SPRINT.html'))} · regenerate: node ~/.dsh/gstack/bin/sprint-panel.mjs --dir ${esc(dir)}</span>
</footer>
</div></body></html>
`

const out = path.join(dir, 'SPRINT.html')
fs.writeFileSync(out, html)
console.log(`SPRINT_PANEL: ${out}`)

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
