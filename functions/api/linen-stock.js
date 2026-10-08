import { fetchSheets } from './linen-inventory.js'
import { saveStock } from '../../shared/linenStock.js'
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json()
    const result = await saveStock((path, params, options = {}) => fetchSheets(path, params, env, {
      ...options, scope: 'https://www.googleapis.com/auth/spreadsheets', requireAuth: true,
      headers: { 'content-type': 'application/json' }, body: options.body ? JSON.stringify(options.body) : undefined,
    }), env, body)
    return Response.json(result, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const authError = [401, 403].includes(error.status) || /서비스 계정 인증|GOOGLE_SERVICE_ACCOUNT/.test(error.message)
    const code = authError ? 'auth' : error instanceof TypeError ? 'network' : 'api'
    console.error('[linen-stock]', code, error.message)
    return Response.json({ message: '저장에 실패했습니다. 다시 확인해 주세요.', code, detail: String(error?.message || error) }, { status: error.status || (authError ? 401 : 500) })
  }
}
