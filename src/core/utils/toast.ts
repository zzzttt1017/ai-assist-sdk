/**
 * 框架无关的轻量 Toast 提示。
 *
 * 容器挂载在 #ai-assist-root 下（与 SDK 主作用域一致，避免污染宿主页面），
 * 定位为顶部居中 fixed，自动消失。React / Vue 两端共用。
 */

export type ToastType = 'error' | 'info' | 'success'

const TOAST_DURATION = 3000
const CONTAINER_ID = 'ai-assist-toast-container'

/** 获取挂载容器（懒创建，复用） */
function getContainer(): HTMLElement {
  let container = document.getElementById(CONTAINER_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = CONTAINER_ID
    container.className = 'ai-assist-toast-container'
    const root = document.getElementById('ai-assist-root') || document.body
    root.appendChild(container)
  }
  return container
}

/** 显示一条 toast 提示 */
export function showToast(message: string, type: ToastType = 'error'): void {
  if (!message) return

  const container = getContainer()
  const toast = document.createElement('div')
  toast.className = `ai-assist-toast ai-assist-toast--${type}`
  toast.textContent = message
  container.appendChild(toast)

  // 入场：下一帧触发过渡
  requestAnimationFrame(() => toast.classList.add('ai-assist-toast--visible'))

  const remove = () => {
    toast.classList.remove('ai-assist-toast--visible')
    setTimeout(() => {
      toast.remove()
    }, 250)
  }

  setTimeout(remove, TOAST_DURATION)
}
