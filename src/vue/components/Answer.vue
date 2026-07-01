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
      <MessageItem
        v-for="(msg, idx) in messages"
        :key="idx"
        :msg="msg"
        :index="idx"
        :STATUS="STATUS"
        :displayedContent="displayedContent"
        :getSegmentDisplayContent="getSegmentDisplayContent"
        :setMessageRef="setMessageRef"
      />
    </div>

    <!-- Input -->
    <ChatInput
      v-model="userInput"
      :isGenerating="isGenerating"
      :lastUserMessage="lastUserMessage"
      :hasScroll="hasScroll"
      :isAtBottom="isAtBottom"
      @send="sendMessage"
      @regenerate="regenerateResponse"
      @stop="toggleStop"
      @scroll-to-bottom="scrollToBottom"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, nextTick, watch } from 'vue'
import { getConfig } from '@/core/services/request'
import { formatQuestions } from '@/core/utils'
import type { ChatMessage, MessageStatus } from '@/core/types'

import refreshImg from '@/assets/image/refresh.png'
import MessageItem from './answer/components/MessageItem.vue'
import ChatInput from './answer/components/ChatInput.vue'
import { useScrollManager } from './answer/composables/useScrollManager'
import { useCodeBlocks } from './answer/composables/useCodeBlocks'
import { useMessagesBatch } from './answer/composables/useMessagesBatch'
import { useTypewriter } from './answer/composables/useTypewriter'
import { useSSEStream } from './answer/composables/useSSEStream'
import { useChatActions } from './answer/composables/useChatActions'

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

// ── 核心状态 ──
const messages = ref<ChatMessage[]>([])
const userInput = ref('')
const isGenerating = ref(false)
const lastUserMessage = ref('')
const conversationId = ref('')
const chatBoxRef = ref<HTMLElement | null>(null)

// ── 问候 & 推荐 ──
const sayData = reactive({ text1: '', text2: '' })
const recommendations = ref<string[][]>([])
const currentRecIndex = ref(0)
const currentRecommendations = computed(() =>
  recommendations.value[currentRecIndex.value % (recommendations.value.length || 1)]
)

function refreshRecommendations() {
  currentRecIndex.value++
}

function fillInput(text: string) {
  userInput.value = text
}

// ── 组合 composables ──
const { isAtBottom, hasScroll, scrollToBottom, checkScrollStatus } = useScrollManager(chatBoxRef)
const { enhanceCodeBlocks } = useCodeBlocks()
const { batchMessagesUpdate, flushMessagesBatch } = useMessagesBatch(messages)
const { displayedContent, streamingIndexRef, startTypewriter, stopTypewriter, getSegmentDisplayContent } = useTypewriter(
  messages,
  scrollToBottom,
  STATUS.ANSWERING,
)
const { doStreamRequest, issTop } = useSSEStream({
  messages,
  isGenerating,
  lastUserMessage,
  batchMessagesUpdate,
  flushMessagesBatch,
  STATUS,
  cfg,
})
const { sendMessage, regenerateResponse, toggleStop, goHistoryMessage, initConversation } = useChatActions({
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
})

/** 新建对话：清空当前消息并重新创建会话 */
function createNewConversation() {
  messages.value = []
  lastUserMessage.value = ''
  initConversation()
}

/** 是否处于「已在对话中但无任何内容」的状态（用于隐藏新建对话按钮） */
const isEmptyConversation = computed(() => !!conversationId.value && messages.value.length === 0)

defineExpose({ goHistoryMessage, createNewConversation, isEmptyConversation })

// ── DOM 引用收集（供代码块增强使用） ──
const messageRefs = ref(new Map<number, HTMLElement>())

function setMessageRef(el: any, idx: number) {
  if (el) {
    messageRefs.value.set(idx, el as HTMLElement)
  } else {
    messageRefs.value.delete(idx)
  }
}

// ── 消息变化时：启动打字机 + 增强代码块 ──
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

// ── 滚动监听 ──
let scrollHandler: (() => void) | null = null

onMounted(() => {
  if (props.defaultSayhello) {
    sayData.text1 = props.defaultSayhello.text1
    sayData.text2 = props.defaultSayhello.text2
  }
  if (props.defaultRecommend) {
    recommendations.value = formatQuestions(props.defaultRecommend)
  }
})

onMounted(() => {
  initConversation()
})

onMounted(() => {
  if (chatBoxRef.value) {
    scrollHandler = () => checkScrollStatus()
    chatBoxRef.value.addEventListener('scroll', scrollHandler)
  }
})

onUnmounted(() => {
  stopTypewriter()
  if (chatBoxRef.value && scrollHandler) {
    chatBoxRef.value.removeEventListener('scroll', scrollHandler)
  }
})
</script>
