import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../freeze-guard/index.js'

test('freeze guard denies edits outside the frozen directory and allows reads', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'freeze-guard-'))
  const repo = path.join(root, 'repo')
  const allowed = path.join(repo, 'allowed')
  const blocked = path.join(repo, 'blocked')
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true })
  fs.mkdirSync(allowed, { recursive: true })
  fs.mkdirSync(blocked, { recursive: true })
  fs.writeFileSync(path.join(root, 'freeze-dir.txt'), `${allowed}\ngstack-freeze-v1:test\n`)
  process.env.GSTACK_STATE_ROOT = root
  try {
    let guard
    apply({ tools: { guard: (fn) => { guard = fn } } })
    assert.equal(guard({ name: 'write', arguments: { file_path: path.join(allowed, 'a.txt') } }), undefined)
    const denial = guard({ name: 'write', arguments: { file_path: path.join(blocked, 'b.txt') } })
    assert.match(denial.reason, /\[freeze\]/)
    assert.equal(guard({ name: 'read', arguments: { file_path: path.join(blocked, 'b.txt') } }), undefined)
    assert.equal(guard({ name: 'write', arguments: { file_path: 'allowed/rel.txt' } }), undefined)
  } finally {
    delete process.env.GSTACK_STATE_ROOT
    fs.rmSync(root, { recursive: true, force: true })
  }
})
