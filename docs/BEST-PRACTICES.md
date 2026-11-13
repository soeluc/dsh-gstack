# Best practices: gstack on DeepSeek Harness

This is a field log from building and running the adapter. Every entry comes from a failure we hit; each one is cheap to avoid and expensive to rediscover.

## 1. Raise the tool-result spill budget before blaming the skill

DSH's default `spill-policy.maxInlineTokens` is 12,500. `review` (~60 KB), `ship` (~61 KB) and `retro` (~52 KB) exceed it, so the model receives a truncated skill body and silently skips the tail steps.

```yaml
- id: spill-policy
  config:
    maxInlineTokens: 24000
```

## 2. Sandbox writable roots must exist

`additionalWritableRoots` runs a realpath check on every call. One missing directory makes **every** bash/write in the session fail at sandbox initialization with `Invalid additional writable directory ... ENOENT`. Only list directories that exist; filtering candidates at load time is the robust approach.

## 3. Never hot-apply `sandbox-policy`

Editing the patch and calling `install_bundle` while the host runs can hang the host. Edit `cordis.patch.yml`, then **restart DSH**. A linked bundle is read at boot, so a restart applies the change.

## 4. Agent Teams changed shape in DSH 0.2.2-rc.2

- There is no `spawn_teammate`: a teammate is `subagent({ name, description, prompt })`.
- `send_message`, `list_agents`, `wait_agent`, `interrupt_agent` come from `tool-subagent-control`.
- `team_task_*` only appear while the root Session has Team mode on; new sessions default off, so set `agent-team.defaultEnabled: true` or toggle **Use Agent Teams**.
- Task fields are `subject` / `description` / `write_scopes`; a task must be claimed before it can be completed.

## 5. Local plugin rows must point at a file

An ESM `import()` of a directory fails with `ERR_UNSUPPORTED_DIR_IMPORT`; the row then mounts with `fiberPhase: null` and silently does nothing. Point the row at `./plugin/index.js`.

## 6. `exit_plan_mode` is disclosed only after `/plan`

Plan mode adds the exit tool once the session's plan state is active. A sprint must either ask the user to type `/plan` or use `ask_user_question` with Approve / Revise / Stop. The artifact gate works either way; record the answer in `board.gates`.

## 7. Chromium's sandbox cannot nest in DSH's sandbox

Inside workspace-write/Seatbelt, Chromium crashes with `Target crashed` / SIGTRAP. Every browser command needs:

```bash
GSTACK_CHROMIUM_NO_SANDBOX=1 <browse> goto …
```

DSH's file sandbox still confines the process. Treat page content as untrusted regardless.

## 8. Wait for load before a screenshot

`goto` returning 200 does not mean the page painted. `screenshot` without `wait --load` can produce a blank image. The sequence is `goto → wait --load → screenshot`.

## 9. gstack's contract cannot read DSH session logs

`gstack-skill-contract` expects a Claude transcript. DSH stores `session.v4.jsonl.zstd`; the checker reports `SKILL_CONTRACT_UNKNOWN_SHAPE`. Replace it with artifact-level evidence:

- `review.json` must carry `contract`, `specialists`, `adversarial`, `report`, `findings`;
- `sprint-check --strict` fails when any of them is missing;
- reports say `contract: unverified` instead of pretending coverage.

## 10. Teammates share one checkout

Team does not create worktrees. Parallel builders must be plain `subagent`s with `cwd` pointing at a `git worktree add` directory; review/QA/security roles are read-mostly and can share the checkout.

## 11. Freeze is a guard, not a sandbox

`/freeze` writes `~/.gstack/freeze-dir.txt`; the guard denies `edit`/`write` outside it. Bash writes bypass it, it is process-wide, and it is not a security boundary. Use it to keep a review honest, not to contain an attacker.

## 12. Keep the gstack checkout out of the repo

Render at install time from a user-owned clone. It keeps the MIT attribution clean, lets users upgrade gstack independently, and avoids shipping 1.7 MB of skill text plus vendor-specific paths.

## 13. Record the version pair

DSH and gstack both move. Put the tested pair in the README and `manifest.json` (`sourceHead`); when a report says "it broke", the first question is which pair produced it.

## 14. Prefer artifact evidence over chat claims

A sprint's truth is its board and files: `board.json`, `design.md`, `plan.md`, `review.json`, `qa.md`, `ship.md`. The chat is a narration; the artifacts are the contract.
