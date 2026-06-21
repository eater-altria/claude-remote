# CLAUDE.md

> 从手机远程操控本机 **Claude Code**。Node 服务驱动官方 **Claude Agent SDK**
> （与 `claude` CLI 同一引擎），经 HTTP + WebSocket 暴露给 Expo / React Native App。
>
> 深度文档见 [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md)。本文件是给 Claude Code
> 会话的操作速查 —— 命令、架构地图、约定与坑。

## 仓库布局

```
server/      Node + TypeScript 服务（Claude Agent SDK 封装）— ESM
app/         Expo ~56 / RN 0.85 / React 19 App（expo-router）— Android 为主
flutter-app/ Flutter 客户端（与 app/ 功能对等，跨平台：Android/iOS/web/桌面）
codegen/     协议代码生成：server/src/protocol.ts → app 的 TS 镜像 + flutter 的 Dart 模型
relay/       可选云中继：本机 server 拨出 → 中继反代 app 流量（跨网段时用）— ESM
install/     自启安装器（macOS launchd / Linux systemd）
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

**Codegen**（`cd codegen`）
- `npm install`（首次）· `npm run gen` — 改完 `server/src/protocol.ts` 必跑，重生成
  `app/src/api/protocol.gen.ts` 与 `flutter-app/lib/protocol/protocol.gen.dart`
- `npm run schema` — debug：dump 派生出的 JSON Schema

**Flutter App**（`cd flutter-app`）
- 首次：`flutter create .`（生成 android/ios 等原生脚手架，不覆盖 lib/ 与 pubspec）→ `flutter pub get`
- `flutter analyze`（提交前必跑，等价 typecheck）· `flutter run` / `flutter build apk`
- ⚠️ 本机未装 Flutter/Dart 工具链——首次 `flutter analyze` 是真正的编译关

## 架构地图

**Server（`server/src/`）**
- `index.ts` 启动装配 · `config.ts` 配置/token/claude 探测 · `logger.ts`
- `protocol.ts` — ★ 线协议**唯一真源**
- `claude/` — `manager.ts`（会话注册表/持久化/LRU）· `session.ts`（单个常驻 `query()` 生命周期，最核心）· `permissions.ts`（权限策略 + diff 派生）· `transform.ts`（SDK 流 → WireEvent）· `askTool.ts` / `filesTool.ts`（内置 MCP）
- `http/` — `rest.ts`（health/fs/capabilities/sessions/file 下载/**file 上传**（`POST /sessions/:id/upload`，原始字节经 `express.raw` 存到 `<dataDir>/uploads/<id>/`，回绝对路径供 agent Read）/**git**/**REST 权限·问题应答**）· `fsbrowse.ts` · `git.ts`（`git status/diff` 解析为 `GitStatusDTO`）
- `ws/gateway.ts` — WS 网关（鉴权握手、多路复用、广播、心跳）。permission/question/state 事件**额外** `broadcastAll` 一条 `alert` 给所有连接客户端 → App 转成本端本地通知（取代旧的 FCM 推送）
- `relay/agent.ts` — 可选拨出桥：opt-in 时向云中继开一条常驻控制 WS，把中继转发来的 HTTP/WS 重放到本机 loopback（`127.0.0.1:<port>`），**完全复用**现有 gateway/REST。`index.ts` 在 `server.listen` 回调里调 `startRelayAgent(cfg)`（未配置则 no-op）
- `pairing.ts` — 配对 URI（`claude-remote://add?url=&token=&name=`）唯一真源；`index.ts` 启动用 `qrcode-terminal` 打印 LAN（+ relay）二维码，App 扫码一键添加 server。App 端镜像见 `app/src/api/pairing.ts`
- **TodoWrite → `todos` 事件**：`transform.ts` 把 `TodoWrite` 工具调用转成独立的 `kind:'todos'` WireEvent（不再当普通 tool 卡片），驱动 App 顶部常驻任务进度面板

**Relay（`relay/src/`，独立可部署服务）**
- `index.ts` 启动（`RELAY_PORT`/`RELAY_HOST`/`RELAY_TOKEN`/`RELAY_PUBLIC_URL`）· `relay.ts`（按 `serverId` 多路复用：`/agent` 控制通道 + `/s/:serverId/*` 反代；设了 `RELAY_PUBLIC_URL` 时每有 server 连入打印一张**仅地址**的配对二维码——中继无明文 token，App 扫后需手填）· `protocol.ts` — ★ 中继↔agent 线协议**真源**（与 `server/src/relay/agent.ts` 顶部的镜像手工同步）
- App 不需改：把某个 server 的 `baseUrl` 填成 `https://relay/s/<serverId>`，`wsUrl()`/REST 自然拼出 `…/s/<id>/ws` 与 `…/s/<id>/api/*`，token 用 server **自己的** access token（中继只存其 sha256，逐请求校验）。LAN 与中继并存互不影响。详见 `relay/README.md`

**App（`app/src/`）**
- `app/` expo-router 屏幕：`index`（会话列表）· `new-session`（浏览 fs 选 cwd）· `settings`（多服务器，含 Scan QR 入口）· `scan`（expo-camera 扫配对二维码：完整码直接保存，relay 仅地址码则补填 token）· `session/[id].tsx`（聊天主界面，最核心）
- `state/` — `store.ts`（zustand：连接/会话/视图/能力/未读 lastSeen/每日花费 spendByDay+预算/通知开关；收到 `alert` → 本地通知）· `transcript.ts`（WireEvent → TranscriptItem 归约）· `cwdHistory.ts`（最近/收藏工作目录，按服务器分桶）· `notifications.ts`（expo-notifications：前台展示、Android 渠道、approval 动作分类、权限申请、`presentLocalNotification` 发本地通知、点击/动作处理）
- `api/` — `client.ts`（REST，含 git/REST 应答/`uploadFile` 二进制上传）· `ws.ts`（多路复用 WS，自动重连+重 attach）· `protocol.ts`（协议镜像）
- `components/` — Diff / ToolCard / FileCard / ImageCard / ThinkingBlock / Markdown（代码块复制+轻量高亮）/ PermissionSheet / QuestionCards / CommandPalette / ModelEffortSheet / InfoSheet（含 7 天花费图+预算）/ GitSheet / FileMentionPalette（@文件：子串排序匹配 + 命中高亮 + dotfile + 目录头/加载态）/ TaskProgress（常驻 TodoWrite 进度面板，来自 `view.todos`）/ SubagentPanel（常驻子代理面板，来自 `view.subagents`，仅运行中显示）/ AttachSheet（输入栏附件菜单：拍照/相册图片/文件——前两者走内联 base64 图片，文件走 `uploadFile` 上传后把绝对路径折进消息文本）/ BottomSheet
- `theme/` — theme.ts + ThemeProvider.tsx

## 约定与坑（务必遵守）

- **协议代码生成（取代旧的手工双份镜像）**：`server/src/protocol.ts` 是**唯一真源**。改完它
  必须 `cd codegen && npm run gen`，会重生成 `app/src/api/protocol.gen.ts`（TS 逐字副本，
  `app/src/api/protocol.ts` 只 `export *` 转发，旧导入路径/类型名不变）与
  `flutter-app/lib/protocol/protocol.gen.dart`（Dart：可辨识联合→sealed class、字面量联合→enum、
  interface→带 fromJson/toJson 的类）。`.gen.*` 文件带 DO-NOT-EDIT 头，**别**手改。
  ⚠️ 仅生成**类型**；protocol.ts 里的 UI 常量（`PERMISSION_MODE_LABELS`/`EFFORT_LEVELS`）不入 schema，
  Flutter 侧的展示镜像在 `flutter-app/lib/theme/labels.dart`，`PROTOCOL_VERSION` 生成为 `kProtocolVersion`。
- **Flutter 端与 app/ 一一对应**：`api/`(client/ws/pairing)·`state/`(store=ChangeNotifier/transcript/
  notifications/cwd_history)·`screens/`·`components/`·`theme/`。状态用 `provider` 的
  `ChangeNotifierProvider<Store>`；通知同样纯本端（WS `alert` → 本地通知，无 FCM）。原生权限
  （相机/相册/通知/cleartext http）需在 `flutter create .` 后补进 manifest/Info.plist。
- **权限用 `PreToolUse` hook**，不用 SDK 的 `canUseTool`（当前 SDK 版本该路径有 bug）。
  策略见 `permissions.ts` 的 `decidePolicy`；只读工具 + 内置 MCP（`ask_user`/`send_file`/`send_image`）永远放行。
- **澄清问题用自定义 `ask_user` MCP**（`askTool.ts`），内置 `AskUserQuestion` 已被
  `disallowedTools` 禁用。系统提示里强制模型用 `ask_user` / `send_file` / `send_image`。
- **`init` 去抖**：SDK 每个 turn 都重发 `system/init`，只有 session id **真正变化**时
  才当作 `/clear` 清空转写（`session.ts`）。
- **控制请求要给足超时**：`getContextUsage()` 冷启动可达 ~7–8s。`session.ts` 的
  `withControlTimeout` 对 context 用 15s，且超时只对当次降级、不永久锁死（否则会一直回退到
  单桶 "Conversation (estimated)" 估算）。
- **文件下发路径安全**：`send_file` / `send_image` 暂存的真实路径**绝不出进程**，App 只能凭
  `fileId` 经鉴权 REST 端点取字节。**反向上传**（`POST /sessions/:id/upload`）落到
  `<dataDir>/uploads/<id>/`，会话删除时（`manager.delete`）一并清理。
- **effort 近似**：当前 SDK 无运行时 setEffort，用 `setMaxThinkingTokens` 的 thinking 预算映射。
- **App 改动后**：`session/[id].tsx` 等改完跑 `npm run typecheck`，要看实机效果就打 APK 发手机。
- **鉴权**：除 `/api/health` 外所有 HTTP + WS 握手都要带 Bearer token（env > `config.json` > 自动生成）。
- **通知是纯本端**：已**移除 FCM/Expo 远程推送**（无 `push.ts`、无 `/api/push/*`、无 EAS FCM 凭据）。server 在 permission/question/turn-done 时 `broadcastAll` 一条 `alert` 给所有连接的 WS 客户端，App（`store._onMessage` → `presentLocalNotification`）转成 expo-notifications 本地通知。⚠️ **代价**：通知只在 App 进程存活且 WS 在线时（前台或后台短窗口）才会触发；被系统杀死后收不到——这是放弃 FCM 的固有取舍。通知内 Approve/Deny 仍走 **REST**（`POST /api/sessions/:id/permission|question`），不依赖在线 WS。正在前台查看的会话不重复弹横幅（`setActiveSession` 抑制）。
- **原生依赖需重新打包**：`expo-notifications` / `expo-clipboard` / `expo-camera` /
  `expo-document-picker` / `expo-file-system`（选文件 + 二进制上传）等是原生模块，改完必须重打
  APK（Expo Go 行为不同），不能只热重载 JS。⚠️ App 端上传用 `FileSystem.uploadAsync(BINARY_CONTENT)`，
  **别**用 `fetch(uri).blob()`（RN 里读本地文件不可靠）。

## 配置

`~/.claude-remote/config.json` 或环境变量：`CLAUDE_REMOTE_PORT`(8787) · `_HOST`(0.0.0.0) ·
`_TOKEN` · `_CLAUDE_PATH`(自动探测) · `_DATA_DIR`(~/.claude-remote) · `_MAX_LIVE`(12)。
默认加载用户真实 Claude 设置（`settingSources: ['user','project','local']`），所以 skills /
plugins / 自定义 slash 命令都可用。

server 与 relay 启动时各自 `import 'dotenv/config'`，自动读取**各自工作目录**下的 `.env`
（`server/.env`、`relay/.env`，见各目录 `.env.example`）。真实 shell 环境变量优先级高于
`.env`；`.env` 已被 `.gitignore` 忽略，勿提交。

- **config.json 不回写 env 解析结果**：`loadConfig` 只在「自动生成了新 token」时写一次
  config.json（仅持久化 token，供 `install.sh` 读取）。其余字段（port/host/relay…）每次
  按 env > config.json > 默认值即时解析，**不焯进文件**——删掉某个 env 变量（如 relay）下次
  启动即生效，不会被旧的持久化值续上。要用 config.json 配置，手写进去即可（会被读取、不被覆盖）。
- **dotenv 不做 `~`/变量展开**：`CLAUDE_REMOTE_DATA_DIR` 的前导 `~` 由 `expandHome` 展开
  （否则会在 cwd 下建出字面 `~` 目录）。relay `serverId` 缺省由**主机名**派生（稳定、无需持久化）。

**云中继（可选，默认关）**：env `CLAUDE_REMOTE_RELAY_ENABLED`(1/true) · `_RELAY_URL`(中继 https
地址) · `_RELAY_TOKEN`(= 中继 `RELAY_TOKEN`) · `_RELAY_SERVER_ID`(缺省自动生成并持久化) ·
`_RELAY_NAME`，或 config.json 的 `relay` 块。`loadRelayConfig`（`config.ts`）解析：env 优先、
未配置则 `relay: null`（保持纯 LAN）。中继侧部署见 `relay/README.md`。

## Expo 注意

Expo 已大改，写 App 代码前先查对应版本文档：https://docs.expo.dev/versions/v56.0.0/
（见 `app/AGENTS.md`）。
