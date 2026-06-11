import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { getConfig, createAuthAxios } from '@/core/services/request'
import { createConversation, sendMessage as sendMessageApi, stopReply, getConversationMessages } from '@/core/services/api'
import { useClipboard, statusText, formatQuestions, textError, processSSEData, parseSSEData } from '@/core/utils'
import { renderMarkdown } from '@/core/utils/markdown'
import type { ChatMessage, MessageStatus, AiAssistConfig } from '@/core/types'

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

interface AnswerProps {
  defaultSayhello?: { text1: string; text2: string }
  defaultRecommend?: string[]
  onConversationCreated?: (id: string) => void
}

export interface AnswerRef {
  goHistoryMessage: (appConversationId: string) => void
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
  const [messageID, setMessageID] = useState<string>()

  const chatBoxRef = useRef<HTMLDivElement>(null)
  const streamBufferRef = useRef(new Map<number, string>())
  const controllersRef = useRef({
    first: new AbortController(),
    again: new AbortController(),
  })
  const issTopRef = useRef(false)
  const conversationIdRef = useRef<string>('')

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
    const authAxios = createAuthAxios()
    const data = {
      Query: text,
      AppConversationID: id,
      AppKey: cfg.appKey,
      QueryExtends: { Files: [] },
    }

    try {
      const res = await authAxios.post(apis.replyApi, data, {
        headers: { Accept: 'text/html' },
      })
      const sseData = processSSEData(res.data)
      const contentData = parseSSEData(sseData)
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { type: 'ai', content: contentData, status: STATUS.COMPLETED }
        return updated
      })
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { type: 'ai', content: '服务连接失败，请稍后重试', status: STATUS.ERROR }
        return updated
      })
    }
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
    await againSendMessageReply(lastUserMessage)
  }

  const againSendMessageReply = async (textID: string) => {
    const aiIndex = messages.length
    issTopRef.current = false
    streamBufferRef.current.set(aiIndex, '')
    setIsGenerating(true)

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
            AppConversationID: conversationIdRef.current,
            ResponseMode: 'streaming',
            UserID: sessionStorage.getItem('username') || '',
          },
        }),
        signal: controllersRef.current.again.signal,
        openWhenHidden: true,
        onmessage(ev) {
          try {
            const dataStr = ev.data.replace(/^data:data: /, '')
            if (!dataStr) return
            const chunk = JSON.parse(dataStr)
            switch (chunk.event) {
              case 'message_start':
                setLastUserMessage(chunk.id)
                streamBufferRef.current.set(aiIndex, '')
                break
              case 'message': {
                const currentContent = (streamBufferRef.current.get(aiIndex) || '') + chunk.answer
                streamBufferRef.current.set(aiIndex, currentContent)
                setMessages(prev => {
                  const updated = [...prev]
                  if (updated[aiIndex]) {
                    updated[aiIndex] = {
                      ...updated[aiIndex],
                      content: currentContent,
                      status: issTopRef.current ? STATUS.STOP : STATUS.ANSWERING,
                    }
                  }
                  return updated
                })
                break
              }
              case 'message_end':
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
            }
          } catch {}
        },
        onclose() {
          const buffer = streamBufferRef.current.get(aiIndex) || ''
          setMessages(prev => {
            const updated = [...prev]
            if (updated[aiIndex] && updated[aiIndex].status !== STATUS.ERROR) {
              updated[aiIndex] = {
                ...updated[aiIndex],
                content: issTopRef.current && !buffer ? '停止回答' : buffer,
                status: issTopRef.current ? STATUS.STOP : STATUS.COMPLETED,
              }
            }
            return updated
          })
          setIsGenerating(false)
          streamBufferRef.current.delete(aiIndex)
        },
        onerror() {
          setMessages(prev => {
            const updated = [...prev]
            if (updated[aiIndex]) {
              updated[aiIndex] = { ...updated[aiIndex], content: '\n⚠️ 请求异常，已终止', status: STATUS.ERROR }
            }
            return updated
          })
          setIsGenerating(false)
          streamBufferRef.current.delete(aiIndex)
        },
      })
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        if (updated[aiIndex]) {
          updated[aiIndex] = { ...updated[aiIndex], content: '服务连接失败，请稍后重试', status: STATUS.ERROR }
        }
        return updated
      })
    }
  }

  const toggleStop = async () => {
    if (!apis.setopreplyApi || !isGenerating) return
    const aiIndex = messages.length - 1
    try {
      await stopReply(apis, lastUserMessage, sessionStorage.getItem('username') || '')
      setMessages(prev => {
        const updated = [...prev]
        if (updated[aiIndex]) {
          updated[aiIndex] = {
            ...updated[aiIndex],
            content: updated[aiIndex].content || '停止回答',
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

        {messages.map((message, index) => (
          <div key={index} className={`message ${message.type}-message`}>
            {message.type === 'ai' ? (
              <>
                <div className="message-content ba-markdown">
                  {(message.status === STATUS.THINKING || message.status === STATUS.RETHINKING) ? (
                    <div className="scale-animation-container">
                      <span className="scale-dot" />
                      <span className="scale-dot" />
                      <span className="scale-dot" />
                      <span className="scale-dot" />
                    </div>
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
                  )}
                </div>
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
        ))}
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
