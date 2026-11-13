import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectSprints } from '../sprint-live/index.js'

test('collectSprints summarizes boards and findings for the live panel', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sprint-live-'))
  const dir = path.join(root, '.gstack', 'sprint', 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'board.json'), JSON.stringify({
    id: 'demo',
    goal: 'live smoke',
    phase: 'review',
    gate: 'plan-approval',
    tasks: [
      { id: 'design', owner: 'product', state: 'done', artifact: 'design.md', dependsOn: [] },
      { id: 'review', owner: 'reviewer', state: 'in_progress', artifact: 'review.json', dependsOn: ['design'] },
    ],
  }))
  fs.writeFileSync(path.join(dir, 'design.md'), '# design\n')
  fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify({
    contract: 'unverified',
    specialists: ['reviewer'],
    adversarial: { ran: true },
    findings: [{ severity: 'major', file: 'a.go', line: 7, issue: 'smoke' }],
  }))
  try {
    const ctx = {
      workspaceRegistry: { list: () => [{ directory: root, title: 'demo-ws' }] },
      workingDirectory: { defaultDirectory: '' },
    }
    const sprints = collectSprints(ctx)
    assert.equal(sprints.length, 1)
    const s = sprints[0]
    assert.equal(s.id, 'demo')
    assert.equal(s.phase, 'review')
    assert.equal(s.counts.tasks, 2)
    assert.equal(s.counts.done, 1)
    assert.equal(s.counts.major, 1)
    assert.equal(s.contract, 'unverified')
    assert.equal(s.artifacts['design.md'], true)
    assert.equal(s.artifacts['qa.md'], false)
    assert.equal(s.tasks[0].artifactExists, true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
