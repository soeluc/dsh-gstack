#!/usr/bin/env node
/**
 * sprint-dashboard.mjs — render a human-readable SPRINT.md from a sprint board.
 *
 * Reads .gstack/sprint/<id>/board.json + the phase artifacts and writes
 * .gstack/sprint/<id>/SPRINT.md, which the DSH sidebar Markdown preview can open.
 *
 * Usage: node sprint-dashboard.mjs --dir .gstack/sprint/<id>
 */
import fs from 'node:fs'
import path from 'node:path'

const PHASES = ['intake', 'design', 'plan', 'plan-review', 'build', 'review', 'qa', 'ship', 'done']
const ARTIFACTS = ['design.md', 'plan.md', 'review.json', 'security.md', 'qa.md', 'ship.md']

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const dir = path.resolve(arg('--dir', '.gstack/sprint'))
const boardPath = path.join(dir, 'board.json')
if (!fs.existsSync(boardPath)) {
  console.error(`no board.json in ${dir}`)
  process.exit(2)
}
const board = JSON.parse(fs.readFileSync(boardPath, 'utf8'))
const exists = (rel) => fs.existsSync(path.resolve(dir, rel))
const phaseIdx = Math.max(0, PHASES.indexOf(board.phase))

const lines = []
lines.push(`# Sprint ${board.id || '?'}`)
lines.push('')
lines.push(`> ${board.goal || '(no goal)'}`)
lines.push(`> phase **${board.phase || '?'}** · gate **${board.gate || 'none'}** · generated ${new Date().toISOString()}`)
lines.push('')

lines.push('## Phase ladder')
for (let i = 0; i < PHASES.length; i++) {
  const p = PHASES[i]
  const mark = i < phaseIdx ? 'x' : i === phaseIdx ? '>' : ' '
  lines.push(`- [${mark}] ${p}`)
}
lines.push('')

lines.push('## Tasks')
if (Array.isArray(board.tasks) && board.tasks.length) {
  lines.push('| id | owner | state | depends on | artifact |')
  lines.push('|---|---|---|---|---|')
  for (const t of board.tasks) {
    const art = t.artifact ? `${t.artifact} ${exists(t.artifact) ? '✅' : '❌'}` : '—'
    lines.push(`| ${t.id} | ${t.owner || '—'} | ${t.state || '?'} | ${(t.dependsOn || []).join(', ') || '—'} | ${art} |`)
  }
} else {
  lines.push('_no tasks_')
}
lines.push('')

lines.push('## Artifacts')
for (const a of ARTIFACTS) lines.push(`- ${exists(a) ? '✅' : '⬜'} \`${a}\``)
lines.push('')

const reviewPath = path.join(dir, 'review.json')
if (fs.existsSync(reviewPath)) {
  try {
    const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'))
    const findings = Array.isArray(review) ? review : Array.isArray(review.findings) ? review.findings : []
    const bySeverity = {}
    for (const f of findings) {
      const s = String(f.severity || 'unknown').toLowerCase()
      bySeverity[s] = (bySeverity[s] || 0) + 1
    }
    lines.push('## Review')
    lines.push('')
    lines.push(`contract: **${review.contract || 'missing'}** · specialists: ${Array.isArray(review.specialists) ? review.specialists.join(', ') || 'none' : 'missing'} · adversarial: ${review.adversarial ? 'yes' : 'no'}`)
    lines.push('')
    if (findings.length) {
      lines.push('| severity | file | issue |')
      lines.push('|---|---|---|')
      for (const f of findings.slice(0, 20)) {
        lines.push(`| ${f.severity || '?'} | ${f.file || '?'}${f.line ? ':' + f.line : ''} | ${String(f.issue || '').replace(/\|/g, '\\|').slice(0, 160)} |`)
      }
      if (findings.length > 20) lines.push(`| … | | ${findings.length - 20} more |`)
    } else {
      lines.push('_no findings_')
    }
    lines.push('')
  } catch (e) {
    lines.push(`## Review\n\n⚠️ review.json does not parse: ${e.message}\n`)
  }
}

const next = (board.tasks || []).filter((t) => t.state !== 'done').map((t) => `- ${t.id} (${t.state})`)
if (next.length) {
  lines.push('## Next')
  lines.push(...next)
  lines.push('')
}

const out = path.join(dir, 'SPRINT.md')
fs.writeFileSync(out, lines.join('\n'))
console.log(`SPRINT_DASHBOARD: ${out}`)
