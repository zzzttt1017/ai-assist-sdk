# ai-assist-sdk 使用文档

> 财务 AI 助手 SDK，以可拖拽悬浮球形态注入页面，点击展开 AI 对话面板。同时支持 **React** 和 **Vue3**。

## 子路径导出

| 导入路径 | 用途 |
|---|---|
| `ai-assist-sdk` | 主入口，导出 TypeScript 类型和框架无关的工具函数 / API |
| `ai-assist-sdk/react` | React 适配器 — `initAiAssist` / `mountAiAssist` / `unmountAiAssist` |
| `ai-assist-sdk/vue` | Vue3 适配器 — `initAiAssist` / `mountAiAssist` / `unmountAiAssist` / Vue plugin |
| `ai-assist-sdk/styles` | CSS 样式文件 |

---

## 安装

### 本地联调（`file:` 协议）

在宿主项目 `package.json` 中添加：

```json
{
  "dependencies": {
    "ai-assist-sdk": "file:../ai-assist-sdk"
  }
}
```

```bash
cd ai-assist-sdk && pnpm build:lib     # 先构建
cd your-project && pnpm install        # 安装
```

每次改 SDK 代码只需 `pnpm build:lib`，宿主项目自动生效（符号链接）。

### 正式安装

```bash
# React 项目
npm install ai-assist-sdk react react-dom antd

# Vue3 项目
npm install ai-assist-sdk vue
```

---

## `AiAssistConfig` 完整配置

```ts
interface AiAssistConfig {
  // === 必填 ===
  baseUrl: string            // 后端 API 基础地址
  token: string              // 鉴权 token，自动注入 Authorization: Bearer header

  // === 可选 ===
  name?: string              // AI 助手名称，面板标题栏显示
  appKey?: string            // 应用标识（非必传）

  defaultSayhello?: {        // 问候语
    text1: string            //   主标题
    text2: string            //   副标题
  }

  defaultRecommend?: string[]  // 推荐问题列表

  apis: {
    // ── 对话 ──
    chatQueryApi: string                // 必填：聊天查询（非流式）
    chatQueryStreamApi?: string         // 聊天查询（流式 SSE），配置即启用
    queryAgainApi?: string              // 重新生成（非流式）
    queryAgainStreamApi?: string        // 重新生成（流式 SSE）
    stopMessageApi?: string             // 停止回复

    // ── 会话管理 ──
    createConversationApi?: string      // 创建新会话
    getConversationListApi?: string     // 获取历史会话列表
    getConversationMessagesApi?: string // 获取某会话的消息历史
    deleteConversationApi?: string      // 删除会话

    // ── 其他 ──
    getSuggestedQuestionsApi?: string   // 获取建议问题
    getMessageInfoApi?: string          // 获取消息详情
    getAppConfigApi?: string            // 获取应用配置
    getPersonalInfoApi?: string         // 获取个人信息
  }
}
```

**注意**：
- 仅 `baseUrl`、`token`、`apis.chatQueryApi` 为必填
- 未配置的可选端点对应功能自动关闭
- 对话优先走流式 SSE（`chatQueryStreamApi`），检测到 `text/event-stream` 自动切换
- 所有请求 body 固定为 `{ data: { ... } }`（HiAgentParamVO 格式，不含 `app` 字段）

---

## Vue3 使用

### 命令式挂载（推荐）

```ts
// main.ts
import 'ai-assist-sdk/styles'
import { initAiAssist, mountAiAssist } from 'ai-assist-sdk/vue'

initAiAssist({
  name: '财务AI员工',
  baseUrl: 'https://goon.csci.com.hk/fis-api',
  token: 'your-bearer-token',
  defaultSayhello: {
    text1: 'Hi~ 我是财务助手!',
    text2: '可以为你答疑解惑，助你轻松工作，多点生活',
  },
  defaultRecommend: [
    '本月报销流程是什么？',
    '如何查询预算余额？',
    '发票开具需要哪些信息？',
  ],
  apis: {
    // 对话（必填 + 流式可选）
    chatQueryApi: '/hi-agent/chatQuery',
    chatQueryStreamApi: '/hi-agent/chatQueryStream',
    queryAgainStreamApi: '/hi-agent/queryAgainStream',
    stopMessageApi: '/hi-agent/stopMessage',

    // 会话
    createConversationApi: '/hi-agent/createConversation',
    getConversationListApi: '/hi-agent/ai-getConversationList',
    getConversationMessagesApi: '/hi-agent/getConversationMessages',
    deleteConversationApi: '/hi-agent/deleteConversation',

    // 其他
    getSuggestedQuestionsApi: '/hi-agent/getSuggestedQuestions',
    getPersonalInfoApi: '/hi-agent/getPersonalInfo',
  },
})

mountAiAssist() // 默认挂载到 document.body

// 卸载
// unmountAiAssist()
```

### Vue 插件方式

```ts
import AiAssistPlugin from 'ai-assist-sdk/vue'
import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)
app.use(AiAssistPlugin, config)   // config 同上
app.mount('#app')
```

```vue
<!-- 任意 .vue 组件中使用 -->
<template>
  <AiAssist />
</template>
```

### 开发调试时使用代理

如果后端 API 和前端不在同一域名，配置 Vite 代理转发：

```ts
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'https://goon.csci.com.hk/fis-api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

---

## React 使用

```tsx
// main.tsx
import 'ai-assist-sdk/styles'
import { initAiAssist, mountAiAssist } from 'ai-assist-sdk/react'

initAiAssist({
  name: '财务AI员工',
  baseUrl: 'https://goon.csci.com.hk/fis-api',
  token: 'your-bearer-token',
  apis: {
    chatQueryApi: '/hi-agent/chatQuery',
    chatQueryStreamApi: '/hi-agent/chatQueryStream',
    queryAgainStreamApi: '/hi-agent/queryAgainStream',
    stopMessageApi: '/hi-agent/stopMessage',
    createConversationApi: '/hi-agent/createConversation',
    getConversationListApi: '/hi-agent/ai-getConversationList',
    getConversationMessagesApi: '/hi-agent/getConversationMessages',
    getPersonalInfoApi: '/hi-agent/getPersonalInfo',
  },
})

mountAiAssist()
```

也可直接使用 React 组件：

```tsx
import { AiAssist } from 'ai-assist-sdk/react'

function App() {
  return <AiAssist />
}
```

React 项目需额外安装 `react`、`react-dom`、`antd`。

---

## 功能说明

| 功能 | 说明 |
|---|---|
| 悬浮球 | 半透明吉祥物图标，可拖拽移动，释放后吸附最近屏幕边缘，hover 高亮微移，位置 localStorage 持久化 |
| AI 对话 | 点击悬浮球展开面板；Markdown 渲染（代码高亮、表格）；优先 SSE 流式响应 |
| 消息状态 | 思考中 → 回答中 → 完成；支持停止回答 / 重新生成 / 一键复制 |
| 历史记录 | 会话列表（首字母头像 + 标题 + 时间），点击加载历史，删除需二次确认 |
| 个人信息 | 显示姓名、用户名、部门、邮箱、数据权限（PT 名称列表） |
| 推荐问题 | 配置 `defaultRecommend`，3 个一组轮播，"换一换"切换 |
| 全屏/小窗 | 面板支持放大全屏和缩小恢复 |

---

## 注意事项

### Vue3

- ❌ 不要用 `import AiAssistSdk from 'ai-assist-sdk/vue'` 然后调 `AiAssistSdk.initAiAssist()`
- ✅ 用 `import { initAiAssist, mountAiAssist } from 'ai-assist-sdk/vue'`
- Vue3 项目无需安装 React/ReactDOM（peerDep 已标记 optional）

### 通用

- 所有请求自动附带 `Authorization: Bearer <token>` header
- 流式 SSE 响应类型为 `text/event-stream`，由 SDK 内部解析
- `stopMessageApi` 请求体固定 `{ data: { MessageID } }`
- 接口 baseUrl 和 apis 路径拼接为完整 URL（如 `https://goon.csci.com.hk/fis-api/hi-agent/chatQuery`）
