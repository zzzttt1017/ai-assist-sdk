import { http, createAuthAxios } from './request'
import version from './version'
import type { AiAssistConfig, PersonalInfo } from '@/core/types'

// ==================== 会话管理 ====================

export const createConversation = async (apis: AiAssistConfig['apis']) => {
  if (!apis.createConversationApi) return
  const result = await http.post(apis.createConversationApi, version({}))
  return result
}

export const getConversationList = async (apis: AiAssistConfig['apis']) => {
  if (!apis.getConversationListApi) return null
  const result = await http.post(apis.getConversationListApi, version({}))
  return result
}

export const deleteConversation = async (
  apis: AiAssistConfig['apis'],
  appConversationId: string
) => {
  if (!apis.deleteConversationApi) return
  await http.post(apis.deleteConversationApi, version({
    AppConversationID: appConversationId,
  }))
}

export const getConversationMessages = async (
  apis: AiAssistConfig['apis'],
  appConversationId: string
) => {
  if (!apis.getConversationMessagesApi) return null
  const authAxios = createAuthAxios()
  const res = await authAxios.post(apis.getConversationMessagesApi, version({
    AppConversationID: appConversationId,
    Limit: 100,
  }))
  return res.data
}

// ==================== 对话 ====================

/** 发送消息（非流式） */
export const chatQuery = async (
  apis: AiAssistConfig['apis'],
  query: string,
  appConversationId: string
) => {
  const authAxios = createAuthAxios()
  const res = await authAxios.post(apis.chatQueryApi, version({
    Query: query,
    AppConversationID: appConversationId,
  }))
  return res.data
}

/** 停止回复 */
export const stopMessage = async (
  apis: AiAssistConfig['apis'],
  messageId: string,
) => {
  if (!apis.stopMessageApi) return
  await http.post(apis.stopMessageApi, version({
    MessageID: messageId,
  }))
}

// ==================== 其他 ====================

export const getSuggestedQuestions = async (apis: AiAssistConfig['apis']) => {
  if (!apis.getSuggestedQuestionsApi) return null
  const res = await http.post(apis.getSuggestedQuestionsApi, version({}))
  return res
}

export const getMessageInfo = async (
  apis: AiAssistConfig['apis'],
  messageId: string
) => {
  if (!apis.getMessageInfoApi) return null
  const res = await http.post(apis.getMessageInfoApi, version({
    MessageID: messageId,
  }))
  return res?.data
}

export const getAppConfig = async (apis: AiAssistConfig['apis']) => {
  if (!apis.getAppConfigApi) return null
  const res = await http.post(apis.getAppConfigApi, version({}))
  return res?.data
}

export const getPersonalInfo = async (apis: AiAssistConfig['apis']): Promise<PersonalInfo | null> => {
  if (!apis.getPersonalInfoApi) return null
  const res = await http.post(apis.getPersonalInfoApi, version({}))
  return res?.data
}
