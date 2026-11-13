/**
 * gstack freeze guard for DSH.
 *
 * gstack's /freeze writes <state-root>/freeze-dir.txt; /unfreeze removes it.
 * While that file exists, this guard denies edit/write calls whose target is
 * outside the recorded directory. It is a monotonic tools.guard, so nothing
 * later in the pipeline can turn the denial back into permission.
 *
 * Scope: process-wide. A freeze blocks every session on this machine until
 * /unfreeze; that is deliberate for a single-user harness, and bash writes are
 * outside the guard's reach (reported by the denial message).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const name = 'gstack-freeze-guard'
export const inject = ['tools']

const FROZEN_TOOLS = new Set(['edit', 'write', 'str_replace_editor'])

function stateRoot() {
  return process.env.GSTACK_HOME || process.env.GSTACK_STATE_ROOT || path.join(os.homedir(), '.gstack')
}

function freezeDir() {
  try {
    const text = fs.readFileSync(path.join(stateRoot(), 'freeze-dir.txt'), 'utf8')
    const first = text.split('\n')[0].trim()
    return first ? path.resolve(first) : null
  } catch {
    return null
  }
}

function repoRootOf(dir) {
  let current = dir
  for (;;) {
    if (fs.existsSync(path.join(current, '.git'))) return current
    const parent = path.dirname(current)
    if (parent === current) return dir
    current = parent
  }
}

function targetOf(args) {
  if (!args || typeof args !== 'object') return null
  const value = args.file_path ?? args.path ?? args.notebook_path
  return typeof value === 'string' && value ? value : null
}

export function apply(ctx) {
  ctx.tools.guard((exec) => {
    if (!FROZEN_TOOLS.has(exec.name)) return undefined
    const frozen = freezeDir()
    if (!frozen) return undefined
    const target = targetOf(exec.arguments)
    if (!target) return undefined
    // Relative tool paths are workspace-relative; approximate the workspace by
    // the nearest git root above the frozen directory, never the host cwd.
    const base = repoRootOf(frozen)
    const abs = path.isAbsolute(target) ? path.resolve(target) : path.resolve(base, target)
    if (abs === frozen || abs.startsWith(frozen + path.sep)) return undefined
    return {
      reason: `[freeze] ${exec.name} targets ${abs}, outside the frozen directory ${frozen}. Work inside it, or ask the user to run /unfreeze. Bash writes are not covered by this guard.`,
      info: { name: 'gstack-freeze', code: 'GSTACK_FROZEN' },
    }
  })
}
