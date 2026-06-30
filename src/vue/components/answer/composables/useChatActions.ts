import { reactive, type Ref } from 'vue'
import { createAuthAxios } from '@/core/services/request'
import { createConversation, stopMessage, getConversationMessages } from '@/core/services/api'
import { processSSEData, parseSSEData } from '@/core/utils'
import type { ChatMessage, MessageStatus, AiAssistConfig } from '@/core/types'

interface UseChatActionsParams {
  messages: Ref<ChatMessage[]>
  userInput: Ref<string>
  isGenerating: Ref<boolean>
  lastUserMessage: Ref<string>
  conversationId: Ref<string>
  doStreamRequest: (apiUrl: string, bodyData: Record<string, any>, aiIndex: number, signal: AbortSignal, isRetry?: boolean) => Promise<void>
  issTop: Ref<boolean>
  scrollToBottom: () => void
  STATUS: Record<string, MessageStatus>
  cfg: AiAssistConfig
}

/** 从非流式响应中提取回答文本 */
function extractContent(data: any): string {
  if (typeof data === 'string') {
    const sse = processSSEData(data)
    return parseSSEData(sse) || data
  }
  return data?.answer || data?.data?.answer || String(data || '')
}

/** 获取"重新生成"流式接口，降级到普通接口 */
function getAgainStreamApi(apis: AiAssistConfig['apis']): string {
  return apis.queryAgainStreamApi || apis.queryAgainApi || apis.chatQueryStreamApi || apis.chatQueryApi
}

/**
 * 对话操作：发送消息 / 重新生成 / 停止 / 加载历史会话
 *
 * 内部管理两个 AbortController（first / again）用于中断 SSE 连接。
 */
export function useChatActions({
  messages,
  userInput,
  isGenerating,
  lastUserMessage,
  conversationId,
  doStreamRequest,
  issTop,
  scrollToBottom,
  STATUS,
  cfg,
}: UseChatActionsParams) {
  const apis = cfg.apis
  const controllers = reactive({
    first: new AbortController(),
    again: new AbortController(),
  })

  async function sendMessage() {
    const text = userInput.value.trim()
    if (!text || isGenerating.value) return

    const newMessages: ChatMessage[] = [
      ...messages.value,
      { type: 'user', content: text },
      { type: 'ai', content: '', status: STATUS.THINKING },
    ]
    messages.value = newMessages
    userInput.value = ''
    scrollToBottom()

    const aiIndex = newMessages.length - 1

    // 优先流式
    if (apis.chatQueryStreamApi) {
      console.log('[ai-assist-sdk] ✅ 使用流式 SSE:', apis.chatQueryStreamApi)
      await doStreamRequest(apis.chatQueryStreamApi, {
        Query: text,
        AppConversationID: conversationId.value,
        ResponseMode: 'streaming',
      }, aiIndex, controllers.first.signal)
      return
    }

    // 降级非流式
    console.warn('[ai-assist-sdk] ⚠️ 未配置 chatQueryStreamApi，降级为非流式请求')
    try {
      const authAxios = createAuthAxios()
      const res = await authAxios.post(apis.chatQueryApi, {
        app: cfg.app ?? 1,
        data: { Query: text, AppConversationID: conversationId.value },
      })
      const contentData = extractContent(res.data)
      messages.value = [...messages.value.slice(0, -1), { type: 'ai', content: contentData, status: STATUS.COMPLETED }]
    } catch {
      messages.value = [...messages.value.slice(0, -1), { type: 'ai', content: '服务连接失败，请稍后重试', status: STATUS.ERROR }]
    }
  }

  async function regenerateResponse() {
    if (!lastUserMessage.value || isGenerating.value) return
    const updated = [...messages.value]
    if (updated.length > 0 && updated[updated.length - 1].type === 'ai') updated.pop()
    updated.push({ type: 'ai', content: '', status: STATUS.RETHINKING })
    messages.value = updated
    scrollToBottom()

    const aiIndex = messages.value.length
    await doStreamRequest(getAgainStreamApi(apis), {
      MessageID: lastUserMessage.value,
      AppConversationID: conversationId.value,
      ResponseMode: 'streaming',
    }, aiIndex, controllers.again.signal, true)
  }

  async function toggleStop() {
    if (!apis.stopMessageApi || !isGenerating.value) return
    const aiIndex = messages.value.length - 1
    try {
      await stopMessage(apis, lastUserMessage.value)
      const msgs = [...messages.value]
      if (msgs[aiIndex]) {
        msgs[aiIndex] = { ...msgs[aiIndex], content: msgs[aiIndex].content || '已停止回答', status: STATUS.STOP }
      }
      messages.value = msgs
      isGenerating.value = false
      controllers.first.abort()
      controllers.first = new AbortController()
      controllers.again.abort()
      controllers.again = new AbortController()
      issTop.value = true
    } catch {
      const msgs = [...messages.value]
      if (msgs[aiIndex]) {
        msgs[aiIndex] = { ...msgs[aiIndex], content: '系统繁忙，请稍后再试', status: STATUS.ERROR }
      }
      messages.value = msgs
    }
  }

  async function goHistoryMessage(appConversationId: string) {
    conversationId.value = appConversationId
    const res = await getConversationMessages(apis, appConversationId)
    const contentData = res?.messages?.[0]?.answerInfo?.answer
    if (contentData) {
      messages.value = [...messages.value, { type: 'ai', content: contentData, status: STATUS.COMPLETED }]
    }
  }

  /** 创建新会话，返回 appConversationID */
  async function initConversation() {
    const result = await createConversation(apis)
    if (result?.conversation?.appConversationID) {
      conversationId.value = result.conversation.appConversationID
    }
  }

  return { sendMessage, regenerateResponse, toggleStop, goHistoryMessage, initConversation, controllers }
}
