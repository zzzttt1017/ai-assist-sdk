<template>
  <div class="input-container">
    <div v-if="lastUserMessage" class="tooltip-enhanced" data-tooltip="重新回答">
      <img class="refresh" @click="$emit('regenerate')" :src="refreshImg" />
    </div>
    <img v-else class="refresh" :src="refreshImg" />

    <input
      :value="modelValue"
      type="text"
      placeholder="输入消息..."
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keyup.enter="$emit('send')"
      :disabled="isGenerating"
    />

    <div v-if="isGenerating && lastUserMessage" class="tooltip-enhanced stop" data-tooltip="停止回答">
      <img :src="startImg" @click="$emit('stop')" />
    </div>
    <div v-else class="tooltip-enhanced send" data-tooltip="开始回答">
      <img :src="sendImg" @click="$emit('send')" />
    </div>

    <div v-if="hasScroll && !isAtBottom" class="moveTB">
      <img @click="$emit('scroll-to-bottom')" :src="bottomImg" />
    </div>
  </div>
</template>

<script setup lang="ts">
import refreshImg from '@/assets/image/refresh.png'
import startImg from '@/assets/image/start.png'
import sendImg from '@/assets/image/send.png'
import bottomImg from '@/assets/image/bottom.png'

defineProps<{
  modelValue: string
  isGenerating: boolean
  lastUserMessage: string
  hasScroll: boolean
  isAtBottom: boolean
}>()

defineEmits<{
  'update:modelValue': [value: string]
  send: []
  regenerate: []
  stop: []
  'scroll-to-bottom': []
}>()
</script>
