# 使用指南：你的 gstack 超级团队

## 一句话

选 **gstack** preset，然后像用 Claude Code 一样用斜杠命令：

```
/sprint 把 pkg/db 的非密文密码 panic 修掉并补测试
/review
/ship
```

`/sprint` 是编排入口；`/review`、`/qa`、`/ship` 等是单技能入口。

## 席位与技能

| 席位 | 角色任务书 | 主要技能 |
|---|---|---|
| lead | `~/.dsh/gstack/roles/lead.md` | `/sprint`、`/autoplan`、`/ship` |
| product | `roles/product.md` | `/office-hours`、`/plan-ceo-review` |
| architect | `roles/architect.md` | `/plan-eng-review`、`/spec` |
| designer | `roles/designer.md` | `/plan-design-review`、`/design-review` |
| reviewer | `roles/reviewer.md` | `/review`、`/test-audit` |
| security | `roles/security.md` | `/cso` |
| qa | `roles/qa.md` | `/qa`、`/verify` |
| release | `roles/release.md` | `/ship`、`/document-release` |

全部技能：`/gstack`（router，63 个，含路径）。

## 一次 sprint

1. **建板**：Lead 写 `.gstack/sprint/<id>/board.json`。
2. **派人**：`subagent({ name, description, prompt })`，prompt 里带角色任务书、技能路径、输入、完成标准、写作用域。
3. **协作**：`send_message` 派活，`wait_agent` 等结果，`list_agents` 看状态。
4. **任务板**：`team_task_create({ subject, description, write_scopes })`；先 claim 再 complete。
5. **门禁**：计划用 `exit_plan_mode`（它只在用户 `/plan` 进入计划模式后出现；不可用时改用 `ask_user_question` 的 Approve / Revise / Stop）；发布用 `ask_user_question`。答案记入 `board.gates`。
6. **收口**：

```bash
node ~/.dsh/gstack/bin/sprint-check.mjs --dir .gstack/sprint/<id> --strict
```

`--strict` 要求 `review.json` 含 `specialists`、`adversarial`、`report`、`contract`；exit 1 表示不可收口。

再生成两个可读面板：

```bash
node ~/.dsh/gstack/bin/sprint-dashboard.mjs --dir .gstack/sprint/<id>
# → .gstack/sprint/<id>/SPRINT.md（Markdown 预览）

node ~/.dsh/gstack/bin/sprint-panel.mjs --dir .gstack/sprint/<id>
# → .gstack/sprint/<id>/SPRINT.html（自包含视觉面板，HTML 预览打开）
```

HTML 面板不依赖网络，包含：阶段环、阶段阶梯、任务表、findings 表、产物检查、下一步。board 改动后重跑即可刷新。

### 常驻实时面板

安装的 bundle 还带一个 **Live Sprint 面板**：会话输入框上方常驻一条 SPRINT 状态条，点 `▸` 展开阶段/任务/findings/产物；每 5 秒刷新，数据来自所有 workspace 的 `.gstack/sprint/*/board.json`（Host route `/gstack-sprint/data`）。不需要手动生成。

首次启用需要**完全重启 DSH**（Host 路由与客户端 bundle 在启动时加载）。

## 什么时候用 Team，什么时候用 subagent

- **Team**：3 个以上角色、多轮协作、共享任务板。队友就是 `subagent`，没有独立的 `spawn_teammate`。
- **subagent**：一次性、边界清晰的任务，不需要任务板。
- 两者共享同一个 checkout；**构建任务必须一个 worktree 一个 builder**：

```bash
git worktree add ../<repo>-wt-<task> -b wt/<task>
```

## 产物

```
.gstack/sprint/<id>/
  board.json      # 任务、依赖、阶段、门禁
  design.md       # office-hours / ceo-review
  plan.md         # eng review
  review.json     # findings + specialists + adversarial + report + contract
  security.md     # cso
  qa.md           # qa + 证据
  ship.md         # 测试、文档、PR
```

## 浏览器（/browse、/qa）

gstack 自带 headless Chromium 已构建：

```bash
# DSH 的 Seatbelt 与 Chromium 自带沙箱会冲突（Target crashed / SIGTRAP）；
# 每条浏览器命令都要带这个环境变量。DSH 的文件沙箱仍然生效。
B="${GSTACK_ROOT:-$HOME/gstack}/browse/dist/browse"
GSTACK_CHROMIUM_NO_SANDBOX=1 "$B" goto https://example.com
GSTACK_CHROMIUM_NO_SANDBOX=1 "$B" wait --load
GSTACK_CHROMIUM_NO_SANDBOX=1 "$B" text
GSTACK_CHROMIUM_NO_SANDBOX=1 "$B" screenshot .gstack/tmp/shot.png
GSTACK_CHROMIUM_NO_SANDBOX=1 "$B" console --errors
GSTACK_CHROMIUM_NO_SANDBOX=1 "$B" stop
```

DSH 的 bash 每次都是新 shell，**不要依赖 `$B` 变量跨调用**：用上面的绝对路径，或在每条命令前 `B=<path>`。截图前先 `wait --load`，否则可能拿到空白图。

## 冻结编辑（/freeze）

gstack 的 `/freeze <dir>` 会写 `~/.gstack/freeze-dir.txt`；DSH 的 `freeze-guard` 在工具拦截层拒绝冻结目录外的 `edit`/`write`。

- 作用域：**整个 DSH 进程**（单用户假设），`/unfreeze` 解除；
- 相对路径按冻结目录最近的 git 根解析；
- `bash` 写入不在守卫范围，冻结期间仍应避免用 shell 改文件。

## 已知限制

- `contract: unverified`：DSH 读不了 gstack 的 Claude transcript；用 `sprint-check --strict` 做产物级替代。
- 浏览器步骤默认跳过（Aside 缺失、bundle 未构建）。
- 队友与 Lead 共享 cwd；没有自动 owner 释放；Team API 仍是实验性。
- `sandbox-policy` 只能在启动时生效：改 `cordis.patch.yml` 后**重启 DSH**，不要 `install_bundle` 热应用。

## 日常

```bash
# 重新渲染技能/角色/检查器（gstack 升级后）
cd ~/Documents/deepseek-harness/default-workspace/gstack-dsh && node render.mjs

# 回滚整个 bundle
plugin_manager remove_bundle @local/dsh-gstack
```
