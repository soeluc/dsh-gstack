# 维护手册：gstack × DSH 超级团队

> 适用版本：DSH 0.2.2-rc.2 · gstack v1.99.2.0（commit `4414f4cc9`）
> 适配器源码：`~/Documents/deepseek-harness/default-workspace/gstack-dsh/`

这份手册只讲**怎么维护、怎么改、怎么验证、坏了怎么修**。日常用法看 [USAGE.md](USAGE.md)，总体设计看 [gstack-super-team-final.md](../gstack-super-team-final.md)。

---

## 1. 组件清单

| 组件 | 位置 | 是否可手改 |
|---|---|---|
| 渲染器 | `gstack-dsh/render.mjs` | ✅ 改完重跑 |
| DSH bundle patch | `gstack-dsh/cordis.patch.yml` | ✅ 改完重启 DSH |
| 证据检查 / 面板 | `gstack-dsh/sprint-check.mjs`、`sprint-dashboard.mjs` | ✅ 改完重跑渲染 |
| freeze 守卫 | `gstack-dsh/freeze-guard/` | ✅ 改完重启 DSH |
| 使用/维护文档 | `USAGE.md`、`MAINTENANCE.md`、`README.md` | ✅ |
| 渲染产物 | `~/.dsh/gstack/{skills,roles,bin}` | ❌ 由 `render.mjs` 生成 |
| DSH preset | `@local/dsh-gstack`（desktop profile） | ❌ 用 `plugin_manager` |
| gstack 运行时 | `~/Projects/shelf/github/gstack` | 只读使用；升级用 `git pull` |

**版本记录**：`~/.dsh/gstack/skills/manifest.json` 里有 `sourceHead` 和 `generatedAt`；DSH 版本看 `defaults read "/Applications/DeepSeek Harness.app/Contents/Info.plist" CFBundleShortVersionString`。

---

## 2. 更新 gstack 技能

```bash
cd ~/Projects/shelf/github/gstack
git pull --ff-only
git log --oneline -1

cd ~/Documents/deepseek-harness/default-workspace/gstack-dsh
node render.mjs

# 验证
ls ~/.dsh/gstack/skills
cat ~/.dsh/gstack/skills/manifest.json
~/.claude/skills/gstack/bin/gstack-doctor
```

**预期**：`render.mjs` 打印 `rendered 15 first-class skills ... 63 routed`，`manifest.sourceHead` 变成新 commit。

**gstack 大版本升级时额外检查**：

1. 新技能是否值得升为一级：编辑 `render.mjs` 的 `CURATED`，加名字 + 描述，重跑。
2. 描述是否变短/变长：`CURATED` 会覆盖，未覆盖的走 frontmatter。
3. `browse/dist` 是否还在；不在就重建（见 §3）。
4. 如果升级改动了 `review`/`ship` 的流程语义，跑一次真实 `/review` 冒烟。

**不建议**：直接改 `~/.dsh/gstack/skills` 里的文件；下次渲染会被覆盖。

---

## 3. 重建浏览器（gstack 升级或缓存丢失时）

```bash
cd ~/Projects/shelf/github/gstack
bun install --frozen-lockfile
bun build --compile --no-compile-autoload-dotenv --no-compile-autoload-bunfig \
  browse/src/cli.ts --outfile browse/dist/browse
bun build --compile --no-compile-autoload-dotenv --no-compile-autoload-bunfig \
  browse/src/find-browse.ts --outfile browse/dist/find-browse
bash browse/scripts/build-node-server.sh
chmod +x browse/dist/browse browse/dist/find-browse
./bin/gstack-browser-ensure
```

验证：

```bash
./bin/gstack-browser-ensure --check --quiet   # 期望 BROWSER_OK ...
B=./browse/dist/browse
GSTACK_CHROMIUM_NO_SANDBOX=1 "$B" goto https://example.com
GSTACK_CHROMIUM_NO_SANDBOX=1 "$B" wait --load
GSTACK_CHROMIUM_NO_SANDBOX=1 "$B" screenshot /tmp/shot.png
GSTACK_CHROMIUM_NO_SANDBOX=1 "$B" stop
```

---

## 4. 更新 DSH

DSH 桌面端会自动升级（本次从 0.2.2-rc.1 到 rc.2 就改了 Team 的接口）。升级后按顺序检查：

1. **插件是否还活着**：

```bash
# 在 DSH 里或用 plugin_manager 工具
list_plugins   → 找 include:preset-gstack、include:gstack-freeze-guard
```

- `preset-gstack` 必须是 `active`；
- `gstack-freeze-guard` 必须是 `active`；如果是 `null`，看 §8 的 ESM 目录导入。

2. **配置键是否还有效**：rc.2 里 `agent-team` 移除了 `maxMembers` 等键，继续写会在启动时被拒。升级后先 `grep -n "agent-team" cordis.patch.yml`，对照 `docs/config-catalog` 或包 README。

3. **工具名是否还在**：`send_message` / `list_agents` / `wait_agent` / `team_task_*`；Team 语义在 rc.2 变成了“队友 = subagent”。

4. **沙箱可写根**：`~/.gstack`、`~/go/pkg/mod`、`~/Library/Caches/go-build` 是否仍存在；不存在的目录必须从 `additionalWritableRoots` 删掉。

5. **重跑冒烟**：`/review`、`/sprint`、freeze、browser 各一次。

**DSH 升级后不要做的事**：不要用 `install_bundle` 热应用 `sandbox-policy`（会卡住宿主）；只改 patch + 重启。

---

## 5. 想优化时，改哪里

| 想优化 | 改哪里 | 见效方式 |
|---|---|---|
| 加/减一级技能 | `render.mjs` 的 `CURATED` | 重跑 `node render.mjs` |
| 改技能描述（路由质量） | 同上 | 重跑 |
| 改工具映射/头注 | `render.mjs` 的 `ADAPTER`、`transform()` | 重跑 |
| 改 Lead 人格 | `cordis.patch.yml` 的 `preset-gstack.persona.prefix` | 重启 DSH |
| 加减 preset 工具 | `cordis.patch.yml` 的 `preset-gstack.plugins` | 重启 DSH |
| 改角色任务书 | `render.mjs` 的 `ROLES` | 重跑 |
| 改 sprint 流程/门禁 | `render.mjs` 的 `SPRINT_BODY` | 重跑 |
| 改证据规则 | `sprint-check.mjs` | 重跑渲染（会复制到 bin） |
| 改面板字段 | `sprint-dashboard.mjs` / `sprint-panel.mjs` | 重跑渲染 |
| 改 freeze 行为 | `freeze-guard/index.js` | 重启 DSH |
| 改实时面板 | `sprint-live/index.js`（数据）/ `sprint-live/client.js`（UI） | 重启 DSH |
| 改沙箱可写根 | `cordis.patch.yml` 的 `sandbox-policy` | **重启 DSH** |

---

## 6. 每次改动后的验证清单

```bash
# 1) 技能目录
ls ~/.dsh/gstack/skills        # 15 个目录
ls ~/.dsh/gstack/roles         # 8 个文件

# 2) 渲染 manifest
cat ~/.dsh/gstack/skills/manifest.json

# 3) gstack 健康
~/.claude/skills/gstack/bin/gstack-doctor

# 4) 浏览器
~/.claude/skills/gstack/bin/gstack-browser-ensure --check --quiet

# 5) 证据工具
node ~/.dsh/gstack/bin/sprint-check.mjs --dir /tmp/sprint-demo --strict
node ~/.dsh/gstack/bin/sprint-panel.mjs --dir /tmp/sprint-demo

# 6) 插件状态（在 DSH 里）
list_plugins → preset-gstack active, gstack-freeze-guard active
```

行为级冒烟（新 gstack 会话）：

- `/review` 能加载、能派专家、能写 review.json；
- `/sprint` 能建 board、走 Gate 1、跑 sprint-check；
- `/freeze <dir>` 后目录外写入被 `[freeze]` 拒绝；
- 浏览器 `goto + wait --load + screenshot` 正常。

---

## 7. 回滚

```text
plugin_manager remove_bundle @local/dsh-gstack
```

- 移除 preset、spill 提额、sandbox 可写根、freeze 守卫、agent-team 默认开启；
- `~/.dsh/gstack` 渲染产物可保留，也可删除；
- gstack checkout 的 `node_modules` / `browse/dist` 可保留，不影响 DSH。

---

## 8. 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| `Invalid additional writable directory "...": ENOENT` | `additionalWritableRoots` 里有不存在的目录 | 从 patch 删掉该项，重启 DSH |
| bash/write 全挂、只有 read 能用 | 同上（沙箱初始化失败） | 同上 |
| `gstack-review-log` EPERM / `Gate edits: UNAVAILABLE` | `~/.gstack` 不在可写根 | 确认 `additionalWritableRoots` 含 `~/.gstack` |
| `go build ./...` 卡在 `$GOMODCACHE` | Go 缓存不在可写根 | 加 `~/go/pkg/mod`、`~/Library/Caches/go-build` |
| `install_bundle` 后宿主卡死 | `sandbox-policy` 热应用 | 不要热装；改 patch + 重启 |
| 插件行 `fiberPhase: null` | 行指向目录，ESM 不支持目录导入 | 改成 `./freeze-guard/index.js` |
| 团队工具消失 | rc.2 语义变化 | 队友 = `subagent`；消息靠 `tool-subagent-control` |
| `team_task_create` 不存在 | Team mode 未开 | 菜单里开 **Use Agent Teams**，或 `agent-team.defaultEnabled: true` |
| `exit_plan_mode` 不存在 | 计划模式未激活 | 先 `/plan`；或 Gate 1 用 `ask_user_question` |
| Chromium `Target crashed` / SIGTRAP | Chromium 沙箱嵌套在 DSH Seatbelt 里 | 每条 `$B` 命令加 `GSTACK_CHROMIUM_NO_SANDBOX=1` |
| 截图纯白 | 截图早于渲染 | 先 `wait --load` 再 `screenshot` |
| 大技能加载被截断 | spill 预算 | `spill-policy.maxInlineTokens: 24000` |
| 报告 `contract: unverified` | 合同读不了 DSH 日志 | 正常；用 `sprint-check --strict` 做产物级替代 |

---

## 9. 版本管理建议

`gstack-dsh/` 目前不是一个 git 仓库。建议把它纳入版本控制（只提交源码，不提交生成物）：

```bash
cd ~/Documents/deepseek-harness/default-workspace/gstack-dsh
git init
cat > .gitignore <<'EOF'
node_modules/
EOF
git add render.mjs sprint-check.mjs sprint-dashboard.mjs cordis.patch.yml package.json freeze-guard README.md USAGE.md MAINTENANCE.md
git commit -m "gstack-dsh adapter"
```

每次升级 gstack 或改适配器后提交一次，`manifest.json` 里的 `sourceHead` 就是对应的 gstack 版本证据。

---

## 10. 下一步优化路线（建议顺序）

1. **浏览器 QA 成熟化**：导入登录态 cookie、真实 staging 的 `/qa` 冒烟、截图证据；收益最直接。
2. **角色权限与 hooks**：reviewer 只读、builder 可写、ship 人审；把 `/guard`、`careful` 接进 `tools.guard`。
3. **Sprint 面板**：阶段/门禁/产物/成本的可视化；`SPRINT.md` 已是雏形。
4. **合同适配器**：DSH 会话日志 → gstack transcript，恢复 `contract: verified`。
5. **模型路由**：Lead/review 强模型、QA/文档便宜模型、接 Claude Code/Codex 做外部评审。
6. **上游化**：`hosts/dsh.ts` + `./setup --host dsh`。
