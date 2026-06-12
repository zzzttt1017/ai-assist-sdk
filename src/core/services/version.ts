/** 将数据包装为 HiAgentParamVO 的 data 字段（忽略 app 参数） */
const hiAgentBody = (data: Record<string, any> = {}) => ({
  data: { ...data },
})

export default hiAgentBody
