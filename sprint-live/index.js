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
export const inject = ['webServer', 'workspaceRegistry', 'workingDirectory', 'sessions', 'sessionPersistence']

const PHASES = ['intake', 'design', 'plan', 'plan-review', 'build', 'review', 'qa', 'ship', 'done']
const ARTIFACTS = ['design.md', 'plan.md', 'review.json', 'security.md', 'qa.md', 'ship.md']


const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', 'target', '.cache', 'Library', '.Trash', '.npm', '.pnpm-store'])
const baseCache = new Map()

/** Find `.gstack/sprint` directories under a workspace root, bounded and cached. */
export function discoverSprintBases(root, maxDepth = 4, now = Date.now()) {
  const cached = baseCache.get(root)
  if (cached && now - cached.at < 30_000) return cached.bases
  const bases = []
  let visited = 0
  const walk = (dir, depth) => {
    if (visited > 2000) return
    visited += 1
    const sprint = path.join(dir, '.gstack', 'sprint')
    try { if (fs.statSync(sprint).isDirectory()) bases.push(sprint) } catch {}
    if (depth >= maxDepth) return
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (SKIP_DIRS.has(entry.name)) continue
      if (entry.name.startsWith('.') && entry.name !== '.gstack') continue
      walk(path.join(dir, entry.name), depth + 1)
    }
  }
  walk(root, 0)
  baseCache.set(root, { at: now, bases })
  return bases
}

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

export async function collectSprints(ctx) {
  const roots = new Map()
  const errors = []
  const addRoot = (dir, label) => {
    if (typeof dir === 'string' && dir && !roots.has(dir)) roots.set(dir, label || path.basename(dir))
  }
  try {
    for (const w of ctx.workspaceRegistry.list()) addRoot(w.directory || w.path || w.root, w.title)
  } catch (error) { errors.push(`workspaceRegistry: ${error.message}`) }
  try {
    for (const session of ctx.sessions.list()) addRoot(session.header?.cwd)
  } catch (error) { errors.push(`sessions: ${error.message}`) }
  try {
    for (const snapshot of await ctx.sessionPersistence.list()) addRoot(snapshot.header?.cwd)
  } catch (error) { errors.push(`sessionPersistence: ${error.message}`) }
  try {
    const fallback = ctx.workingDirectory?.defaultDirectory
    addRoot(fallback)
  } catch {}
  try {
    for (const dir of (process.env.GSTACK_SPRINT_ROOTS || '').split(path.delimiter)) addRoot(dir.trim())
  } catch {}

  const sprints = []
  for (const [root, label] of roots) {
    for (const base of discoverSprintBases(root)) {
      let entries = []
      try {
        entries = fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory())
      } catch { continue }
      for (const entry of entries) {
        const summary = summarize(path.join(base, entry.name), label)
        if (summary) sprints.push(summary)
      }
    }
  }
  sprints.sort((a, b) => b.mtime - a.mtime)
  return { sprints: sprints.slice(0, 20), roots: [...roots.keys()], errors }
}

export function apply(ctx) {
  return ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/gstack-sprint/data',
    handler: async (_req, res) => {
      let body
      try {
        const result = await collectSprints(ctx)
        body = JSON.stringify({ generatedAt: new Date().toISOString(), ...result })
      } catch (error) {
        body = JSON.stringify({ generatedAt: new Date().toISOString(), sprints: [], roots: [], errors: [String(error)] })
      }
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(body)
    },
  }))
}
