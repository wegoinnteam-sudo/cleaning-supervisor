import { getGoogleAuth } from './linenInventory.js'
import { saveStock } from '../../shared/linenStock.js'
export async function saveLinenStock(body) {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets'])
  if (!auth) throw Object.assign(new Error('Google 서비스 계정 인증 설정이 필요합니다.'), { status: 401 })
  const client = await auth.getClient?.() || auth
  return saveStock(async (path, params, options = {}) => {
    const response = await client.request({ url: `https://sheets.googleapis.com/v4/spreadsheets/${path}`, params, method: options.method || 'GET', data: options.body, retry: false })
    return response.data
  }, process.env, body)
}
