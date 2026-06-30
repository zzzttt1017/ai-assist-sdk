import { reactive, ref, type Ref } from 'vue'
import type { ChatMessage, MessageSegment, MessageStatus } from '@/core/types'

/**
 * 打字机效果：对正在流式输出（ANSWERING）的 AI 消息做逐字/渐进显示动画。
 *
 * - displayedContent: 每条 AI 消息当前已渲染的内容（可能是 content 的子串）
 * - streamingIndexRef: 每条消息已显示到的字符位置
 * - getSegmentDisplayContent: 对 segments 模式下最后一个 answer segment 应用打字机截断
 *
 * @param messages    消息列表 ref
 * @param scrollToBottom  滚动到底部回调（打字机推进时调用）
 * @param ANSWERING   流式回答中的状态值
 */
export function useTypewriter(
  messages: Ref<ChatMessage[]>,
  scrollToBottom: () => void,
  ANSWERING: MessageStatus,
) {
  const displayedContent = reactive(new Map<number, string>())
  const streamingIndexRef = ref(new Map<number, number>())
  let typewriterRaf = 0
  let typewriterLastTime = 0

  /** 启动/重启打字机动画循环 */
  function startTypewriter() {
    if (typewriterRaf) return // 已在运行

    const TICK_MS = 16   // ~60fps
    const BASE_SPEED = 1 // 每帧最少 1 字（逐字效果）
    const MAX_SPEED = 40 // 每帧最多 40 字

    const tick = (time: number) => {
      if (time - typewriterLastTime >= TICK_MS) {
        typewriterLastTime = time
        let anyActive = false

        messages.value.forEach((msg, idx) => {
          if (msg.type !== 'ai' || msg.status !== ANSWERING) return
          const target = msg.content
          const currentIdx = streamingIndexRef.value.get(idx) ?? 0
          const remaining = target.length - currentIdx

          if (remaining > 0) {
            anyActive = true
            const speed = remaining > 15
              ? Math.min(Math.ceil(remaining * 0.3), MAX_SPEED)
              : BASE_SPEED
            const newIdx = Math.min(currentIdx + speed, target.length)
            streamingIndexRef.value.set(idx, newIdx)
            displayedContent.set(idx, target.slice(0, newIdx))
          }
        })

        // 有活跃流式消息时滚动到底部
        if (anyActive) scrollToBottom()

        // 如果没有任何正在流式输出的消息，停止动画循环
        const hasStreaming = messages.value.some(m => m.type === 'ai' && m.status === ANSWERING)
        if (!hasStreaming) {
          typewriterRaf = 0
          return
        }
      }
      typewriterRaf = requestAnimationFrame(tick)
    }

    typewriterRaf = requestAnimationFrame(tick)
  }

  /** 停止打字机并立即将所有流式消息显示完整内容 */
  function flushTypewriter() {
    if (typewriterRaf) {
      cancelAnimationFrame(typewriterRaf)
      typewriterRaf = 0
    }
    messages.value.forEach((msg, idx) => {
      if (msg.type === 'ai') {
        displayedContent.set(idx, msg.content)
        streamingIndexRef.value.set(idx, msg.content.length)
      }
    })
  }

  /** 停止 RAF 循环（组件卸载时调用） */
  function stopTypewriter() {
    if (typewriterRaf) {
      cancelAnimationFrame(typewriterRaf)
      typewriterRaf = 0
    }
  }

  /** 获取 segment 级别的显示内容（最后一个 answer segment 应用打字机效果） */
  function getSegmentDisplayContent(msgIdx: number, segIdx: number, seg: MessageSegment, msg: ChatMessage): string {
    if (seg.type !== 'answer' || msg.status !== ANSWERING) return seg.content

    const segs = msg.segments || []
    // 检查后面是否还有 answer segment
    const hasLaterAnswer = segs.slice(segIdx + 1).some(s => s.type === 'answer')
    if (hasLaterAnswer) return seg.content // 不是最后一个 answer segment，完全显示

    // 这是最后一个 answer segment 且正在流式输出 — 应用打字机
    const displayIdx = streamingIndexRef.value.get(msgIdx)
    if (displayIdx == null) return seg.content

    // 计算此 segment 在完整 content 中的字符偏移
    let offset = 0
    for (let i = 0; i < segIdx; i++) {
      if (segs[i].type === 'answer') offset += segs[i].content.length
    }

    const segEnd = offset + seg.content.length
    if (displayIdx >= segEnd) return seg.content  // 已完全显示
    if (displayIdx <= offset) return ''            // 尚未开始显示

    return seg.content.slice(0, displayIdx - offset)
  }

  return { displayedContent, streamingIndexRef, startTypewriter, flushTypewriter, getSegmentDisplayContent, stopTypewriter }
}
