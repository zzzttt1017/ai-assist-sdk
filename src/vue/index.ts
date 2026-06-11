import { createApp, App as VueApp } from 'vue'
import AiAssist from './components/AiAssist.vue'
import { setConfig } from '@/core/services/request'
import '@/styles/index.less'
import type { AiAssistConfig } from '@/core/types'

export type { AiAssistConfig }

let app: VueApp | null = null

export const initAiAssist = (config: AiAssistConfig): void => {
  setConfig(config)
}

export const mountAiAssist = (container?: HTMLElement): void => {
  const target = container || document.body
  const wrapper = document.createElement('div')
  wrapper.id = 'ai-assist-root'
  target.appendChild(wrapper)
  app = createApp(AiAssist)
  app.mount(wrapper)
}

export const unmountAiAssist = (): void => {
  if (app) {
    app.unmount()
    app = null
  }
  const wrapper = document.getElementById('ai-assist-root')
  if (wrapper) {
    wrapper.remove()
  }
}

export { AiAssist }

/**
 * Vue3 插件安装方式
 * @example
 * // main.ts
 * import { createApp } from 'vue'
 * import AiAssistPlugin from 'ai-assist-sdk/vue'
 * const app = createApp(App)
 * app.use(AiAssistPlugin, { ...config })
 * // 然后在 App.vue 中使用 <AiAssist />
 */
export default {
  install(app: VueApp, config: AiAssistConfig) {
    setConfig(config)
    app.component('AiAssist', AiAssist)
  },
}
