import { getConfig } from './request'

/** 将数据包装为 HiAgentParamVO，包含 app 和 data 字段 */
const hiAgentBody = (data: Record<string, any> = {}) => {
  const cfg = getConfig()
  const app = cfg.app ?? 1
  return { app, data: { ...data } }
}

export default hiAgentBody
