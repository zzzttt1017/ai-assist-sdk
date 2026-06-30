import { ref, nextTick, type Ref } from 'vue'

/**
 * 聊天容器滚动状态管理
 * - isAtBottom: 用户是否滚动到底部
 * - hasScroll: 容器是否出现滚动条
 */
export function useScrollManager(chatBoxRef: Ref<HTMLElement | null>) {
  const isAtBottom = ref(true)
  const hasScroll = ref(false)

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

  return { isAtBottom, hasScroll, scrollToBottom, checkScrollStatus }
}
