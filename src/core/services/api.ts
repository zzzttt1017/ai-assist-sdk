import { http, createAuthAxios, getConfig } from './request'
import version from './version'
import type { AiAssistConfig, PersonalInfo } from '@/core/types'

export const createConversation = async (apis: AiAssistConfig['apis']) => {
  if (!apis.createaconversationApi) return
  const result = await http.post(apis.createaconversationApi, '')
  return result
}

export const getConversationMessages = async (
  apis: AiAssistConfig['apis'],
  appConversationId: string
) => {
  if (!apis.conversationmessagesApi) return null
  const authAxios = createAuthAxios()
  const res = await authAxios.post(apis.conversationmessagesApi, {
    AppConversationID: appConversationId,
    AppKey: getConfig().appKey,
    Limit: 100,
  })
  return res.data
}

export const sendMessage = async (
  apis: AiAssistConfig['apis'],
  text: string,
  appConversationId: string,
  token: string
) => {
  const authAxios = createAuthAxios()
  const data = {
    Query: text,
    AppConversationID: appConversationId,
    AppKey: getConfig().appKey,
    QueryExtends: { Files: [] },
  }
  const res = await authAxios.post(apis.replyApi, data, {
    headers: { Accept: 'text/html' },
  })
  return res.data
}

export const stopReply = async (
  apis: AiAssistConfig['apis'],
  messageId: string,
  userId: string
) => {
  if (!apis.setopreplyApi) return
  await http.post(apis.setopreplyApi, version({
    MessageID: messageId,
    UserID: userId,
  }))
}

export const getHistoryList = async (apis: AiAssistConfig['apis']) => {
  if (!apis.historyApi) return null
  const result = await http.post(apis.historyApi, 279)
  return result
}

export const deleteHistory = async (
  apis: AiAssistConfig['apis'],
  appConversationId: string
) => {
  if (!apis.deletehistoryApi) return
  await http.post(apis.deletehistoryApi, { appConversationID: appConversationId })
}

export const getPersonalInfo = async (apis: AiAssistConfig['apis']): Promise<PersonalInfo | null> => {
  if (!apis.personalInfoApi) return null
  const res = await http.post(apis.personalInfoApi)
  return res?.data
}
