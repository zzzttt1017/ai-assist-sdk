export interface AiAssistConfig {
  name?: string
  baseUrl: string
  token: string
  appKey?: string
  app?: number
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

export interface MessageSegment {
  type: 'thinking' | 'agent_thought' | 'answer'
  content: string
  duration?: number
}

/** SSE message_cost 事件携带的消费信息 */
export interface MessageCost {
  inputTokens: number
  outputTokens: number
  latency: number
  latencyFirstResp?: number
}

export interface ChatMessage {
  type: 'user' | 'ai'
  content: string
  status?: MessageStatus
  thinkingContent?: string
  thinkingDuration?: number
  /** 按时间顺序排列的内容分段（支持 think_message 与 message 穿插） */
  segments?: MessageSegment[]
  /** 消费信息（input/output tokens 等） */
  cost?: MessageCost
  /** agent_error 的错误信息 */
  errorMessage?: string
}

/** API 返回的会话列表项（已转 camelCase） */
export interface ConversationItem {
  appConversationID: string
  conversationName: string
  createTime: string
  createTimestamp: number
  lastChatTime: string
  lastChatTimestamp: number
  emptyConversation: boolean
  isPinned: boolean
  conversationID: string
}

/** 历史列表项（含客户端扩展字段） */
export interface HistoryItem extends ConversationItem {
  selected?: boolean
}

/** getConversationMessages 返回的消息项 */
export interface ConversationMessageItem {
  answerInfo: {
    answer: string
  }
}

export interface PersonalInfo {
  name: string
  userName: string
  dept: string
  email: string
  ptnameList: string[]
}
