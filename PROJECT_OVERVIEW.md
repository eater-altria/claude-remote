# Claude Remote — 项目功能与技术架构总览

> 从手机（Android 原生 App）远程操控运行在你电脑上的 **Claude Code**。
> 一个轻量 Node 服务驱动官方 **Claude Agent SDK**（与 `claude` CLI 同一引擎），
> 通过 HTTP + WebSocket 暴露给局域网内的 Expo / React Native App。

---

## 1. 一句话概括

```
┌──────────────┐        HTTP + WebSocket         ┌────────────────────────────┐
│  Expo App    │ ──────────────────────────────▶ │  Server (Node + TS)        │
│  (Android)   │ ◀────────────────────────────── │   Claude Agent SDK ↔ claude │
└──────────────┘   sessions · stream · approve    └────────────────────────────┘
```

- **Server**：把 Claude Agent SDK 的 `query()` 流封装成一套规范化的「线协议」事件，
  做权限网关、会话持久化、文件浏览/下载/上传。
- **App**：原生渲染思考过程、回复（Markdown）、工具调用、命令输出、代码改动 diff，
  并在手机上逐条批准/拒绝命令与文件编辑、回答澄清问题，常驻显示任务/子代理进度。
- **Relay**（可选）：跨网段时部署的云中继 —— 本机 server 拨出，中继按 `serverId`
  反代 App 的 HTTP + WebSocket 流量。
- **Install**：launchd / systemd 安装器，让服务开机/登录自启。

仓库布局：

```
claude-remote/
├── server/      Node + TypeScript 服务（Claude Agent SDK 封装）— ESM
├── app/         Expo / React Native App（expo-router, TypeScript）— Android 为主
├── relay/       可选云中继（跨网段时用；本机 server 拨出，中继反代 App 流量）— ESM
├── install/     自启安装器（launchd / systemd）
├── PROJECT_OVERVIEW.md   本文件
└── README.md
```

---

## 2. 核心功能清单

| 功能 | 说明 |
|---|---|
| 💬 **多轮流式对话** | 通过局域网与 Claude Code 聊天，token 级流式渲染。 |
| 🧠 **思考过程渲染** | 实时展示 thinking 块、回复（Markdown）、工具调用、命令输出。 |
| 📝 **代码改动以 diff 呈现** | Write/Edit/MultiEdit/NotebookEdit 被解析为 `FileChange`，App 渲染前后对比卡片。 |
| ✅ **逐条审批** | 每个命令/文件编辑都可在手机上批准或拒绝，支持「永远允许此工具」开关。 |
| 🔐 **四种权限模式** | Ask（默认逐条问）· Auto-accept edits（自动接受编辑）· Bypass（YOLO 全放行）· Plan（只读规划）。 |
| ❓ **澄清问题→选项卡** | 通过自定义 `ask_user` MCP 工具把问题渲染成单选/多选卡片，支持「Other」自由文本。 |
| 🗂 **浏览文件系统选工作目录** | 新会话通过浏览服务端文件系统选 cwd，无需手输路径；支持新建文件夹，并记住最近/收藏目录（按服务器分桶）。 |
| 📎 **附件菜单（拍照/图片/文件）** | 输入栏 ＋ 菜单：拍照与图库图片走内联 base64 喂给模型；任意文件经 `POST /upload` 上传到主机，agent 凭绝对路径 Read。 |
| 📥 **文件下发 / 内联图片** | `send_file` 把文件暂存供下载卡片取字节；`send_image` 把图片内联展示在聊天里。服务端真实路径绝不外泄。 |
| 📋 **任务 & 子代理面板** | TodoWrite → 常驻任务进度面板；`Task` 子代理运行时 → 常驻子代理面板（均为替换式快照事件）。 |
| 🔔 **本地通知** | 审批 / 问题 / 回合完成时 server 广播 `alert`，App 转 expo-notifications 本地通知；通知内 Approve/Deny 走 REST。已移除 FCM/远程推送。 |
| 🌿 **Git 面板** | 查看工作目录的 `git status` 与逐文件 unified diff（`GitStatusDTO`）。 |
| 💰 **花费 & 预算** | 7 天花费图、每日预算提醒（`spendByDay`）。 |
| ➕ **会话管理** | 创建、恢复（resume）、删除会话；转写历史持久化并在恢复时回放。 |
| ⚙️ **运行时切换** | 切换模型、推理强度（effort）、权限模式，皆可在会话进行中调整。 |
| 🎛 **命令面板** | 拉取引擎支持的 slash 命令 / 模型 / 子代理，做成 App 内命令面板。 |
| 📊 **上下文 & 用量卡片** | `/context`、`/usage` 渲染为原生卡片（token 占比、成本、速率限制）。 |
| 🔌 **开机自启** | macOS launchd / Linux systemd，服务随登录或开机启动。 |
| 🌐 **多服务器 + 扫码配对** | App 保存多个服务器档案并快速切换；可扫配对二维码一键添加（`claude-remote://add?...`）。 |
| ☁️ **可选云中继** | 跨网段时本机 server 拨出到中继，App 经公网 `…/s/<serverId>/…` 访问，逻辑 100% 复用。 |

---

## 3. 技术栈

### Server（`server/`）
- **运行时**：Node 18+，TypeScript（ESM，`"type": "module"`）
- **核心依赖**：
  - `@anthropic-ai/claude-agent-sdk` — 驱动 Claude Code 的引擎（复用本机 `claude` 登录态，**无需 API key**）
  - `express` + `cors` — HTTP/REST
  - `ws` — WebSocket
  - `zod` — MCP 工具入参校验
- **构建/运行**：`tsx`（dev 热重载）、`tsc`（生产构建）

### App（`app/`）
- **框架**：Expo ~56 / React Native 0.85 / React 19，`expo-router`（文件路由）
- **状态**：`zustand` + `AsyncStorage`（持久化服务器配置、cwd 历史、花费）
- **关键库**：`react-native-reanimated`、`react-native-gesture-handler`、
  `react-native-keyboard-controller`、`expo-image`、`expo-image-picker`、
  `expo-document-picker` + `expo-file-system`（选文件 + 二进制上传）、
  `expo-camera`（扫配对二维码）、`expo-notifications`（本地通知）、
  `expo-clipboard`、`expo-glass-effect`、`@expo/ui`、`expo-symbols`
- **目标平台**：Android（用 Expo Go 直接跑，或 `expo run:android` / EAS 构建 APK）。
  ⚠️ 含原生模块（notifications / camera / document-picker / file-system），改完须重打 APK，Expo Go 行为可能不同。

### Relay（`relay/`，可选独立部署）
- **运行时**：Node 18+，TypeScript（ESM）。依赖 `express` + `ws` + `qrcode-terminal`。
- 按 `serverId` 多路复用：`/agent` 控制通道（本机 server 拨入）+ `/s/:serverId/*` 反代。
  只存 server access token 的 sha256，逐请求校验，看不懂业务内容。

### Install（`install/`）
- Bash 安装器，按 OS 生成 launchd `.plist` 或 systemd user unit，并自检健康端点、打印 URL+Token。

---

## 4. 服务端架构

```
server/src/
├── index.ts             启动入口：装配 config → manager → express → ws gateway；打印配对二维码、起 relay agent
├── config.ts            配置加载、token 生成、claude 二进制探测、fs 根目录、relay 配置解析
├── protocol.ts          ★ 线协议唯一真源（与 app 镜像同步）
├── pairing.ts           配对 URI（claude-remote://add?url=&token=&name=）唯一真源
├── logger.ts            轻量日志
├── claude/
│   ├── manager.ts       SessionManager：会话注册表、持久化、LRU 驱逐、事件转发、删除时清理上传
│   ├── session.ts       ClaudeSession：单个 SDK query() 的完整生命周期
│   ├── permissions.ts   工具分类、权限策略、diff 派生、人类可读描述
│   ├── transform.ts     SDK 消息流 → 规范化 WireEvent（流式 + 历史回放；含 todos / subagents 快照）
│   ├── askTool.ts       in-process MCP：ask_user（澄清问题卡片）
│   └── filesTool.ts     in-process MCP：send_file（下发）+ send_image（内联展示）
├── http/
│   ├── rest.ts          REST：health / fs / capabilities / sessions / file 下载 / 文件上传 / git / REST 权限·问题应答
│   ├── fsbrowse.ts      文件系统选择器（列目录、新建目录、安全处理）
│   └── git.ts           git status / diff 解析为 GitStatusDTO
├── relay/
│   └── agent.ts         可选拨出桥：向云中继开常驻控制 WS，把转发来的 HTTP/WS 重放到本机 loopback
└── ws/
    └── gateway.ts       WebSocket 网关：鉴权握手、多路复用、订阅广播、心跳；permission/question/state 额外 broadcastAll 一条 alert
```

### 4.1 SessionManager（`manager.ts`）
- **注册表**：内存里维护 `live`（活跃的 `ClaudeSession`）与磁盘 `store`（持久化元数据）。
- **持久化**：会话元数据写到 `~/.claude-remote/sessions.json`；转写历史本身存于 Claude Code
  标准会话库，恢复时通过 `getSessionMessages` 取回并经 `historyToEvents` 回放。
- **LRU 驱逐**：活跃会话数有上限（`maxLiveSessions`，默认 12）；空闲会话按 LRU 关闭，
  正在 running / 等待审批 / 等待回答的会话不被驱逐。
- **懒恢复**：`ensureLive()` 在 attach 时按需从磁盘 resume（用 `resumeSessionId`），并预填历史 backlog。
- **事件转发**：把每个 session 的 `event / state / permission / question / capabilities / reset`
  事件冒泡给 WS 网关广播。

### 4.2 ClaudeSession（`session.ts`）—— 最核心
每个会话持有**一个常驻的 SDK `query()`（streaming-input 模式）**：

- **输入**：用 async generator（`inputGenerator`）作为 prompt 源，把用户消息入队后唤醒，
  支持文本与图片（base64）。
- **输出**：`consume()` 迭代 SDK 消息，`handle()` 按类型分发：
  - `system/init` — 捕获 SDK session id；**关键技巧**：SDK 每个 turn 都会重发 `init`，
    只有 session id **真正变化**时才判定为 `/clear` 上下文重置并清空转写。
  - `assistant` / `user` / `stream_event` / `result` — 交给 `LiveTransformer` 转成 WireEvent。
- **权限网关**：用 **`PreToolUse` hook** 拦截每个工具调用（而非 SDK 的 `canUseTool`
  回调——当前 SDK 版本该路径有 bug）。策略由 `decidePolicy` 决定 allow/deny/ask，
  ask 时把 `PermissionRequest` 推给 App 并 `await` 决定（30 分钟超时自动拒绝）。
- **澄清问题**：`askUser()` 经 `ask_user` MCP 工具往返，把选项卡片推给 App 等回答。
- **文件下发 / 内联图片**：`sendFile()` / `sendImage()` 把文件按 `fileId` 暂存
  （服务端真实路径**绝不外泄**），分别推 file 下载卡片或 image 内联卡片，App 经
  `/api/sessions/:id/files/:fileId` 鉴权取字节。
- **运行时控制**：`setModelId`、`setEffort`（本 SDK 无运行时 setEffort，用
  `setMaxThinkingTokens` 的 thinking 预算近似映射 low→max）、`setMode`、`interrupt`。
- **能力探测**：`fetchCapabilities()` 调 `supportedCommands/Models/Agents` 填充命令面板。
- **断线重连友好**：保存 `openPermissionRequests` / `openQuestionRequests` 快照，
  重连客户端 attach 时重放未决提示与完整 backlog。

### 4.3 权限策略（`permissions.ts`）
工具按类别归类（read / search / edit / execute / web / task / ask / other），策略矩阵：

| 模式 | 只读/搜索 | 编辑 | 执行/其它 |
|---|---|---|---|
| `default`（Ask） | 自动允许 | 询问 | 询问 |
| `acceptEdits` | 自动允许 | 自动允许 | 询问 |
| `bypassPermissions` | 全部自动允许 | | |
| `plan` | 自动允许 | **拒绝** | **拒绝**（回提示让模型只出计划） |

- 只读工具（Read/Glob/Grep/LS/TodoWrite…）与两个内置 MCP 工具（`ask_user`、`send_file`）**永远放行**。
- 「永远允许此工具」会把工具名加入该会话的 `remembered` 集合。

### 4.4 内置 MCP 工具
- **`ask_user`**（`askTool.ts`）：用 `createSdkMcpServer` + `zod` 定义 1–4 个多选问题，
  每题 2–4 选项；App 渲染选项卡，回答以文本喂回模型。系统提示里强制模型用它而非内置
  `AskUserQuestion`（后者被 `disallowedTools` 禁用）。
- **`send_file` / `send_image`**（`filesTool.ts`）：把文件下发到手机（下载卡片），
  或把图片内联展示在聊天里。系统提示强制模型用它们而非直接贴路径。
- **反向上传**（非 MCP，走 REST）：App 选的文件经 `POST /api/sessions/:id/upload`
  上传，原始字节存到 `~/.claude-remote/uploads/<会话>/`，回绝对路径供 agent Read，
  会话删除时清理。

### 4.5 线协议（`protocol.ts`）
**单一真源**，`app/src/api/protocol.ts` 是手工镜像（改动需同步）。包含：
- `WireEvent`：规范化转写事件（user / block_start·delta·end 流式文本&思考 /
  tool_use / tool_result / task / result / notice / **file** / **image** /
  **todos**（TodoWrite 清单快照，驱动任务面板）/ **subagents**（Task 子代理快照，
  驱动子代理面板））。
- `PermissionRequest` / `QuestionRequest` 及其响应（WS 或 REST 均可应答）。
- REST DTO（Health / CreateSession / Fs* / Capabilities / SlashCommand / Model / Agent /
  **GitStatusDTO** / 文件上传）。
- WS 信封：`ClientMessage`（attach/detach/user_message/permission_response/
  question_response/interrupt/set_*/get_context/get_usage/ping）与 `ServerMessage`
  （hello/attached/event/backlog/permission_request/…/**alert**（→ App 本地通知）/info_result/pong）。
- `ContextUsageDTO` / `UsageDTO`：上下文占用与用量（含速率限制窗口）。

---

## 5. App 架构

```
app/src/
├── app/                       expo-router 屏幕
│   ├── _layout.tsx            根布局
│   ├── index.tsx              会话列表（首页）
│   ├── new-session.tsx        新建会话：浏览文件系统选 cwd（含最近/收藏）+ 选权限模式
│   ├── settings.tsx           服务器配置（URL+Token、Test & Connect、多服务器、Scan QR 入口）
│   ├── scan.tsx               expo-camera 扫配对二维码（完整码直接保存；relay 仅地址码补填 token）
│   └── session/[id].tsx       聊天界面（核心）
├── state/
│   ├── store.ts               zustand store：连接、会话、视图、能力、未读、每日花费+预算、通知开关
│   ├── transcript.ts          WireEvent → TranscriptItem 归约器（流式合并；todos/subagents 提取）
│   ├── cwdHistory.ts          最近 / 收藏工作目录（按服务器分桶）
│   └── notifications.ts       expo-notifications：前台展示、Android 渠道、approval 动作、本地通知
├── api/
│   ├── client.ts              REST 客户端（鉴权、超时、多服务器档案、git、uploadFile 二进制上传）
│   ├── ws.ts                  多路复用 WebSocket（自动重连、重新 attach）
│   ├── pairing.ts             配对 URI 解析（server 端 pairing.ts 的镜像）
│   └── protocol.ts            协议镜像
├── components/                Diff / ToolCard / FileCard / ImageCard / ThinkingBlock /
│                              Markdown / PermissionSheet / QuestionCards / CommandPalette /
│                              ModelEffortSheet / InfoSheet（含 7 天花费图+预算）/ GitSheet /
│                              FileMentionPalette（@文件补全）/ TaskProgress（TodoWrite 面板）/
│                              SubagentPanel（子代理面板）/ AttachSheet（拍照/图片/文件）/ BottomSheet
└── theme/                     theme.ts + ThemeProvider.tsx（配色/间距/圆角、明暗主题）
```

- **状态流**：WS 收到 `event` → `applyEvent` 把 `WireEvent` 归约进 `TranscriptItem[]`
  （流式 block 用 id 累加文本、tool_use 与后续 tool_result 按 toolUseId 配对）；`todos` /
  `subagents` 不进转写，单独喂 `view.todos` / `view.subagents` 驱动常驻面板；`alert` → 本地通知。
- **连接**：`WsConnection` 单条 socket 多路复用所有订阅会话，断线自动重连并重新 attach。
- **多服务器**：`ServerProfile` 存 AsyncStorage，可保存/切换/编辑/删除，扫码可一键添加。

---

## 6. 云中继 Relay（可选，默认关）

手机和电脑跨网段时（例如人在外面用 4G），部署一个 relay 让两端会合。**纯 LAN 时完全不需要。**

```
App ──HTTPS/WSS──▶ relay（公网）◀──WSS 拨出── 本机 server（NAT 后）
        /s/<serverId>/...                      127.0.0.1:8787
```

- **本机 server 拨出**（`server/src/relay/agent.ts`）：opt-in 时向云中继开一条常驻控制 WS，
  把中继转发来的 HTTP / WS 重放到本机 loopback，**完全复用**现有 gateway/REST。
  `index.ts` 在 `server.listen` 回调里 `startRelayAgent(cfg)`（未配置则 no-op）。
- **中继**（`relay/src/relay.ts`）：按 `serverId` 多路复用 —— `/agent` 控制通道 +
  `/s/:serverId/*` 反代。只存 server access token 的 **sha256**，逐请求校验；中继无明文 token，
  看不懂业务内容，只按 `streamId` 转发。
- **App 无需改**：把某 server 的 `baseUrl` 填成 `https://relay/s/<serverId>`，`wsUrl()` / REST
  自然拼出 `…/s/<id>/ws` 与 `…/s/<id>/api/*`，token 用 server **自己的** access token。
  LAN 与中继并存互不影响。详见 `relay/README.md`。
- **配置**：env `CLAUDE_REMOTE_RELAY_ENABLED`(1) · `_RELAY_URL` · `_RELAY_TOKEN`(= 中继
  `RELAY_TOKEN`) · `_RELAY_SERVER_ID`(缺省自动生成持久化) · `_RELAY_NAME`，或 config.json 的
  `relay` 块。`loadRelayConfig` 解析：env 优先，未配置则 `relay: null`。

---

## 7. 通信流程（一次带审批的对话）

1. App 经 `POST /api/sessions`（带工作目录）创建会话 → Server 起 `ClaudeSession`。
2. App WS `attach` → Server 回 `attached` + `backlog`（历史回放）+ `capabilities`，并重放未决提示。
3. App 发 `user_message` → 入队喂给 SDK，状态变 `running`。
4. SDK 流式产出 → `LiveTransformer` 转成 `block_start/delta/end`、`tool_use` 等 → WS 广播 `event`。
5. 模型要跑命令/改文件 → `PreToolUse` hook 命中 `ask` → Server 推 `permission_request`，会话变 `awaiting_permission`。
6. App 弹 `PermissionSheet`，用户批准/拒绝（可勾「永远允许」）→ WS `permission_response` → hook 放行或拒绝。
7. 工具结果回流为 `tool_result`，最终 `result` 事件带成本/turn 数，状态回 `idle`。

---

## 8. 鉴权与安全模型

- **Bearer Token**：每个 HTTP 请求与 WS 握手都要带 token（env > 持久化 > 自动生成，存 `config.json`）。
  唯一例外是 `/api/health`。
- **文件下载非通用**：只有被 `send_file` / `send_image` 显式暂存的 `fileId` 可下载，服务端真实路径**永不出进程**。
- **文件上传隔离**：上传字节落到 `~/.claude-remote/uploads/<会话>/`（不污染项目树），文件名 ASCII 净化防穿越，回绝对路径供 agent Read，会话删除时清理。
- **文件系统选择器**：列目录默认隐藏点文件，安全处理符号链接与无权限项（EACCES→403）。
- **云中继零信任明文**：中继只存 server token 的 sha256，逐请求校验，不持有明文、看不懂业务内容。
- **通知纯本端**：无 FCM/远程推送、无第三方凭据；通知只在 App 进程存活、WS 在线时触发（取舍见 §10）。
- **定位边界**：服务面向**可信局域网**（或经你自管的中继），要求端口（默认 8787）可达（放行防火墙）。
  Bypass（YOLO）模式会全量放行工具，需谨慎。

---

## 9. 配置项

`~/.claude-remote/config.json` 或环境变量：

| 环境变量 | 默认 | 含义 |
|---|---|---|
| `CLAUDE_REMOTE_PORT` | `8787` | 监听端口 |
| `CLAUDE_REMOTE_HOST` | `0.0.0.0` | 绑定地址 |
| `CLAUDE_REMOTE_TOKEN` | *(生成)* | App 必带的 Bearer token |
| `CLAUDE_REMOTE_CLAUDE_PATH` | *(自动探测)* | `claude` 二进制路径 |
| `CLAUDE_REMOTE_DATA_DIR` | `~/.claude-remote` | 配置 + 会话元数据目录 |
| `CLAUDE_REMOTE_MAX_LIVE` | `12` | 常驻活跃会话上限 |

> 服务默认加载用户真实的 Claude Code 设置（`settingSources: ['user','project','local']`），
> 因此你的 skills、plugins、自定义 slash 命令都可用；置为 `[]` 可改为隔离运行。
>
> 云中继相关变量（`CLAUDE_REMOTE_RELAY_*`）见 §6；server 与 relay 启动时各自
> `import 'dotenv/config'` 读取**各自工作目录**下的 `.env`（真实 shell 环境变量优先）。

---

## 10. 关键设计权衡（hacker notes）

- **每会话一个常驻 streaming `query()`**：SDK session id / cwd / 元数据持久化，转写存标准会话库，恢复时回放。
- **权限用 `PreToolUse` hook 而非 `canUseTool`**：后者在当前 SDK 版本会崩，hook 路径稳定可控。
- **澄清卡片用自定义 `ask_user` MCP 工具**（预批准）而非内置 `AskUserQuestion`（已禁用），
  完全掌控问答往返。
- **`init` 重发去抖**：仅在 session id 真正改变时清空转写，避免每个 turn 边界误清。
- **effort 近似**：当前 SDK 无运行时 setEffort，用 `setMaxThinkingTokens` 的 thinking 预算映射。
- **协议双份镜像**：`server/src/protocol.ts` 为真源，`app/src/api/protocol.ts` 手工同步；
  relay 侧 `relay/src/protocol.ts` 与 `server/src/relay/agent.ts` 顶部镜像也需手工同步。
- **通知放弃 FCM 的取舍**：改用 WS `alert` + 本地通知，无需推送凭据/服务，但**被系统杀死后收不到**
  —— 仅在 App 存活（前台或后台短窗口）时触发；通知内 Approve/Deny 走 REST，不依赖在线 WS。
- **TodoWrite / Task 用替换式快照**：`todos` / `subagents` 是整盘 replace-on-each 事件，绕过转写
  驱动常驻面板；子代理面板仅在有 running 子代理时显示（跑完自动隐藏）。
- **config.json 不回写 env**：只在自动生成新 token 时写一次；port/host/relay 等每次按 env > config > 默认即时解析，
  删掉某个 env（如 relay）下次启动即生效。
```
