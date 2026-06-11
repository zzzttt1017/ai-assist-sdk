import React, { useState, useEffect } from 'react'
import { getPersonalInfo } from '@/services/api'
import { getConfig } from '@/services/request'
import type { PersonalInfo } from '@/types'

const Info: React.FC = () => {
  const cfg = getConfig()
  const [info, setInfo] = useState<PersonalInfo | null>(null)

  useEffect(() => {
    const fetchInfo = async () => {
      const data = await getPersonalInfo(cfg.apis)
      setInfo(data)
    }
    fetchInfo()
  }, [])

  return (
    <div className="container info">
      <div className="info-item">
        <div className="heading">
          <div className="heading-column" />
          <div className="heading-title">基本信息</div>
        </div>
        <div className="basic-content">
          <div className="basic-content-text basic-content-key">姓名</div>
          <div className="basic-content-text">{info?.name || ''}</div>
        </div>
        <div className="basic-content">
          <div className="basic-content-text basic-content-key">用户名</div>
          <div className="basic-content-text">{info?.userName || ''}</div>
        </div>
      </div>
      <div className="info-item">
        <div className="heading">
          <div className="heading-column" />
          <div className="heading-title">数据权限</div>
        </div>
        <div className="permission-content">
          {info?.ptnameList?.map((item, index) => (
            <div className="permission-content-text" key={index}>{item}</div>
          ))}
        </div>
      </div>
      <div className="info-item">
        <div className="heading">
          <div className="heading-column" />
          <div className="heading-title">帮助信息</div>
        </div>
        <div className="basic-content">
          <div className="basic-content-text basic-content-key">部门</div>
          <div className="basic-content-text">{info?.dept || ''}</div>
        </div>
        <div className="basic-content">
          <div className="basic-content-text basic-content-key">邮箱</div>
          <div className="basic-content-text">{info?.email || ''}</div>
        </div>
      </div>
    </div>
  )
}

export default Info
