import React, { useState, useEffect } from 'react'
import { Modal, Button } from 'antd'
import { getHistoryList, deleteHistory } from '@/services/api'
import { getConfig } from '@/services/request'
import type { HistoryItem } from '@/types'

import addImg from '@/assets/image/add.png'
import addsImg from '@/assets/image/adds.png'

interface HistoryProps {
  onHistoryDetail: (appConversationId: string) => void
  onAnswer: () => void
  onEditTitle: (text: string) => void
}

const History: React.FC<HistoryProps> = ({ onHistoryDetail, onAnswer, onEditTitle }) => {
  const cfg = getConfig()
  const apis = cfg.apis

  const [historyList, setHistoryList] = useState<HistoryItem[]>([])
  const [deleteExpanded, setDeleteExpanded] = useState(false)
  const [centerDialogVisible, setCenterDialogVisible] = useState(false)
  const [deleteId, setDeleteId] = useState('')

  const getConversationList = async () => {
    const result = await getHistoryList(apis)
    if (result?.conversationList) {
      const filtered = result.conversationList
        .filter((item: any) => item !== null)
        .map((item: any) => ({ ...item, selected: false }))
      setHistoryList(filtered)
    }
  }

  const handleClear = (id: string) => {
    setDeleteId(id)
    setCenterDialogVisible(true)
  }

  const handleDelete = async () => {
    setCenterDialogVisible(false)
    await deleteHistory(apis, deleteId)
    await getConversationList()
  }

  const newCreateAconversation = () => {
    if (deleteExpanded) return
    onAnswer()
  }

  useEffect(() => {
    getConversationList()
  }, [])

  return (
    <div className="ai-history">
      <div className="content">
        {historyList.length > 0 && (
          <div>
            {historyList.map((item) => (
              <div
                className="info"
                key={item.appConversationID}
                onClick={() => onHistoryDetail(item.appConversationID)}
              >
                <div className="info-pic">
                  {item.conversationName.slice(0, 1)}
                </div>
                <div className="info-content">
                  <div className="info-content-title">{item.conversationName}</div>
                  <div className="info-content-time">{item.createTime}</div>
                </div>
                <div
                  className="clear-history"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleClear(item.appConversationID)
                  }}
                >
                  删除
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ai-add" onClick={newCreateAconversation}>
        <img src={deleteExpanded ? addImg : addsImg} />
        <span style={{ color: deleteExpanded ? '#999999' : '#333333' }}>新建AI对话</span>
      </div>

      <Modal
        open={centerDialogVisible}
        onCancel={() => setCenterDialogVisible(false)}
        title="确定要删除该历史记录吗？"
        centered
        width={300}
        footer={[
          <Button key="cancel" onClick={() => setCenterDialogVisible(false)}>取消</Button>,
          <Button key="ok" type="primary" onClick={handleDelete}>确定</Button>,
        ]}
      >
        <p>一旦删除，数据将无法恢复。</p>
      </Modal>
    </div>
  )
}

export default History
