export const STOCK_ITEMS = [
  ['singleDuvetCover', '싱글 이불커버'],
  ['doubleDuvetCover', '더블 이불커버'],
  ['singleMattressCover', '싱글 매트리스커버'],
  ['doubleMattressCover', '더블 매트리스커버'],
  ['pillowCover', '베개커버'],
  ['bathMat', '발매트'],
]
export const STOCK_SPREADSHEET_ID = '1a8jUbszQLpq-mzbfIV4oPgxrGxFCrFAnc4lhlzVzL-w'
const HEADERS = ['날짜', 'Dirty sheet', 'sv', 'Rewash', '이불(싱글)', '이불(더블)', '베개', '발매트', '(침대커버)싱글', '(침대커버)더블']
export function stockDate(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date).map(p => [p.type, p.value]))
  return `${parts.year}. ${Number(parts.month)}. ${Number(parts.day)}`
}
export function stockRow(quantities, date) {
  if (!quantities || STOCK_ITEMS.some(([key]) => !Number.isSafeInteger(quantities[key]) || quantities[key] < 0)) throw Object.assign(new Error('0 이상의 정수를 입력해 주세요.'), { status: 400 })
  if (STOCK_ITEMS.every(([key]) => quantities[key] === 0)) throw Object.assign(new Error('수량을 하나 이상 입력해 주세요.'), { status: 400 })
  const q = quantities
  return [stockDate(date), 'Dirty sheet', 'sv', 'Rewash', q.singleDuvetCover, q.doubleDuvetCover, q.pillowCover, q.bathMat, q.singleMattressCover, q.doubleMattressCover]
}
// Stable positive metadata ID: Google rejects duplicate IDs atomically with the append.
async function metadataId(requestId) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(requestId)))
  return (new DataView(bytes.buffer).getUint32(0) & 0x7fffffff) || 1
}
export async function saveStock(call, env, body, date = new Date()) {
  const { requestId, quantities } = body
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId || '')) throw Object.assign(new Error('유효한 요청 ID가 필요합니다.'), { status: 400 })
  const row = stockRow(quantities, date)
  const spreadsheetId = env.GOOGLE_STOCK_SPREADSHEET_ID || STOCK_SPREADSHEET_ID
  if (spreadsheetId !== STOCK_SPREADSHEET_ID) throw new Error('린넨 기록 대상 Spreadsheet ID를 확인해 주세요.')
  const id = await metadataId(requestId)
  const fingerprint = JSON.stringify([requestId, ...STOCK_ITEMS.map(([key]) => quantities[key])])
  const previous = await call(`${spreadsheetId}/developerMetadata:search`, {}, { method: 'POST', body: { dataFilters: [{ developerMetadataLookup: { metadataId: id } }] } })
  const metadata = previous.matchedDeveloperMetadata?.[0]?.developerMetadata
  if (metadata) {
    if (metadata.metadataKey !== 'sv-linen-stock' || metadata.metadataValue !== fingerprint) throw Object.assign(new Error('요청 ID 충돌: 새 요청이 필요합니다.'), { status: 409 })
    return { saved: true, requestId, alreadySaved: true }
  }
  const info = await call(spreadsheetId, { fields: 'sheets(properties(sheetId,title))' })
  const candidates = []
  for (const { properties } of info.sheets || []) {
    if (env.GOOGLE_STOCK_SHEET_TAB_NAME && properties.title !== env.GOOGLE_STOCK_SHEET_TAB_NAME) continue
    const quoted = `'${properties.title.replaceAll("'", "''")}'`
    const result = await call(`${spreadsheetId}/values/${encodeURIComponent(quoted)}`, { valueRenderOption: 'FORMULA' })
    const values = result.values || []
    if (!HEADERS.every((header, index) => String(values[1]?.[index] || '').trim() === header)) continue
    candidates.push({ properties, values })
  }
  if (candidates.length !== 1) throw new Error('일치하는 실제 워크시트가 하나여야 합니다. GOOGLE_STOCK_SHEET_TAB_NAME과 2행 헤더를 확인해 주세요.')
  const { properties, values } = candidates[0]
  let last = 1
  values.forEach((r, index) => { if (index >= 2 && String(r[0] ?? '').trim()) last = index })
  // appendCells uses the last data row across the sheet. Fail closed if that differs from A.
  if (values.slice(last + 1).some(r => r.some(v => v !== '' && v != null))) throw new Error('A열 마지막 기록 아래에 다른 열의 데이터가 있습니다. 기존 데이터 보호를 위해 저장을 중단합니다.')
  const result = await call(`${spreadsheetId}:batchUpdate`, {}, { method: 'POST', body: { requests: [
    { appendCells: { sheetId: properties.sheetId, rows: [{ values: row.map(value => ({ userEnteredValue: typeof value === 'number' ? { numberValue: value } : { stringValue: value } })) }], fields: 'userEnteredValue' } },
    { createDeveloperMetadata: { developerMetadata: { metadataId: id, metadataKey: 'sv-linen-stock', metadataValue: fingerprint, visibility: 'DOCUMENT', location: { spreadsheet: true } } } },
  ] } })
  if (!result.replies || result.replies.length !== 2) throw new Error('Google Sheets 저장 응답을 확인할 수 없습니다.')
  return { saved: true, requestId, sheetTitle: properties.title, date: row[0] }
}
