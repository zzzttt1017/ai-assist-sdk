<template>
  <div class="container">
    <div class="chat-box scrollWrap" ref="chatBoxRef">
      <!-- Greeting -->
      <div class="message ai-message greet-message">
        <div class="ai-greet">
          <h1>{{ sayData.text1 }}</h1>
          <p>{{ sayData.text2 }}</p>
        </div>
      </div>

      <!-- Recommendations -->
      <div v-if="currentRecommendations?.length" class="message ai-message recommend-message">
        <div class="ai-recommend">
          <div class="recommend-header">
            <span>你可以尝试这样问我：</span>
            <p class="refresh-btn" @click="refreshRecommendations">
              <img :src="refreshImg" />
              <span>换一换</span>
            </p>
          </div>
          <ul>
            <li v-for="(item, idx) in currentRecommendations" :key="idx" @click="fillInput(item)">{{ item }}</li>
          </ul>
        </div>
      </div>

      <!-- Messages -->
      <div v-for="(msg, idx) in messages" :key="idx" :class="['message', `${msg.type}-message`]">
        <template v-if="msg.type === 'ai'">
          <!-- 思考中（无内容时的 loading 动画） -->
          <div v-if="(msg.status === STATUS.THINKING || msg.status === STATUS.RETHINKING) && !msg.thinkingContent && !msg.content" class="message-content ba-markdown">
            <div class="scale-animation-container">
              <span class="scale-dot" />
              <span class="scale-dot" />
              <span class="scale-dot" />
              <span class="scale-dot" />
            </div>
          </div>
          <!-- segments 分段渲染 -->
          <div v-if="msg.segments && msg.segments.length" class="message-content ba-markdown" :ref="(el: any) => setMessageRef(el, idx)">
            <template v-for="(seg, segIdx) in msg.segments" :key="segIdx">
              <!-- 智能体 / 工具调用状态 -->
              <div v-if="seg.type === 'agent_thought'" class="agent-thought">
                <svg class="agent-thought__icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="16.5" y1="16.5" x2="21" y2="21" />
                </svg>
                <span class="agent-thought__text">
                  {{ seg.duration != null ? '搜索信息完成' : '搜索信息中…' }}
                </span>
              </div>
              <!-- 深度思考分段 -->
              <div v-else-if="seg.type === 'thinking'" class="thinking-block" :class="{ 'thinking-block--expanded': thinkingExpanded.get(`${idx}-${segIdx}`) === true }">
                <div class="thinking-block__header" @click="toggleThinking(idx, segIdx)">
                  <span class="thinking-block__title">
                    {{ seg.duration != null ? '深度思考' : '深度思考中' }}
                  </span>
                  <svg class="thinking-block__arrow" :class="{ 'thinking-block__arrow--down': thinkingExpanded.get(`${idx}-${segIdx}`) === true }" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                <div v-if="thinkingExpanded.get(`${idx}-${segIdx}`) === true" class="thinking-block__content">
                  {{ seg.content }}
                </div>
              </div>
              <!-- 回答分段 -->
              <div v-else>
                <div v-html="renderMarkdown(preprocessStreamingMarkdown(getSegmentDisplayContent(idx, segIdx, seg, msg)))" />
              </div>
            </template>
            <span v-if="msg.status === STATUS.ANSWERING" class="streaming-cursor" />
          </div>
          <!-- 兜底：无 segments 但有 content -->
          <div v-if="!msg.segments?.length && msg.content" class="message-content ba-markdown" :ref="(el: any) => setMessageRef(el, idx)">
            <div v-html="renderMarkdown(preprocessStreamingMarkdown(displayedContent.get(idx) ?? msg.content))" />
            <span v-if="msg.status === STATUS.ANSWERING" class="streaming-cursor" />
          </div>
          <!-- 错误信息 -->
          <div v-if="msg.errorMessage" class="message-error">
            <span class="message-error__icon">⚠️</span>
            <span>{{ msg.errorMessage }}</span>
          </div>
          <!-- 消费信息（仅在非流式/非思考状态下展示） -->
          <div v-if="msg.cost && msg.status !== STATUS.ANSWERING && msg.status !== STATUS.THINKING" class="message-cost">
            {{ formatCostText(msg.cost) }}
          </div>
          <div class="status-indicator">
            <span @click="copyContent(msg)">{{ statusText(msg.status) }}</span>
          </div>
        </template>
        <div v-else class="message-content">{{ msg.content }}</div>
      </div>
    </div>

    <!-- Input -->
    <div class="input-container">
      <div v-if="lastUserMessage" class="tooltip-enhanced" data-tooltip="重新回答">
        <img class="refresh" @click="regenerateResponse" :src="refreshImg" />
      </div>
      <img v-else class="refresh" :src="refreshImg" />

      <input
        v-model="userInput"
        type="text"
        placeholder="输入消息..."
        @keyup.enter="sendMessage"
        :disabled="isGenerating"
      />

      <div v-if="isGenerating && lastUserMessage" class="tooltip-enhanced stop" data-tooltip="停止回答">
        <img :src="startImg" @click="toggleStop" />
      </div>
      <div v-else class="tooltip-enhanced send" data-tooltip="开始回答">
        <img :src="sendImg" @click="sendMessage" />
      </div>

      <div v-if="hasScroll && !isAtBottom" class="moveTB">
        <img @click="scrollToBottom" :src="bottomImg" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, nextTick, watch } from 'vue'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { getConfig, createAuthAxios } from '@/core/services/request'
import { createConversation, stopMessage, getConversationMessages } from '@/core/services/api'
import { useClipboard, statusText, formatQuestions, processSSEData, parseSSEData, preprocessStreamingMarkdown } from '@/core/utils'
import { renderMarkdown } from '@/core/utils/markdown'
import type { ChatMessage, MessageStatus, MessageSegment, MessageCost } from '@/core/types'

import refreshImg from '@/assets/image/refresh.png'
import startImg from '@/assets/image/start.png'
import sendImg from '@/assets/image/send.png'
import bottomImg from '@/assets/image/bottom.png'

const STATUS = {
  THINKING: 'thinking' as MessageStatus,
  RETHINKING: 'rethinking' as MessageStatus,
  ANSWERING: 'answering' as MessageStatus,
  PAUSED: 'paused' as MessageStatus,
  COMPLETED: 'completed' as MessageStatus,
  STOP: 'stop' as MessageStatus,
  ERROR: 'error' as MessageStatus,
}

const props = defineProps<{
  defaultSayhello?: { text1: string; text2: string }
  defaultRecommend?: string[]
}>()

const cfg = getConfig()
const apis = cfg.apis

const messages = ref<ChatMessage[]>([])
const userInput = ref('')
const isGenerating = ref(false)
const lastUserMessage = ref('')
const isAtBottom = ref(true)
const hasScroll = ref(false)
const sayData = reactive({ text1: '', text2: '' })
const recommendations = ref<string[][]>([])
const currentRecIndex = ref(0)

const chatBoxRef = ref<HTMLElement | null>(null)
// 分段内容追踪（支持 think_message / agent_thought / message 穿插）
const segmentsMap = ref(new Map<number, MessageSegment[]>())
const currentSegType = ref(new Map<number, MessageSegment['type']>())
const thinkingStartTimes = ref(new Map<number, number>())
const agentThoughtStartTimes = ref(new Map<number, number>())
const messageRefs = ref(new Map<number, HTMLElement>())
const controllers = reactive({
  first: new AbortController(),
  again: new AbortController(),
})
const issTop = ref(false)
const conversationId = ref('')

// 思考区块展开状态（默认展开）
const thinkingExpanded = reactive(new Map<string, boolean>())

// ── 打字机效果 ──
// 每个 AI 消息的实际内容 vs 已显示内容
const displayedContent = reactive(new Map<number, string>())
const streamingIndexRef = ref(new Map<number, number>()) // 每条消息已显示到的字符位置
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
        if (msg.type !== 'ai' || msg.status !== STATUS.ANSWERING) return
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
      const hasStreaming = messages.value.some(m => m.type === 'ai' && m.status === STATUS.ANSWERING)
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

/** 获取 segment 级别的显示内容（最后一个 answer segment 应用打字机效果） */
function getSegmentDisplayContent(msgIdx: number, segIdx: number, seg: MessageSegment, msg: ChatMessage): string {
  if (seg.type !== 'answer' || msg.status !== STATUS.ANSWERING) return seg.content

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

// ── RAF 批量更新：将同一帧内的多次 messages.value 赋值合并为一次 ──
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

/** 立即刷出所有待处理的批量更新（用于终止状态） */
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

const currentRecommendations = computed(() =>
  recommendations.value[currentRecIndex.value % (recommendations.value.length || 1)]
)

function getStreamApi() {
  return apis.chatQueryStreamApi || apis.chatQueryApi
}

function getAgainStreamApi() {
  return apis.queryAgainStreamApi || apis.queryAgainApi || apis.chatQueryStreamApi || apis.chatQueryApi
}

function scrollToBottom() {
  nextTick(() => {
    if (chatBoxRef.value) {
      chatBoxRef.value.scrollTop = chatBoxRef.value.scrollHeight
    }
  })
}

function checkScrollStatus() {
  if (!chatBoxRef.value) return
  const container = chatBoxRef.value
  const bottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1
  const hasBar = container.scrollHeight > container.clientHeight
  isAtBottom.value = bottom
  hasScroll.value = hasBar
}

function refreshRecommendations() {
  currentRecIndex.value++
}

function fillInput(text: string) {
  userInput.value = text
}

function copyContent(msg: ChatMessage) {
  try {
    const { copy } = useClipboard()
    copy(msg.content)
  } catch {}
}

/** 收集每个 AI 消息容器的 DOM 引用 */
function setMessageRef(el: any, idx: number) {
  if (el) {
    messageRefs.value.set(idx, el as HTMLElement)
  } else {
    messageRefs.value.delete(idx)
  }
}

/** 为代码块添加语言标签和复制按钮 */
function enhanceCodeBlocks(container: HTMLElement) {
  const pres = container.querySelectorAll('pre')
  pres.forEach((pre) => {
    // 避免重复增强
    if (pre.querySelector('.copy-button')) return
    const code = pre.querySelector('code')
    if (!code) return

    // 提取语言
    const langClass = Array.from(code.classList).find(c => c.startsWith('language-')) || ''
    const language = langClass.replace('language-', '')
    if (language) {
      const langSpan = document.createElement('span')
      langSpan.className = 'code-lang'
      langSpan.textContent = language
      pre.appendChild(langSpan)
    }

    // 添加复制按钮
    const btn = document.createElement('button')
    btn.className = 'copy-button'
    btn.textContent = '复制'
    btn.onclick = () => {
      navigator.clipboard.writeText(code.textContent || '').then(() => {
        btn.textContent = '已复制'
        setTimeout(() => { btn.textContent = '复制' }, 2000)
      })
    }
    pre.appendChild(btn)
  })
}

function extractContent(data: any): string {
  if (typeof data === 'string') {
    const sse = processSSEData(data)
    return parseSSEData(sse) || data
  }
  return data?.answer || data?.data?.answer || String(data || '')
}

function formatThinkingDuration(duration?: number): string {
  if (duration == null || duration <= 0) return ''
  if (duration >= 60) {
    return `${Math.floor(duration / 60)}分${(duration % 60).toFixed(1)}秒`
  }
  if (duration < 1) return `${(duration * 1000).toFixed(0)}毫秒`
  return `${duration.toFixed(1)}秒`
}

function formatCostText(cost: MessageCost): string {
  const parts: string[] = []
  if (cost.inputTokens > 0) parts.push(`输入 ${cost.inputTokens} tokens`)
  if (cost.outputTokens > 0) parts.push(`输出 ${cost.outputTokens} tokens`)
  const latencyText = cost.latency >= 1
    ? `${cost.latency.toFixed(1)}s`
    : `${Math.round(cost.latency * 1000)}ms`
  parts.push(`耗时 ${latencyText}`)
  return parts.join(' · ')
}

function toggleThinking(msgIdx: number, segIdx: number) {
  const key = `${msgIdx}-${segIdx}`
  thinkingExpanded.set(key, thinkingExpanded.get(key) !== true)
}

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
      async onopen(res) {
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
              break

            case 'message': {
              const answerText = chunk.answer || ''
              const curType = currentSegType.value.get(aiIndex)
              const segs = segmentsMap.value.get(aiIndex) || []
              const last = segs[segs.length - 1]

              if (curType === 'answer' && last && last.type === 'answer') {
                last.content += answerText
              } else {
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
  await doStreamRequest(getAgainStreamApi(), {
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

defineExpose({ goHistoryMessage })

// 消息变化时：启动打字机 + 增强代码块
watch(messages, () => {
  nextTick(() => {
    // 对已完成的 AI 消息，直接显示完整内容
    messages.value.forEach((msg, idx) => {
      if (msg.type === 'ai' && msg.status !== STATUS.ANSWERING) {
        displayedContent.set(idx, msg.content)
        streamingIndexRef.value.set(idx, msg.content.length)
      }
    })
    // 启动打字机动画（如果仍有流式消息）
    startTypewriter()
    // 增强代码块
    messageRefs.value.forEach((el) => {
      enhanceCodeBlocks(el)
    })
  })
}, { deep: true })

// 组件销毁时清理
onUnmounted(() => {
  if (typewriterRaf) {
    cancelAnimationFrame(typewriterRaf)
    typewriterRaf = 0
  }
  if (chatBoxRef.value && scrollHandler) {
    chatBoxRef.value.removeEventListener('scroll', scrollHandler)
  }
})

onMounted(() => {
  if (props.defaultSayhello) {
    sayData.text1 = props.defaultSayhello.text1
    sayData.text2 = props.defaultSayhello.text2
  }
  if (props.defaultRecommend) {
    recommendations.value = formatQuestions(props.defaultRecommend)
  }
})

onMounted(async () => {
  const result = await createConversation(apis)
  if (result?.conversation?.appConversationID) {
    conversationId.value = result.conversation.appConversationID
  }
})

let scrollHandler: (() => void) | null = null
onMounted(() => {
  if (chatBoxRef.value) {
    scrollHandler = () => checkScrollStatus()
    chatBoxRef.value.addEventListener('scroll', scrollHandler)
  }
})
</script>
