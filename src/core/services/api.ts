import { http, createAuthAxios } from './request'
import version from './version'
import type { AiAssistConfig, PersonalInfo, ConversationItem, ConversationMessageItem } from '@/core/types'

// ==================== 响应处理 ====================

/** 统一响应格式 */
interface ApiResponse<T = any> {
  code: number
  msg: string
  data: T
}

/** PascalCase → camelCase */
const toCamelCase = (str: string): string => str.charAt(0).toLowerCase() + str.slice(1)

/** 递归将对象所有 key 从 PascalCase 转为 camelCase */
const convertKeysToCamelCase = <T = any>(obj: any): T => {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(convertKeysToCamelCase) as unknown as T
  if (typeof obj === 'object') {
    const result: Record<string, any> = {}
    for (const key of Object.keys(obj)) {
      result[toCamelCase(key)] = convertKeysToCamelCase(obj[key])
    }
    return result as T
  }
  return obj
}

/**
 * 统一解析响应：校验 code !== 0 则抛错，data 为 JSON 字符串自动反序列化，
 * 并将所有 key 从 PascalCase 转为 camelCase
 */
const parseResponse = <T = any>(response: ApiResponse): T => {
  if (response.code !== 0) {
    throw new Error(response.msg || '请求失败')
  }
  const rawData = response.data
  let data: any
  if (typeof rawData === 'string') {
    data = JSON.parse(rawData)
  } else {
    data = rawData
  }
  return convertKeysToCamelCase(data) as T
}

// ==================== 会话管理 ====================

export const createConversation = async (apis: AiAssistConfig['apis']): Promise<{ conversation: ConversationItem } | undefined> => {
  if (!apis.createConversationApi) return
  const result = await http.post(apis.createConversationApi, version({}))
  return parseResponse<{ conversation: ConversationItem }>(result)
}

export const getConversationList = async (apis: AiAssistConfig['apis']): Promise<{ conversationList: ConversationItem[] } | null> => {
  if (!apis.getConversationListApi) return null
  const result = await http.post(apis.getConversationListApi, version({}))
  return parseResponse<{ conversationList: ConversationItem[] }>(result)
}

export const deleteConversation = async (
  apis: AiAssistConfig['apis'],
  appConversationId: string
) => {
  if (!apis.deleteConversationApi) return
  const result = await http.post(apis.deleteConversationApi, version({
    AppConversationID: appConversationId,
  }))
  parseResponse(result)
}

export const getConversationMessages = async (
  apis: AiAssistConfig['apis'],
  appConversationId: string
): Promise<{ messages: ConversationMessageItem[] } | null> => {
  if (!apis.getConversationMessagesApi) return null
  const authAxios = createAuthAxios()
  const res = await authAxios.post(apis.getConversationMessagesApi, version({
    AppConversationID: appConversationId,
    Limit: 100,
  }))
  return parseResponse<{ messages: ConversationMessageItem[] }>(res.data)
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
  return parseResponse(res.data)
}

/** 停止回复 */
export const stopMessage = async (
  apis: AiAssistConfig['apis'],
  messageId: string,
) => {
  if (!apis.stopMessageApi) return
  const result = await http.post(apis.stopMessageApi, version({
    MessageID: messageId,
  }))
  parseResponse(result)
}

// ==================== 其他 ====================

export const getSuggestedQuestions = async (apis: AiAssistConfig['apis']) => {
  if (!apis.getSuggestedQuestionsApi) return null
  const result = await http.post(apis.getSuggestedQuestionsApi, version({}))
  return parseResponse(result)
}

export const getMessageInfo = async (
  apis: AiAssistConfig['apis'],
  messageId: string
) => {
  if (!apis.getMessageInfoApi) return null
  const result = await http.post(apis.getMessageInfoApi, version({
    MessageID: messageId,
  }))
  return parseResponse(result)
}

export const getAppConfig = async (apis: AiAssistConfig['apis']) => {
  if (!apis.getAppConfigApi) return null
  const result = await http.post(apis.getAppConfigApi, version({}))
  return parseResponse(result)
}

export const getPersonalInfo = async (apis: AiAssistConfig['apis']): Promise<PersonalInfo | null> => {
  if (!apis.getPersonalInfoApi) return null
  const result = await http.post(apis.getPersonalInfoApi, version({}))
  return parseResponse<PersonalInfo>(result)
}
