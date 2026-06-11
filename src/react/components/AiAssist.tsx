import React, { useState, useEffect, useRef, useCallback } from 'react'
import Answer, { AnswerRef } from './Answer'
import History from './History'
import Info from './Info'
import { getConfig } from '@/core/services/request'
import type { ViewStatus } from '@/core/types'

import sparkleImg from '@/assets/image/sparkle.png'
import historyImg from '@/assets/image/history.png'
import amplifyImg from '@/assets/image/amplify.png'
import amplifysImg from '@/assets/image/amplifys.png'
import closeImg from '@/assets/image/close.png'
import characterImg from '@/assets/image/character.png'

const CHAR_WIDTH = 117
const CHAR_HEIGHT = 118
const HALF_CHAR_WIDTH = CHAR_WIDTH / 2

const AiAssist: React.FC = () => {
  const cfg = getConfig()

  const [isAi, setIsAi] = useState(false)
  const [screenStatus, setScreenStatus] = useState(false)
  const [viewStatus, setViewStatus] = useState<ViewStatus>('answer')
  const [titleShow, setTitleShow] = useState(false)
  const [title, setTitle] = useState('')
  const [titleContent, setTitleContent] = useState('')

  const [characterPosition, setCharacterPosition] = useState({
    x: window.innerWidth - HALF_CHAR_WIDTH,
    y: window.innerHeight / 2 - CHAR_HEIGHT / 2,
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isRecycling, setIsRecycling] = useState(false)
  const [panelPosition, setPanelPosition] = useState<'left' | 'right' | 'center'>('right')
  const [backPosition, setBackPosition] = useState<'left' | 'right'>('left')

  const dragStartRef = useRef({ x: 0, y: 0 })
  const hasDraggedRef = useRef(false)
  const answerRef = useRef<AnswerRef>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updatePanelPosition = useCallback(() => {
    const screenCenter = window.innerWidth / 2
    const charCenterX = characterPosition.x + HALF_CHAR_WIDTH
    if (charCenterX < screenCenter) {
      setPanelPosition('left')
      setBackPosition('right')
    } else {
      setPanelPosition('right')
      setBackPosition('left')
    }
  }, [characterPosition.x])

  const recyclePosition = useCallback(() => {
    const screenWidth = window.innerWidth
    const targetY = Math.max(0, Math.min(characterPosition.y, window.innerHeight - CHAR_HEIGHT))
    const charCenterX = characterPosition.x + HALF_CHAR_WIDTH
    const targetX = charCenterX >= screenWidth / 2
      ? screenWidth - HALF_CHAR_WIDTH
      : -HALF_CHAR_WIDTH
    return { x: targetX, y: targetY }
  }, [characterPosition])

  const doRecycleAnimation = useCallback(() => {
    setIsRecycling(true)
    const targetPos = recyclePosition()
    setCharacterPosition(targetPos)
    setTimeout(() => {
      setIsRecycling(false)
      updatePanelPosition()
      saveCharacterPosition()
    }, 400)
  }, [recyclePosition, updatePanelPosition])

  const saveCharacterPosition = () => {
    try {
      localStorage.setItem('characterPosition', JSON.stringify(characterPosition))
      localStorage.setItem('panelPosition', panelPosition)
      localStorage.setItem('backPosition', backPosition)
    } catch {}
  }

  const loadCharacterPosition = useCallback(() => {
    const savedPosition = localStorage.getItem('characterPosition')
    if (savedPosition) {
      const position = JSON.parse(savedPosition)
      setCharacterPosition({
        x: position.x,
        y: Math.min(Math.max(position.y, 0), window.innerHeight - CHAR_HEIGHT),
      })
    } else {
      setCharacterPosition({
        x: window.innerWidth - HALF_CHAR_WIDTH,
        y: window.innerHeight / 2 - CHAR_HEIGHT / 2,
      })
    }
    const savedPanelPosition = localStorage.getItem('panelPosition')
    const savedBackPosition = localStorage.getItem('backPosition')
    if (savedPanelPosition) setPanelPosition(savedPanelPosition as any)
    if (savedBackPosition) setBackPosition(savedBackPosition as any)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const newX = clientX - dragStartRef.current.x
    const newY = Math.max(0, Math.min(clientY - dragStartRef.current.y, window.innerHeight - CHAR_HEIGHT))
    const dx = Math.abs(newX - characterPosition.x)
    const dy = Math.abs(newY - characterPosition.y)
    if (dx + dy > 5) hasDraggedRef.current = true
    setCharacterPosition({ x: newX, y: newY })
  }, [isDragging, characterPosition])

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
      if (hasDraggedRef.current) {
        doRecycleAnimation()
        hasDraggedRef.current = false
      }
    }
  }, [isDragging, doRecycleAnimation])

  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    setIsRecycling(false)
    setIsDragging(true)
    hasDraggedRef.current = false
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    dragStartRef.current = {
      x: clientX - characterPosition.x,
      y: clientY - characterPosition.y,
    }
  }

  const handleCharacterClick = () => {
    if (!hasDraggedRef.current && !isRecycling) {
      updatePanelPosition()
      setIsAi(true)
    } else {
      hasDraggedRef.current = false
    }
  }

  const handleHistoryDetail = (appConversationId: string) => {
    setViewStatus('answer')
    setTimeout(() => {
      answerRef.current?.goHistoryMessage(appConversationId)
    }, 0)
  }

  const handleAnswer = () => setViewStatus('answer')
  const editTitle = (text: string) => { setTitle(text); setTitleShow(true) }
  const sureEditTitle = () => { setTitleContent(title); setTitleShow(false) }

  const hoverDirection = (() => {
    const screenCenter = window.innerWidth / 2
    const charCenterX = characterPosition.x + HALF_CHAR_WIDTH
    return charCenterX < screenCenter ? 5 : -5
  })()

  const panelPositionClass = screenStatus ? '' : `panel-${panelPosition}`

  useEffect(() => {
    loadCharacterPosition()
  }, [])

  useEffect(() => {
    const handleResize = () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = setTimeout(() => doRecycleAnimation(), 100)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    }
  }, [doRecycleAnimation])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleMouseMove(e)
    const onTouchMove = (e: TouchEvent) => handleMouseMove(e)
    const onMouseUp = () => handleMouseUp()
    const onTouchEnd = () => handleMouseUp()
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('touchmove', onTouchMove, { passive: true } as any)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('touchend', onTouchEnd)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [handleMouseMove, handleMouseUp])

  useEffect(() => {
    if (screenStatus) {
      setPanelPosition('center')
    } else {
      updatePanelPosition()
    }
  }, [screenStatus])

  return (
    <>
      {isAi && (
        <div className={`ai-panel ${screenStatus ? 'maxWrap' : 'minWrap'} ${panelPositionClass}`}>
          <div className="header">
            <p>
              {(viewStatus === 'info' || viewStatus === 'history') ? (
                <div className={`back ${backPosition}`} onClick={() => setViewStatus('answer')}>
                  <span style={{ fontSize: 18 }}>←</span>
                </div>
              ) : (
                <img src={sparkleImg} onClick={() => setViewStatus('info')} />
              )}
            </p>
            <div className="header-title">
              <span>
                {viewStatus === 'info' ? '个人信息' : viewStatus === 'history' ? '历史信息' : cfg.name}
              </span>
            </div>
            <p>
              <img src={historyImg} className="mute" onClick={() => setViewStatus('history')} />
              <img onClick={() => setScreenStatus(!screenStatus)} src={screenStatus ? amplifysImg : amplifyImg} />
              <img onClick={() => setIsAi(false)} src={closeImg} />
            </p>
          </div>

          {viewStatus === 'answer' && (
            <Answer
              ref={answerRef}
              defaultSayhello={cfg.defaultSayhello}
              defaultRecommend={cfg.defaultRecommend}
            />
          )}
          {viewStatus === 'history' && (
            <History
              onHistoryDetail={handleHistoryDetail}
              onAnswer={handleAnswer}
              onEditTitle={editTitle}
            />
          )}
          {viewStatus === 'info' && <Info />}

          <div className="setTitle" style={{ display: titleShow ? 'block' : 'none' }}>
            <div className="content">
              <div className="main">
                <p className="title">修改标题</p>
                <textarea
                  value={title}
                  placeholder="请输入新标题"
                  onChange={(e) => setTitle(e.target.value)}
                />
                <p className="btn">
                  <span onClick={() => setTitleShow(false)}>取消</span>
                  <span onClick={sureEditTitle}>确定</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isAi && (
        <div
          className={`character ${isDragging ? 'dragging' : ''} ${isRecycling ? 'recycling' : ''}`}
          style={{
            left: `${characterPosition.x}px`,
            top: `${characterPosition.y}px`,
            transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
            '--direction': hoverDirection,
          } as React.CSSProperties}
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          onClick={handleCharacterClick}
        >
          <img src={characterImg} />
        </div>
      )}
    </>
  )
}

export default AiAssist
