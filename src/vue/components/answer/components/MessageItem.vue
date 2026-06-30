<template>
  <div :class="['message', `${msg.type}-message`]">
    <template v-if="msg.type === 'ai'">
      <!-- 思考中（无内容时的 loading 动画） -->
      <div
        v-if="(msg.status === STATUS.THINKING || msg.status === STATUS.RETHINKING) && !msg.thinkingContent && !msg.content"
        class="message-content ba-markdown"
      >
        <div class="scale-animation-container">
          <span class="scale-dot" />
          <span class="scale-dot" />
          <span class="scale-dot" />
          <span class="scale-dot" />
        </div>
      </div>

      <!-- segments 分段渲染 -->
      <div
        v-if="msg.segments && msg.segments.length"
        class="message-content ba-markdown"
        :ref="(el: any) => setMessageRef(el, index)"
      >
        <template v-for="(seg, segIdx) in msg.segments" :key="segIdx">
          <!-- 智能体 / 工具调用状态 -->
          <div
            v-if="seg.type === 'agent_thought'"
            class="agent-thought"
            :class="{ 'agent-thought--done': seg.duration != null }"
          >
            <span class="agent-thought__spinner">
              <SearchOutlined />
            </span>
            <span class="agent-thought__text">
              {{ seg.duration != null ? '工具调用' : '工具调用中...' }}
            </span>
            <!-- <span v-if="seg.duration != null" class="agent-thought__duration">{{ formatDuration(seg.duration) }}</span> -->
          </div>
          <!-- 深度思考分段 -->
          <div
            v-else-if="seg.type === 'thinking'"
            class="thinking-block"
            :class="{
              'thinking-block--expanded': expanded.get(segIdx) === true,
              'thinking-block--active': seg.duration == null,
            }"
          >
            <div class="thinking-block__header" @click="toggleThinking(segIdx)">
              <span class="thinking-block__indicator" />

              <span class="thinking-block__title">
                {{ seg.duration != null ? '深度思考' : '深度思考中' }}
              </span>
              <!-- <span v-if="seg.duration != null" class="thinking-block__duration">{{ formatDuration(seg.duration) }}</span> -->
              <svg
                class="thinking-block__arrow"
                :class="{ 'thinking-block__arrow--down': expanded.get(segIdx) === true }"
                viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <Transition name="thinking-expand">
              <div v-if="expanded.get(segIdx) === true" class="thinking-block__content">
                {{ seg.content }}
              </div>
            </Transition>
          </div>
          <!-- 回答分段 -->
          <div v-else>
            <div v-html="renderMarkdown(preprocessStreamingMarkdown(getSegmentDisplayContent(index, segIdx, seg, msg)))" />
          </div>
        </template>
        <span v-if="msg.status === STATUS.ANSWERING" class="streaming-cursor" />
      </div>

      <!-- 兜底：无 segments 但有 content -->
      <div
        v-if="!msg.segments?.length && msg.content"
        class="message-content ba-markdown"
        :ref="(el: any) => setMessageRef(el, index)"
      >
        <div v-html="renderMarkdown(preprocessStreamingMarkdown(displayedContent.get(index) ?? msg.content))" />
        <span v-if="msg.status === STATUS.ANSWERING" class="streaming-cursor" />
      </div>

      <!-- 错误信息 -->
      <div v-if="msg.errorMessage" class="message-error">
        <span class="message-error__icon">⚠️</span>
        <span>{{ msg.errorMessage }}</span>
      </div>

      <!-- 消费信息（仅在非流式/非思考状态下展示） -->
      <div
        v-if="msg.cost && msg.status !== STATUS.ANSWERING && msg.status !== STATUS.THINKING"
        class="message-cost"
      >
        {{ formatCostText(msg.cost) }}
      </div>

      <div class="status-indicator">
        <span @click="copyContent(msg)">{{ statusText(msg.status) }}</span>
      </div>
    </template>

    <!-- 用户消息 -->
    <div v-else class="message-content">{{ msg.content }}</div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { renderMarkdown, preprocessStreamingMarkdown, statusText, useClipboard } from '@/core/utils'
import type { ChatMessage, MessageCost, MessageSegment, MessageStatus } from '@/core/types'
import { SearchOutlined } from "@ant-design/icons-vue"
const props = defineProps<{
  msg: ChatMessage
  index: number
  STATUS: Record<string, MessageStatus>
  displayedContent: Map<number, string>
  getSegmentDisplayContent: (msgIdx: number, segIdx: number, seg: MessageSegment, msg: ChatMessage) => string
  setMessageRef: (el: any, idx: number) => void
}>()

// 思考区块展开状态（默认展开，按 segIdx 管理）
const expanded = reactive(new Map<number, boolean>())

function toggleThinking(segIdx: number) {
  expanded.set(segIdx, expanded.get(segIdx) !== true)
}

/** 将秒数格式化为人类可读的耗时文案 */
function formatDuration(duration?: number): string {
  if (duration == null || duration <= 0) return ''
  if (duration < 1) return `${Math.round(duration * 1000)}ms`
  if (duration < 60) return `${duration.toFixed(1)}s`
  return `${Math.floor(duration / 60)}m${Math.round(duration % 60)}s`
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

function copyContent(msg: ChatMessage) {
  try {
    const { copy } = useClipboard()
    copy(msg.content)
  } catch {}
}
</script>
