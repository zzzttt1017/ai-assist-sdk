import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { getConfig, createAuthAxios } from '@/core/services/request'
import { createConversation, stopMessage, getConversationMessages } from '@/core/services/api'
import { useClipboard, statusText, formatQuestions, textError, processSSEData, parseSSEData, preprocessStreamingMarkdown, renderMarkdown } from '@/core/utils'
import type { ChatMessage, MessageStatus, AiAssistConfig, MessageSegment, MessageCost } from '@/core/types'

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

/** 代码块自定义组件：语言标签 + 复制按钮 */
const markdownComponents = {
  pre({ node, children, ...props }: any) {
    const codeChild = node?.children?.find(
      (c: any): c is typeof c & { properties?: { className?: string[] } } =>
        c.type === 'element' && c.tagName === 'code'
    )
    const langClass = codeChild?.properties?.className?.[0] || ''
    const language = langClass.replace('language-', '') || ''
    return (
      <pre {...props}>
        {language && <span className="code-lang">{language}</span>}
        <button
          className="copy-button"
          onClick={(e) => {
            const codeEl = (e.currentTarget as HTMLElement).nextElementSibling as HTMLElement
            if (codeEl) {
              navigator.clipboard.writeText(codeEl.textContent || '').then(() => {
                const btn = e.currentTarget as HTMLElement
                btn.textContent = '已复制'
                setTimeout(() => { btn.textContent = '复制' }, 2000)
              })
            }
          }}
        >复制</button>
        {children}
      </pre>
    )
  },
}

interface AnswerProps {
  defaultSayhello?: { text1: string; text2: string }
  defaultRecommend?: string[]
  onConversationCreated?: (id: string) => void
}

export interface AnswerRef {
  goHistoryMessage: (appConversationId: string) => void
}

/**
 * 流式 Markdown 渲染器 — 逐字打字机效果
 * 通过 requestAnimationFrame 逐字递增显示内容，
 * 使用 dangerouslySetInnerHTML + renderMarkdown 避免 ReactMarkdown 的性能开销
 */
const StreamingMarkdown: React.FC<{
  content: string
  status: MessageStatus
  onContentGrow?: () => void
}> = ({ content, status, onContentGrow }) => {
  const isStreaming = status === STATUS.ANSWERING
  const [displayed, setDisplayed] = useState(content)
  const contentRef = useRef(content)
  const indexRef = useRef(content.length)
  const rafRef = useRef(0)
  const lastTimeRef = useRef(0)
  const onGrowRef = useRef(onContentGrow)
  onGrowRef.current = onContentGrow

  // 非 streaming 时直接全量显示
  useEffect(() => {
    contentRef.current = content
    if (!isStreaming) {
      setDisplayed(content)
      indexRef.current = content.length
    }
  }, [content, isStreaming])

  // 逐字打字机动画
  useEffect(() => {
    if (!isStreaming) return

    const TICK_MS = 16 // ~60fps
    const BASE_SPEED = 1   // 每帧最少 1 字（逐字效果）
    const MAX_SPEED = 40   // 每帧最多 40 字

    const tick = (time: number) => {
      if (time - lastTimeRef.current >= TICK_MS) {
        lastTimeRef.current = time
        const target = contentRef.current
        const remaining = target.length - indexRef.current

        if (remaining > 0) {
          // 自适应速度：落后多则快追，接近则慢放
          const speed = remaining > 15
            ? Math.min(Math.ceil(remaining * 0.3), MAX_SPEED)
            : BASE_SPEED
          indexRef.current = Math.min(indexRef.current + speed, target.length)
          setDisplayed(target.slice(0, indexRef.current))
          onGrowRef.current?.()
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isStreaming])

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(preprocessStreamingMarkdown(displayed)) }} />
      {isStreaming && <span className="streaming-cursor" />}
    </>
  )
}

/** 深度思考区块 — 可折叠展示深度思考内容，hover 时显示箭头 */
const ThinkingBlock: React.FC<{
  content: string
  isStreaming?: boolean
}> = ({ content, isStreaming }) => {
  const [expanded, setExpanded] = useState(false)

  if (!content) return null

  return (
    <div className={`thinking-block ${expanded ? 'thinking-block--expanded' : ''}`}>
      <div className="thinking-block__header" onClick={() => setExpanded(!expanded)}>
        <span className="thinking-block__title">
          {isStreaming ? '深度思考中' : '已深度思考'}
        </span>
        <svg className={`thinking-block__arrow ${expanded ? 'thinking-block__arrow--down' : ''}`} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {expanded && (
        <div className="thinking-block__content">
          {content}
        </div>
      )}
    </div>
  )
}

/** 智能体/工具调用状态条 — 极简展示 */
const AgentThoughtBlock: React.FC<{ isDone?: boolean }> = ({ isDone }) => {
  return (
    <div className="agent-thought">
      <svg className="agent-thought__icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" />
      </svg>
      <span className="agent-thought__text">
        {isDone ? '搜索信息完成' : '搜索信息中…'}
      </span>
    </div>
  )
}

/** 消费信息展示 */
const CostInfo: React.FC<{ cost: MessageCost }> = ({ cost }) => {
  const parts: string[] = []
  if (cost.inputTokens > 0) parts.push(`输入 ${cost.inputTokens} tokens`)
  if (cost.outputTokens > 0) parts.push(`输出 ${cost.outputTokens} tokens`)
  const latencyText = cost.latency >= 1
    ? `${cost.latency.toFixed(1)}s`
    : `${Math.round(cost.latency * 1000)}ms`
  parts.push(`耗时 ${latencyText}`)
  return <div className="message-cost">{parts.join(' · ')}</div>
}

const Answer = forwardRef<AnswerRef, AnswerProps>(({ defaultSayhello, defaultRecommend }, ref) => {
  const cfg = getConfig()
  const apis = cfg.apis

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [userInput, setUserInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [lastUserMessage, setLastUserMessage] = useState('')
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasScroll, setHasScroll] = useState(false)
  const [sayData, setSayData] = useState({ text1: '', text2: '' })
  const [recommendations, setRecommendations] = useState<string[][]>([])
  const [currentRecIndex, setCurrentRecIndex] = useState(0)

  const chatBoxRef = useRef<HTMLDivElement>(null)
  // 分段内容追踪（支持 think_message / agent_thought / message 穿插）
  const segmentsRef = useRef<Map<number, MessageSegment[]>>(new Map())
  const currentSegTypeRef = useRef<Map<number, MessageSegment['type']>>(new Map())
  const thinkingStartTimeRef = useRef<Map<number, number>>(new Map())
  const agentThoughtStartTimeRef = useRef<Map<number, number>>(new Map())
  const controllersRef = useRef({
    first: new AbortController(),
    again: new AbortController(),
  })
  const issTopRef = useRef(false)
  const conversationIdRef = useRef<string>('')

  // RAF 批量更新：将同一帧内的多次 setMessages 合并为一次渲染
  const pendingUpdatesRef = useRef<Array<(prev: ChatMessage[]) => ChatMessage[]>>([])
  const rafBatchIdRef = useRef(0)

  const batchSetMessages = useCallback((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    pendingUpdatesRef.current.push(updater)
    if (!rafBatchIdRef.current) {
      rafBatchIdRef.current = requestAnimationFrame(() => {
        rafBatchIdRef.current = 0
        const updates = pendingUpdatesRef.current
        pendingUpdatesRef.current = []
        if (updates.length > 0) {
          setMessages(prev => {
            let result = prev
            for (const fn of updates) {
              result = fn(result)
            }
            return result
          })
        }
      })
    }
  }, [])

  /** 立即刷出所有待处理的批量更新（用于终止状态） */
  const flushBatch = useCallback(() => {
    if (rafBatchIdRef.current) {
      cancelAnimationFrame(rafBatchIdRef.current)
      rafBatchIdRef.current = 0
    }
    const updates = pendingUpdatesRef.current
    pendingUpdatesRef.current = []
    if (updates.length > 0) {
      setMessages(prev => {
        let result = prev
        for (const fn of updates) {
          result = fn(result)
        }
        return result
      })
    }
  }, [])

  useImperativeHandle(ref, () => ({
    goHistoryMessage: async (appConversationId: string) => {
      conversationIdRef.current = appConversationId
      const res = await getConversationMessages(apis, appConversationId)
      const contentData = res?.messages?.[0]?.answerInfo?.answer
      if (contentData) {
        setMessages(prev => [...prev, {
          type: 'ai',
          content: contentData,
          status: STATUS.COMPLETED,
        }])
      }
    }
  }))

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatBoxRef.current) {
        chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight
      }
    })
  }, [])

  const checkScrollStatus = useCallback(() => {
    if (!chatBoxRef.current) return
    const container = chatBoxRef.current
    const isBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1
    const hasScrollbar = container.scrollHeight > container.clientHeight
    setIsAtBottom(isBottom)
    setHasScroll(hasScrollbar)
  }, [])

  useEffect(() => {
    if (defaultSayhello) {
      setSayData({ text1: defaultSayhello.text1, text2: defaultSayhello.text2 })
    }
    if (defaultRecommend) {
      setRecommendations(formatQuestions(defaultRecommend))
    }
  }, [defaultSayhello, defaultRecommend])

  useEffect(() => {
    const init = async () => {
      const result = await createConversation(apis)
      if (result?.conversation?.appConversationID) {
        conversationIdRef.current = result.conversation.appConversationID
      }
    }
    init()
  }, [])

  useEffect(() => {
    const container = chatBoxRef.current
    if (!container) return
    const handleScroll = () => checkScrollStatus()
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [checkScrollStatus])

  const refreshRecommendations = () => setCurrentRecIndex(prev => prev + 1)
  const fillInput = (text: string) => setUserInput(text)

  const copyContent = (message: ChatMessage) => {
    try {
      const { copy } = useClipboard()
      copy(message.content)
    } catch {}
  }

  // 获取可用的流式 API 地址，优先流式，降级非流式
  const getStreamApi = () => apis.chatQueryStreamApi || apis.chatQueryApi
  const getAgainStreamApi = () => apis.queryAgainStreamApi || apis.queryAgainApi || apis.chatQueryStreamApi || apis.chatQueryApi

  /** 建立 SSE 流式请求的通用方法 */
  const doStreamRequest = async (
    apiUrl: string,
    bodyData: Record<string, any>,
    aiIndex: number,
    signal: AbortSignal,
    isRetry = false,
  ) => {
    issTopRef.current = false
    segmentsRef.current.set(aiIndex, [])
    setIsGenerating(true)

    /** 同步 segments 到 messages（使用批量更新） */
    const syncSegments = () => {
      const segs = segmentsRef.current.get(aiIndex) || []
      batchSetMessages(prev => {
        const updated = [...prev]
        if (updated[aiIndex]) {
          updated[aiIndex] = {
            ...updated[aiIndex],
            segments: segs.map(s => ({ ...s })),
          }
        }
        return updated
      })
    }

    try {
      const fullUrl = cfg.baseUrl.replace(/\/+$/, '') + '/' + apiUrl.replace(/^\/+/, '')
      await fetchEventSource(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: cfg.app ?? 1, data: bodyData }),
        signal,
        openWhenHidden: true,
        async onopen(res) {
          console.log('[ai-assist-sdk] 📡 连接已建立, status:', res.status, 'content-type:', res.headers.get('content-type'))
        },
        onmessage(ev) {
          try {
            let dataStr = ev.data || ''
            if (dataStr.startsWith('data:')) {
              dataStr = dataStr.replace(/^data:\s*/, '')
            }
            if (!dataStr) return

            let chunk: any
            try {
              chunk = JSON.parse(dataStr)
            } catch {
              return
            }

            switch (chunk.event) {
              case 'message_start':
                if (!isRetry) setLastUserMessage(chunk.id)
                currentSegTypeRef.current.set(aiIndex, 'answer')
                break

              case 'think_message_output_start': {
                thinkingStartTimeRef.current.set(aiIndex, Date.now())
                currentSegTypeRef.current.set(aiIndex, 'thinking')
                const segs = segmentsRef.current.get(aiIndex) || []
                segmentsRef.current.set(aiIndex, [...segs, { type: 'thinking', content: '' }])
                syncSegments()
                break
              }

              case 'agent_thought': {
                const thoughtText = chunk.thought || chunk.thinking || ''
                const segs = segmentsRef.current.get(aiIndex) || []
                const last = segs[segs.length - 1]
                if (last && last.type === 'agent_thought') {
                  last.content += thoughtText
                } else {
                  currentSegTypeRef.current.set(aiIndex, 'agent_thought')
                  segs.push({ type: 'agent_thought', content: thoughtText })
                  agentThoughtStartTimeRef.current.set(aiIndex, Date.now())
                }
                segmentsRef.current.set(aiIndex, segs)
                // 合并 segments + thinkingContent 更新为一次 batchSetMessages
                batchSetMessages(prev => {
                  const updated = [...prev]
                  if (updated[aiIndex]) {
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      segments: segs.map(s => ({ ...s })),
                      thinkingContent: (updated[aiIndex].thinkingContent || '') + thoughtText,
                      status: STATUS.THINKING,
                    }
                  }
                  return updated
                })
                break
              }

              case 'think_message': {
                const thinkingText = chunk.thinking || chunk.answer || chunk.text || ''
                const segs = segmentsRef.current.get(aiIndex) || []
                const last = segs[segs.length - 1]
                if (last && last.type === 'thinking') {
                  last.content += thinkingText
                } else {
                  segs.push({ type: 'thinking', content: thinkingText })
                  thinkingStartTimeRef.current.set(aiIndex, Date.now())
                }
                segmentsRef.current.set(aiIndex, segs)
                // 合并 segments + thinkingContent 更新
                batchSetMessages(prev => {
                  const updated = [...prev]
                  if (updated[aiIndex]) {
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      segments: segs.map(s => ({ ...s })),
                      thinkingContent: (updated[aiIndex].thinkingContent || '') + thinkingText,
                      status: STATUS.THINKING,
                    }
                  }
                  return updated
                })
                break
              }

              case 'agent_thought_end': {
                const startTime = agentThoughtStartTimeRef.current.get(aiIndex)
                const duration = startTime
                  ? Math.round(((Date.now() - startTime) / 1000) * 10) / 10
                  : 0
                const segs = segmentsRef.current.get(aiIndex) || []
                const last = segs[segs.length - 1]
                if (last && last.type === 'agent_thought') {
                  last.duration = duration
                }
                segmentsRef.current.set(aiIndex, segs)
                batchSetMessages(prev => {
                  const updated = [...prev]
                  if (updated[aiIndex]) {
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      segments: segs.map(s => ({ ...s })),
                      thinkingDuration: (updated[aiIndex].thinkingDuration || 0) + duration,
                    }
                  }
                  return updated
                })
                break
              }

              case 'think_message_output_end': {
                const startTime = thinkingStartTimeRef.current.get(aiIndex)
                const duration = startTime
                  ? Math.round(((Date.now() - startTime) / 1000) * 10) / 10
                  : 0
                const segs = segmentsRef.current.get(aiIndex) || []
                const last = segs[segs.length - 1]
                if (last && last.type === 'thinking') {
                  last.duration = duration
                }
                segmentsRef.current.set(aiIndex, segs)
                batchSetMessages(prev => {
                  const updated = [...prev]
                  if (updated[aiIndex]) {
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      segments: segs.map(s => ({ ...s })),
                      thinkingDuration: (updated[aiIndex].thinkingDuration || 0) + duration,
                    }
                  }
                  return updated
                })
                break
              }

              case 'tool_message': {
                const toolText = chunk.answer || chunk.text || chunk.content || ''
                if (!toolText) break
                const segs = segmentsRef.current.get(aiIndex) || []
                segs.push({ type: 'answer', content: toolText })
                segmentsRef.current.set(aiIndex, segs)
                syncSegments()
                break
              }

              case 'message_output_start':
                currentSegTypeRef.current.set(aiIndex, 'answer')
                break

              case 'message': {
                const answerText = chunk.answer || ''
                const curType = currentSegTypeRef.current.get(aiIndex)
                const segs = segmentsRef.current.get(aiIndex) || []
                const last = segs[segs.length - 1]

                if (curType === 'answer' && last && last.type === 'answer') {
                  last.content += answerText
                } else {
                  currentSegTypeRef.current.set(aiIndex, 'answer')
                  segs.push({ type: 'answer', content: answerText })
                }
                segmentsRef.current.set(aiIndex, segs)

                // 合并 segments + content + status 更新为一次 batchSetMessages
                const fullContent = segs.filter(s => s.type === 'answer').map(s => s.content).join('')
                batchSetMessages(prev => {
                  const updated = [...prev]
                  if (updated[aiIndex]) {
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      segments: segs.map(s => ({ ...s })),
                      content: fullContent,
                      status: issTopRef.current ? STATUS.STOP : STATUS.ANSWERING,
                    }
                  }
                  return updated
                })
                break
              }

              case 'message_end':
                flushBatch()
                setMessages(prev => {
                  const updated = [...prev]
                  if (updated[aiIndex]) {
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      status: issTopRef.current ? STATUS.STOP : STATUS.COMPLETED,
                    }
                  }
                  return updated
                })
                setIsGenerating(false)
                break

              case 'agent_error':
              case 'message_failed':
                flushBatch()
                setMessages(prev => {
                  const updated = [...prev]
                  if (updated[aiIndex]) {
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      status: STATUS.ERROR,
                      content: chunk.error_msg || chunk.message || '请求失败',
                      errorMessage: chunk.error_msg || chunk.message || '请求失败',
                    }
                  }
                  return updated
                })
                setIsGenerating(false)
                break

              case 'message_replace': {
                const replaceText = chunk.answer || ''
                const segs = segmentsRef.current.get(aiIndex) || []
                const lastAnswerIdx = segs.map((s, i) => ({ s, i })).reverse().find(x => x.s.type === 'answer')?.i
                if (lastAnswerIdx != null) {
                  segs[lastAnswerIdx] = { ...segs[lastAnswerIdx], content: replaceText }
                } else {
                  segs.push({ type: 'answer', content: replaceText })
                }
                segmentsRef.current.set(aiIndex, segs)
                batchSetMessages(prev => {
                  const updated = [...prev]
                  if (updated[aiIndex]) {
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      segments: segs.map(s => ({ ...s })),
                      content: replaceText,
                    }
                  }
                  return updated
                })
                break
              }

              case 'message_cost': {
                const cost: MessageCost = {
                  inputTokens: chunk.input_tokens || 0,
                  outputTokens: chunk.output_tokens || 0,
                  latency: chunk.latency || 0,
                  latencyFirstResp: chunk.latency_first_resp,
                }
                batchSetMessages(prev => {
                  const updated = [...prev]
                  if (updated[aiIndex]) {
                    updated[aiIndex] = { ...updated[aiIndex], cost }
                  }
                  return updated
                })
                break
              }

              default:
                console.log('[ai-assist-sdk] 未知 event 类型:', chunk.event, chunk)
            }
          } catch (e) {
            console.error('[ai-assist-sdk] onmessage 解析失败:', e)
          }
        },
        onclose() {
          flushBatch()
          const segs = segmentsRef.current.get(aiIndex) || []
          const fullContent = segs.filter(s => s.type === 'answer').map(s => s.content).join('')
          setMessages(prev => {
            const updated = [...prev]
            if (updated[aiIndex] && updated[aiIndex].status !== STATUS.ERROR) {
              updated[aiIndex] = {
                ...updated[aiIndex],
                content: issTopRef.current && !fullContent ? '已停止回答' : fullContent,
                status: issTopRef.current ? STATUS.STOP : STATUS.COMPLETED,
              }
            }
            return updated
          })
          setIsGenerating(false)
        },
        onerror(err) {
          console.error('[ai-assist-sdk] ❌ 连接错误:', err)
          flushBatch()
          setMessages(prev => {
            const updated = [...prev]
            if (updated[aiIndex]) {
              updated[aiIndex] = { ...updated[aiIndex], content: '\n⚠️ 请求异常，已终止', status: STATUS.ERROR }
            }
            return updated
          })
          setIsGenerating(false)
        },
      })
    } catch (err) {
      console.error('[ai-assist-sdk] doStreamRequest error:', err)
      if (!issTopRef.current) {
        flushBatch()
        setMessages(prev => {
          const updated = [...prev]
          if (updated[aiIndex]) {
            updated[aiIndex] = { ...updated[aiIndex], content: '服务连接失败，请稍后重试', status: STATUS.ERROR }
          }
          return updated
        })
        setIsGenerating(false)
      }
    }
  }

  /** 发送消息：优先流式，降级非流式 */
  const sendMessage = async () => {
    const text = userInput.trim()
    if (!text || isGenerating) return

    const newMessages: ChatMessage[] = [
      ...messages,
      { type: 'user', content: text },
      { type: 'ai', content: '', status: STATUS.THINKING },
    ]
    setMessages(newMessages)
    setUserInput('')
    scrollToBottom()

    const id = conversationIdRef.current
    const aiIndex = newMessages.length - 1

    // 优先使用流式 API
    if (apis.chatQueryStreamApi) {
      console.log('[ai-assist-sdk] ✅ 使用流式 SSE:', apis.chatQueryStreamApi)
      await doStreamRequest(apis.chatQueryStreamApi, {
        Query: text,
        AppConversationID: id,
        ResponseMode: 'streaming',
      }, aiIndex, controllersRef.current.first.signal)
      return
    }

    // 降级：非流式
    console.warn('[ai-assist-sdk] ⚠️ 未配置 chatQueryStreamApi，降级为非流式请求')
    try {
      const authAxios = createAuthAxios()
      const res = await authAxios.post(apis.chatQueryApi, {
        app: cfg.app ?? 1,
        data: { Query: text, AppConversationID: id },
      })
      const contentData = extractContent(res.data)
      setMessages(prev => {
        const updated = [...prev]
        updated[aiIndex] = { type: 'ai', content: contentData, status: STATUS.COMPLETED }
        return updated
      })
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        updated[aiIndex] = { type: 'ai', content: '服务连接失败，请稍后重试', status: STATUS.ERROR }
        return updated
      })
    }
  }

  /** 从响应中提取文本内容 */
  const extractContent = (data: any): string => {
    if (typeof data === 'string') {
      const sseData = processSSEData(data)
      return parseSSEData(sseData) || data
    }
    return data?.answer || data?.data?.answer || String(data || '')
  }

  const regenerateResponse = async () => {
    if (!lastUserMessage || isGenerating) return
    setMessages(prev => {
      const updated = [...prev]
      if (updated.length > 0 && updated[updated.length - 1].type === 'ai') {
        updated.pop()
      }
      updated.push({ type: 'ai', content: '', status: STATUS.RETHINKING })
      return updated
    })
    scrollToBottom()

    const aiIndex = messages.length
    const againApi = getAgainStreamApi()

    await doStreamRequest(againApi, {
      MessageID: lastUserMessage,
      AppConversationID: conversationIdRef.current,
      ResponseMode: 'streaming',
    }, aiIndex, controllersRef.current.again.signal, true)
  }

  const toggleStop = async () => {
    if (!apis.stopMessageApi || !isGenerating) return
    const aiIndex = messages.length - 1
    try {
      await stopMessage(apis, lastUserMessage)
      setMessages(prev => {
        const updated = [...prev]
        if (updated[aiIndex]) {
          updated[aiIndex] = {
            ...updated[aiIndex],
            content: updated[aiIndex].content || '已停止回答',
            status: STATUS.STOP,
          }
        }
        return updated
      })
      setIsGenerating(false)
      controllersRef.current.first.abort()
      controllersRef.current.first = new AbortController()
      controllersRef.current.again.abort()
      controllersRef.current.again = new AbortController()
      issTopRef.current = true
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        if (updated[aiIndex]) {
          updated[aiIndex] = { ...updated[aiIndex], content: '系统繁忙，请稍后再试', status: STATUS.ERROR }
        }
        return updated
      })
    }
  }

  const currentRecommendations = recommendations[currentRecIndex % (recommendations.length || 1)]

  return (
    <div className="container">
      <div className="chat-box scrollWrap" ref={chatBoxRef}>
        <div className="message ai-message greet-message">
          <div className="ai-greet">
            <h1>{sayData.text1}</h1>
            <p>{sayData.text2}</p>
          </div>
        </div>

        {currentRecommendations?.length > 0 && (
          <div className="message ai-message recommend-message">
            <div className="ai-recommend">
              <div className="recommend-header">
                <span>你可以尝试这样问我：</span>
                <p className="refresh-btn" onClick={refreshRecommendations}>
                  <img src={refreshImg} />
                  <span>换一换</span>
                </p>
              </div>
              <ul>
                {currentRecommendations.map((item, index) => (
                  <li key={index} onClick={() => fillInput(item)}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {messages.map((message, index) => {
          const segs = message.segments
          const showDots = (message.status === STATUS.THINKING || message.status === STATUS.RETHINKING) && !message.thinkingContent && !message.content
          const hasSegments = segs && segs.length > 0

          return (
          <div key={index} className={`message ${message.type}-message`}>
            {message.type === 'ai' ? (
              <>
                {showDots && (
                  <div className="message-content ba-markdown">
                    <div className="scale-animation-container">
                      <span className="scale-dot" />
                      <span className="scale-dot" />
                      <span className="scale-dot" />
                      <span className="scale-dot" />
                    </div>
                  </div>
                )}
                {hasSegments && (
                  <div className="message-content ba-markdown">
                    {segs.map((seg, segIdx) => {
                      const isLastAnswer = seg.type === 'answer' &&
                        !segs.slice(segIdx + 1).some(s => s.type === 'answer')
                      if (seg.type === 'agent_thought') {
                        return <AgentThoughtBlock key={segIdx} isDone={seg.duration != null} />
                      }
                      if (seg.type === 'thinking') {
                        return (
                          <ThinkingBlock
                            key={segIdx}
                            content={seg.content}
                            isStreaming={message.status === STATUS.THINKING || message.status === STATUS.RETHINKING}
                          />
                        )
                      }
                      return isLastAnswer && message.status === STATUS.ANSWERING ? (
                        <StreamingMarkdown
                          key={segIdx}
                          content={seg.content}
                          status={STATUS.ANSWERING}
                          onContentGrow={scrollToBottom}
                        />
                      ) : (
                        <ReactMarkdown
                          key={segIdx}
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeHighlight]}
                          components={markdownComponents}
                        >
                          {seg.content}
                        </ReactMarkdown>
                      )
                    })}
                  </div>
                )}
                {!hasSegments && message.content ? (
                  <div className="message-content ba-markdown">
                    <StreamingMarkdown
                      content={message.content}
                      status={message.status!}
                      onContentGrow={scrollToBottom}
                    />
                  </div>
                ) : null}
                {message.errorMessage && (
                  <div className="message-error">
                    <span className="message-error__icon">⚠️</span>
                    <span>{message.errorMessage}</span>
                  </div>
                )}
                {message.cost && message.status !== STATUS.ANSWERING && message.status !== STATUS.THINKING && (
                  <CostInfo cost={message.cost} />
                )}
                <div className="status-indicator">
                  <span onClick={() => copyContent(message)}>
                    {statusText(message.status)}
                  </span>
                </div>
              </>
            ) : (
              <div className="message-content">{message.content}</div>
            )}
          </div>
        )})}
      </div>

      <div className="input-container">
        {lastUserMessage ? (
          <div className="tooltip-enhanced" data-tooltip="重新回答">
            <img className="refresh" onClick={regenerateResponse} src={refreshImg} />
          </div>
        ) : (
          <img className="refresh" src={refreshImg} />
        )}
        <input
          value={userInput}
          type="text"
          placeholder="输入消息..."
          onKeyUp={(e) => e.key === 'Enter' && sendMessage()}
          onChange={(e) => setUserInput(e.target.value)}
          disabled={isGenerating}
        />
        {isGenerating && lastUserMessage ? (
          <div className="tooltip-enhanced stop" data-tooltip="停止回答">
            <img src={startImg} onClick={toggleStop} />
          </div>
        ) : (
          <div className="tooltip-enhanced send" data-tooltip="开始回答">
            <img src={sendImg} onClick={sendMessage} />
          </div>
        )}
        {hasScroll && !isAtBottom && (
          <div className="moveTB">
            <img onClick={scrollToBottom} src={bottomImg} />
          </div>
        )}
      </div>
    </div>
  )
})

Answer.displayName = 'Answer'
export default Answer
