window.__ModuleLoader__.load({
  id: '@local/dsh-gstack',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback } = React

    const PHASES = ['intake', 'design', 'plan', 'plan-review', 'build', 'review', 'qa', 'ship', 'done']
    const C = {
      text: 'var(--dsw-alias-label-primary)',
      muted: 'var(--dsw-alias-label-secondary)',
      border: 'var(--dsw-alias-border-l1)',
      surface: 'var(--dsw-alias-bg-layer-1)',
      surface2: 'var(--dsw-alias-bg-layer-2)',
      brand: 'var(--dsw-alias-brand-primary)',
      ok: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      bad: 'var(--dsw-alias-state-error-primary)',
      idle: 'var(--dsw-alias-state-idle-primary)',
    }

    const chip = (text, color) => h('span', {
      key: text,
      style: {
        display: 'inline-block', padding: '1px 7px', borderRadius: 999,
        border: `1px solid ${color || C.border}`, color: color || C.muted,
        fontSize: 11, lineHeight: '18px', whiteSpace: 'nowrap',
      },
    }, text)

    const sevColor = (s) => {
      const v = String(s).toLowerCase()
      if (v === 'critical' || v === 'blocker') return C.bad
      if (v === 'major') return C.warn
      if (v === 'minor') return C.idle
      return C.muted
    }
    const stateColor = (s) => {
      if (s === 'done') return C.ok
      if (s === 'in_progress' || s === 'ready') return C.brand
      if (s === 'blocked') return C.bad
      return C.muted
    }

    function useSprints() {
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [updated, setUpdated] = useState('')
      const load = useCallback(async () => {
        try {
          const res = await fetch('/gstack-sprint/data', { cache: 'no-store' })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const json = await res.json()
          setData(json)
          setError(null)
          setUpdated(new Date().toLocaleTimeString())
        } catch (err) {
          setError(String(err && err.message ? err.message : err))
        }
      }, [])
      useEffect(() => {
        let alive = true
        const tick = () => { if (alive) load() }
        tick()
        const timer = setInterval(tick, 5000)
        return () => { alive = false; clearInterval(timer) }
      }, [load])
      return { data, error, updated, reload: load }
    }

    function SprintDock() {
      const { data, error, updated, reload } = useSprints()
      const [open, setOpen] = useState(false)
      const [sel, setSel] = useState(0)
      const sprints = (data && Array.isArray(data.sprints)) ? data.sprints : []
      const sprint = sprints[Math.min(sel, Math.max(0, sprints.length - 1))]

      const bar = h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '5px 10px', margin: '0 10px 6px', borderRadius: 10,
          border: `1px solid ${C.border}`, background: C.surface, color: C.text,
          fontSize: 12, lineHeight: '18px',
        },
      },
        h('span', { style: { fontWeight: 600, letterSpacing: '.02em' } }, 'SPRINT'),
        sprint ? h('span', { style: { color: C.muted } }, sprint.id) : null,
        sprint ? chip(sprint.phase, C.brand) : null,
        sprint ? h('span', { style: { color: C.muted } }, `${sprint.counts.done}/${sprint.counts.tasks} tasks`) : null,
        sprint ? chip(`${sprint.counts.findings} findings`, sprint.counts.critical ? C.bad : sprint.counts.major ? C.warn : C.muted) : null,
        sprint ? h('span', { style: { color: C.muted } }, `gate ${sprint.gate}`) : null,
        !sprint && !error ? h('span', { style: { color: C.muted } }, 'no sprint yet — run /sprint <goal>') : null,
        error ? h('span', { style: { color: C.bad } }, `panel: ${error}`) : null,
        sprints.length > 1 ? h('select', {
          value: sel,
          onChange: (e) => setSel(Number(e.target.value)),
          style: { marginLeft: 'auto', background: C.surface2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, padding: '1px 4px' },
        }, sprints.map((s, i) => h('option', { key: s.dir, value: i }, `${s.workspace} · ${s.id}`))) : h('span', { style: { marginLeft: 'auto' } }),
        h('span', { style: { color: C.muted, fontSize: 11 } }, updated ? `updated ${updated}` : ''),
        h('button', {
          type: 'button', onClick: () => reload(),
          title: 'Refresh now',
          style: { background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, padding: '0 6px', lineHeight: '18px' },
        }, '↻'),
        h('button', {
          type: 'button', onClick: () => setOpen((v) => !v), disabled: !sprint,
          title: open ? 'Collapse' : 'Expand',
          style: { background: 'transparent', color: sprint ? C.text : C.muted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: sprint ? 'pointer' : 'default', fontSize: 11, padding: '0 6px', lineHeight: '18px' },
        }, open ? '▾' : '▸'),
      )

      if (!open || !sprint) return bar

      const phase = h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
        PHASES.map((p, i) => chip(p, i < sprint.phaseIndex ? C.ok : i === sprint.phaseIndex ? C.brand : C.muted)))

      const tasks = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        sprint.tasks.length ? sprint.tasks.map((t) => h('div', {
          key: t.id, style: { display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 11 },
        },
          h('code', { style: { color: C.text, minWidth: 90 } }, t.id),
          chip(t.state, stateColor(t.state)),
          h('span', { style: { color: C.muted } }, t.owner || '—'),
          h('span', { style: { color: C.muted, marginLeft: 'auto' } }, t.artifact ? `${t.artifact}${t.artifactExists === false ? ' ✗' : t.artifactExists ? ' ✓' : ''}` : ''),
        )) : h('div', { style: { color: C.muted, fontSize: 11 } }, 'no tasks'))

      const findings = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        sprint.findings.length ? sprint.findings.map((f, i) => h('div', {
          key: `${f.file}:${f.line}:${i}`, style: { fontSize: 11, display: 'flex', gap: 6, alignItems: 'baseline' },
        },
          chip(f.severity, sevColor(f.severity)),
          h('code', { style: { color: C.muted } }, `${f.file}${f.line ? ':' + f.line : ''}`),
          h('span', { style: { color: C.text } }, f.issue),
        )) : h('div', { style: { color: C.muted, fontSize: 11 } }, 'no findings'))

      const artifacts = h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 } },
        Object.entries(sprint.artifacts).map(([name, ok]) => h('span', {
          key: name, style: { color: ok ? C.ok : C.muted },
        }, `${ok ? '✓' : '○'} ${name}`)))

      const section = (title, body) => h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        h('div', { style: { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' } }, title),
        body)

      return h('div', { style: { margin: '0 10px 8px' } }, bar,
        h('div', {
          style: {
            border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 10px 10px',
            background: C.surface, padding: 10, display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12,
            maxHeight: 320, overflow: 'auto',
          },
        },
          section('goal', h('div', { style: { fontSize: 12, color: C.text } }, sprint.goal || '—')),
          section('phase', phase),
          section('tasks', tasks),
          section('findings', findings),
          section('artifacts', artifacts),
          section('contract', h('div', { style: { fontSize: 11, color: sprint.contract === 'verified' ? C.ok : C.warn } },
            `${sprint.contract} · specialists: ${sprint.specialists.join(', ') || 'none'} · adversarial: ${sprint.adversarial ? 'yes' : 'no'}`)),
        ))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'gstack-sprint-live',
          order: 40,
        }, SprintDock))
      },
    }
  },
})
