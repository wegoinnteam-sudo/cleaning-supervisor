export const STOCK_ITEMS = [
  ['singleDuvetCover', '싱글 이불커버'],
  ['doubleDuvetCover', '더블 이불커버'],
  ['singleMattressCover', '싱글 매트리스커버'],
  ['doubleMattressCover', '더블 매트리스커버'],
  ['pillowCover', '베개커버'],
  ['bathMat', '발매트'],
]
export const STOCK_SPREADSHEET_ID = '1a8jUbszQLpq-mzbfIV4oPgxrGxFCrFAnc4lhlzVzL-w'
const ITEM_HEADERS = {
  '이불(싱글)': 'singleDuvetCover',
  '이불(더블)': 'doubleDuvetCover',
  '베개': 'pillowCover',
  '발매트': 'bathMat',
  '(침대커버)싱글': 'singleMattressCover',
  '(침대커버)더블': 'doubleMattressCover',
}
const quoteTitle = title => `'${title.replaceAll("'", "''")}'`
const normalizeHeader = value => String(value ?? '').replace(/\s/g, '').toLowerCase()
function itemColumns(headers) {
  const keys = headers.slice(4, 10).map(header => Object.entries(ITEM_HEADERS).find(([label]) => normalizeHeader(label) === normalizeHeader(header))?.[1])
  return keys.length === 6 && keys.every(Boolean) && new Set(keys).size === 6 ? keys : null
}
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
  const sheets = (info.sheets || []).map(({ properties }) => properties)
    .filter(({ title }) => !env.GOOGLE_STOCK_SHEET_TAB_NAME || title === env.GOOGLE_STOCK_SHEET_TAB_NAME)
  if (!sheets.length) throw new Error(`GOOGLE_STOCK_SHEET_TAB_NAME(${env.GOOGLE_STOCK_SHEET_TAB_NAME}) 탭을 찾지 못했습니다.`)
  // Check every tab's row-2 header in one request instead of reading each whole tab.
  const headerResult = await call(`${spreadsheetId}/values:batchGetByDataFilter`, {}, { method: 'POST', body: {
    dataFilters: sheets.map(({ title }) => ({ a1Range: `${quoteTitle(title)}!A2:J2` })),
  } })
  const headerRows = (headerResult.valueRanges || []).map(range => range.valueRange?.values?.[0] || [])
  const candidates = sheets.map((properties, index) => ({ properties, columns: itemColumns(headerRows[index]) })).filter(candidate => candidate.columns)
  if (candidates.length !== 1) {
    const found = sheets.length === 1 ? ` 현재 2행: ${headerRows[0]?.join(' | ') || '(비어 있음)'}` : ` 일치한 탭 수: ${candidates.length}`
    throw new Error(`2행 품목 헤더(E~J)가 일치하는 워크시트를 하나만 찾아야 합니다.${found}`)
  }
  const { properties, columns } = candidates[0]
  row.splice(4, 6, ...columns.map(key => quantities[key]))
  // Google appends after the final row containing data, skipping internal gaps.
  const result = await call(`${spreadsheetId}:batchUpdate`, {}, { method: 'POST', body: { requests: [
    { appendCells: { sheetId: properties.sheetId, rows: [{ values: row.map(value => ({ userEnteredValue: typeof value === 'number' ? { numberValue: value } : { stringValue: value } })) }], fields: 'userEnteredValue' } },
    { createDeveloperMetadata: { developerMetadata: { metadataId: id, metadataKey: 'sv-linen-stock', metadataValue: fingerprint, visibility: 'DOCUMENT', location: { spreadsheet: true } } } },
  ] } })
  if (!result.replies || result.replies.length !== 2) throw new Error('Google Sheets 저장 응답을 확인할 수 없습니다.')
  return { saved: true, requestId, sheetTitle: properties.title, date: row[0] }
}
