<template>
  <div>
    <!-- AI Panel -->
    <div
      v-if="isAi"
      :class="['ai-panel', screenStatus ? 'maxWrap' : 'minWrap', panelPositionClass]"
    >
      <div class="header">
        <p>
          <span
            v-if="viewStatus === 'info' || viewStatus === 'history'"
            :class="['back', backPosition]"
            @click="viewStatus = 'answer'"
          >
            <span style="font-size: 18px">←</span>
          </span>
          <img v-else :src="sparkleImg" />
          <!-- <img v-else :src="sparkleImg" @click="viewStatus = 'info'" /> -->
        </p>
        <div class="header-title">
          <span>{{ viewStatus === 'info' ? '个人信息' : viewStatus === 'history' ? '历史信息' : cfg.name }}</span>
        </div>
        <p>
          <PlusOutlined v-show="showNewChat" class="op-icon" @click="handleNewConversation" />
          <!-- <img :src="historyImg" class="mute" @click="viewStatus = 'history'" /> -->
          <img @click="screenStatus = !screenStatus" :src="screenStatus ? amplifysImg : amplifyImg" />
          <img @click="isAi = false" :src="closeImg" />
        </p>
      </div>

      <Answer
        v-if="viewStatus === 'answer'"
        ref="answerRef"
        :defaultSayhello="cfg.defaultSayhello"
        :defaultRecommend="cfg.defaultRecommend"
      />
      <History
        v-if="viewStatus === 'history'"
        @history-detail="handleHistoryDetail"
        @new-answer="viewStatus = 'answer'"
      />
      <Info v-if="viewStatus === 'info'" />

      <!-- Edit Title Popup -->
      <div class="setTitle" v-show="titleShow">
        <div class="content">
          <div class="main">
            <p class="title">修改标题</p>
            <textarea v-model="title" placeholder="请输入新标题" />
            <p class="btn">
              <span @click="titleShow = false">取消</span>
              <span @click="sureEditTitle">确定</span>
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Character -->
    <div
      v-if="!isAi"
      :class="['character', { dragging: isDragging, recycling: isRecycling }]"
      :style="characterStyle"
      @mousedown="startDrag"
      @touchstart="startDrag"
      @click="handleCharacterClick"
    >
      <img :src="characterImg" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import Answer from './Answer.vue'
import History from './History.vue'
import Info from './Info.vue'
import { getConfig } from '@/core/services/request'
import type { ViewStatus } from '@/core/types'
import {PlusOutlined} from "@ant-design/icons-vue"
import sparkleImg from '@/assets/image/sparkle.png'
import historyImg from '@/assets/image/history.png'
import amplifyImg from '@/assets/image/amplify.png'
import amplifysImg from '@/assets/image/amplifys.png'
import closeImg from '@/assets/image/close.png'
import characterImg from '@/assets/image/character.png'

const CHAR_WIDTH = 117
const CHAR_HEIGHT = 118
const HALF_CHAR_WIDTH = CHAR_WIDTH / 2

const cfg = getConfig()

const isAi = ref(false)
const screenStatus = ref(false)
const viewStatus = ref<ViewStatus>('answer')
const titleShow = ref(false)
const title = ref('')
const titleContent = ref('')

const characterPosition = reactive({
  x: window.innerWidth - HALF_CHAR_WIDTH,
  y: window.innerHeight / 2 - CHAR_HEIGHT / 2,
})
const isDragging = ref(false)
const isRecycling = ref(false)
const panelPosition = ref<'left' | 'right' | 'center'>('right')
const backPosition = ref<'left' | 'right'>('left')

const dragStart = reactive({ x: 0, y: 0 })
const hasDragged = ref(false)
const answerRef = ref<InstanceType<typeof Answer> | null>(null)
let resizeTimer: ReturnType<typeof setTimeout> | null = null

const hoverDirection = computed(() => {
  const screenCenter = window.innerWidth / 2
  const charCenterX = characterPosition.x + HALF_CHAR_WIDTH
  return charCenterX < screenCenter ? 5 : -5
})

const panelPositionClass = computed(() => screenStatus.value ? '' : `panel-${panelPosition.value}`)

const showNewChat = computed(() => !answerRef.value?.isEmptyConversation)

const characterStyle = computed(() => ({
  left: `${characterPosition.x}px`,
  top: `${characterPosition.y}px`,
  transition: isDragging.value ? 'none' : 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
  '--direction': String(hoverDirection.value),
}))

function updatePanelPosition() {
  const screenCenter = window.innerWidth / 2
  const charCenterX = characterPosition.x + HALF_CHAR_WIDTH
  if (charCenterX < screenCenter) {
    panelPosition.value = 'left'
    backPosition.value = 'right'
  } else {
    panelPosition.value = 'right'
    backPosition.value = 'left'
  }
}

function recyclePosition() {
  const screenWidth = window.innerWidth
  const targetY = Math.max(0, Math.min(characterPosition.y, window.innerHeight - CHAR_HEIGHT))
  const charCenterX = characterPosition.x + HALF_CHAR_WIDTH
  const targetX = charCenterX >= screenWidth / 2
    ? screenWidth - HALF_CHAR_WIDTH
    : -HALF_CHAR_WIDTH
  return { x: targetX, y: targetY }
}

function doRecycleAnimation() {
  isRecycling.value = true
  const targetPos = recyclePosition()
  characterPosition.x = targetPos.x
  characterPosition.y = targetPos.y
  setTimeout(() => {
    isRecycling.value = false
    updatePanelPosition()
    saveCharacterPosition()
  }, 400)
}

function saveCharacterPosition() {
  try {
    localStorage.setItem('characterPosition', JSON.stringify({ x: characterPosition.x, y: characterPosition.y }))
    localStorage.setItem('panelPosition', panelPosition.value)
    localStorage.setItem('backPosition', backPosition.value)
  } catch {}
}

function loadCharacterPosition() {
  const savedPosition = localStorage.getItem('characterPosition')
  if (savedPosition) {
    const position = JSON.parse(savedPosition)
    characterPosition.x = position.x
    characterPosition.y = Math.min(Math.max(position.y, 0), window.innerHeight - CHAR_HEIGHT)
  } else {
    characterPosition.x = window.innerWidth - HALF_CHAR_WIDTH
    characterPosition.y = window.innerHeight / 2 - CHAR_HEIGHT / 2
  }
  const savedPanelPosition = localStorage.getItem('panelPosition')
  const savedBackPosition = localStorage.getItem('backPosition')
  if (savedPanelPosition) panelPosition.value = savedPanelPosition as any
  if (savedBackPosition) backPosition.value = savedBackPosition as any
}

function handleMouseMove(e: MouseEvent | TouchEvent) {
  if (!isDragging.value) return
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
  const newX = clientX - dragStart.x
  const newY = Math.max(0, Math.min(clientY - dragStart.y, window.innerHeight - CHAR_HEIGHT))
  const dx = Math.abs(newX - characterPosition.x)
  const dy = Math.abs(newY - characterPosition.y)
  if (dx + dy > 5) hasDragged.value = true
  characterPosition.x = newX
  characterPosition.y = newY
}

function handleMouseUp() {
  if (isDragging.value) {
    isDragging.value = false
    if (hasDragged.value) {
      doRecycleAnimation()
      hasDragged.value = false
    }
  }
}

function startDrag(e: MouseEvent | TouchEvent) {
  isRecycling.value = false
  isDragging.value = true
  hasDragged.value = false
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
  dragStart.x = clientX - characterPosition.x
  dragStart.y = clientY - characterPosition.y
}

function handleCharacterClick() {
  if (!hasDragged.value && !isRecycling.value) {
    updatePanelPosition()
    isAi.value = true
  } else {
    hasDragged.value = false
  }
}

function handleHistoryDetail(appConversationId: string) {
  viewStatus.value = 'answer'
  nextTick(() => {
    answerRef.value?.goHistoryMessage(appConversationId)
  })
}

function handleNewConversation() {
  viewStatus.value = 'answer'
  nextTick(() => {
    answerRef.value?.createNewConversation()
  })
}

function sureEditTitle() {
  titleContent.value = title.value
  titleShow.value = false
}

watch(screenStatus, (val) => {
  if (val) {
    panelPosition.value = 'center'
  } else {
    updatePanelPosition()
  }
})

onMounted(() => {
  loadCharacterPosition()
})

// Resize handler
function handleResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => doRecycleAnimation(), 100)
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (resizeTimer) clearTimeout(resizeTimer)
})

// Drag events
onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('touchmove', handleMouseMove, { passive: true } as any)
  document.addEventListener('mouseup', handleMouseUp)
  document.addEventListener('touchend', handleMouseUp)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('touchmove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  document.removeEventListener('touchend', handleMouseUp)
})
</script>
