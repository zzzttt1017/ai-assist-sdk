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
    chatQueryApi: '/hi-agent/chatQuery',
    chatQueryStreamApi: '/hi-agent/chatQueryStream',
    queryAgainApi: '/hi-agent/queryAgain',
    queryAgainStreamApi: '/hi-agent/queryAgainStream',
    stopMessageApi: '/hi-agent/stopMessage',
    createConversationApi: '/hi-agent/createConversation',
    getConversationListApi: '/hi-agent/ai-getConversationList',
    getConversationMessagesApi: '/hi-agent/getConversationMessages',
    deleteConversationApi: '/hi-agent/deleteConversation',
    getSuggestedQuestionsApi: '/hi-agent/getSuggestedQuestions',
    getMessageInfoApi: '/hi-agent/getMessageInfo',
    getAppConfigApi: '/hi-agent/getAppConfig',
    getPersonalInfoApi: '/hi-agent/getPersonalInfo',
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
