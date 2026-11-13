#!/usr/bin/env node
/**
 * setup.mjs — check prerequisites, render the DSH skills, and print next steps.
 *
 * Usage:
 *   node scripts/setup.mjs [--gstack-root <dir>] [--dsh-home <dir>] [--check]
 *
 * Nothing here installs the bundle: DSH owns its profile. The script renders
 * into the DSH home and prints the one plugin_manager call to make.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const REPO = path.resolve(import.meta.dirname, '..')

function arg(flag) {
  const i = process.argv.indexOf(flag)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined
}
const checkOnly = process.argv.includes('--check')
const home = os.homedir()
const dshHome = arg('--dsh-home') || process.env.DSH_HOME || path.join(home, '.dsh')
const out = path.join(dshHome, 'gstack', 'skills')
const gstackRoot = arg('--gstack-root')
  || process.env.GSTACK_ROOT
  || [
    path.join(home, 'gstack'),
    path.join(home, '.claude', 'skills', 'gstack'),
  ].find((candidate) => fs.existsSync(path.join(candidate, 'review', 'SKILL.md')))

const problems = []
if (!gstackRoot) {
  problems.push('gstack checkout not found. Clone it first:\n  git clone https://github.com/garrytan/gstack ~/gstack')
} else if (!fs.existsSync(path.join(gstackRoot, 'review', 'SKILL.md'))) {
  problems.push(`gstack root ${gstackRoot} does not contain review/SKILL.md`)
}

const nodeMajor = Number(process.versions.node.split('.')[0])
if (!Number.isFinite(nodeMajor) || nodeMajor < 22) problems.push(`Node.js >= 22 required (found ${process.versions.node})`)

const bun = spawnSync('bun', ['--version'], { encoding: 'utf8' })
if (bun.status !== 0) problems.push('Bun not found on PATH (gstack needs >= 1.3.3): https://bun.sh')
else {
  const [major = 0, minor = 0] = String(bun.stdout).trim().split('.').map(Number)
  if (major < 1 || (major === 1 && minor < 3)) problems.push(`Bun >= 1.3.3 required (found ${bun.stdout.trim()})`)
}

if (problems.length) {
  console.error('dsh-gstack setup: prerequisites missing\n')
  for (const p of problems) console.error(`- ${p}`)
  process.exit(1)
}

const stateRoot = process.env.GSTACK_STATE_ROOT || process.env.GSTACK_HOME || path.join(home, '.gstack')
if (!checkOnly) fs.mkdirSync(stateRoot, { recursive: true })
console.log(`gstack     ${gstackRoot}`)
console.log(`DSH home   ${dshHome}`)
console.log(`skills     ${out}`)
console.log(`state root ${stateRoot}`)

if (checkOnly) {
  console.log('\ncheck ok')
  process.exit(0)
}

const rendered = spawnSync(process.execPath, [path.join(REPO, 'render.mjs'), '--gstack-root', gstackRoot, '--out', out], { stdio: 'inherit' })
if (rendered.status !== 0) process.exit(rendered.status ?? 1)

const browser = path.join(gstackRoot, 'browse', 'dist', 'browse')
console.log('\nNext:')
console.log(`1. In DSH, install this bundle (Plugins → install bundle, or the plugin_manager tool):`)
console.log(`   install_bundle ${REPO}`)
console.log('2. Fully quit and reopen DSH (Host rows and the client panel load at startup).')
console.log('3. Settings → Agent preset → gstack (or switch the current session seat).')
console.log('4. Verify: /review on a branch, /sprint <goal>, /browse on a page, /freeze <dir>.')
if (!fs.existsSync(browser)) {
  console.log('\nOptional browser: gstack Chromium is not built yet.')
  console.log(`  cd ${gstackRoot} && bun install --frozen-lockfile`)
  console.log('  bun build --compile --no-compile-autoload-dotenv --no-compile-autoload-bunfig browse/src/cli.ts --outfile browse/dist/browse')
  console.log('  bun build --compile --no-compile-autoload-dotenv --no-compile-autoload-bunfig browse/src/find-browse.ts --outfile browse/dist/find-browse')
  console.log('  ./bin/gstack-browser-ensure')
} else {
  console.log(`\nBrowser: ${browser} (run ${gstackRoot}/bin/gstack-browser-ensure --check --quiet)`)
}
