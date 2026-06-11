import { createApp, onErrorCaptured } from 'vue'
import { initAiAssist, mountAiAssist } from '@/vue/index'

// 全局错误捕获
const app = createApp({
  setup() {
    onErrorCaptured((err) => {
      console.error('Vue Error captured:', err)
      return false
    })
  },
  template: '<div style="padding:40px;font-family:sans-serif"><h1>AI Assist SDK Demo (Vue3)</h1><p>右下角浮动球已加载，点击即可打开AI助手面板</p></div>',
})

app.config.errorHandler = (err, instance, info) => {
  console.error('Global error:', err, info)
}

app.mount('#app')

// 初始化并挂载 AI 助手
try {
  console.log('Initializing AiAssist...')
  initAiAssist({
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

  console.log('Mounting AiAssist...')
  mountAiAssist()
  console.log('AiAssist mounted. Root element:', document.getElementById('ai-assist-root'))
} catch (e) {
  console.error('Failed to mount AiAssist:', e)
}
