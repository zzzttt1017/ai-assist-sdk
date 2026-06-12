export interface AiAssistConfig {
  name?: string
  baseUrl: string
  token: string
  appKey?: string
  defaultSayhello?: {
    text1: string
    text2: string
  }
  defaultRecommend?: string[]
  apis: {
    // 对话
    chatQueryApi: string
    chatQueryStreamApi?: string
    queryAgainApi?: string
    queryAgainStreamApi?: string
    stopMessageApi?: string
    // 会话管理
    createConversationApi?: string
    getConversationListApi?: string
    getConversationMessagesApi?: string
    deleteConversationApi?: string
    // 其他
    getSuggestedQuestionsApi?: string
    getMessageInfoApi?: string
    getAppConfigApi?: string
    getPersonalInfoApi?: string
  }
}

export type ViewStatus = 'answer' | 'history' | 'info'

export type MessageStatus = 'thinking' | 'rethinking' | 'answering' | 'paused' | 'completed' | 'stop' | 'error'

export interface ChatMessage {
  type: 'user' | 'ai'
  content: string
  status?: MessageStatus
}

export interface HistoryItem {
  appConversationID: string
  conversationName: string
  createTime: string
  lastUpdateTime?: string
  selected?: boolean
}

export interface PersonalInfo {
  name: string
  userName: string
  dept: string
  email: string
  ptnameList: string[]
}
