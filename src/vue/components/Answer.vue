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
          <div class="message-content ba-markdown">
            <div v-if="msg.status === STATUS.THINKING || msg.status === STATUS.RETHINKING" class="scale-animation-container">
              <span class="scale-dot" />
              <span class="scale-dot" />
              <span class="scale-dot" />
              <span class="scale-dot" />
            </div>
            <div v-else v-html="renderMarkdown(msg.content)" />
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
import { ref, reactive, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { getConfig, createAuthAxios } from '@/core/services/request'
import { createConversation, stopReply, getConversationMessages } from '@/core/services/api'
import { useClipboard, statusText, formatQuestions, processSSEData, parseSSEData } from '@/core/utils'
import { renderMarkdown } from '@/core/utils/markdown'
import type { ChatMessage, MessageStatus } from '@/core/types'

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
const streamBuffer = ref(new Map<number, string>())
const controllers = reactive({
  first: new AbortController(),
  again: new AbortController(),
})
const issTop = ref(false)
const conversationId = ref('')

const currentRecommendations = computed(() =>
  recommendations.value[currentRecIndex.value % (recommendations.value.length || 1)]
)

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

  const authAxios = createAuthAxios()
  const data = {
    Query: text,
    AppConversationID: conversationId.value,
    AppKey: cfg.appKey,
    QueryExtends: { Files: [] },
  }

  try {
    const res = await authAxios.post(apis.replyApi, data, { headers: { Accept: 'text/html' } })
    const sseData = processSSEData(res.data)
    const contentData = parseSSEData(sseData)
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
  await againSendMessageReply(lastUserMessage.value)
}

async function againSendMessageReply(textID: string) {
  const aiIndex = messages.value.length
  issTop.value = false
  streamBuffer.value.set(aiIndex, '')
  isGenerating.value = true

  try {
    await fetchEventSource(apis.againreplyApi || '', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': sessionStorage.getItem('token') || '',
      },
      body: JSON.stringify({
        app: 1,
        data: {
          MessageID: textID,
          AppConversationID: conversationId.value,
          ResponseMode: 'streaming',
          UserID: sessionStorage.getItem('username') || '',
        },
      }),
      signal: controllers.again.signal,
      openWhenHidden: true,
      onmessage(ev) {
        try {
          const dataStr = ev.data.replace(/^data:data: /, '')
          if (!dataStr) return
          const chunk = JSON.parse(dataStr)
          switch (chunk.event) {
            case 'message_start':
              lastUserMessage.value = chunk.id
              streamBuffer.value.set(aiIndex, '')
              break
            case 'message': {
              const cur = (streamBuffer.value.get(aiIndex) || '') + chunk.answer
              streamBuffer.value.set(aiIndex, cur)
              const msgs = [...messages.value]
              if (msgs[aiIndex]) {
                msgs[aiIndex] = { ...msgs[aiIndex], content: cur, status: issTop.value ? STATUS.STOP : STATUS.ANSWERING }
              }
              messages.value = msgs
              break
            }
            case 'message_end': {
              const msgs = [...messages.value]
              if (msgs[aiIndex]) {
                msgs[aiIndex] = { ...msgs[aiIndex], status: issTop.value ? STATUS.STOP : STATUS.COMPLETED }
              }
              messages.value = msgs
              isGenerating.value = false
              break
            }
          }
        } catch {}
      },
      onclose() {
        const buffer = streamBuffer.value.get(aiIndex) || ''
        const msgs = [...messages.value]
        if (msgs[aiIndex] && msgs[aiIndex].status !== STATUS.ERROR) {
          msgs[aiIndex] = {
            ...msgs[aiIndex],
            content: issTop.value && !buffer ? '停止回答' : buffer,
            status: issTop.value ? STATUS.STOP : STATUS.COMPLETED,
          }
        }
        messages.value = msgs
        isGenerating.value = false
        streamBuffer.value.delete(aiIndex)
      },
      onerror() {
        const msgs = [...messages.value]
        if (msgs[aiIndex]) {
          msgs[aiIndex] = { ...msgs[aiIndex], content: '\n⚠️ 请求异常，已终止', status: STATUS.ERROR }
        }
        messages.value = msgs
        isGenerating.value = false
        streamBuffer.value.delete(aiIndex)
      },
    })
  } catch {
    const msgs = [...messages.value]
    if (msgs[aiIndex]) {
      msgs[aiIndex] = { ...msgs[aiIndex], content: '服务连接失败，请稍后重试', status: STATUS.ERROR }
    }
    messages.value = msgs
  }
}

async function toggleStop() {
  if (!apis.setopreplyApi || !isGenerating.value) return
  const aiIndex = messages.value.length - 1
  try {
    await stopReply(apis, lastUserMessage.value, sessionStorage.getItem('username') || '')
    const msgs = [...messages.value]
    if (msgs[aiIndex]) {
      msgs[aiIndex] = { ...msgs[aiIndex], content: msgs[aiIndex].content || '停止回答', status: STATUS.STOP }
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

// Scroll listener
let scrollHandler: (() => void) | null = null
onMounted(() => {
  if (chatBoxRef.value) {
    scrollHandler = () => checkScrollStatus()
    chatBoxRef.value.addEventListener('scroll', scrollHandler)
  }
})
onUnmounted(() => {
  if (chatBoxRef.value && scrollHandler) {
    chatBoxRef.value.removeEventListener('scroll', scrollHandler)
  }
})
</script>
