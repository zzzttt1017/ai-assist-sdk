import React from 'react'
import { createRoot } from 'react-dom/client'
import AiAssistSdk from '@/react/index'

AiAssistSdk.initAiAssist({
  name: '财务AI员工',
  baseUrl: '/API',
  token: 'your-token-here',
  appKey: 'd0rs4ajbg4roompa2h9g',
  defaultSayhello: {
    text1: 'Hi~ 我是财务助手!',
    text2: '可以为你答疑解惑，助你轻松工作，多点生活',
  },
  apis: {
    replyApi: '/aiController/chat_query',
    againreplyApi: '/aiController/chat_query',
    setopreplyApi: '/aiController/stop_reply',
    historyApi: '/aiController/get_conversation_list',
    deletehistoryApi: '/aiController/delete_conversation',
    createaconversationApi: '/aiController/create_conversation',
    conversationmessagesApi: '/aiController/get_conversation_messages',
    personalInfoApi: '/aiController/query/personal',
  },
})

AiAssistSdk.mountAiAssist()

const App = () => (
  <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
    <h1>AI Assist SDK Demo (React)</h1>
    <p>右下角浮动球已加载，点击即可打开AI助手面板</p>
  </div>
)

createRoot(document.getElementById('app')!).render(<App />)
