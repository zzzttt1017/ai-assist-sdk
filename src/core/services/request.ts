import axios from 'axios'
import type { AiAssistConfig } from '@/core/types'

/** HTTP 状态码 → 友好提示文案 */
const HTTP_ERROR_MAP: Record<number, string> = {
  400: '请求参数错误',
  401: '登录已过期，请重新登录',
  403: '暂无权限访问',
  404: '请求的资源不存在',
  408: '请求超时，请稍后再试',
  413: '提交数据过大，请精简后重试',
  429: '请求过于频繁，请稍后再试',
  500: '服务器开小差了，请稍后再试',
  502: '网关错误，请稍后再试',
  503: '服务暂时不可用，请稍后再试',
  504: '网关超时，请稍后再试',
}

/** 从 axios 错误中解析出友好提示文案（优先取后端返回的 msg） */
const resolveErrorMessage = (error: any): string => {
  if (error?.response) {
    const { status, data } = error.response
    const backendMsg = data?.msg || data?.message || (typeof data === 'string' ? data : '')
    if (backendMsg) return backendMsg
    return HTTP_ERROR_MAP[status] || `请求失败（${status}）`
  }
  if (error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')) {
    return '请求超时，请稍后再试'
  }
  if (error?.message === 'Network Error') {
    return '网络连接失败，请检查网络'
  }
  return error?.message || '网络异常，请稍后再试'
}

/** 为 axios 实例挂载统一响应错误拦截器，把非 2xx 转为带友好文案的 Error */
const attachErrorInterceptor = (ax: ReturnType<typeof axios.create>) => {
  ax.interceptors.response.use(
    (res) => res,
    (error) => Promise.reject(new Error(resolveErrorMessage(error)))
  )
  return ax
}

let config: AiAssistConfig | null = null

export const setConfig = (cfg: AiAssistConfig) => {
  config = cfg
}

export const getConfig = (): AiAssistConfig => {
  if (!config) throw new Error('AiAssistSdk 未初始化，请先调用 initAiAssist')
  return config
}

const instance = axios.create({
  timeout: 180000,
  headers: {
    'Content-Type': 'application/json',
  },
})
attachErrorInterceptor(instance)

instance.interceptors.request.use((reqConfig) => {
  const cfg = getConfig()
  if (reqConfig.headers) {
    reqConfig.headers['Authorization'] = `Bearer ${cfg.token}`
  }
  if (!reqConfig.baseURL && cfg.baseUrl) {
    reqConfig.baseURL = cfg.baseUrl
  }
  return reqConfig
})

export const request = async <T = any>(
  url: string,
  data: any = {},
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  headers: Record<string, string> = {}
): Promise<T> => {
  const cfg = getConfig()
  const reqConfig: any = {
    method,
    url,
    baseURL: cfg.baseUrl,
    headers: {
      ...headers,
      Authorization: `Bearer ${cfg.token}`,
    },
  }
  method.toUpperCase() === 'GET' ? (reqConfig.params = data) : (reqConfig.data = data)
  const response = await instance(reqConfig)
  return response.data
}

export const http = {
  get: <T = any>(url: string, params?: any, headers?: Record<string, string>) =>
    request<T>(url, params, 'GET', headers),
  post: <T = any>(url: string, data?: any, headers?: Record<string, string>) =>
    request<T>(url, data, 'POST', headers),
  put: <T = any>(url: string, data?: any, headers?: Record<string, string>) =>
    request<T>(url, data, 'PUT', headers),
  delete: <T = any>(url: string, headers?: Record<string, string>) =>
    request<T>(url, {}, 'DELETE', headers),
}

export const createAuthAxios = () => {
  const cfg = getConfig()
  return attachErrorInterceptor(axios.create({
    baseURL: cfg.baseUrl,
    timeout: 600000,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.token}`,
    },
  }))
}
