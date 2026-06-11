import axios from 'axios'
import type { AiAssistConfig } from '@/core/types'

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
  return axios.create({
    baseURL: cfg.baseUrl,
    timeout: 600000,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.token}`,
    },
  })
}
