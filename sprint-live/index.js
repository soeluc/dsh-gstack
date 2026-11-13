/**
 * Host half of the live Sprint panel.
 *
 * Registers one read-only JSON route, `/gstack-sprint/data`, that scans every
 * registered workspace for `.gstack/sprint/<id>/board.json`. The client half
 * polls it and renders a docked strip with an expandable detail view.
 */
import fs from 'node:fs'
import path from 'node:path'

export const name = 'gstack-sprint-live'
export const inject = ['webServer', 'workspaceRegistry', 'workingDirectory']

const PHASES = ['intake', 'design', 'plan', 'plan-review', 'build', 'review', 'qa', 'ship', 'done']
const ARTIFACTS = ['design.md', 'plan.md', 'review.json', 'security.md', 'qa.md', 'ship.md']

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

function statTime(file) {
  try { return fs.statSync(file).mtimeMs } catch { return 0 }
}

function artwork(dir) {
  const out = {}
  for (const name of ARTIFACTS) out[name] = fs.existsSync(path.join(dir, name))
  return out
}

function summarize(dir, workspaceLabel) {
  const boardFile = path.join(dir, 'board.json')
  const board = readJson(boardFile)
  if (!board) return null
  const review = readJson(path.join(dir, 'review.json'))
  const findings = Array.isArray(review) ? review : Array.isArray(review?.findings) ? review.findings : []
  const tasks = Array.isArray(board.tasks) ? board.tasks : []
  const done = tasks.filter((t) => t.state === 'done').length
  const sev = findings.reduce((acc, f) => {
    const s = String(f.severity || 'unknown').toLowerCase()
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})
  return {
    id: String(board.id || path.basename(dir)),
    goal: String(board.goal || ''),
    phase: PHASES.includes(board.phase) ? board.phase : String(board.phase || '?'),
    phaseIndex: Math.max(0, PHASES.indexOf(board.phase)),
    gate: String(board.gate || 'none'),
    workspace: workspaceLabel,
    dir,
    mtime: Math.max(statTime(boardFile), statTime(path.join(dir, 'review.json'))),
    counts: {
      tasks: tasks.length,
      done,
      findings: findings.length,
      critical: (sev.critical || 0) + (sev.blocker || 0),
      major: sev.major || 0,
      minor: sev.minor || 0,
    },
    contract: review && typeof review.contract === 'string' ? review.contract : 'missing',
    specialists: Array.isArray(review?.specialists) ? review.specialists : [],
    adversarial: Boolean(review?.adversarial),
    tasks: tasks.slice(0, 40).map((t) => ({
      id: String(t.id || ''),
      owner: String(t.owner || ''),
      state: String(t.state || '?'),
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
      artifact: t.artifact ? String(t.artifact) : '',
      artifactExists: t.artifact ? fs.existsSync(path.join(dir, String(t.artifact))) : null,
    })),
    findings: findings.slice(0, 30).map((f) => ({
      severity: String(f.severity || 'unknown'),
      file: String(f.file || ''),
      line: f.line || null,
      issue: String(f.issue || '').slice(0, 240),
    })),
    artifacts: artwork(dir),
  }
}

export function collectSprints(ctx) {
  const roots = new Map()
  try {
    for (const w of ctx.workspaceRegistry.list()) {
      const dir = w.directory || w.path || w.root
      if (typeof dir === 'string' && dir) roots.set(dir, w.title || path.basename(dir))
    }
  } catch {}
  try {
    const fallback = ctx.workingDirectory?.defaultDirectory
    if (typeof fallback === 'string' && fallback && !roots.has(fallback)) roots.set(fallback, path.basename(fallback))
  } catch {}

  const sprints = []
  for (const [root, label] of roots) {
    const base = path.join(root, '.gstack', 'sprint')
    let entries = []
    try {
      entries = fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory())
    } catch { continue }
    for (const entry of entries) {
      const summary = summarize(path.join(base, entry.name), label)
      if (summary) sprints.push(summary)
    }
  }
  sprints.sort((a, b) => b.mtime - a.mtime)
  return sprints.slice(0, 20)
}

export function apply(ctx) {
  return ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/gstack-sprint/data',
    handler: async (_req, res) => {
      let body
      try {
        body = JSON.stringify({ generatedAt: new Date().toISOString(), sprints: collectSprints(ctx) })
      } catch (error) {
        body = JSON.stringify({ generatedAt: new Date().toISOString(), sprints: [], error: String(error) })
      }
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(body)
    },
  }))
}
