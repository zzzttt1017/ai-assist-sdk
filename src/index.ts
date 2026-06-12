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
  getConversationList,
  deleteConversation,
  getConversationMessages,
  chatQuery,
  stopMessage,
  getSuggestedQuestions,
  getMessageInfo,
  getAppConfig,
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
