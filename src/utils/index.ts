export const useClipboard = () => {
  let isCopied = false
  let error = ''

  const copy = async (text: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      isCopied = true
      setTimeout(() => (isCopied = false), 1500)
    } catch (err: any) {
      error = err.message
    }
  }

  return { copy, isCopied, error }
}

export const extractPlainText = (html: string): string => {
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, '')
  return text.replace(/\s+/g, ' ').trim()
}

import type { MessageStatus } from '@/types'

const STATUS_MAP: Record<MessageStatus, string> = {
  thinking: '正在思考中',
  rethinking: '重新思考中',
  answering: '正在回答中',
  paused: '回答已停止',
  error: '系统繁忙，请稍后再试',
  stop: '已停止回答',
  completed: '复制内容',
}

export const statusText = (status?: MessageStatus): string => {
  if (!status) return ''
  return STATUS_MAP[status] || ''
}

export const formatQuestions = (arr: any[]): string[][] => {
  if (!arr?.length) return []
  const isStringMode = typeof arr[0] === 'string'
  const sorted = isStringMode
    ? [...arr].sort((a, b) => Number(a) - Number(b))
    : [...arr].sort((a: any, b: any) => a.seq - b.seq)

  return Array.from(
    { length: Math.ceil(sorted.length / 3) },
    (_, i) => sorted.slice(i * 3, (i + 1) * 3).map((item: any) => (isStringMode ? item : item.question))
  )
}

export const textError = (text: string): string => {
  return text.includes('Exceeded LLM tokens limit') ? '系统繁忙，请稍后再试' : text
}

export const processSSEData = (sseData: string): string => {
  const lines = sseData.split('\n')
  const dataLines = lines.filter((line) => line.startsWith('data:'))
  const jsonData = dataLines.map((line) => line.replace('data:', '').trim()).filter(Boolean)
  if (jsonData.length === 0) return ''
  const combinedData = jsonData.join('\n')
  try {
    const parsedData = JSON.parse(combinedData)
    return parsedData.answer || ''
  } catch {
    return combinedData
  }
}

export const parseSSEData = (sseData: string): string => {
  const lines = sseData.split('\n')
  let markdownContent = ''
  lines.forEach((line) => {
    if (!line.trim()) return
    if (line.startsWith('data: ')) {
      const dataStr = line.replace('data: ', '').trim()
      try {
        const data = JSON.parse(dataStr)
        if (data.event === 'message' && data.answer !== undefined) {
          markdownContent += data.answer
        }
      } catch {
        markdownContent += dataStr
      }
    }
  })
  return markdownContent
}
