import { ref, type Ref } from 'vue'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import type { ChatMessage, MessageSegment, MessageCost, MessageStatus } from '@/core/types'
import type { AiAssistConfig } from '@/core/types'

interface UseSSEStreamParams {
  messages: Ref<ChatMessage[]>
  isGenerating: Ref<boolean>
  lastUserMessage: Ref<string>
  batchMessagesUpdate: (updater: (msgs: ChatMessage[]) => ChatMessage[]) => void
  flushMessagesBatch: () => void
  STATUS: Record<string, MessageStatus>
  cfg: AiAssistConfig
}

/**
 * SSE 流式请求：处理 think_message / agent_thought / message 等事件的分段拼接与状态流转。
 *
 * 内部管理：
 * - segmentsMap: 每条 AI 消息的分段数组（支持 thinking/agent_thought/answer 穿插）
 * - currentSegType: 当前正在写入的 segment 类型
 * - thinkingStartTimes / agentThoughtStartTimes: 用于计算耗时
 * - issTop: 是否已手动停止
 *
 * 对外暴露 doStreamRequest 与 issTop（toggleStop 需读写）。
 */
export function useSSEStream({
  messages,
  isGenerating,
  lastUserMessage,
  batchMessagesUpdate,
  flushMessagesBatch,
  STATUS,
  cfg,
}: UseSSEStreamParams) {
  const segmentsMap = ref(new Map<number, MessageSegment[]>())
  const currentSegType = ref(new Map<number, MessageSegment['type']>())
  const thinkingStartTimes = ref(new Map<number, number>())
  const agentThoughtStartTimes = ref(new Map<number, number>())
  const issTop = ref(false)

  /** 同步 segments 到 messages[aiIndex]（使用批量更新） */
  function syncSegments(aiIndex: number) {
    const segs = segmentsMap.value.get(aiIndex) || []
    batchMessagesUpdate(msgs => {
      if (msgs[aiIndex]) {
        const updated = [...msgs]
        updated[aiIndex] = { ...updated[aiIndex], segments: segs.map(s => ({ ...s })) }
        return updated
      }
      return msgs
    })
  }

  /**
   * 关闭所有未结束的 thinking segment（duration == null）。
   * 在"回答开始"时调用 —— 语义上"开始回答 = 前序思考阶段结束"。
   *
   * 解决 think_message 与 message 穿插时，第一段思考因缺少 think_message_output_end
   * 而永远停留在"思考中"的问题。后续若再来 think_message，会新建新的思考段（合理）。
   */
  function closeOpenThinking(aiIndex: number) {
    const segs = segmentsMap.value.get(aiIndex) || []
    const startTime = thinkingStartTimes.value.get(aiIndex)
    let closedDuration = 0
    let closed = false

    segs.forEach((s) => {
      if (s.type === 'thinking' && s.duration == null) {
        const d = startTime
          ? Math.round(((Date.now() - startTime) / 1000) * 10) / 10
          : 0
        s.duration = d
        closedDuration += d
        closed = true
      }
    })

    if (!closed) return
    segmentsMap.value.set(aiIndex, segs)
    batchMessagesUpdate(msgs => {
      if (msgs[aiIndex]) {
        const updated = [...msgs]
        updated[aiIndex] = {
          ...updated[aiIndex],
          segments: segs.map(s => ({ ...s })),
          thinkingDuration: (updated[aiIndex].thinkingDuration || 0) + closedDuration,
        }
        return updated
      }
      return msgs
    })
  }

  async function doStreamRequest(
    apiUrl: string,
    bodyData: Record<string, any>,
    aiIndex: number,
    signal: AbortSignal,
    isRetry = false,
  ) {
    issTop.value = false
    segmentsMap.value.set(aiIndex, [])
    isGenerating.value = true

    try {
      const fullUrl = cfg.baseUrl.replace(/\/+$/, '') + '/' + apiUrl.replace(/^\/+/, '')
      await fetchEventSource(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: cfg.app ?? 1, data: bodyData }),
        signal,
        openWhenHidden: true,
        async onopen(_res) {
        },
        onmessage(ev) {
          try {
            let dataStr = ev.data || ''
            if (dataStr.startsWith('data:')) {
              dataStr = dataStr.replace(/^data:\s*/, '')
            }
            if (!dataStr) return

            let chunk: any
            try {
              chunk = JSON.parse(dataStr)
            } catch {
              return
            }

            switch (chunk.event) {
              case 'message_start':
                if (!isRetry) lastUserMessage.value = chunk.id
                currentSegType.value.set(aiIndex, 'answer')
                break

              case 'think_message_output_start': {
                thinkingStartTimes.value.set(aiIndex, Date.now())
                currentSegType.value.set(aiIndex, 'thinking')
                const segs = segmentsMap.value.get(aiIndex) || []
                segmentsMap.value.set(aiIndex, [...segs, { type: 'thinking' as const, content: '' }])
                syncSegments(aiIndex)
                break
              }

              case 'agent_thought': {
                const thoughtText = chunk.thought || chunk.thinking || ''
                const segs = segmentsMap.value.get(aiIndex) || []
                const last = segs[segs.length - 1]
                if (last && last.type === 'agent_thought') {
                  last.content += thoughtText
                } else {
                  currentSegType.value.set(aiIndex, 'agent_thought')
                  segs.push({ type: 'agent_thought' as const, content: thoughtText })
                  agentThoughtStartTimes.value.set(aiIndex, Date.now())
                }
                segmentsMap.value.set(aiIndex, segs)
                // 合并 segments + thinkingContent 更新
                batchMessagesUpdate(msgs => {
                  if (msgs[aiIndex]) {
                    const updated = [...msgs]
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      segments: segs.map(s => ({ ...s })),
                      thinkingContent: (updated[aiIndex].thinkingContent || '') + thoughtText,
                      status: STATUS.THINKING,
                    }
                    return updated
                  }
                  return msgs
                })
                break
              }

              case 'think_message': {
                const thinkingText = chunk.thinking || chunk.answer || chunk.text || ''
                const segs = segmentsMap.value.get(aiIndex) || []
                const last = segs[segs.length - 1]
                if (last && last.type === 'thinking') {
                  last.content += thinkingText
                } else {
                  segs.push({ type: 'thinking' as const, content: thinkingText })
                  thinkingStartTimes.value.set(aiIndex, Date.now())
                }
                segmentsMap.value.set(aiIndex, segs)
                // 合并 segments + thinkingContent 更新
                batchMessagesUpdate(msgs => {
                  if (msgs[aiIndex]) {
                    const updated = [...msgs]
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      segments: segs.map(s => ({ ...s })),
                      thinkingContent: (updated[aiIndex].thinkingContent || '') + thinkingText,
                      status: STATUS.THINKING,
                    }
                    return updated
                  }
                  return msgs
                })
                break
              }

              case 'agent_thought_end': {
                const startTime = agentThoughtStartTimes.value.get(aiIndex)
                const duration = startTime
                  ? Math.round(((Date.now() - startTime) / 1000) * 10) / 10
                  : 0
                const segs = segmentsMap.value.get(aiIndex) || []
                const last = segs[segs.length - 1]
                if (last && last.type === 'agent_thought') {
                  last.duration = duration
                }
                segmentsMap.value.set(aiIndex, segs)
                batchMessagesUpdate(msgs => {
                  if (msgs[aiIndex]) {
                    const updated = [...msgs]
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      segments: segs.map(s => ({ ...s })),
                      thinkingDuration: (updated[aiIndex].thinkingDuration || 0) + duration,
                    }
                    return updated
                  }
                  return msgs
                })
                break
              }

              case 'think_message_output_end': {
                const startTime = thinkingStartTimes.value.get(aiIndex)
                const duration = startTime
                  ? Math.round(((Date.now() - startTime) / 1000) * 10) / 10
                  : 0
                const segs = segmentsMap.value.get(aiIndex) || []
                const last = segs[segs.length - 1]
                if (last && last.type === 'thinking') {
                  last.duration = duration
                }
                segmentsMap.value.set(aiIndex, segs)
                batchMessagesUpdate(msgs => {
                  if (msgs[aiIndex]) {
                    const updated = [...msgs]
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      segments: segs.map(s => ({ ...s })),
                      thinkingDuration: (updated[aiIndex].thinkingDuration || 0) + duration,
                    }
                    return updated
                  }
                  return msgs
                })
                break
              }

              case 'tool_message': {
                const toolText = chunk.answer || chunk.text || chunk.content || ''
                if (!toolText) break
                const segs = segmentsMap.value.get(aiIndex) || []
                segs.push({ type: 'answer' as const, content: toolText })
                segmentsMap.value.set(aiIndex, segs)
                syncSegments(aiIndex)
                break
              }

              case 'message_output_start':
                currentSegType.value.set(aiIndex, 'answer')
                // 回答开始 = 前序未结束的思考阶段结束
                closeOpenThinking(aiIndex)
                break

              case 'message': {
                const answerText = chunk.answer || ''
                const curType = currentSegType.value.get(aiIndex)
                const segs = segmentsMap.value.get(aiIndex) || []
                const last = segs[segs.length - 1]

                if (curType === 'answer' && last && last.type === 'answer') {
                  last.content += answerText
                } else {
                  // 即将新建 answer segment —— 先关闭未结束的 thinking（兜底，防后端不发 message_output_start）
                  closeOpenThinking(aiIndex)
                  currentSegType.value.set(aiIndex, 'answer')
                  segs.push({ type: 'answer' as const, content: answerText })
                }
                segmentsMap.value.set(aiIndex, segs)

                // 合并 segments + content + status 更新
                const fullContent = segs.filter(s => s.type === 'answer').map(s => s.content).join('')
                batchMessagesUpdate(msgs => {
                  if (msgs[aiIndex]) {
                    const updated = [...msgs]
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      segments: segs.map(s => ({ ...s })),
                      content: fullContent,
                      status: issTop.value ? STATUS.STOP : STATUS.ANSWERING,
                    }
                    return updated
                  }
                  return msgs
                })
                break
              }

              case 'message_end': {
                flushMessagesBatch()
                const msgs = [...messages.value]
                if (msgs[aiIndex]) {
                  msgs[aiIndex] = { ...msgs[aiIndex], status: issTop.value ? STATUS.STOP : STATUS.COMPLETED }
                }
                messages.value = msgs
                isGenerating.value = false
                break
              }

              case 'agent_error':
              case 'message_failed': {
                flushMessagesBatch()
                const msgs = [...messages.value]
                if (msgs[aiIndex]) {
                  msgs[aiIndex] = {
                    ...msgs[aiIndex],
                    status: STATUS.ERROR,
                    content: chunk.error_msg || chunk.message || '请求失败',
                    errorMessage: chunk.error_msg || chunk.message || '请求失败',
                  }
                  messages.value = msgs
                }
                isGenerating.value = false
                break
              }

              case 'message_replace': {
                const replaceText = chunk.answer || ''
                const segs = segmentsMap.value.get(aiIndex) || []
                const lastAnswerIdx = segs.map((s, i) => ({ s, i })).reverse().find(x => x.s.type === 'answer')?.i
                if (lastAnswerIdx != null) {
                  segs[lastAnswerIdx] = { ...segs[lastAnswerIdx], content: replaceText }
                } else {
                  segs.push({ type: 'answer' as const, content: replaceText })
                }
                segmentsMap.value.set(aiIndex, segs)
                batchMessagesUpdate(msgs => {
                  if (msgs[aiIndex]) {
                    const updated = [...msgs]
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      segments: segs.map(s => ({ ...s })),
                      content: replaceText,
                    }
                    return updated
                  }
                  return msgs
                })
                break
              }

              case 'message_cost': {
                const cost: MessageCost = {
                  inputTokens: chunk.input_tokens || 0,
                  outputTokens: chunk.output_tokens || 0,
                  latency: chunk.latency || 0,
                  latencyFirstResp: chunk.latency_first_resp,
                }
                batchMessagesUpdate(msgs => {
                  if (msgs[aiIndex]) {
                    const updated = [...msgs]
                    updated[aiIndex] = { ...updated[aiIndex], cost }
                    return updated
                  }
                  return msgs
                })
                break
              }

              default:
            }
          } catch (e) {
            console.error('[ai-assist-sdk] onmessage 解析失败:', e)
          }
        },
        onclose() {
          flushMessagesBatch()
          // 连接关闭时，关闭尚未结束的 thinking segment（防止中断后卡在"思考中"）
          closeOpenThinking(aiIndex)
          flushMessagesBatch()
          const segs = segmentsMap.value.get(aiIndex) || []
          const fullContent = segs.filter(s => s.type === 'answer').map(s => s.content).join('')
          const msgs = [...messages.value]
          if (msgs[aiIndex] && msgs[aiIndex].status !== STATUS.ERROR) {
            msgs[aiIndex] = {
              ...msgs[aiIndex],
              content: issTop.value && !fullContent ? '已停止回答' : fullContent,
              status: issTop.value ? STATUS.STOP : STATUS.COMPLETED,
            }
          }
          messages.value = msgs
          isGenerating.value = false
        },
        onerror(err) {
          console.error('[ai-assist-sdk] ❌ 连接错误:', err)
          flushMessagesBatch()
          const msgs = [...messages.value]
          if (msgs[aiIndex]) {
            msgs[aiIndex] = { ...msgs[aiIndex], content: '\n⚠️ 请求异常，已终止', status: STATUS.ERROR }
          }
          messages.value = msgs
          isGenerating.value = false
        },
      })
    } catch (err) {
      console.error('[ai-assist-sdk] doStreamRequest error:', err)
      if (!issTop.value) {
        flushMessagesBatch()
        const msgs = [...messages.value]
        if (msgs[aiIndex]) {
          msgs[aiIndex] = { ...msgs[aiIndex], content: '服务连接失败，请稍后重试', status: STATUS.ERROR }
        }
        messages.value = msgs
        isGenerating.value = false
      }
    }
  }

  return { doStreamRequest, issTop }
}
