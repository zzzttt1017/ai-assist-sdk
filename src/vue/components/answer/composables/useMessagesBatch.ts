import { type Ref } from 'vue'
import type { ChatMessage } from '@/core/types'

/**
 * RAF 批量更新：将同一帧内的多次 messages 赋值合并为一次，避免频繁触发响应式更新。
 *
 * - batchMessagesUpdate: 传入更新函数，延迟到下一帧统一写入
 * - flushMessagesBatch: 立即刷出所有待处理更新（用于终止/错误等需要即时反馈的场景）
 */
export function useMessagesBatch(messages: Ref<ChatMessage[]>) {
  let pendingMessages: ChatMessage[] | null = null
  let messagesRafId = 0

  function batchMessagesUpdate(updater: (msgs: ChatMessage[]) => ChatMessage[]) {
    pendingMessages = updater(pendingMessages || [...messages.value])
    if (!messagesRafId) {
      messagesRafId = requestAnimationFrame(() => {
        messagesRafId = 0
        if (pendingMessages) {
          messages.value = pendingMessages
          pendingMessages = null
        }
      })
    }
  }

  function flushMessagesBatch() {
    if (messagesRafId) {
      cancelAnimationFrame(messagesRafId)
      messagesRafId = 0
    }
    if (pendingMessages) {
      messages.value = pendingMessages
      pendingMessages = null
    }
  }

  return { batchMessagesUpdate, flushMessagesBatch }
}
