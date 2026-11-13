window.__ModuleLoader__.load({
  id: '@local/dsh-gstack',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback } = React
    let ReactDOM = null
    try { ReactDOM = require('react-dom') } catch {}

    const PHASES = ['intake', 'design', 'plan', 'plan-review', 'build', 'review', 'qa', 'ship', 'done']
    const C = {
      text: 'var(--dsw-alias-label-primary)',
      muted: 'var(--dsw-alias-label-secondary)',
      border: 'var(--dsw-alias-border-l1)',
      surface: 'var(--dsw-alias-bg-layer-1)',
      surface2: 'var(--dsw-alias-bg-layer-2)',
      overlay: 'var(--dsw-alias-bg-overlay)',
      brand: 'var(--dsw-alias-brand-primary)',
      ok: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      bad: 'var(--dsw-alias-state-error-primary)',
      idle: 'var(--dsw-alias-state-idle-primary)',
    }

    // Expansion lives outside React state: the dock item can remount when the
    // conversation repaints, and a local useState would silently reset.
    let openFlag = false
    const openListeners = new Set()
    function setOpen(next) {
      openFlag = typeof next === 'function' ? next(openFlag) : next
      for (const listener of openListeners) listener()
    }
    function useOpen() {
      const [, force] = useState(0)
      useEffect(() => {
        const listener = () => force((n) => n + 1)
        openListeners.add(listener)
        return () => openListeners.delete(listener)
      }, [])
      return [openFlag, setOpen]
    }

    function Overlay(props) {
      if (ReactDOM && ReactDOM.createPortal) return ReactDOM.createPortal(props.children, document.body)
      return props.children
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

    function Section(props) {
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        h('div', { style: { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' } }, props.title),
        props.children)
    }

    function Details(props) {
      const s = props.sprint
      const phase = h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
        PHASES.map((p, i) => chip(p, i < s.phaseIndex ? C.ok : i === s.phaseIndex ? C.brand : C.muted)))

      const tasks = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        s.tasks.length ? s.tasks.map((t) => h('div', {
          key: t.id, style: { display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 11 },
        },
          h('code', { style: { color: C.text, minWidth: 90 } }, t.id),
          chip(t.state, stateColor(t.state)),
          h('span', { style: { color: C.muted } }, t.owner || '—'),
          h('span', { style: { color: C.muted, marginLeft: 'auto' } },
            t.artifact ? `${t.artifact}${t.artifactExists === false ? ' ✗' : t.artifactExists ? ' ✓' : ''}` : ''),
        )) : h('div', { style: { color: C.muted, fontSize: 11 } }, 'no tasks'))

      const findings = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        s.findings.length ? s.findings.map((f, i) => h('div', {
          key: `${f.file}:${f.line}:${i}`, style: { fontSize: 11, display: 'flex', gap: 6, alignItems: 'baseline' },
        },
          chip(f.severity, sevColor(f.severity)),
          h('code', { style: { color: C.muted } }, `${f.file}${f.line ? ':' + f.line : ''}`),
          h('span', { style: { color: C.text } }, f.issue),
        )) : h('div', { style: { color: C.muted, fontSize: 11 } }, 'no findings'))

      const artifacts = h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 } },
        Object.entries(s.artifacts).map(([name, ok]) => h('span', {
          key: name, style: { color: ok ? C.ok : C.muted },
        }, `${ok ? '✓' : '○'} ${name}`)))

      return h('div', {
        onClick: (e) => e.stopPropagation(),
        style: {
          position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)',
          width: 'min(760px, calc(100vw - 32px))', maxHeight: 'min(60vh, 520px)', overflow: 'auto',
          background: C.overlay, color: C.text, border: `1px solid ${C.border}`, borderRadius: 14,
          boxShadow: '0 16px 48px rgba(0,0,0,.28)', padding: 14, zIndex: 2147483001,
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
          h('div', { style: { fontWeight: 650, fontSize: 13 } }, `${s.workspace} · ${s.id}`),
          chip(s.phase, C.brand),
          chip(`${s.counts.findings} findings`, s.counts.critical ? C.bad : s.counts.major ? C.warn : C.muted),
          h('span', { style: { color: C.muted, fontSize: 11 } }, `gate ${s.gate}`),
          h('button', {
            type: 'button', onClick: () => setOpen(false),
            style: { marginLeft: 'auto', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '0 8px', lineHeight: '20px' },
          }, 'close')),
        h('div', { style: { fontSize: 12, color: C.muted, marginBottom: 10 } }, s.goal || '—'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 } },
          h(Section, { title: 'phase' }, phase),
          h(Section, { title: 'tasks' }, tasks),
          h(Section, { title: 'findings' }, findings),
          h(Section, { title: 'artifacts' }, artifacts),
          h(Section, { title: 'contract' },
            h('div', { style: { fontSize: 11, color: s.contract === 'verified' ? C.ok : C.warn } },
              `${s.contract} · specialists: ${s.specialists.join(', ') || 'none'} · adversarial: ${s.adversarial ? 'yes' : 'no'}`)),
        ))
    }

    function SprintDock() {
      const { data, error, updated, reload } = useSprints()
      const [open, setOpen] = useOpen()
      const [sel, setSel] = useState(0)
      const sprints = (data && Array.isArray(data.sprints)) ? data.sprints : []
      const sprint = sprints[Math.min(sel, Math.max(0, sprints.length - 1))]

      const bar = h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '5px 10px', margin: '0 10px 6px', borderRadius: 10,
          border: `1px solid ${C.border}`, background: C.surface, color: C.text,
          fontSize: 12, lineHeight: '18px', position: 'relative', zIndex: 1,
        },
      },
        h('span', { style: { fontWeight: 600, letterSpacing: '.02em' } }, 'SPRINT'),
        sprint ? h('span', { style: { color: C.muted } }, sprint.id) : null,
        sprint ? chip(sprint.phase, C.brand) : null,
        sprint ? h('span', { style: { color: C.muted } }, `${sprint.counts.done}/${sprint.counts.tasks} tasks`) : null,
        sprint ? chip(`${sprint.counts.findings} findings`, sprint.counts.critical ? C.bad : sprint.counts.major ? C.warn : C.muted) : null,
        sprint ? h('span', { style: { color: C.muted } }, `gate ${sprint.gate}`) : null,
        !sprint && !error ? h('span', {
          style: { color: C.muted },
          title: (data && Array.isArray(data.roots)) ? data.roots.join('\n') : '',
        }, `no sprint in ${(data && Array.isArray(data.roots)) ? data.roots.length : 0} roots — run /sprint <goal>`) : null,
        data && Array.isArray(data.errors) && data.errors.length ? h('span', { style: { color: C.warn } }, `scan: ${data.errors.join('; ')}`) : null,
        error ? h('span', { style: { color: C.bad } }, `panel: ${error}`) : null,
        sprints.length > 1 ? h('select', {
          value: sel,
          onChange: (e) => setSel(Number(e.target.value)),
          style: { marginLeft: 'auto', background: C.surface2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, padding: '1px 4px' },
        }, sprints.map((s, i) => h('option', { key: s.dir, value: i }, `${s.workspace} · ${s.id}`))) : h('span', { style: { marginLeft: 'auto' } }),
        h('span', { style: { color: C.muted, fontSize: 11 } }, updated ? `updated ${updated}` : ''),
        h('button', {
          type: 'button', onPointerDown: (e) => e.stopPropagation(), onClick: () => reload(),
          title: 'Refresh now',
          style: { background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, padding: '0 6px', lineHeight: '18px' },
        }, '↻'),
        h('button', {
          type: 'button', onPointerDown: (e) => e.stopPropagation(), onClick: () => setOpen((v) => !v),
          disabled: !sprint, 'aria-expanded': open,
          title: open ? 'Collapse' : 'Expand',
          style: { background: 'transparent', color: sprint ? C.text : C.muted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: sprint ? 'pointer' : 'default', fontSize: 11, padding: '0 6px', lineHeight: '18px' },
        }, !sprint ? 'No sprint' : open ? 'Collapse' : 'Details'),
      )

      if (!sprint) return bar
      return h('div', null, bar, open ? h(Overlay, null,
        h('div', {
          onClick: () => setOpen(false),
          style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.18)', zIndex: 2147483000 },
        }),
        h(Details, { sprint, key: sprint.dir }),
      ) : null)
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
