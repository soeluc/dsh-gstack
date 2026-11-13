# Contributing to dsh-gstack

Thanks for trying the experiment. The goal is narrow and practical: **make gstack work well on DeepSeek Harness, and write down what actually works.**

This project is experimental. DSH's plugin API, Agent Teams, and gstack's skill format change quickly, so the most valuable contributions are often **compatibility fixes, reproducible bug reports, and field notes** — not just features.

## What to contribute

- **Platform ports** — Linux and Windows: sandbox writable roots, Go module/build caches, browser path, `/freeze` behavior.
- **Browser QA** — cookie/login import, authenticated staging runs, visual evidence, canary checks.
- **Hooks & role permissions** — reviewer read-only, builder writable, ship requires approval; gstack `/guard` / `careful`.
- **Contract adapter** — map DSH session logs to gstack's transcript shape, or a stronger artifact-level contract.
- **Sprint panel / task board** — live phases, gates, cost, teammate view; better empty/error states.
- **Docs** — install guides, troubleshooting entries, best practices, platform notes.
- **Bug reports** — include DSH version, gstack commit, OS, the exact command, and the raw error.

## Ground rules

1. **Do not vendor gstack.** Clone it at install time; render locally. This keeps licensing clean and avoids stale skill text.
2. **No secrets, no personal absolute paths.** Use `GSTACK_ROOT`, `DSH_HOME`, `GSTACK_STATE_ROOT`; the renderer and patch must work on another machine.
3. **Only list existing sandbox roots.** `additionalWritableRoots` validates each directory on every call; a missing root breaks every bash/write in the session.
4. **Do not hot-apply `sandbox-policy`.** Edit `cordis.patch.yml` and restart DSH; live reconfiguration can hang the host.
5. **Test on a clean profile when you can.** A change that only works in an already-composed session is not done.
6. **Keep experimental assumptions isolated.** Put version-specific behavior in a small file with a comment naming the DSH/gstack version it targets.
7. **Run the checks.**

```bash
node --test test/*.test.mjs
node render.mjs --gstack-root ~/gstack --out /tmp/dsh-gstack-skills
```

8. **Licensing.** Code contributions are MIT. Rendered gstack text stays MIT (Garry Tan); do not relicense it.

## Development loop

```bash
git clone https://github.com/soeluc/dsh-gstack.git
cd dsh-gstack
node scripts/setup.mjs --gstack-root ~/gstack --dsh-home /tmp/dsh-home --check   # read-only checks
node render.mjs --gstack-root ~/gstack --out /tmp/dsh-gstack-skills              # render to a scratch dir
node --test test/*.test.mjs
```

To test a UI or host change, install the bundle into a DSH profile and **restart**:

```text
install_bundle /absolute/path/to/dsh-gstack
```

Remember: `remove_bundle` + `install_bundle` re-applies `sandbox-policy`; restart-only is safer for patch edits now that the bundle is linked.

## PR checklist

- [ ] `node --test test/*.test.mjs` passes.
- [ ] `node render.mjs --gstack-root ~/gstack --out /tmp/...` succeeds; output has 15 skills + 8 roles.
- [ ] No absolute personal paths (`grep -R "/Users/"`).
- [ ] No secrets or tokens.
- [ ] README / USAGE / MAINTENANCE updated when behavior changes.
- [ ] The PR states the tested DSH version, gstack commit, OS, and what was verified.
- [ ] New behavior has a failure story (what happens when the directory/route/tool is missing).

## Version compatibility policy

The project targets the newest DSH release it has been tested against. When a new DSH rc ships, the maintainer should:

1. Boot with the existing bundle and check `preset-gstack` / `gstack-freeze-guard` are `active`.
2. Re-read the DSH release notes for changed plugin APIs (Agent Teams changed materially between rc.1 and rc.2).
3. Run the smoke set: `/review`, `/sprint`, `/freeze`, `/browse`, Sprint panel.
4. Record the tested versions in `README.md` / `MAINTENANCE.md`.

## Communication

- Open an issue with the smallest reproduction.
- For design changes, describe the failure mode first, then the proposed behavior.
- Be direct and concrete; this project values evidence over enthusiasm.

## Code style

- ESM, Node built-ins only unless a dependency is unavoidable.
- No build step for the host/server code; `node --check` must pass.
- Keep client code dependency-free except React from the DSH module table.
- Prefer small files with a module comment stating the contract and the failure modes.
