import React from 'react'
import { createRoot } from 'react-dom/client'
import AiAssist from './components/AiAssist'
import { setConfig } from './services/request'
import '@/styles/index.less'
import type { AiAssistConfig } from './types'

export type { AiAssistConfig }

export const initAiAssist = (config: AiAssistConfig): void => {
  setConfig(config)
}

export const mountAiAssist = (container?: HTMLElement): void => {
  const target = container || document.body
  const wrapper = document.createElement('div')
  wrapper.id = 'ai-assist-root'
  target.appendChild(wrapper)
  const root = createRoot(wrapper)
  root.render(React.createElement(AiAssist))
}

export const unmountAiAssist = (): void => {
  const wrapper = document.getElementById('ai-assist-root')
  if (wrapper) {
    wrapper.remove()
  }
}

export { AiAssist }

export default { initAiAssist, mountAiAssist, unmountAiAssist, AiAssist }
