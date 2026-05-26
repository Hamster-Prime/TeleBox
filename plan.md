# TeleBox 全量代码与依赖审查计划 (plan.md)

> 本计划为 codex `/goal` 任务的输入文档。  
> 目标：对 TeleBox（Telegram UserBot 框架）进行**穷尽式**审查，覆盖代码缺陷、安全漏洞、依赖风险、运行时与生命周期问题、平台兼容性、并发安全、性能、可维护性等所有维度。  
> 不限时长，宁可慢、不可漏。每一项都要求**逐文件、逐函数、逐分支**核对，并产出可追踪的 finding 列表（含 `file:line` 引用、严重等级、修复建议）。

---

## 0. 任务约束与产出格式

### 0.1 任务约束
- **不要修改任何代码**，本任务为纯审查。除非显式要求“产出修补 PoC”，否则仅写入 `audit/` 目录下的发现文档。
- **不要执行带副作用的命令**：禁止 `npm install`、`npm update`、`git push`、`git reset --hard`、`rm -rf` 等。
- 允许执行的只读探测：`tsc --noEmit`、`npm ls`、`npm outdated`、`npm audit`、`git log`、`git status`、`git diff`、`ripgrep`、`node -e` 等。
- 项目运行平台横跨 **Linux / macOS / Windows**，但默认部署目标是 **Linux + Node.js 24.x + PM2**。审查时必须显式标注每一个 finding 是否平台特有。
- 项目目前在 Windows 上开发（`C:\Users\linlu\Desktop\DEV\TeleBox`），请注意 CRLF、路径分隔符、shell 命令差异。

### 0.2 产出目录结构
请创建 `audit/` 子目录，并按以下结构写报告：

```
audit/
├── 00_summary.md                # 总览：严重等级分布、Top 10 风险、修复优先级
├── 01_dependency_audit.md       # 依赖与 supply-chain 风险
├── 02_security_findings.md      # 安全漏洞（命令注入、路径遍历、SSRF、反序列化等）
├── 03_runtime_lifecycle.md      # generationContext / runtimeManager / 资源泄漏
├── 04_plugin_system.md          # pluginManager / hot-reload / require.cache / alias 等
├── 05_telegram_layer.md         # teleproto 调用、entity/peer/access_hash、channel gap
├── 06_logger_console.md         # logger 覆写 console、降级、循环依赖
├── 07_plugin_by_plugin.md       # 每个内置插件逐一审查（按文件分章节）
├── 08_utils_by_file.md          # 每个 utils 文件逐一审查（按文件分章节）
├── 09_cross_platform.md         # Windows / macOS / Linux 兼容性
├── 10_perf_memory.md            # 性能与内存（含 reload 内存监控逻辑评估）
├── 11_data_layer.md             # better-sqlite3 + lowdb 使用与并发
├── 12_typescript_types.md       # tsconfig、类型逃逸（any/as any）、unsound 范型
├── 13_error_handling.md         # try/catch、unhandledRejection、错误吞没
├── 14_concurrency.md            # 异步竞态、双重 init、未 await、并发 IO
├── 15_logging_observability.md  # 控制台噪音、敏感信息泄漏、日志级别一致性
├── 16_config_secrets.md         # config.json/session/.env 安全
├── 17_build_deploy.md           # tsx + tsconfig-paths + PM2 ecosystem
├── 18_tests_coverage.md         # 测试缺失情况（项目无 tests/ 目录）
├── 19_docs_consistency.md       # README/INSTALL/CHANGELOG/TELEBOX_DEVELOPMENT 与代码一致性
└── 20_action_plan.md            # 修复路线图：P0/P1/P2 + 估时
```

### 0.3 finding 条目格式
每条 finding 必须使用如下 Markdown 块（不要省略任何字段）：

```markdown
### FND-XXX: <一句话标题>
- **Severity**: Critical | High | Medium | Low | Info
- **Category**: security | correctness | runtime | dependency | perf | dx | docs | platform
- **File(s)**: `src/utils/foo.ts:42-58`, `src/plugin/bar.ts:101`
- **Component**: pluginManager / runtimeManager / logger / tpm plugin / …
- **Platform**: All | Linux | macOS | Windows
- **Reproduction / Trigger**: <如何触发或被利用>
- **Evidence**: <代码片段、调用链、git blame、依赖路径>
- **Root Cause**: <为什么会出问题>
- **Impact**: <如果不修，最坏会怎样>
- **Suggested Fix**: <具体到行级的修复建议；如果需要权衡，列出 ≥2 个方案及取舍>
- **Confidence**: 1–5（1=猜测，5=确定）
- **References**: <相关 CVE、文档、commit>
```

`FND-XXX` 编号全局递增（FND-001, FND-002…），不区分类别。每一条 finding 进入对应主题报告后，需在 `00_summary.md` 中再次出现（仅 ID + 标题 + Severity）。

---

## 1. 项目背景（审查必须先吸收的事实）

> 这部分是“供审查者快速建立心智模型”的速查表，**不是结论**。审查时如发现这里描述与代码不符，应作为 finding 记下。

- **项目类型**：Telegram UserBot 框架，使用 `teleproto`（GramJS 衍生分支）库登录用户账号。
- **运行入口**：`src/index.ts` → `startRuntime()` (`src/utils/runtimeManager.ts`)。
- **插件机制**：动态 `require()` `src/plugin/` 和用户 `plugins/` 目录下的 `.ts` 文件；reload 时清 `require.cache` 实现热重载。
- **命令处理**：消息事件 (`NewMessage` / `EditedMessage`) → `dealCommandPlugin` → `getCommandFromMessage` → 调用 `plugin.cmdHandlers[cmd]`。
- **生命周期**：`GenerationContext` (`src/utils/generationContext.ts`) 跟踪每一代 runtime 的 task/disposable/listener/timeout/child-process，reload 时 abort + drain。
- **数据库**：
  - `better-sqlite3` for: alias、sudo、sendlog、sure（同步 API）
  - `lowdb` (JSON file) for: tpm 插件记录、reload 内存配置、status 模板、bf 备份配置
- **关键全局副作用**：
  - `logger`（`src/utils/logger.ts`）启动时一次性覆写 `console.*`，并将 `PERSISTENT_TIMESTAMP_OUTDATED` 等 RPC 错误降级为 WARN、触发 channel gap circuit breaker。
  - `src/hook/patches/telegram.patch.ts` 在启动时 monkey-patch `HTMLParser.parse` 和 `Api.Message.deleteWithDelay/safeDelete`。
- **命令前缀**：默认 `. 。 $`；开发模式 `! ！`；可通过环境变量 `TB_PREFIX`、`TB_SUDO_PREFIX` 覆盖。
- **会话**：`config.json` 存 `api_id` / `api_hash` / `session`（StringSession，**含完整 auth_key，泄漏即丢号**）。
- **远程插件源**：硬编码 `https://raw.githubusercontent.com/TeleBoxDev/TeleBox_Plugins/main/plugins.json`。

---

## 2. 阶段分解（依次执行，前一阶段产物作为后一阶段输入）

### Phase A — 全局映射（建立"地图"）

A.1 列出仓库全部源文件，按目录分组并标注 LOC：
- `src/index.ts`、`src/hook/`、`src/plugin/`、`src/utils/`、`scripts/run-tsx.cjs`、`ecosystem.config.cjs`。
- 输出 `audit/_inventory.md`（不计入正式 finding 报告）。

A.2 解析 `package.json`：
- 列出全部 `dependencies`（30+ 项）+ `overrides`。
- 标记每个依赖的用途（哪些文件 import 了它）、是否 `@types/*` 与实际包同步、是否冗余/未用、是否过期。
- 注意 `"type": "commonjs"` 与若干依赖（如 `@vitalets/google-translate-api`, `modern-gif`, `p-limit`, `cheerio`, `lowdb`）都是 ESM-only 包：审查是否在 commonjs 里被正确 import / 是否实际可用。
- 注意 `"engines": { "node": "24.x" }` 与 README/INSTALL 描述、`scripts/run-tsx.cjs` 中对 Node 22+ 的 `--localstorage-file` 处理是否一致。
- 检查 `package-lock.json` 已被 `.gitignore`（最近一次提交 `691ea42 chore: ignore package-lock.json`）—— 这本身是个**风险点**，需要单独 finding：失去 lock file 意味着每次安装解析出来的依赖树都可能不同。

A.3 解析 `tsconfig.json`：
- 评估 `"strict": true` 是否真生效（是否有 `as any` / `@ts-ignore` 大量逃逸）。
- `"include": ["src/**/*", "plugins/**/*"]` 把用户插件目录纳入 typecheck，会有什么副作用？
- `"baseUrl": "./src"` + path alias `@utils/*` 与 `tsconfig-paths/register` 在生产、reload、动态 require 下是否始终生效。
- `"lib": ["dom", "es7", "ES2019", "ES2020"]` —— dom 是否有必要？
- `"sourceMap": false` 对生产排错的影响。

A.4 解析 `scripts/run-tsx.cjs` 与 PM2 `ecosystem.config.cjs`：
- `NODE_OPTIONS` 的合并是否会被 PM2 二次覆盖？
- `--localstorage-file` 路径默认在 `~/.cache/telebox/node-localstorage`，权限、被多实例共享时是否冲突。
- PM2 `instances` 支持 `max` / 数字 / cluster 模式 —— UserBot **不应** cluster 多实例同时登录同一 session，需要核实是否有显式禁止。

A.5 把 `.gitignore` / `.env-sample` / `INSTALL.md` / `README.md` / `CHANGELOG.md` / `TELEBOX_DEVELOPMENT.md` 全部读一遍，记录文档与代码不一致之处入 `19_docs_consistency.md`。

> ⏹ Phase A 完成判据：`audit/_inventory.md` 列出所有源文件 LOC、所有依赖用途、所有顶层配置文件解读。

---

### Phase B — 安全审查（最高优先级）

> 任何外部输入流（Telegram 消息、远程 URL、用户提供的目标 chat id、回复中的文件、shell 参数、环境变量）都必须假设为不可信。

B.1 **命令注入面**（`02_security_findings.md`）：列出每个 `exec()` / `execAsync()` / `execSync()` / `spawn()` 调用点，分析输入来源。已知调用点：
  - `src/plugin/exec.ts:163` — `msg.message.slice(1).replace(/^\S+\s+/, "")` 直接进 `exec(shellCommand)`。这是**有意为之**的设计（用户自己的账号、`.exec` 命令），但必须确认：
    - sudo 用户能否触发？`sudo.ts` 中 `listenMessageHandler` 会把白名单用户的消息以**自己的身份**发送，再调用 `dealCommandPluginWithMessage`，意味着白名单用户能 `.exec` ——是否在文档中明确告警？
    - 命令前缀可被 `.prefix set` 修改，能否构造出绕过预期前缀的命令？
  - `src/plugin/update.ts:76,81,85` — `execAsync("git fetch --all" / "git reset --hard ${fullBranch}" / "git pull ${remote} ${branch}")`，其中 `remote` 和 `branch` 来自 `git remote` / `git branch -r`，理论上可控；但若有人在 `.git/config` 注入恶意 remote 名，会触发 shell 解释 ——验证。
  - `src/plugin/ping.ts:169,213` — `ping -c ${count} -W 5 ${target}`：`target` 来自用户参数；正则 `parseTarget` 并不能完全防止注入（例如 `;ls;`）。审查必须给出**最小 PoC** 或证伪。
  - `src/plugin/status.ts` 大量 `safeExec("uname -r")` 等固定字符串，本身安全；但要审查 `safeExec` 是否捕捉了 stderr/timeout、命令在 macOS 下兼容性（已有 `sysctl` 路径分支）。
  - `src/plugin/reload.ts:473` — `execAsync("pm2 restart telebox")` 固定字符串，安全。
  - `src/plugin/bf.ts` — 大量 `spawn("tar"/"gzip", [...])`，参数是数组形式，**不经过 shell**，安全；但 `path.join(parentDir, dirName)` 中 `parentDir = path.dirname(cwd)` 在 Windows 上行为如何（驱动器根目录）？
  - `src/utils/teleboxInfoHelper.ts:21` — `execSync("git rev-parse --short HEAD", { cwd: process.cwd() })`：若 cwd 在 git submodule、worktree、shallow clone 中会怎样？
  - `src/utils/npm_install.ts:20-31` — `execFileSync("npm", [...])` 用 execFile 是好习惯，无 shell 解释；但是否清理了所有可能影响子进程的 env？已有 `buildCleanNpmEnv()` 清 `npm_*`，但 `NPM_CONFIG_PREFIX`、`NODE_OPTIONS` 等是否需要也清？

B.2 **路径遍历 / 任意文件写**：
  - `src/plugin/tpm.ts:324, 411, 536, 639` — `path.join(PLUGIN_PATH, ${plugin}.ts)`、`path.join(PLUGIN_PATH, fileName)`。`plugin` 来自远程 `plugins.json` 的 key（信任远端仓库），`fileName` 来自回复消息的 `media.document.attributes[0].fileName`（来自其他 Telegram 用户）。能否传入 `../../etc/cron.d/foo`？审查 `sanitizeFilename` 在哪些路径生效（`bf.ts:141` 有一份，但 tpm 没用）。
  - `src/plugin/bf.ts:474-523` — `cmd === "all"` 会 `tar` 父目录，`parentDir = path.dirname(process.cwd())`，再发文件到 Telegram。如果 cwd 在 `/root`、`~/`，会暴露宿主机的同级文件。设计风险。
  - `src/plugin/sendLog.ts:17-32` — 写死了多条系统路径 `/var/log/telebox/*.log`、`~/.pm2/logs/*`，并把这些日志文件**整份发到 Telegram 目标对话**。日志极可能包含 session 等敏感信息；评估。
  - `src/plugin/prefix.ts:92-105` — 写入 `.env`，使用简单正则替换；若 `.env` 已有同名变量带特殊字符，行为如何？是否破坏文件？

B.3 **不可信反序列化 / 动态 require**：
  - `src/plugin/tpm.ts:644` — `require(filePath)` 直接 require 用户发来的 `.ts`（已通过 `isValidPlugin` 校验，但 require 本身就会执行任意代码）。是否在 README/UX 上充分告警“安装插件 = 信任作者完全控制你的 Telegram 账号 + 主机”？
  - `src/utils/pluginManager.ts:150-160` — `dynamicRequireWithDeps()` 删 `require.cache` 后 require，路径来自 `setPlugins(USER_PLUGIN_PATH | DEFAULT_PLUGIN_PATH)`，未做白名单。
  - `src/utils/tlRevive.ts` — `reviveTl()` 接受任意 JSON，按 `className` 反查 `Api[...]` 构造器并 `new Ctor(args)`。如果该 JSON 来自不可信源（目前只在 entity 调试场景被自己使用），仍应评估“被滥用”风险。

B.4 **SSRF / 远程拉取**：
  - `tpm.ts` 通过 `axios.get(PLUGINS_INDEX_URL)` 拉硬编码 GitHub URL；`normalizeGithubUrl()` 把 `github.com/blob/...` 改写为 `raw.githubusercontent.com/...`，但**没有验证 host 是否在白名单**，远程 `plugins.json` 中的 `url` 字段可指向任意域 → 可被仓库维护者投毒。审查后续 mitigations。
  - `update.ts` 用 `git pull <remote>`，依赖宿主 `.git/config`，无额外校验。
  - 是否对 axios 的 `responseType: "text"` + `maxContentLength` 做限制？防止恶意大文件填爆磁盘。

B.5 **凭据与日志泄漏**：
  - `src/utils/apiConfig.ts` 明文存 session 到 `config.json`，且无文件权限收紧；审查 `.gitignore` 是否覆盖（已覆盖 `config.json`）。
  - `logger` 把对象用 `util.inspect(arg, { colors: true, depth: null, breakLength: Infinity })` 完整 dump —— 若意外把含 session/token 的对象打入 log，会全量打印。审查是否有任何路径会 `console.log(client.session)` 或类似。
  - `sendlog` / `bf` 把日志、备份发到 Telegram 对话；评估"目标对话被错配置"导致敏感数据外泄的风险。
  - `debug.ts` 的 `entity` / `msg` 命令把 entity（含 access_hash）/Message 完整 JSON 化打入 log 与编辑消息：access_hash 一旦发到群里就泄漏给所有看消息的人。

B.6 **权限与白名单一致性**：
  - `sudo.ts` 白名单允许其他用户以**主账号身份**触发任意命令，包括 `.exec`、`.tpm i`、`.update -f`。审查：
    - `listenMessageHandler` 路径中是否对“危险命令”做二次确认？目前**没有**。
    - 命令前缀可由 sudo 用户用 `.prefix` 修改？审查 `prefix.ts` 是否做了权限检查（看起来没有，因为 `prefix` 命令只检查 `msg.out || savedPeerId` 在 `dealCommandPlugin`，sudo 路径走的是 `sendMessage` 再触发，等价于 self-message）。
  - `sure.ts` 比 sudo 更宽松（任意群成员），但要求“消息白名单”精确匹配；审查 `_command:` 前缀模式下、`startsWith(prefix)` 的匹配是否会被构造前缀子串绕过。

B.7 **HTML / Markdown 注入**：
  - 多数插件统一使用 `parseMode: "html"` 配合 `htmlEscape()`；审查每个 `msg.edit({ text, parseMode: "html" })` 调用点的 text 是否经过转义。
  - `tpm.ts:1066` 直接拼接 `pluginLines.join("\n")` 进 `<blockquote expandable>`：插件名/描述里若有 `<` `>`，escape 是否完整？
  - `re.ts` 中 `formattingEntities: message.entities` 直接复用远端消息的实体，无校验。

B.8 **DoS / 资源耗尽**：
  - `tpm i all` 串行下载所有插件，每个 100ms 节流；远端 `plugins.json` 可有任意大小列表 → 攻击者 fork 仓库内嵌入大量条目；审查上限。
  - `bf all` 打包整个项目目录（不含 node_modules），无大小/超时限制；若 `assets/` / `plugins/` 被恶意填充会撑爆磁盘 / 内存（gzip 流式还好）。
  - `re.ts` 的 repeat 参数无上限，可 `re 1 99999`。
  - `ping <hostname>` 的 `systemPing` count 默认 3 但参数未传入；HTTP/TCP ping 各方法对单个目标会同时发 5+ 请求，可被滥用做扫描。

> ⏹ Phase B 完成判据：以上每一行 bullet 都在 `02_security_findings.md` 里有 finding 或显式说明“已确认安全（原因）”。

---

### Phase C — Runtime / Lifecycle 审查

C.1 `src/utils/runtimeManager.ts`：
- `transitionPromise` 单例锁是否能防住所有并发场景（`reloadRuntime` × N 同时调用、`shutdownRuntime` 在 reload 中途调用）？
- `startFreshRuntime` 失败时 `currentRuntime = null` 但 `reloadRuntime` 失败时**保留** newRuntime —— 这两个路径不一致，core 行为差异是否有文档？
- `disposeRuntime` 在 `runtime.context.state === "disposed"` 时返回的 DrainResult 中 `stats` 用 `cloneEmptyDrainStats(runtime.context.snapshot().stats)`：函数名"empty"但实际不是空。命名误导。
- `destroyClient` 设有 `CLIENT_DESTROY_TIMEOUT_MS=15s`，但 teleproto 内部的 `destroy()` 在断网时可能 hang —— 是否有兜底强杀？

C.2 `src/utils/generationContext.ts`：
- `markResourcesCanceled` 在 `abort()` 时给所有非 `abort-token` 的活跃资源累加 `canceled++`，但**并未真正取消** disposable（disposable 仍在 set 里等 drain）。这造成"canceled 计数与实际状态不一致"。审查是否会误导诊断。
- `trackTask`：`.finally()` 里 `tasks.delete(entry)` + `completeResource`，但如果 promise 永不 settle，`drain` 会 timeout。审查 timeout 后的状态机：是否会让 `disposed` 标志推进？看起来只有未 timeout 才设 `lifecycleState = "disposed"`，timeout 后**永远不会进入 disposed**。这意味着 reload 反复 timeout 时，老 generation 会留下一堆 active resource，存在累积内存泄漏。
- `delay()` 路径在 `signal.aborted` 时调用 `trackTask(Promise.reject(...))` 会把 reject 计入 active task；是否需要短路。
- `setTimeout` 包装：`callback` 在已 abort 时不执行，但 timer 仍 fire 一次后 dispose；如果 disposable 抛错，会被 `console.error` 吞掉。
- 与 PR 历史的 `feat`/`fix` 注释（如"runtime hang"、"reload fails")交叉验证 commit message 与 code 是否一致。

C.3 `src/utils/pluginManager.ts`：
- `purgeModuleCache` 不会跨过 `CACHE_PURGE_EXCLUDE`，但 **子树收集** `collectModuleSubtree` 会跟随到 `node_modules` 边界外，验证逻辑（`shouldPurgeCache` 中 `if (normalized.includes(${sep}node_modules${sep})) return false`）是否对**符号链接**奏效（Windows 上可能不解析符号链接）。
- `loadPluginsForRuntime` 顺序：先 `setPlugins(USER_PLUGIN_PATH)` 再 `DEFAULT_PLUGIN_PATH` —— 若用户插件名与内置插件同名，后加入的（默认插件）会**覆盖** map 中的 entry，但 `validPlugins[]` 数组里二者都在 → `runPluginSetup` 会跑两次。是否预期？
- `dealCommandPluginWithMessage` 失败时 `await msg.edit({ text: errorMsg })` 可能因消息已删除/客户端被销毁再次抛错；当前用 try/catch 包裹了 inner edit。OK。
- `pluginLoadDepth` 防嵌套，但只看深度数字，不区分 generation；若 `loadPlugins()` 在 setup() 中被调用会被跳过 —— 这是 commit 691ea42 之前的痛点，**核对 commit log** 与现在实现是否一致。
- `getCommandFromMessage` 中 `aliasDB.close()` 在循环外，但 alias DB 是同步打开 + 用完关闭：每次消息到达都重新打开 SQLite 文件，I/O 开销可能巨大（特别是高频群）。基准评估。
- 命令正则 `/^[a-z0-9_]+$/i` 在 `getCommandFromMessage` 中：不允许带横线/中文命令，但 alias 可以绕过（先检查 alias）。审查是否有意。

C.4 `src/utils/cronManager.ts`：
- `del(name)` 在 dispose 时跑，但同时 `task` 可能仍 running；evaluation 是否把 in-flight 任务等齐再返回。
- `set` 中 `if (this.tasks.has(name)) throw` —— reload 后旧 disposable 才 drain，新 setup 又跑：若 disposable 没及时清，新 `set` 会抛。审查时序。

C.5 `src/utils/channelGapBreaker.ts`：
- 写死的 `FAILURE_THRESHOLD = 2`、`BREAK_COOLDOWN_MS = 6h` —— 缺少配置入口。
- `clearChannelStateOnClient` 反射式触摸 `client._channelPts` / `client.updateManager.*` 私有字段；teleproto 升级后字段重命名即静默失效。审查是否有 fallback / 日志。
- `tryGetClient()` 用 `require("./runtimeManager")` 同步取，避免循环引用 —— 验证 require cycle。
- `resetCircuitBreaker()` 在 `startFreshRuntime` 中调用：reload 时清；但如果"循环 reload"（如内存监控触发），可能把还有效的 cooldown 重置。

C.6 `src/utils/logger.ts`：
- 单例：构造时 `if (Object.keys(context).length === 0)` 才 override console；reload 时本文件被 **CACHE_PURGE_EXCLUDE** 排除，所以 logger 不会被重新实例化。但如果有任何下游代码 `new Logger()` 也会绕过 override —— 审查使用方。
- `formatLog` 中 stack 解析硬编码 `i = 3` 起 —— 在 reload/异步堆栈下偏移可能偏。
- `console.log`/`console.warn`/`console.error` 三个路径都重复粘贴了相同的 downgrade 逻辑，提取函数与否的取舍 + 是否有路径漏写（如 `process.stderr.write` 直接绕过）。
- ANSI 颜色在 PM2 文件日志里会留下乱码？审查 `isTTY` 判断。
- `initDB().catch(console.error)` 在 logger 构造时 fire-and-forget；如果 db 初始化失败，level 用默认值 INFO，但用户可能以为已经被设置成 DEBUG。

> ⏹ Phase C 完成判据：每个 lifecycle 相关文件都至少有"X 个 finding 或显式标注无问题"。

---

### Phase D — 平台兼容性（重点 Windows）

D.1 **路径与 shell**：
- 所有用 `/bin/sh` 风格 shell 的地方在 Windows 上行为？
  - `update.ts` 用 `git`、`exec.ts` 直接转发用户命令、`ping.ts` 用 `ping -c`（Windows 是 `-n`）/`awk`、`status.ts` 大量 `df -k`、`ps aux`、`free -b` 都是 Linux 命令。
  - `bf.ts` 的 `spawn("tar")` —— Windows 默认无 tar（Win10+ 有 bsdtar，需 PATH 命中）。
- `path.join` 使用基本一致；但 `process.cwd()` 在 PM2 `script: node, args: runner entry, cwd: root` 模式下与 `npm start` 一致吗？

D.2 **package.json scripts**：
- `"dev": "NODE_ENV=development node scripts/run-tsx.cjs ./src/index.ts"` —— Windows 命令提示符不支持 `NODE_ENV=…` 内联（PowerShell 也不支持）。审查是否破坏 Win 开发。
- `"start"` 在 PowerShell 下能跑（无 inline env），OK。

D.3 **better-sqlite3 / sharp / canvas / ssh2**：
- 都是原生模块，需要 Node ABI 匹配；Windows 上若无 VS Build Tools 安装会失败。审查 INSTALL.md 是否给出 Windows 指引（目前未给）。
- `canvas` 是否在所有插件里都被用到？grep 一遍：若只有少数远程插件依赖，应该考虑是否能 lazy 加载或 optional。

D.4 **PM2**：
- ecosystem 设 `interpreter: 'none'`，依赖 `node + tsx`；Windows 上 PM2 兼容性不佳，需文档说明。

D.5 **大小写敏感**：
- `tsconfig` 有 `forceConsistentCasingInFileNames`，OK。但仓库内是否有 `loginManager.ts` 引用为 `LoginManager` 之类？grep。

> ⏹ Phase D 完成判据：每个跨平台调用点都被标注是否在 Win/macOS 工作。

---

### Phase E — 并发与数据层

E.1 **SQLite**：
  - 所有 SQLite DB（alias/sudo/sendlog/sure）都使用 `new Database(path)` + 用完 `db.close()`，**每次操作都重新打开**。better-sqlite3 是同步阻塞 API，频繁 open/close 在高频消息场景下会阻塞事件循环 → 测算 P99 影响。
  - 是否使用 `journal_mode = WAL`？默认不是，多进程访问（PM2 cluster + 是否场景）会冲突。
  - 同进程内"打开-关闭-再打开"是否会丢 in-memory cache？

E.2 **lowdb**：
  - `JSONFilePreset` 内部带读写竞争保护吗？多个并发 `await db.write()` 会怎样？看 reload 中 `memoryMonitorTask` 与 `cmdHandlers.memory` 都可能并发改 config，可能造成最后写覆盖。

E.3 **进程级竞态**：
  - `process.on('unhandledRejection')` 只 `console.error`，不退出；而 `uncaughtException` 直接 `process.exit(1)`。区别是有意吗？是否会让 unhandled rejection 静默累积内存？
  - reload 内存监控里 `process.exit(0)` 调度，但同时有 `reloadRuntime()` 在跑 —— `scheduleTrackedTimeout(() => process.exit(0), 1000)`：reload 是否能在 1s 内完成？若没完成，进程会半中间退出。

E.4 **`/me` 操作**：
  - `sendLog` 默认目标 "me"（自己的 Saved Messages）；多账户场景下 "me" 不同账号语义不同。审查。

> ⏹ Phase E 完成判据：每条 race condition 都有"复现假设 + 实际能否触发"判断。

---

### Phase F — 性能与内存

F.1 reload 内存监控 (`src/plugin/reload.ts`)：
  - 默认 `0 * * * *` —— 每小时；阈值 `memoryThreshold=150MB`/`rssThreshold=512MB`/`runtimeGrowthThreshold=120MB`。对一台 1G 小机器太低；对大插件用户偏紧。审查文档是否说明。
  - "Memory 优化"流程：先 `reloadRuntime()` → 还高就 `process.exit(0)`。`exit(0)` 依赖 PM2 自动重启；若用户裸跑（无 PM2），bot 直接挂掉。审查是否检测了 PM2 环境。
  - `baselineMode: "on-reload"` 会在每次 reload 后重设 baseline → growth 永远是 0，等价于禁用 growth 监控。可能是 feature 也可能是 bug。

F.2 **Logger 输出量**：
  - 每条消息触发 `getCommandFromMessage` → 内部 new SQLite → log "PREFIXES" 一次（仅启动）。但 alias 查询本身**不打 log**。
  - 大群高频消息会让 stack 解析 (`new Error().stack`) 成本上升。

F.3 **Telegraph / TelegramFormatter**：
  - 这两个文件超 500/700 行，但只在远程插件中使用 —— 项目本体没引用。**确认无用即标记为 dead code**。

F.4 **archiver / sharp / canvas / modern-gif**：
  - 仅 `bf.ts` 用过 sharp？审一遍。`archiver` 在 dependencies 但 `bf.ts` 用 `spawn("tar")` —— 似乎 archiver 是冗余依赖。确认。
  - `ssh2` 在 `src/` 内未被 import，可能是给远程插件预留？标 dead。
  - `cheerio`、`@vitalets/google-translate-api`、`opencc-js`、`qrcode-terminal`（loginManager 用 ✓）、`p-limit`、`node-schedule`（已被 cron 替代但仍在依赖）、`@modelcontextprotocol/sdk`、`js-yaml` —— 全部 grep `src/`、`plugins/` 看是否被用。

> ⏹ Phase F 完成判据：列出至少一份"待移除/可拆为 optional/peer 的依赖"清单。

---

### Phase G — 插件逐一审查

每个 `src/plugin/*.ts` 都在 `07_plugin_by_plugin.md` 里有独立小节：

#### G.1 `alias.ts`
- `setAlias` 的 splitIndex 逻辑：靠 `getPluginEntry` 判断 token 是否是命令；若 alias 与原命令同名会怎样？测试 `.alias set foo foo`。
- `del`/`set` 后调用 `loadPlugins()` 触发 reload —— 一次 alias 编辑就 reload 整个 runtime，开销/事件丢失风险。

#### G.2 `bf.ts`
- 全量 `cmd === "all"` 时把整个 cwd 打包；`tar --exclude=node_modules` 等列表是否能确保排除大文件（如 `temp/`、`assets/eat/cache`、用户插件下载的 zip）。
- `restoreBackup` 会**先复制当前到 `_restore_backup_<ts>`，再删除原目录，再恢复**：中间任何步骤失败，状态破碎。审查回滚。
- `formatEntity` 调用 `getGlobalClient()` 用于 destinations 显示 —— 若客户端正在 reload，会抛。

#### G.3 `debug.ts`
- `id <messageLink>` 把任何人能发的链接解析为 entity；用户能否构造让 bot 访问私有频道并外泄信息（其实是 bot 自己的账号，权限就是自己的）—— 主要风险是 access_hash 写进消息。
- `echo` 用 `Api.messages.SendMessage`/`SendMedia` 直接发；若 reply 中有 webpage / poll，未处理。
- `entity`/`msg` 当消息过长改为发文件，但 filename 含 `entity_${entity?.id}` —— id 可能含特殊字符吗？

#### G.4 `exec.ts`
- 整体设计为"自己用"，但 sudo 路径下白名单用户可触发。审查文档警告。
- 输出截断 `truncate(text, 3500)` —— 用户实际输出 markdown 会被截断到不完整反引号，可能让 `parseMode: "markdown"` 抛错。
- 状态消息每 2s 编辑一次，编辑失败 `.catch(() => undefined)` 静默；快命令 + 慢编辑会导致状态消息晚于完成。

#### G.5 `help.ts`
- 100 entity 上限规划（`EntityPlanner`）—— 是不是 Telegram **实体**上限 100，还是格式化标签上限？验证 Telegram 当前文档。
- `formatBasicCommands` 的 fallback 集合 + sort —— 顺序稳定吗？

#### G.6 `loglevel.ts`
- `levelStr` 大小写处理 OK；但 `client.setLogLevel` 失败 catch 但不告知用户。

#### G.7 `ping.ts`
- `ping all` 串行 5 个 DC，每个最长 timeout 大概 5s = 25s；阻塞期间用户 reload 会怎样？(`lifecycle` 未传到 `execAsync`)
- `parseTarget` 正则未防注入：`ping "; cat /etc/passwd;"` 会因后续 `${target}` 进入 shell。**P0 安全风险**。
- ICMP fallback HTTP ping 直接发 HEAD 请求到任意 hostname —— SSRF？bot 主人触发，不算外部 SSRF，但暴露 internal hosts 信息。

#### G.8 `prefix.ts`
- `.env` 持久化逻辑：正则替换 `^[ \t]*TB_PREFIX\s*=.*$`，若值含 `"` / `=` / 换行会破坏 .env 解析。
- 同步 `fs.writeFileSync(envPath, content, "utf-8")` 在 Win 可能写 CRLF（取决于 fs 实现）—— PM2 重启后是否仍能正确读？

#### G.9 `re.ts`
- `repeat` 无上限。
- 论坛话题 `topMsgId` 正确传递；但若 source 与 dest 不在同一群，topMsgId 无意义。

#### G.10 `reload.ts`
- 见 F.1。另外 `pmr` 命令仅做 `await execAsync("pm2 restart telebox")`，**不检查 PM2 是否存在**。
- `exit` 写 `temp/exit/msg.json` + `process.exit(0)`：依赖 PM2 重启回来再执行 `editExitMsg`。`editExitMsg` 在 `import` 时同步检查文件 —— 引入了 startup IO 副作用，应改为 startup hook。
- `memoryMonitorTask` 失败链路里同时有 `runtime.client.sendMessage("me", ...)` 与 `await client.sendMessage("me", ...)`：变量 `client` 在 catch 分支可能未定义（已 const 在 try 内）。审查。

#### G.11 `sendLog.ts`
- 见 B.5。文件上限 50MB。
- `target` 来自 sendLogDB，类型字符串；但 `target = db.getTarget()` 后赋给 `target: string | number` 实际从未变 number。

#### G.12 `status.ts`
- `safeExec` 在 Windows 上对 `df -k`、`ps aux` 等会失败 —— `getLinuxXxx` 仅在 `platform === "linux"` 时调用，但 `getCpuUsage` 中 win32 用 `wmic`（Win10 已弃用，Win11 默认未启用）。
- `renderTemplate` 简单 `{key}` 替换：若用户模板里有 `{` `}` 但不是占位符（如示例 JSON），会保留 `{key}` 字面。低风险。

#### G.13 `sudo.ts`
- 见 B.6。
- `withSudoDB` 同步操作 + 缓存 10s TTL，频繁消息会反复打开 DB。
- `listenMessageHandler` 中 `msg.client?.sendMessage(...)` 后立即 `dealCommandPluginWithMessage`，但**没有等 sendMessage 返回**写到事件队列：可能因 server 延迟，原 listenMessage 处理时 sudoMsg 还没创建 → 出现两份消息（一份用户发的、一份 bot 发的，bot 发的又触发自己 reply）。审查事件去重。

#### G.14 `sure.ts`
- 与 sudo 类似，但增加消息白名单。`_command:` 前缀匹配 `startsWith + suffix.startsWith(" ")` —— 若用户消息恰好是 `_command:/sb!malicious` 会被匹配吗？(suffix = `!malicious`, 不以空格开头 → 不匹配) OK。但 `prefix.replace(prefix, m.redirect)` 只替换第一次 —— 边界情况验证。

#### G.15 `tpm.ts`
- 见 B.2/B.3/B.4。
- `installPlugin` 接收远程内容 `response.data`（类型声明为 `string` 但 axios `responseType:"text"` 在 binary 文件下可能是 Buffer）—— 写入文件 OK。
- `if (require.main === module)` 末尾的 CLI 模式：`installPlugin(args, fakeMsg)` 不会带 lifecycle；调用 `loadPlugins()` 会触发 `tryGetCurrentGenerationContext` 报错（无 runtime）。审查。
- `getMediaFileName` 直接 `metadata.document.attributes[0].fileName` —— 若第一个 attribute 不是 fileName 会拿到 undefined，后续 `endsWith(".ts")` 抛。

#### G.16 `update.ts`
- 见 B.1。失败提示文案"如果是 Git 冲突，请手动..."OK。
- `reloadRuntime()` 调用前已经 `npm install`；如果 `package.json` 改了原生模块，重 require 时 ABI 不匹配 → 必须重启进程，但当前只是 reload runtime → 可能错误地认为成功。

> ⏹ Phase G 完成判据：每个插件文件至少 3 条 finding 或显式标"已审查无问题"。

---

### Phase H — Utils 逐一审查

每个 `src/utils/*.ts` 都在 `08_utils_by_file.md` 里有独立小节。重点：

- `apiConfig.ts`：见 B.5。同时 `promptInput` 与 `loginManager.ts` 中 `createInterface(input, output)` 两套 readline 实现，可能竞争 stdin。审查首次启动流程。
- `authGuards.ts`：仅捕 `AUTH_KEY_UNREGISTERED`，但 teleproto 还会抛 `SESSION_REVOKED` / `USER_DEACTIVATED`，是否需要同等处理。
- `banUtils.ts`：未在内置插件用到？grep 用方。若仅给远程插件用，应考虑移到独立目录。
- `channelGapBreaker.ts`：见 C.5。
- `conversation.ts`：复杂的 abort + timeout + readline + listener 管理。重点验证 cleanup 路径（每个 Promise 创建分支都要 `cleanup()`）。
- `cronManager.ts`：见 C.4。
- `entityHelpers.ts`：`safeForwardMessage` 重试 3 次，FloodWait 处理 OK；但每次重试都会 `getEntity` 两次（fromEntity + toEntity），实体未缓存。
- `generationContext.ts`：见 C.2。
- `globalClient.ts`：只 re-export，OK；但很多文件直接从 `runtimeManager` import，而它又再 re-export —— 看是否有循环。
- `logger.ts`：见 C.6。
- `loginManager.ts`：QR 90s 超时；密码登录 `client.start` 委托给 teleproto；`safeCheckAuthorization` 在 `try` 内，外层 `catch (error)` 仅处理 `AUTH_KEY_UNREGISTERED`，其他错误 throw —— 启动时网络错误会让进程退出。是否提供 retry。
- `npm_install.ts`：见 B.1（execFile 安全）。`require.resolve(pkg)` 用于"是否已装"判断，但 `package.json` 中的依赖与 node_modules 状态可能不一致。
- `pathHelpers.ts`：未做错误处理；`fs.mkdirSync(filePath)` 仅创建一层，不能创建嵌套目录（`recursive: false`），看是否触发。
- `pluginBase.ts`：`abstract` 类不能 `new`，但 `isValidPlugin` 用 duck typing 校验；与 `extends Plugin` 不一致（plugin 作者必须 `extends Plugin`）。
- `pluginManager.ts`：见 C.3。
- `runtimeManager.ts`：见 C.1。
- `safeGetMessages.ts`：仅捕 `undefined.date` 这一种崩溃；其他形态的"消息丢失"未覆盖。
- `sendLogDB.ts`、`sudoDB.ts`、`sureDB.ts`、`aliasDB.ts`：见 E.1。
- `teleboxInfoHelper.ts`：`execSync("git rev-parse --short HEAD")` 在 reload/PM2 中会反复执行；可缓存。
- `telegramFormatter.ts`、`telegraphFormatter.ts`：见 F.3，确认是否仍被本仓库引用，若否标 dead code（但远程插件可能依赖）。
- `tlRevive.ts`：见 B.3。

> ⏹ Phase H 完成判据：每个 utils 文件至少 1 条 finding 或显式标"已审查"。

---

### Phase I — Hook 与 monkey-patch

`src/hook/`：
- `listen.ts` 中 `patchMsgEdit` 把 `Api.Message.prototype.edit` 替换为：sudo 用户消息编辑改为 sendMessage。**但被 index.ts 注释掉（`// patchMsgEdit();`）**。审查是否仍能通过其他路径加载、是否应彻底删除 / 是否文档说明。
- `patches/telegram.patch.ts`：
  - `protectHtmlEntities` 用 PUA 区码点占位，再恢复；保证 GramJS 解析嵌套 `&lt;`。审查若用户文本本身就含 PUA 字符会怎样（编解码冲突）。
  - 给 `Api.Message.prototype` 加 `deleteWithDelay` / `safeDelete`：每次启动覆盖；reload 时本文件未被 `require.cache` 清掉（不属于排除清单也不属于 plugin） —— 但 `loadPluginsForRuntime` 只 purge "插件文件"+依赖的子树，patch 文件不属于。检查覆盖一致性。
- `types/telegram.d.ts`：声明合并 OK。

> ⏹ Phase I 完成判据：所有 monkey-patch 点列出 + 一致性结论。

---

### Phase J — TypeScript 严格性

J.1 `tsc --noEmit` 是否目前通过？跑一遍：
```bash
npx tsc --noEmit
```
（只读，不写盘）

J.2 全仓 grep：
```text
"as any" / ": any" / "@ts-ignore" / "@ts-expect-error" / "Function" / "Object"
```
列出 hotspot 文件并评估能否收紧。

J.3 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` 当前都未启用 —— 评估开启代价。

J.4 `paths: { "@utils/*": ["utils/*"] }` 在动态 require 路径下是否被 `tsconfig-paths/register` 解析？审查 reload 后是否会"忘记 path map"。

> ⏹ Phase J 完成判据：列出每条类型逃逸点。

---

### Phase K — 测试与可观测性

K.1 项目目前**无 `tests/` 目录**。审查：
- 任何 CI 配置（`.github/`、`.gitlab-ci.yml`）？没有。
- 当前发布流程？看 `package.json` 没有 `prepublish` / `prepare`，OK。
- 给出"最小可行测试矩阵"建议（单元 / 集成 / 端到端的合理分层）。

K.2 错误观测：
- `process.on('unhandledRejection')` 只 console.error，不上报；建议接入 sentry 或自有 endpoint（可选）。
- 多数插件错误都直接 `msg.edit({ text: error.message })` 给用户看 —— 是否在 prod 模式下应该模糊化？

> ⏹ Phase K 完成判据：列出"测试覆盖率 = 0% 的影响 + 建议测试金字塔"。

---

### Phase L — 文档一致性

逐一对比：
- `README.md` 中 "支持 .help / .id / .tpm / ..." 列表 vs 代码实际命令；尤其"开发模式 `NODE_ENV=development tpm run dev`" 中的 `tpm run dev` 应为 `npm run dev`（typo？）。
- `INSTALL.md` 命令 `pm2 start "npm start"` vs 项目自带 `ecosystem.config.cjs` —— 建议用 `pm2 start ecosystem.config.cjs`。
- `CHANGELOG.md` 中 `[0.2.7-docs] --2026-03-20` —— 日期未来值，可能 typo。
- `TELEBOX_DEVELOPMENT.md` 3402 行，需要快速核对：插件 API 描述是否与 `pluginBase.ts` 一致；`Plugin.description` 类型签名（README 示例 vs 代码：README 示例为 `(...args: any[]) => string | void`，代码同）。
- `.env-sample` 列出 `TB_PREFIX` / `TB_SUDO_PREFIX` / `TB_CMD_IGNORE_EDITED` / `TB_LISTENER_HANDLE_EDITED`，但代码中还使用 `TB_CONNECTION_RETRIES`、`TB_LOCALSTORAGE_FILE` 未列入 sample。

> ⏹ Phase L 完成判据：每个文档文件至少 1 项一致性 finding 或"已审查"。

---

### Phase M — 修复优先级与路线图

汇总到 `audit/20_action_plan.md`：

- **P0（24h 内）**：所有 Critical security finding（命令注入、路径遍历、access_hash 泄漏）。
- **P1（1 周）**：runtime 资源泄漏、Windows 不可用项、PM2 单实例约束文档化。
- **P2（1 月）**：依赖瘦身、类型收紧、补测试、移除 dead code。
- **P3（迭代中）**：可观测性、性能调优、UX 文案。

每个 P 级条目给出：受影响 finding ID 集合、估时（人小时）、是否需破坏性变更 / 是否影响 plugin API。

---

## 3. 主动验证项（不只是读代码，要实际确认）

> 这些项是"读代码会漏，必须跑或反复 grep"才能盖到的。

V.1 跑：`npm ls --all` —— 标记每条 EXTRANEOUS / UNMET / DEPRECATED。  
V.2 跑：`npm outdated` —— 标记每条 latest 与 wanted 的差。  
V.3 跑：`npm audit --omit=dev` —— 标记每条 CVE（已知问题）。  
V.4 跑：`npx tsc --noEmit`（如未通过，单独 finding）。  
V.5 grep：`process.env\.` 全仓，列出所有 env 变量与其默认值、是否文档化。  
V.6 grep：`as any` / `@ts-ignore` 数量与位置。  
V.7 grep：所有 `await msg.edit(` 与 `await msg.client?.sendMessage(` —— 标记未 catch 的。  
V.8 grep：`setTimeout` / `setInterval` 中**未被 GenerationContext 跟踪**的（即直接 `setTimeout(...)` 而非 `lifecycle.setTimeout`）。这些是 reload 后会泄漏的 timer。  
V.9 grep：`new Database(` 出现位置 vs `.close()` 配对率。  
V.10 git blame：`channelGapBreaker.ts` 中阈值 / 私有字段引用是哪几次 commit 加的，了解上下文。  
V.11 跑：尝试在 Windows 上启动 `npm start` —— 哪一步失败（不实际登录，看到 prompt 即停）。  
V.12 list：所有定义但未导出 / 导出但未引用的符号（`tsc --noUnusedLocals` 一次性 dry run）。

---

## 4. 已知 risk hotspots 速查表（审查时优先看）

| 优先级 | 模块 / 文件 | 风险关键词 | 备注 |
|---|---|---|---|
| 🔴 | `src/plugin/ping.ts:169,213` | `${target}` 直接拼入 shell | 命令注入 |
| 🔴 | `src/plugin/tpm.ts:644` | `require(filePath)` 任意 .ts | 远程代码执行（设计如此，需文档警告） |
| 🔴 | `src/plugin/tpm.ts:324/411/536` | `path.join(PLUGIN_PATH, ${plugin}.ts)` | 路径遍历（plugin 来自远程） |
| 🔴 | `src/utils/apiConfig.ts:33` | `config.json` 写 session 明文 | 凭据泄漏面 |
| 🔴 | `src/plugin/debug.ts` | entity JSON 含 access_hash 进消息 | 信息泄漏 |
| 🟠 | `src/utils/generationContext.ts` | drain timeout 后状态不进 disposed | 累积泄漏 |
| 🟠 | `src/utils/logger.ts` | `console.*` 全局覆写 + GramJS 解析 | 双重前缀、stack 偏移 |
| 🟠 | `src/plugin/reload.ts` | `process.exit(0)` 依赖 PM2 | 裸跑场景挂掉 |
| 🟠 | `src/plugin/bf.ts` | `cmd === "all"` 打包父目录 | 越界备份 |
| 🟠 | `src/plugin/sendLog.ts` | 整份日志发到 chat | session/token 可能泄漏 |
| 🟡 | `src/utils/channelGapBreaker.ts` | 触摸 teleproto 私有字段 | 升级即坏 |
| 🟡 | `src/plugin/sudo.ts` / `sure.ts` | 第三方账户调任意命令 | 权限矩阵 |
| 🟡 | `package.json` | `package-lock.json` 已被 .gitignore | 依赖漂移 |
| 🟡 | `package.json` | `archiver` / `ssh2` / `node-schedule` / `cheerio` / `canvas` | 疑似未用 |
| 🟢 | 多处 | better-sqlite3 频繁 open/close | 性能 |
| 🟢 | 多处 | 跨平台 shell 命令（`ping -c`, `df -k`, `ps aux`） | Win/macOS |

---

## 5. 验收清单（codex 完成本 plan 后，必须返回）

1. ☐ `audit/_inventory.md` 存在，含全部源文件 LOC 与 import graph 摘要。
2. ☐ `audit/00_summary.md` 含 Top 10 Critical/High finding（ID + 一句话）、严重等级直方图、每个 Phase A–M 的"已完成 / 待办"标志。
3. ☐ `audit/01_dependency_audit.md` 给出**每个依赖**的状态（used by 哪些文件、是否冗余、是否 outdated、CVE）。
4. ☐ `audit/02_security_findings.md` 至少覆盖 B.1–B.8 列出的所有调用点。
5. ☐ `audit/03_runtime_lifecycle.md` 至少有 C.1–C.6 每节 1 条 finding 或显式"OK"。
6. ☐ `audit/07_plugin_by_plugin.md` 16 个内置插件（G.1–G.16）每个独立小节。
7. ☐ `audit/08_utils_by_file.md` 23 个 utils 文件每个独立小节。
8. ☐ `audit/20_action_plan.md` 完整 P0–P3 路线图，所有 finding ID 都被归类。
9. ☐ 所有 finding 编号唯一 (`FND-001` … `FND-XXX`)。
10. ☐ 每条 Critical / High finding 都附**修复建议**（不只是描述问题）。
11. ☐ 任何"无法判断 / 需要运行才能确认"的项，明确写入 `audit/_open_questions.md`。

---

## 6. 审查者风格与态度要求

- **不要客气**：发现真问题就直说"这是 critical bug"。
- **不要重复已知**：每条 finding 只出现一次，跨章节交叉引用用 `[[FND-XXX]]`。
- **不要堆砌**：宁可少几条高质量 finding，也不要 30 条低价值"建议加注释"。
- **不要凭空推测**：如果某行代码看起来可疑但无法证伪，写 `Confidence: 2` 并在 `_open_questions.md` 记录如何验证。
- **不要"修但不审"**：本任务**全程禁止修改业务代码**，只允许在 `audit/` 下写报告与 `.md` 示例片段。
- **不要省事**：跨平台兼容性、并发竞态、reload 资源泄漏都必须**逐文件**审。
- **不要丢失出处**：每条结论都要带 `file:line` 引用。

---

## 7. 备用上下文（给 codex 节省探索成本）

- 项目入口与生命周期：`src/index.ts` → `runtimeManager.ts:startRuntime` → `loginManager.ts:initializeClientSession` → `pluginManager.ts:loadPluginsForRuntime`。
- 命令分发：`pluginManager.ts:dealCommandPlugin` 注册为 `NewMessage` / `EditedMessage` listener；过滤条件是 `msg.out || msg.savedPeerId`（自发消息 or Saved Messages）。
- Reload 路径：插件 `reload.ts:cmdHandlers.reload` → `reloadRuntime()` → 销毁旧 generation → 新建 generation + client → 重新加载 plugins。
- Sudo 路径：`sudo.ts:listenMessageHandler` → 查 SudoDB 缓存 → `client.sendMessage(...)` 以自己身份重发 → `dealCommandPluginWithMessage`。
- TPM 流程：远程 `plugins.json` → 选定插件 → 下载 raw URL → 写入 `plugins/<name>.ts` → `loadPlugins()` 触发完整 runtime reload。
- 主要 commit（最近 5）：
  - 3fb7b56 fix(logger): handle 'difference too long' in channel gap circuit breaker
  - c64f9f0 fix(channelGapBreaker): support teleproto 1.225 updateManager layout
  - 247ad51 fix(plugins): isolate setup failures and add lifecycle fallback
  - 691ea42 chore: ignore package-lock.json
  - c43b738 fix(channelGapBreaker): trip faster — threshold 3→2, recognize teleproto 1.225

---

## 8. 结束语

> 完成本计划的标志：把 `audit/` 目录交付给项目 owner，owner 能据此**直接**安排 sprint。任何"看起来对但说不清"的章节，都要回填为可执行的下一步。

不限时长，**完整性 > 速度**。
