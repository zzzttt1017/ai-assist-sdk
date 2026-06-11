export interface AiAssistConfig {
  name?: string
  baseUrl: string
  token: string
  appKey: string
  defaultSayhello?: {
    text1: string
    text2: string
  }
  defaultRecommend?: string[]
  apis: {
    sayhelloApi?: string
    recommendApi?: string
    replyApi: string
    againreplyApi?: string
    setopreplyApi?: string
    historyApi?: string
    deletehistoryApi?: string
    historynameApi?: string
    createaconversationApi?: string
    conversationmessagesApi?: string
    personalInfoApi?: string
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
