# dsh-gstack

**gstack 超级团队，跑在 DeepSeek Harness 上。**

把 [gstack](https://github.com/garrytan/gstack) 的 60+ 个工程技能、角色化流程和证据纪律，接成 DSH 原生的一套工作方式：一个 `gstack` agent preset、8 份角色任务书、Agent Teams 协作、`/sprint` 全流程、产物级证据检查、常驻 Sprint 面板、`/freeze` 强制守卫，以及 gstack 自带的 headless Chromium。

> ⚠️ **当前是实验项目（experimental）。**
> DSH 的插件 API、Agent Teams、preset 组合和 gstack 的技能格式都在快速变化；本项目按 DSH `0.2.2-rc.2` 与 gstack `v1.99.2.0` 验证。升级任一侧后请按 [MAINTENANCE.md](MAINTENANCE.md) 回归。
> 欢迎一起把它变成 **gstack × DSH 的最佳实践**：装完就能用，遇到问题、做出改进都可以提 PR。

---

## 它给你什么

| 能力 | 说明 |
|---|---|
| `gstack` preset | Lead persona + 13 个一级技能 + `sprint` + 63 技能 router |
| 角色 | `product / architect / designer / reviewer / security / qa / release` 八份任务书 |
| Team | rc.2 Agent Teams：`subagent({name})` + `send_message` + `wait_agent` + `team_task_*` |
| 流程 | `/sprint`：board、阶段、Gate 1/2、worktree 构建、review 扇出 |
| 证据 | `sprint-check --strict` + `SPRINT.md` + `SPRINT.html` |
| 常驻面板 | 输入框上方的 Live Sprint 状态条，5 秒刷新，点开是完整面板 |
| 安全 | `/freeze` 工具级守卫；sandbox 可写根自动探测 |
| 浏览器 | `/browse`、`/qa` 走 gstack 自带 Chromium |

---

## 前置条件

- **DeepSeek Harness** `0.2.2-rc.2` 或兼容版本（Desktop 或 Web）
- **Node.js ≥ 22**（跑渲染器和测试）
- **Bun ≥ 1.3.3**（gstack 运行时）
- **gstack checkout**：`git clone https://github.com/garrytan/gstack ~/gstack`
- 可选：**Chromium**（gstack 的 headless 浏览器；按需构建，见下）

平台：**macOS 已实测**；Linux / Windows 尚未完整验证（sandbox 根、Go 缓存、浏览器路径、`/freeze` 行为需要适配）。欢迎提交平台补丁。

---

## 快速开始

```bash
# 1) gstack
git clone https://github.com/garrytan/gstack ~/gstack

# 2) 本项目
git clone https://github.com/soeluc/dsh-gstack.git ~/dsh-gstack
cd ~/dsh-gstack

# 3) 检查 + 渲染（会创建 ~/.gstack 并写入 ~/.dsh/gstack/skills）
node scripts/setup.mjs --gstack-root ~/gstack
```

然后在 DSH 里安装 bundle：

- 用 **Plugins → 安装 bundle**，选择 `~/dsh-gstack`；
- 或让 agent 调用 `plugin_manager`：

```text
install_bundle /Users/<you>/dsh-gstack
```

安装后：

1. **完全退出并重开 DSH**（Host 路由、freeze 守卫、Live 面板都在启动时加载）；
2. 打开 **Settings → Agent preset**，选 **gstack**（或切换当前会话的 seat）；
3. 验证：

```text
/review
/sprint 修一个小 bug 并补测试
/browse https://example.com
```

---

## 可选：构建浏览器

```bash
cd ~/gstack
bun install --frozen-lockfile
bun build --compile --no-compile-autoload-dotenv --no-compile-autoload-bunfig browse/src/cli.ts --outfile browse/dist/browse
bun build --compile --no-compile-autoload-dotenv --no-compile-autoload-bunfig browse/src/find-browse.ts --outfile browse/dist/find-browse
bash browse/scripts/build-node-server.sh
chmod +x browse/dist/browse browse/dist/find-browse
./bin/gstack-browser-ensure
```

DSH 沙箱内 Chromium 自带沙箱会与 Seatbelt 冲突（`Target crashed`），所以每条浏览器命令都要加：

```bash
GSTACK_CHROMIUM_NO_SANDBOX=1 /path/to/browse goto https://example.com
```

---

## 目录结构

```
dsh-gstack/
  package.json           # bundle manifest + dsh.client
  cordis.patch.yml       # preset / sandbox / spill / host rows
  render.mjs             # gstack -> DSH 技能/角色渲染器
  sprint-check.mjs       # 产物级证据检查
  sprint-dashboard.mjs   # SPRINT.md
  sprint-panel.mjs       # 自包含 SPRINT.html
  sprint-live/           # 常驻面板：Host route + Client dock
  freeze-guard/          # /freeze 工具守卫
  scripts/setup.mjs      # 前置检查 + 渲染 + 下一步提示
  test/                  # node --test
  docs/                  # 实践、平台、故障排查（逐步补齐）
  USAGE.md               # 日常用法
  MAINTENANCE.md         # 升级、定制、排查
```

---

## 配置（环境变量）

| 变量 | 作用 | 默认 |
|---|---|---|
| `GSTACK_ROOT` | gstack checkout 路径 | `~/gstack`，其次 `~/.claude/skills/gstack` |
| `DSH_HOME` | DSH 配置根 | `~/.dsh` |
| `GSTACK_STATE_ROOT` / `GSTACK_HOME` | gstack 状态根（review log、freeze） | `~/.gstack` |

`sandbox-policy.additionalWritableRoots` 会在加载时**只保留本机真实存在的目录**（`~/.gstack`、Go module/build cache、Windows `LOCALAPPDATA` 缓存），避免“目录不存在 → 整个会话 bash/write 失败”。

---

## 已知边界

- `contract: unverified`：gstack 合同读 Claude transcript，DSH 读不了；用 `sprint-check --strict` 做产物级替代。
- `/freeze` 是**进程级**的（单用户假设），且 **bash 写入不受控**；它是纪律执行，不是安全沙箱。
- 浏览器关闭了 Chromium 内层沙箱（DSH 外层仍生效）；页面内容始终按不可信处理。
- 队友共享 cwd；并行构建必须一个 worktree 一个 builder。
- Team / 插件 API 是实验性的，升级 DSH 后按 [MAINTENANCE.md](MAINTENANCE.md) 回归。
- 包名 `@local/dsh-gstack` 是路径安装的本地 id；发布 npm 前改成 `@yourscope/dsh-gstack`，并同步 `sprint-live/client.js` 的 module id。

---

## 一起完善

这个项目的目标不是再造一个 gstack，而是把 **“gstack 在 DSH 上怎么用最好”** 变成可复制的实践：

- 平台移植（Linux / Windows）
- 浏览器登录态 QA、视觉回归
- 更多 hooks / 角色权限（reviewer 只读、ship 人审）
- 合同适配器（DSH session log → gstack transcript）
- Sprint 面板 / 任务板体验
- 文档、故障排查、最佳实践

贡献方式、开发循环和 PR 检查清单见 [CONTRIBUTING.md](CONTRIBUTING.md)。实践与踩坑记录见 [docs/BEST-PRACTICES.md](docs/BEST-PRACTICES.md)。

---

## License

- 本项目代码：MIT，见 [LICENSE](LICENSE)。
- gstack 技能文本：MIT，Copyright © 2026 Garry Tan，见 [NOTICE](NOTICE)。本项目不打包 gstack 仓库；安装时从上游 clone，并在本地渲染。
- DeepSeek Harness 本体不随本项目分发；使用受其自身许可约束。
