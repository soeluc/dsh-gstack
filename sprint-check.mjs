#!/usr/bin/env node
/**
 * sprint-check.mjs — lightweight evidence check for a gstack sprint in DSH.
 *
 * gstack's own contract checker reads Claude transcripts, which DSH cannot
 * produce. This checks the durable artifacts instead: the board's shape, the
 * task DAG, and the artifacts the current phase promises.
 *
 * Usage: node sprint-check.mjs [--dir .gstack/sprint/<id>] [--json]
 * Exit 0 = closable, 1 = missing evidence, 2 = usage/IO error.
 */
import fs from 'node:fs'
import path from 'node:path'

const PHASES = ['intake', 'design', 'plan', 'plan-review', 'build', 'review', 'qa', 'ship', 'done']
const STATES = new Set(['pending', 'ready', 'in_progress', 'done', 'blocked', 'cancelled'])
const REQUIRED = {
  design: ['design.md'],
  plan: ['plan.md'],
  'plan-review': ['plan.md'],
  build: ['plan.md'],
  review: ['plan.md', 'review.json'],
  qa: ['plan.md', 'review.json', 'qa.md'],
  ship: ['plan.md', 'review.json', 'qa.md', 'ship.md'],
  done: ['design.md', 'plan.md', 'review.json', 'qa.md', 'ship.md'],
}

function parseArgs(argv) {
  const out = { dir: '', json: false, strict: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dir') out.dir = argv[++i] || ''
    else if (a === '--json') out.json = true
    else if (a === '--strict') out.strict = true
    else if (a === '--help' || a === '-h') {
      console.log('usage: sprint-check.mjs --dir .gstack/sprint/<id> [--json] [--strict]')
      process.exit(0)
    } else {
      console.error(`unknown argument: ${a}`)
      process.exit(2)
    }
  }
  return out
}

function exists(p) {
  try { return fs.statSync(p).isFile() } catch { return false }
}

function resolveArtifact(dir, rel) {
  const a = path.resolve(dir, rel)
  if (exists(a)) return a
  const b = path.resolve(process.cwd(), rel)
  if (exists(b)) return b
  return null
}

function detectCycle(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const state = new Map()
  const visit = (id, stack) => {
    if (state.get(id) === 'done') return null
    if (state.get(id) === 'visiting') return [...stack, id]
    state.set(id, 'visiting')
    const t = byId.get(id)
    for (const dep of t?.dependsOn || []) {
      if (!byId.has(dep)) continue
      const cycle = visit(dep, [...stack, id])
      if (cycle) return cycle
    }
    state.set(id, 'done')
    return null
  }
  for (const t of tasks) {
    const cycle = visit(t.id, [])
    if (cycle) return cycle
  }
  return null
}

function main() {
  const args = parseArgs(process.argv)
  const dir = path.resolve(args.dir || '.gstack/sprint')
  const missing = []
  const warnings = []
  let board = null

  const boardPath = path.join(dir, 'board.json')
  if (!exists(boardPath)) {
    console.log(`SPRINT_CHECK: failed dir=${dir} reason=no-board`)
    console.log('MISSING: board.json')
    process.exit(1)
  }
  try {
    board = JSON.parse(fs.readFileSync(boardPath, 'utf8'))
  } catch (e) {
    console.log(`SPRINT_CHECK: failed dir=${dir} reason=bad-json`)
    console.log(`MISSING: board.json parses (${e.message})`)
    process.exit(1)
  }

  if (!board.id || typeof board.id !== 'string') missing.push('board.id')
  if (!board.goal) warnings.push('board.goal is empty')
  const phase = PHASES.includes(board.phase) ? board.phase : null
  if (!phase) missing.push(`board.phase (got ${JSON.stringify(board.phase)})`)
  const tasks = Array.isArray(board.tasks) ? board.tasks : null
  if (!tasks) missing.push('board.tasks[]')

  let findings = 0
  if (tasks) {
    const seen = new Set()
    for (const t of tasks) {
      if (!t || typeof t.id !== 'string') { missing.push('task without id'); continue }
      if (seen.has(t.id)) missing.push(`duplicate task id ${t.id}`)
      seen.add(t.id)
      if (!STATES.has(t.state)) missing.push(`task ${t.id}: bad state ${JSON.stringify(t.state)}`)
      for (const dep of t.dependsOn || []) {
        if (!seen.has(dep) && !tasks.some((x) => x.id === dep)) missing.push(`task ${t.id}: unknown dependsOn ${dep}`)
      }
      if (t.state === 'ready' || t.state === 'in_progress') {
        const deps = (t.dependsOn || []).map((d) => tasks.find((x) => x.id === d)).filter(Boolean)
        const open = deps.filter((d) => d.state !== 'done')
        if (open.length) missing.push(`task ${t.id} is ${t.state} but depends on unfinished ${open.map((d) => d.id).join(', ')}`)
      }
      if (t.artifact) {
        const p = resolveArtifact(dir, t.artifact)
        if (!p) missing.push(`task ${t.id} artifact missing: ${t.artifact}`)
      }
    }
    const cycle = detectCycle(tasks)
    if (cycle) missing.push(`dependency cycle: ${cycle.join(' -> ')}`)
  }

  if (phase) {
    const need = REQUIRED[phase] || []
    for (const rel of need) {
      const p = resolveArtifact(dir, rel)
      if (!p) missing.push(`phase ${phase} requires ${rel}`)
    }
  }

  const reviewPath = resolveArtifact(dir, 'review.json')
  if (reviewPath) {
    try {
      const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'))
      const list = Array.isArray(review) ? review : Array.isArray(review.findings) ? review.findings : []
      findings = list.length
      if (typeof review.contract === 'undefined') warnings.push('review.json has no contract field (expected "unverified" or "verified")')
      if (args.strict) {
        if (!['unverified', 'verified'].includes(review.contract)) missing.push('review.json contract must be "unverified" or "verified"')
        const hasSpecialists = Array.isArray(review.specialists) && review.specialists.length > 0
        if (!hasSpecialists && review.smallDiff !== true) missing.push('review.json specialists[] is empty and smallDiff is not true')
        if (!review.adversarial) missing.push('review.json adversarial evidence is missing')
        const report = typeof review.report === 'string' ? review.report : ''
        if (!/Pre-Landing Review/i.test(report)) missing.push('review.json report must contain "Pre-Landing Review"')
      }
      const blockers = list.filter((f) => (f.severity || '').toLowerCase() === 'blocker')
      if (blockers.length) warnings.push(`${blockers.length} blocker finding(s) still listed`)
    } catch (e) {
      missing.push(`review.json parses (${e.message})`)
    }
  }

  if (board.gate && board.gate !== 'none') warnings.push(`gate is ${board.gate}`)

  const ok = missing.length === 0
  if (args.json) {
    console.log(JSON.stringify({ ok, strict: args.strict, dir, phase, tasks: tasks?.length ?? 0, findings, gate: board.gate ?? 'none', missing, warnings }, null, 2))
  } else {
    console.log(`SPRINT_CHECK: ${ok ? 'ok' : 'failed'}${args.strict ? ' strict' : ''} dir=${dir} phase=${phase || '?'} tasks=${tasks?.length ?? 0} findings=${findings} gate=${board.gate ?? 'none'}`)
    if (missing.length) console.log(`MISSING: ${missing.join('; ')}`)
    if (warnings.length) console.log(`WARN: ${warnings.join('; ')}`)
  }
  process.exit(ok ? 0 : 1)
}

main()
