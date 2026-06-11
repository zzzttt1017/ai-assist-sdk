# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## Common Commands

**`pnpm dev`** — 启动 Vite 开发服务器，运行 `src/demo/main.tsx` 作为 demo 页面。开发时用此命令预览 SDK 功能。

**`pnpm build`** — 普通 Vite 构建，产出 demo 页面到 `dist/`，开启 sourcemap。用于预览完整构建产物。

**`pnpm build:lib`** — **库模式构建**（`--mode lib`），这是发布 npm 包的正确命令。产出 UMD (`ai-assist-sdk.umd.js`) 和 ES Module (`ai-assist-sdk.es.js`) 双格式，同时 `vite-plugin-dts` 自动生成类型声明。React/ReactDOM 作为 external 不打包。

**`pnpm preview`** — 预览 `build` 或 `build:lib` 构建结果。

## Architecture

### 项目定位

这是一个**可嵌入的财务 AI 助手 SDK**，以可拖拽悬浮球形态注入宿主页面，点击后展开 AI 对话面板。SDK 构建为 React 组件库，通过 npm 包方式分发，用于各类前端项目（当前 React，待适配 Vue3/原生 JS）。

### 对外 API（`src/index.ts`）

SDK 采用"先配置、后挂载"的两阶段初始化模式：

- **`initAiAssist(config: AiAssistConfig)`** — 注入配置（baseUrl、token、各 API 端点、问候语、推荐问题）。配置通过闭包存入 `services/request.ts` 的单例 `config` 变量，后续所有 API 调用通过 `getConfig()` 取出。
- **`mountAiAssist(container?: HTMLElement)`** — 创建 `#ai-assist-root` DOM 节点并渲染 React 组件树，默认挂载到 `document.body`。
- **`unmountAiAssist()`** — 移除 DOM 节点，完成卸载。
- **`AiAssist`** — 直接导出 React 核心组件，供 React 宿主项目按组件方式使用。
- **`AiAssistConfig`** — TypeScript 类型导出。

### 配置与请求层

**`services/request.ts`** 是整个 SDK 的配置中枢和数据通道：

- `setConfig(cfg)` / `getConfig()` — 闭包单例模式管理 `AiAssistConfig`。`getConfig` 在未初始化时抛错。
- Axios 实例（`instance`）配置了 180s 超时和请求拦截器，拦截器自动注入 `Authorization: Bearer <token>` 和 `baseURL`。
- `request()` 泛型函数支持 GET/POST/PUT/DELETE，GET 请求用 `params`，其他用 `data`。
- `http` 对象提供 `.get/.post/.put/.delete` 便捷方法。
- `createAuthAxios()` — 创建额外 Axios 实例，超时 600s，用于 SSE 流式请求场景。

**`services/api.ts`** 封装全部业务 API，每个函数接收 `apis` 配置对象来决定使用哪个端点（端点本身在 `AiAssistConfig.apis` 中定义，允许每个宿主项目自定义）：

| 函数 | 用途 |
|---|---|
| `createConversation` | 创建新对话，返回 `appConversationID` |
| `sendMessage` | 发送用户消息（非流式 POST，返回含 SSE 数据的 HTML） |
| `stopReply` | 停止 AI 回复（通过 `version()` 包装 body 为 `{app, data}` 结构） |
| `getHistoryList` | 获取历史对话列表（POST 传固定值 `279`） |
| `deleteHistory` | 删除指定对话 |
| `getConversationMessages` | 获取某对话的消息历史 |
| `getPersonalInfo` | 获取当前用户信息 |

**`services/version.ts`** — 简单工具，将数据包装为 `{ app: 1, data: {...} }`，供部分接口使用。

### 组件架构

#### `AiAssist.tsx` — 主容器（唯一顶层组件）

负责全局状态管理和视图路由。核心机制：

- **悬浮球拖拽系统**：使用 `mousedown`/`touchstart` 开始拖拽，全局 `mousemove`/`touchmove` 跟踪位置，`mouseup`/`touchend` 结束。拖拽距离 > 5px 时标记 `hasDraggedRef` 以区分拖拽和点击。释放后执行吸附动画（`doRecycleAnimation`）：根据悬浮球中心点位于屏幕左半还是右半，吸附到最近边缘 (`x = -HALF_CHAR_WIDTH` 或 `screenWidth - HALF_CHAR_WIDTH`)，400ms CSS transition。
- **面板位置自适应**：根据悬浮球在屏幕左/右侧，面板在对应侧弹出（`panel-left`/`panel-right`），返回按钮在另一侧。
- **位置持久化**：悬浮球位置和面板位置通过 `localStorage` 存取，组件挂载时恢复。
- **视图状态**：`ViewStatus = 'answer' | 'history' | 'info'`，通过 header 中的图标按钮切换，Header 标题随视图变化。
- **全屏/小窗切换**：`screenStatus` 控制面板全屏模式。
- **修改标题 Popup**：`setTitle` 浮层，用于重命名对话标题。

#### `Answer.tsx` — 对话组件（核心业务）

使用 `forwardRef` + `useImperativeHandle` 暴露 `goHistoryMessage` 方法给父组件，用于从历史记录跳转加载对话。

**消息流（两种路径）**：

1. **首次发送**（`sendMessage`）：POST 到 `replyApi` → 返回 HTML 响应 → `processSSEData` 提取 `data:` 行中的 `answer` 字段 → `parseSSEData` 按 `event: message` 拼接最终 markdown → 一次性设置 `status: completed`。

2. **重新生成/流式**（`againSendMessageReply`）：使用 `@microsoft/fetch-event-source` 建立 SSE 连接，监听三种事件：
   - `message_start`：记录消息 ID，重置缓冲区
   - `message`：追加 `answer` 到 `streamBufferRef`，实时更新 `messages` state（`status: answering`）
   - `message_end`：标记完成（`status: completed`）
   - `onclose`/`onerror`：处理连接关闭和异常

**Markdown 渲染**：`markdown-it` + `markdown-it-highlightjs`（代码高亮）+ `markdown-it-multimd-table`（增强表格），输出经 `DOMPurify` 净化后通过 `dangerouslySetInnerHTML` 渲染。允许标签白名单包含 h1-h6、pre、code、table 等。

**消息状态**：`thinking → answering → completed`（正常流程），`stop`（用户中断），`error`（异常）。状态决定底部状态文字显示（"正在思考中"/"复制内容"等）。

**推荐问题**：`defaultRecommend` 配置项通过 `formatQuestions` 每 3 个一组分页，支持"换一换"轮播。

**滚动控制**：监听 `scroll` 事件检测是否在底部，不在底部时显示"回到底部"按钮。新消息自动滚底。

#### `History.tsx` — 历史对话

- 调用 `getHistoryList` 获取列表，过滤 null 项，渲染首字母头像 + 标题 + 时间。
- 点击条目通过 `onHistoryDetail(id)` 回调通知 `AiAssist` 切换到 answer 视图并加载历史消息。
- 删除使用 `antd` 的 `Modal` 二次确认 + `Button`。
- "新建AI对话"按钮通过 `onAnswer` 回到 answer 视图。

#### `Info.tsx` — 个人信息

- 调用 `getPersonalInfo` 获取并展示三块信息：基本信息（姓名/用户名）、数据权限（PT 名称列表）、帮助信息（部门/邮箱）。

### 类型系统（`src/types/index.ts`）

- `AiAssistConfig` — SDK 初始化配置，包含 `name`、`baseUrl`、`token`、`appKey`（必填）、`defaultSayhello`、`defaultRecommend`、`apis` 等字段。所有 API 端点均为可选（部分功能可关闭）。
- `ViewStatus` — `'answer' | 'history' | 'info'`
- `MessageStatus` — `'thinking' | 'rethinking' | 'answering' | 'paused' | 'completed' | 'stop' | 'error'`
- `ChatMessage` — `{ type: 'user' | 'ai', content: string, status?: MessageStatus }`
- `HistoryItem` — 历史对话条目
- `PersonalInfo` — 用户信息结构

### 工具函数（`src/utils/index.ts`）

- `useClipboard` — 剪贴板复制（优先 `navigator.clipboard`，降级 `execCommand`）
- `extractPlainText` — HTML 转纯文本，保留换行
- `statusText` — `MessageStatus` → 中文文案映射
- `formatQuestions` — 推荐问题数组排序后按 3 个一组分页
- `textError` — 捕获 LLM token 超限错误并替换中文提示
- `processSSEData` — 从 SSE 原始响应中提取 `data:` 行并合并 `answer` 字段
- `parseSSEData` — 按 `event: message` 拼接完整 markdown 内容

### 样式系统（`src/styles/`）

- `index.less` — 主样式：悬浮球定位/拖拽/吸附动画、面板容器、Header、历史列表、个人信息
- `chat.less` — 聊天区域：消息气泡、输入框、推荐问题卡片
- `markdown.less` — Markdown 渲染样式：代码块（highlight.js 主题 `atom-one-dark`）、表格、标题
- Less 使用 `javascriptEnabled: true`（Vite 配置），部分 Math 运算用于动态计算面板位置
- CSS 变量 `--direction` 用于 hover 时悬浮球的水平微移方向

### 构建配置关键点（`vite.config.ts`）

- 双模式构建：普通模式输出 demo 页面；`--mode lib` 进入库模式
- 库模式下 `external: ['react', 'react-dom']`，globals 映射为 `React`/`ReactDOM`，宿主项目需自行提供
- `vite-plugin-dts` 自动生成类型声明并插入类型入口
- 路径别名 `@ → src/` 在 resolve.alias 和 tsconfig paths 中同步配置

### 关键依赖用途

| 依赖 | 用途 |
|---|---|
| `react` / `react-dom` 19 | UI 框架，external 不打包 |
| `antd` 5 + `@ant-design/icons` | Modal / Button（仅在 History 组件使用） |
| `axios` | HTTP 请求客户端 |
| `@microsoft/fetch-event-source` | SSE 流式请求（支持 POST + 自定义 headers） |
| `markdown-it` + `highlight.js` | Markdown → HTML + 代码语法高亮 |
| `dompurify` | XSS 防护，净化 markdown 渲染输出 |
| `vite-plugin-dts` | 自动生成 `.d.ts` 类型声明文件 |

### 适配 Vue3 的改造要点

当前项目为 React 实现，若需发布为 Vue3 可用 npm 包，关键改造路径：

1. **`services/`、`utils/`、`types/` 完全可复用**，无需更改
2. **需重写的 UI 层**：4 个 `.tsx` 组件 → Vue3 SFC，React hooks 替换为 Vue Composition API（`useState` → `ref`/`reactive`，`useEffect` → `onMounted`/`watch`，`useRef` → `ref`/`template ref`，`useCallback` → 普通函数）
3. **入口改造**：`src/index.ts` 中的 `createRoot().render()` 替换为 `createApp().mount()`，导出 Vue plugin 或直接导出组件
4. **antd → ant-design-vue 或 TDesign**：当前仅 History 组件用了 Modal/Button，替换成本极低
5. **Vite 配置**：`@vitejs/plugin-react` → `@vitejs/plugin-vue`，external 改为 `vue`，样式预处理器 Less 保持不变
6. **`dangerouslySetInnerHTML`** → Vue 的 `v-html` 指令
