// 主入口：导出核心类型和工具
export type {
  AiAssistConfig,
  ViewStatus,
  MessageStatus,
  ChatMessage,
  HistoryItem,
  PersonalInfo,
} from './core/types'

export {
  setConfig,
  getConfig,
  request,
  http,
  createAuthAxios,
} from './core/services/request'

export {
  createConversation,
  sendMessage,
  stopReply,
  getHistoryList,
  deleteHistory,
  getConversationMessages,
  getPersonalInfo,
} from './core/services/api'

export {
  useClipboard,
  extractPlainText,
  statusText,
  formatQuestions,
  textError,
  processSSEData,
  parseSSEData,
  renderMarkdown,
} from './core/utils'
