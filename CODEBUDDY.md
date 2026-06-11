# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## Common Commands

**`pnpm dev`** — 启动 Vite dev server，默认打开 React Demo 页面（`index.html` → `src/react/demo/main.tsx`）。React 和 Vue3 Demo 共用一个 dev server（多页面模式）。

**`pnpm dev:vue`** — 启动 Vite dev server 并打开 Vue3 Demo 页面（`index-vue.html` → `src/vue/demo/main.ts`）。用于开发调试 Vue3 版本。

**`pnpm build:lib`** — **库模式构建**（`--mode lib`），发布 npm 包的正确命令。产出三个入口：`dist/index.mjs`（core 层）、`dist/react/index.mjs`、`dist/vue/index.mjs`，仅 ES Module 格式。`vite-plugin-dts` 自动生成对应 `.d.ts`。`react`/`react-dom`/`vue`/`antd` 均为 external 不打包。

**`pnpm build`** — 普通 Vite 构建，产出 demo 页面到 `dist/`，开启 sourcemap。

**`pnpm preview`** — 预览 `build` 或 `build:lib` 构建结果。

## Architecture

### 定位

财务 AI 助手 SDK，以可拖拽悬浮球形态注入宿主页面，点击后展开 AI 对话面板。**同时支持 React 和 Vue3**，通过 npm 子路径导出 (`ai-assist-sdk/react` 和 `ai-assist-sdk/vue`) 分别供给不同框架项目。

### 三层架构

```
src/
├── core/          # 框架无关的核心层
│   ├── types/     # AiAssistConfig, ChatMessage, MessageStatus 等所有 TS 类型
│   ├── services/  # request.ts(配置单例+Axios)、api.ts(7个业务API)、version.ts
│   └── utils/     # index.ts(剪贴板/SSE解析/状态文案) + markdown.ts(markdown-it渲染)
├── react/         # React 适配层
│   ├── components/ # AiAssist / Answer / History / Info (4 个 .tsx)
│   ├── index.ts   # initAiAssist / mountAiAssist / unmountAiAssist
│   └── demo/      # React Demo
├── vue/           # Vue3 适配层
│   ├── components/ # AiAssist / Answer / History / Info (4 个 .vue SFC)
│   ├── index.ts   # initAiAssist / mountAiAssist / unmountAiAssist + Vue plugin
│   └── demo/      # Vue3 Demo
├── styles/        # 共享 Less 样式（React/Vue 复用）
├── assets/image/  # 共享图片资源
└── index.ts       # 主入口，仅 re-export core 的类型和工具函数
```

### 对外 API

**React 项目**通过 `ai-assist-sdk/react` 导入：
```ts
import { initAiAssist, mountAiAssist, unmountAiAssist } from 'ai-assist-sdk/react'
initAiAssist(config)      // 注入配置（闭包单例）
mountAiAssist(container?) // 创建 #ai-assist-root → createRoot().render(<AiAssist/>)
```

**Vue3 项目**通过 `ai-assist-sdk/vue` 导入：
```ts
import { initAiAssist, mountAiAssist } from 'ai-assist-sdk/vue'
// 用法同上，或作为 Vue 插件：
import AiAssistPlugin from 'ai-assist-sdk/vue'
app.use(AiAssistPlugin, config)  // 注册全局 <AiAssist/> 组件
```
Vue3 版 `mountAiAssist` 内部用 `createApp(AiAssist).mount(wrapper)`。

**主入口** `ai-assist-sdk` 仅导出 core 层（类型 + 工具），不含 UI 组件。

### 配置与请求层（`src/core/services/`）

- **`request.ts`**：`setConfig`/`getConfig` 闭包单例管理 `AiAssistConfig`。`getConfig` 在未初始化时抛错。Axios 实例 180s 超时，拦截器自动注入 `Authorization: Bearer <token>` 和 `baseURL`。`createAuthAxios()` 创建 600s 超时的额外实例，供 SSE 流式请求使用。
- **`api.ts`**：封装 7 个业务 API（`createConversation`、`sendMessage`、`stopReply`、`getHistoryList`、`deleteHistory`、`getConversationMessages`、`getPersonalInfo`），每个函数接收 `AiAssistConfig.apis` 决定调用哪个端点。`AppKey` 通过 `getConfig().appKey` 获取（已配置化）。
- **`version.ts`**：将数据包装为 `{ app: 1, data: {...} }` 结构。

### AiAssistConfig 类型

必填：`baseUrl`、`token`、`appKey`。可选：`name`、`defaultSayhello`（问候语）、`defaultRecommend`（推荐问题数组）。`apis` 中 `replyApi` 为必填，其余 API 端点可选（未配置则对应功能关闭）。

### React 组件（`src/react/components/`）

**AiAssist.tsx** — 主容器：
- 悬浮球拖拽：mousedown/touchstart 开始 → 全局 mousemove 跟踪 → mouseup 释放，位移 > 5px 视为拖拽。释放后执行吸附动画：根据球心所在半屏吸附到左/右边缘，400ms CSS transition。
- 面板位置自适应：球在左半屏 → `panel-left`，右半屏 → `panel-right`，返回按钮在对应侧。
- 位置持久化：localStorage 存取 `characterPosition`、`panelPosition`、`backPosition`。
- 视图路由：`ViewStatus = 'answer' | 'history' | 'info'`，Header 图标切换。
- 修改标题 Popup 浮层。

**Answer.tsx**（`forwardRef` + `useImperativeHandle`）：
- 消息流双路径：首次发送 → POST `replyApi` → HTML 响应 → `processSSEData`/`parseSSEData` 解析；重新生成 → `fetchEventSource` SSE 流式连接监听 `message_start`/`message`/`message_end`。
- Markdown 渲染：`markdown-it` + `highlight.js` + `markdown-it-multimd-table` → `DOMPurify` 净化 → `dangerouslySetInnerHTML`。
- 消息状态 7 种：`thinking/rethinking/answering/paused/completed/stop/error`。
- 推荐问题 `formatQuestions` 3 个一组分页，"换一换"轮播。
- 滚动控制：检测是否在底部，不在底部显示"回到底部"按钮。

**History.tsx**：使用 `antd` 的 `Modal` + `Button` 做删除确认。首字母头像 + 标题 + 时间。

**Info.tsx**：展示基本信息（姓名/用户名）、数据权限（PT 名称列表）、帮助信息（部门/邮箱）。

### Vue3 组件（`src/vue/components/`）

四个 `.vue` SFC 的功能与 React 版完全对等，关键差异：

- 使用 `<script setup lang="ts">` + Composition API
- `dangerouslySetInnerHTML` → `v-html` 指令
- `forwardRef`/`useImperativeHandle` → `defineExpose`
- History 组件的删除弹窗**未使用 antd**，改为原生 HTML + CSS 实现的 Modal（Teleport 到 body）
- Answer 组件的 Props 使用内联类型 `defineProps<{...}>()` 而非具名 `interface`（避免 `vite-plugin-dts` 生成 `.d.ts` 时 TS4082 错误）
- CSS 自定义属性 `--direction` 需显式 `String()` 转换

### 工具函数（`src/core/utils/`）

- `index.ts`：`useClipboard`、`extractPlainText`、`statusText`（状态→中文）、`formatQuestions`、`textError`（LLM token超限）、`processSSEData`（提取 SSE data 行）、`parseSSEData`（拼接 markdown）
- `markdown.ts`：`renderMarkdown` — 框架无关的 markdown-it 实例，供 React/Vue 双端复用

### 样式系统（`src/styles/`）

全局 Less 样式，React 和 Vue3 共享。三个文件通过 `@import` 级联：
- `index.less` — 主样式（`.character` 悬浮球、`.ai-panel` 面板、`.header`、`.ai-history` 历史列表、`.info` 个人信息、`@keyframes` 动画）
- `chat.less` — 聊天区域（`.message` 气泡、`.input-container`、`.ai-greet`/`.ai-recommend`、tooltip）
- `markdown.less` — Markdown 渲染（代码块 `atom-one-dark` 主题、表格、标题）

React 和 Vue 入口文件各自 `import '@/styles/index.less'`，Vite 编译后注入页面。

### 构建配置关键点（`vite.config.ts`）

- 同时使用 `@vitejs/plugin-react` 和 `@vitejs/plugin-vue`
- 库模式三入口：`index`、`react/index`、`vue/index`，仅 `formats: ['es']`
- `external: ['react', 'react-dom', 'vue', 'antd', '@ant-design/icons']`
- `vite-plugin-dts` 配置 include 限定 `.ts`/`.tsx` 文件，exclude `.vue` 文件（Vue SFC 不需要独立 `.d.ts`）
- 路径别名 `@ → src/`
- Less 预处理器 `javascriptEnabled: true`

### npm 包导出（`package.json` exports map）

| 子路径 | 用途 |
|---|---|
| `ai-assist-sdk` | 主入口，导出 core 类型和工具函数 |
| `ai-assist-sdk/react` | React 适配器，导出 `initAiAssist`/`mountAiAssist`/`AiAssist` 组件 |
| `ai-assist-sdk/vue` | Vue3 适配器，导出 `initAiAssist`/`mountAiAssist`/`AiAssist` 组件 + Vue plugin |
| `ai-assist-sdk/styles` | 样式文件入口 |

`peerDependencies` 中 `react`/`react-dom`/`vue` 均设为 `optional: true`，按需安装。

### Vue3 Demo 注意事项

`src/vue/demo/main.ts` 必须使用**命名导入**：
```ts
// ✅ 正确
import { initAiAssist, mountAiAssist } from '@/vue/index'

// ❌ 错误 - default export 只有 { install }，不含 initAiAssist/mountAiAssist
import AiAssistSdk from '@/vue/index'
```

### 关键依赖

| 依赖 | 用途 | 框架相关性 |
|---|---|---|
| `react` / `react-dom` | React 适配层 UI 框架 | React only |
| `vue` | Vue3 适配层 UI 框架 | Vue3 only |
| `antd` + `@ant-design/icons` | Modal / Button（仅 React History 组件） | React only |
| `axios` | HTTP 请求客户端 | 通用 |
| `@microsoft/fetch-event-source` | SSE 流式请求（POST + 自定义 headers） | 通用 |
| `markdown-it` + `highlight.js` | Markdown 渲染 + 代码语法高亮 | 通用 |
| `dompurify` | XSS 防护，净化 markdown 输出 | 通用 |
