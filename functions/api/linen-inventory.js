const DEFAULT_SPREADSHEET_ID = '1ALRPlfA777W1KHiHycva9RuGrPAaSwLg1mJLWS5bJcU'
const KOREA_TIME_ZONE = 'Asia/Seoul'
const INVENTORY_RANGE = 'A1:ZZ1000'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
const WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

let cachedReadToken = null
let cachedWriteToken = null

const linenItems = [
  { key: 'singleDuvetCover', labels: ['싱글 이불커버', '싱글이불커버', 'single duvet cover'], packSize: 5, fixedQuantity: 39 },
  { key: 'doubleDuvetCover', labels: ['더블 이불커버', '더블이불커버', 'double duvet cover'], packSize: 5, fixedQuantity: 28 },
  { key: 'singleMattressCover', labels: ['싱글 매트리스커버', '싱글매트리스커버', '싱글 배트리스커버', 'single mattress cover'], packSize: null, fixedQuantity: 39 },
  { key: 'doubleMattressCover', labels: ['더블 매트리스커버', '더블매트리스커버', 'double mattress cover'], packSize: null, fixedQuantity: 28 },
  { key: 'pillowCover', labels: ['베개커버', 'pillow cover'], packSize: 50, fixedQuantity: 95 },
  { key: 'bathMat', labels: ['발매트', 'bath mat'], packSize: 20, fixedQuantity: 43 },
]

const metricAliases = {
  currentQuantity: ['현재수량', '현제수량'],
  requiredQuantity: ['세탁필요수량', '세탁 필요 수량'],
  incomingQuantity: ['들어온수량', '들어온 수량', '입고수량', '입고 수량'],
  currentStock: ['현재재고', '현제재고', '현재 재고', '현제 재고'],
  totalQuantity: ['총수량', '총 수량'],
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function base64UrlEncode(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function base64ToArrayBuffer(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes.buffer
}

function normalizePrivateKey(privateKey = '') {
  const normalizedKey = privateKey.replace(/\\n/g, '\n').trim()
  if (normalizedKey.includes('\n')) return normalizedKey

  const keyBody = normalizedKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '')

  if (!keyBody) return normalizedKey

  const keyLines = keyBody.match(/.{1,64}/g) || []
  return [
    '-----BEGIN PRIVATE KEY-----',
    ...keyLines,
    '-----END PRIVATE KEY-----',
  ].join('\n')
}

function getServiceAccountEmail(env) {
  return env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    || env.GOOGLE_CLIENT_EMAIL
    || env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL
    || env.CLIENT_EMAIL
    || ''
}

function getPrivateKey(env) {
  if (env.GOOGLE_PRIVATE_KEY_BASE64) {
    return atob(env.GOOGLE_PRIVATE_KEY_BASE64).trim()
  }

  return env.GOOGLE_PRIVATE_KEY
    || env.PRIVATE_KEY
    || ''
}

async function createServiceAccountToken(env, scope) {
  const serviceAccountEmail = getServiceAccountEmail(env)
  const privateKey = getPrivateKey(env)
  if (!serviceAccountEmail || !privateKey) return null

  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64UrlEncode(JSON.stringify({
    iss: serviceAccountEmail,
    scope,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }))
  const unsignedToken = `${header}.${payload}`
  const pem = normalizePrivateKey(privateKey)
  const keyBody = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const key = await crypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(keyBody),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedToken),
  )
  const assertion = `${unsignedToken}.${base64UrlEncode(signature)}`
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Google 서비스 계정 인증에 실패했습니다.')
  }

  return {
    token: data.access_token,
    expiresAt: Date.now() + Math.max((data.expires_in || 3600) - 60, 60) * 1000,
  }
}

async function getAccessToken(env, scope) {
  const cache = scope === WRITE_SCOPE ? cachedWriteToken : cachedReadToken
  if (cache && cache.expiresAt > Date.now()) return cache.token

  const token = await createServiceAccountToken(env, scope)
  if (scope === WRITE_SCOPE) cachedWriteToken = token
  else cachedReadToken = token

  return token?.token || null
}

function getSpreadsheetId(env) {
  return env.GOOGLE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID
}


function getEnvDiagnostics(env) {
  const serviceEmail = getServiceAccountEmail(env)
  const privateKey = getPrivateKey(env)

  return {
    hasApiKey: Boolean(env.GOOGLE_API_KEY),
    hasServiceEmail: Boolean(serviceEmail),
    serviceEmailSource: env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 'GOOGLE_SERVICE_ACCOUNT_EMAIL'
      : env.GOOGLE_CLIENT_EMAIL ? 'GOOGLE_CLIENT_EMAIL'
        : env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL ? 'GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL'
          : env.CLIENT_EMAIL ? 'CLIENT_EMAIL'
            : '',
    serviceEmailLooksValid: /^[^@]+@[^@]+\.iam\.gserviceaccount\.com$/.test(serviceEmail),
    hasPrivateKey: Boolean(privateKey),
    privateKeySource: env.GOOGLE_PRIVATE_KEY ? 'GOOGLE_PRIVATE_KEY'
      : env.GOOGLE_PRIVATE_KEY_BASE64 ? 'GOOGLE_PRIVATE_KEY_BASE64'
        : env.PRIVATE_KEY ? 'PRIVATE_KEY'
          : '',
    privateKeyLength: privateKey.length,
    privateKeyHasBegin: privateKey.includes('BEGIN PRIVATE KEY'),
    privateKeyHasEnd: privateKey.includes('END PRIVATE KEY'),
    privateKeyHasEscapedNewlines: privateKey.includes('\\n'),
    privateKeyHasRealNewlines: privateKey.includes('\n'),
    configuredLinenSheetName: env.GOOGLE_LINEN_SHEET_NAME || env.GOOGLE_INVENTORY_SHEET_NAME || '',
  }
}

function getTodayInKorea(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}.${values.month}.${values.day}`
}

function normalizeDate(value = '', defaultYear = new Date().getFullYear()) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 30000) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 24 * 60 * 60 * 1000)
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('.')
  }

  const dateText = String(value)
  const serialDate = Number(dateText)
  if (Number.isFinite(serialDate) && serialDate > 30000) return normalizeDate(serialDate, defaultYear)

  const fullDateMatch = dateText.match(/(\d{4})\D?(\d{1,2})\D?(\d{1,2})/)

  if (fullDateMatch) {
    const [, year, month, day] = fullDateMatch
    return `${year}.${month.padStart(2, '0')}.${day.padStart(2, '0')}`
  }

  const monthDayMatch = dateText.match(/(\d{1,2})\D+(\d{1,2})/)
  if (!monthDayMatch) return ''

  const [, month, day] = monthDayMatch
  const year = String(defaultYear)
  return `${year}.${month.padStart(2, '0')}.${day.padStart(2, '0')}`
}

function normalizeLabel(value = '') {
  return String(value).toLowerCase().replace(/\s+/g, '').trim()
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function quoteSheetName(title) {
  return `'${title.replaceAll("'", "''")}'`
}

function columnToA1(index) {
  let column = ''
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    column = String.fromCharCode(((value - 1) % 26) + 65) + column
  }
  return column
}

function getConfiguredSheetTitle(env) {
  return env.GOOGLE_LINEN_SHEET_NAME || env.GOOGLE_INVENTORY_SHEET_NAME || ''
}

function inferMetric(value = '') {
  const normalizedValue = normalizeLabel(value)
  return Object.entries(metricAliases).find(([, aliases]) => (
    aliases.some((alias) => normalizedValue.includes(normalizeLabel(alias)))
  ))?.[0] || ''
}

function inferItem(values) {
  const normalizedValues = values.map(normalizeLabel).filter(Boolean)
  return linenItems.find((item) => (
    item.labels.some((label) => normalizedValues.some((value) => value.includes(normalizeLabel(label))))
  ))?.key || ''
}

function fillRow(row = [], maxColumns = row.length) {
  let previous = ''
  return Array.from({ length: maxColumns }, (_, index) => {
    const value = String(row[index] || '').trim()
    if (value) previous = value
    return previous
  })
}

function findDateRowIndex(rows, targetDate) {
  const targetYear = targetDate.slice(0, 4)
  return rows.findIndex((row) => normalizeDate(row[0], targetYear) === targetDate)
}

function findColumns(rows, sheetTitle) {
  const maxColumns = Math.max(...rows.map((row) => row.length), 0)
  const categoryRow = fillRow(rows[0] || [], maxColumns)
  const metricRow = rows[1] || []
  const columns = {}

  for (let columnIndex = 0; columnIndex < maxColumns; columnIndex += 1) {
    const metric = inferMetric(metricRow[columnIndex] || '')
    if (!metric) continue

    const itemKey = inferItem([
      categoryRow[columnIndex] || '',
      rows[0]?.[columnIndex] || '',
      sheetTitle,
    ])
    if (!itemKey) continue

    columns[itemKey] ||= {}
    columns[itemKey][metric] = columnIndex
  }

  return columns
}

async function fetchSheets(spreadsheetPath, params, env, options = {}) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetPath}`)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  const headers = options.headers ? { ...options.headers } : {}
  const scope = options.scope || READONLY_SCOPE
  const accessToken = await getAccessToken(env, scope)
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`
  } else if (env.GOOGLE_API_KEY && !options.requireAuth) {
    url.searchParams.set('key', env.GOOGLE_API_KEY)
  } else {
    throw new Error('Google Sheet 저장에는 GOOGLE_SERVICE_ACCOUNT_EMAIL 또는 GOOGLE_CLIENT_EMAIL, 그리고 GOOGLE_PRIVATE_KEY 또는 PRIVATE_KEY가 필요합니다.')
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body,
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || 'Google Spreadsheet 요청에 실패했습니다.')
  }

  return data
}

async function listSheetTitles(spreadsheetId, env) {
  const configuredSheetTitle = getConfiguredSheetTitle(env)
  if (configuredSheetTitle) return [configuredSheetTitle]

  const data = await fetchSheets(spreadsheetId, {
    fields: 'sheets(properties(title,index))',
  }, env)

  return data.sheets
    ?.map((sheet) => sheet.properties)
    .sort((left, right) => left.index - right.index)
    .map((properties) => properties.title)
    .filter(Boolean) || []
}

async function readSheetRows(spreadsheetId, sheetTitle, env) {
  const range = `${quoteSheetName(sheetTitle)}!${INVENTORY_RANGE}`
  const data = await fetchSheets(`${spreadsheetId}/values/${encodeURIComponent(range)}`, {
    valueRenderOption: 'UNFORMATTED_VALUE',
  }, env)

  return data.values || []
}

async function findInventoryLayout(spreadsheetId, date, env) {
  const sheetTitles = await listSheetTitles(spreadsheetId, env)

  for (const sheetTitle of sheetTitles) {
    const rows = await readSheetRows(spreadsheetId, sheetTitle, env)
    const dateRowIndex = findDateRowIndex(rows, date)
    if (dateRowIndex === -1) continue

    const columns = findColumns(rows, sheetTitle)
    const hasRequiredColumns = linenItems.some((item) => (
      columns[item.key]?.requiredQuantity !== undefined || columns[item.key]?.incomingQuantity !== undefined
    ))

    if (hasRequiredColumns) {
      return { sheetTitle, rows, dateRowIndex, columns }
    }
  }

  throw new Error(`린넨 재고 시트에서 오늘 날짜(${date}) 행과 품목 컬럼을 찾지 못했습니다.`)
}

function buildIncomingQuantities(receivedInputs = {}) {
  return Object.fromEntries(linenItems.map((item) => {
    const inputValue = toNumber(receivedInputs[item.key])
    const quantity = item.packSize ? inputValue * item.packSize : inputValue
    return [item.key, quantity]
  }))
}

function readInventoryValues(layout) {
  return Object.fromEntries(linenItems.map((item) => {
    const itemColumns = layout.columns[item.key] || {}
    const row = layout.rows[layout.dateRowIndex] || []

    return [item.key, {
      currentQuantity: itemColumns.currentQuantity === undefined ? null : toNumber(row[itemColumns.currentQuantity]),
      requiredQuantity: itemColumns.requiredQuantity === undefined ? null : toNumber(row[itemColumns.requiredQuantity]),
      incomingQuantity: itemColumns.incomingQuantity === undefined ? null : toNumber(row[itemColumns.incomingQuantity]),
      currentStock: itemColumns.currentStock === undefined ? null : toNumber(row[itemColumns.currentStock]),
      totalQuantity: itemColumns.totalQuantity === undefined ? null : toNumber(row[itemColumns.totalQuantity]),
    }]
  }))
}

async function getLinenInventory(env) {
  const spreadsheetId = getSpreadsheetId(env)
  const date = getTodayInKorea()
  const layout = await findInventoryLayout(spreadsheetId, date, env)

  return {
    spreadsheetId,
    sheetTitle: layout.sheetTitle,
    date,
    inventory: readInventoryValues(layout),
  }
}

async function saveLinenInventory(env, { requiredQuantities = {}, receivedInputs = {} }) {
  const spreadsheetId = getSpreadsheetId(env)
  const date = getTodayInKorea()
  const layout = await findInventoryLayout(spreadsheetId, date, env)
  const incomingQuantities = buildIncomingQuantities(receivedInputs)
  const data = []

  linenItems.forEach((item) => {
    const itemColumns = layout.columns[item.key] || {}
    const row = layout.rows[layout.dateRowIndex] || []
    const currentColumn = itemColumns.currentQuantity
    const requiredColumn = itemColumns.requiredQuantity
    const incomingColumn = itemColumns.incomingQuantity
    const stockColumn = itemColumns.currentStock
    const totalColumn = itemColumns.totalQuantity
    const requiredQuantity = toNumber(requiredQuantities[item.key])
    const incomingQuantity = incomingQuantities[item.key]
    const currentQuantity = currentColumn === undefined ? 0 : toNumber(row[currentColumn])
    const currentStock = currentQuantity + requiredQuantity + incomingQuantity

    if (requiredColumn !== undefined) {
      data.push({
        range: `${quoteSheetName(layout.sheetTitle)}!${columnToA1(requiredColumn)}${layout.dateRowIndex + 1}`,
        values: [[requiredQuantity]],
      })
    }

    if (incomingColumn !== undefined) {
      data.push({
        range: `${quoteSheetName(layout.sheetTitle)}!${columnToA1(incomingColumn)}${layout.dateRowIndex + 1}`,
        values: [[incomingQuantity]],
      })
    }

    if (stockColumn !== undefined) {
      data.push({
        range: `${quoteSheetName(layout.sheetTitle)}!${columnToA1(stockColumn)}${layout.dateRowIndex + 1}`,
        values: [[currentStock]],
      })
    }

    if (totalColumn !== undefined) {
      data.push({
        range: `${quoteSheetName(layout.sheetTitle)}!${columnToA1(totalColumn)}${layout.dateRowIndex + 1}`,
        values: [[currentStock + item.fixedQuantity]],
      })
    }
  })

  if (!data.length) throw new Error('저장할 세탁필요수량, 들어온수량, 현재재고 또는 총수량 컬럼을 찾지 못했습니다.')

  await fetchSheets(`${spreadsheetId}/values:batchUpdate`, {}, env, {
    method: 'POST',
    scope: WRITE_SCOPE,
    requireAuth: true,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  })

  const refreshedLayout = await findInventoryLayout(spreadsheetId, date, env)

  return {
    spreadsheetId,
    sheetTitle: layout.sheetTitle,
    date,
    incomingQuantities,
    updatedRanges: data.map((entry) => entry.range),
    inventory: readInventoryValues(refreshedLayout),
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)

  if (url.searchParams.get('debug') === 'true') {
    const diagnostics = getEnvDiagnostics(env)

    try {
      const inventory = await getLinenInventory(env)
      return json({
        ...diagnostics,
        linenReadOk: true,
        sheetTitle: inventory.sheetTitle,
        date: inventory.date,
      })
    } catch (error) {
      return json({
        ...diagnostics,
        linenReadOk: false,
        message: error.message,
      }, 500)
    }
  }

  try {
    return json(await getLinenInventory(env))
  } catch (error) {
    return json({ message: error.message }, 500)
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json()
    return json(await saveLinenInventory(env, body || {}))
  } catch (error) {
    return json({ message: error.message }, 500)
  }
}
