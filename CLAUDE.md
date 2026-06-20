# CLAUDE.md

> 从手机远程操控本机 **Claude Code**。Node 服务驱动官方 **Claude Agent SDK**
> （与 `claude` CLI 同一引擎），经 HTTP + WebSocket 暴露给 Expo / React Native App。
>
> 深度文档见 [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md)。本文件是给 Claude Code
> 会话的操作速查 —— 命令、架构地图、约定与坑。

## 仓库布局

```
server/   Node + TypeScript 服务（Claude Agent SDK 封装）— ESM
app/      Expo ~56 / RN 0.85 / React 19 App（expo-router）— Android 为主
install/  自启安装器（macOS launchd / Linux systemd）
```

## 常用命令

**Server**（`cd server`）
- `npm run dev` — tsx watch 热重载（开发；改完通常已自动重载，无需手动重启）
- `npm run typecheck` — `tsc --noEmit`（提交前必跑）
- `npm run build` / `npm start` — 生产构建 / 运行

**App**（`cd app`）
- `npm run typecheck`（= `tsc --noEmit`，提交前必跑）· `npm run lint`
- `npm start` / `npm run android` — Expo dev
- 本地打 preview APK：`eas build --platform android --profile preview --local --non-interactive`
  - 用本地 keystore（`app/credentials.json`），产物写到 `app/build-<时间戳>.apk`，约 2 分钟
  - 完成后用 `mcp__files__send_file` 把 APK 发到手机

## 架构地图

**Server（`server/src/`）**
- `index.ts` 启动装配 · `config.ts` 配置/token/claude 探测 · `logger.ts`
- `protocol.ts` — ★ 线协议**唯一真源**
- `claude/` — `manager.ts`（会话注册表/持久化/LRU）· `session.ts`（单个常驻 `query()` 生命周期，最核心）· `permissions.ts`（权限策略 + diff 派生）· `transform.ts`（SDK 流 → WireEvent）· `askTool.ts` / `filesTool.ts`（内置 MCP）
- `http/` — `rest.ts`（health/fs/capabilities/sessions/file 下载/**git**/**REST 权限·问题应答**）· `fsbrowse.ts` · `git.ts`（`git status/diff` 解析为 `GitStatusDTO`）
- `ws/gateway.ts` — WS 网关（鉴权握手、多路复用、广播、心跳）。permission/question/state 事件**额外** `broadcastAll` 一条 `alert` 给所有连接客户端 → App 转成本端本地通知（取代旧的 FCM 推送）

**App（`app/src/`）**
- `app/` expo-router 屏幕：`index`（会话列表）· `new-session`（浏览 fs 选 cwd）· `settings`（多服务器）· `session/[id].tsx`（聊天主界面，最核心）
- `state/` — `store.ts`（zustand：连接/会话/视图/能力/未读 lastSeen/每日花费 spendByDay+预算/通知开关；收到 `alert` → 本地通知）· `transcript.ts`（WireEvent → TranscriptItem 归约）· `cwdHistory.ts`（最近/收藏工作目录，按服务器分桶）· `notifications.ts`（expo-notifications：前台展示、Android 渠道、approval 动作分类、权限申请、`presentLocalNotification` 发本地通知、点击/动作处理）
- `api/` — `client.ts`（REST，含 git/REST 应答）· `ws.ts`（多路复用 WS，自动重连+重 attach）· `protocol.ts`（协议镜像）
- `components/` — Diff / ToolCard / FileCard / ImageCard / ThinkingBlock / Markdown（代码块复制+轻量高亮）/ PermissionSheet / QuestionCards / CommandPalette / ModelEffortSheet / InfoSheet（含 7 天花费图+预算）/ GitSheet / FileMentionPalette / BottomSheet
- `theme/` — theme.ts + ThemeProvider.tsx

## 约定与坑（务必遵守）

- **协议双份镜像**：`server/src/protocol.ts` 是真源，`app/src/api/protocol.ts` 是手工镜像。
  改任一端的线协议/DTO 必须同步另一端。
- **权限用 `PreToolUse` hook**，不用 SDK 的 `canUseTool`（当前 SDK 版本该路径有 bug）。
  策略见 `permissions.ts` 的 `decidePolicy`；只读工具 + 内置 MCP（`ask_user`/`send_file`）永远放行。
- **澄清问题用自定义 `ask_user` MCP**（`askTool.ts`），内置 `AskUserQuestion` 已被
  `disallowedTools` 禁用。系统提示里强制模型用 `ask_user` / `send_file` / `send_image`。
- **`init` 去抖**：SDK 每个 turn 都重发 `system/init`，只有 session id **真正变化**时
  才当作 `/clear` 清空转写（`session.ts`）。
- **控制请求要给足超时**：`getContextUsage()` 冷启动可达 ~7–8s。`session.ts` 的
  `withControlTimeout` 对 context 用 15s，且超时只对当次降级、不永久锁死（否则会一直回退到
  单桶 "Conversation (estimated)" 估算）。
- **文件下发路径安全**：`send_file` 暂存的真实路径**绝不出进程**，App 只能凭 `fileId`
  经鉴权 REST 端点取字节。
- **effort 近似**：当前 SDK 无运行时 setEffort，用 `setMaxThinkingTokens` 的 thinking 预算映射。
- **App 改动后**：`session/[id].tsx` 等改完跑 `npm run typecheck`，要看实机效果就打 APK 发手机。
- **鉴权**：除 `/api/health` 外所有 HTTP + WS 握手都要带 Bearer token（env > `config.json` > 自动生成）。
- **通知是纯本端**：已**移除 FCM/Expo 远程推送**（无 `push.ts`、无 `/api/push/*`、无 EAS FCM 凭据）。server 在 permission/question/turn-done 时 `broadcastAll` 一条 `alert` 给所有连接的 WS 客户端，App（`store._onMessage` → `presentLocalNotification`）转成 expo-notifications 本地通知。⚠️ **代价**：通知只在 App 进程存活且 WS 在线时（前台或后台短窗口）才会触发；被系统杀死后收不到——这是放弃 FCM 的固有取舍。通知内 Approve/Deny 仍走 **REST**（`POST /api/sessions/:id/permission|question`），不依赖在线 WS。正在前台查看的会话不重复弹横幅（`setActiveSession` 抑制）。
- **原生依赖需重新打包**：`expo-notifications` / `expo-clipboard` 是原生模块，改完必须重打 APK（Expo Go 行为不同），不能只热重载 JS。

## 配置

`~/.claude-remote/config.json` 或环境变量：`CLAUDE_REMOTE_PORT`(8787) · `_HOST`(0.0.0.0) ·
`_TOKEN` · `_CLAUDE_PATH`(自动探测) · `_DATA_DIR`(~/.claude-remote) · `_MAX_LIVE`(12)。
默认加载用户真实 Claude 设置（`settingSources: ['user','project','local']`），所以 skills /
plugins / 自定义 slash 命令都可用。

## Expo 注意

Expo 已大改，写 App 代码前先查对应版本文档：https://docs.expo.dev/versions/v56.0.0/
（见 `app/AGENTS.md`）。
