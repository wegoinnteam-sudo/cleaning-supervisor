const DEFAULT_SPREADSHEET_ID = '1ALRPlfA777W1KHiHycva9RuGrPAaSwLg1mJLWS5bJcU'
const DEFAULT_SCHEDULE_SHEET_NAME = '청소스케쥴'
const SCHEDULE_SHEET_NAME_ALIASES = ['청소스케줄']
const SCHEDULE_RANGE = 'A1:Z3000'
const KOREA_TIME_ZONE = 'Asia/Seoul'
const FORECAST_DAY_COUNT = 7
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

const DATE_COLUMN_INDEX = 1 // B
const CHECKOUT_COLUMN_INDEX = 3 // D
const NO_SHOW_COLUMN_INDEX = 4 // E
const ADJUSTMENT_COLUMN_INDEX = 5 // F
const ACTUAL_CLEAN_COLUMN_INDEX = 6 // G

const STAFF_GROUP_DEFINITIONS = [
  { position: 'Exchange Staff', startColumn: 11, endColumn: 17 }, // L-R
  { position: 'Part-Time', startColumn: 18, endColumn: 22 }, // S-W
  { position: 'SV', startColumn: 23, endColumn: 23 }, // X
  { position: 'SUB', startColumn: 24, endColumn: 24 }, // Y
]

let cachedAccessToken = null

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

function normalizePrivateKey(privateKey) {
  return privateKey.replace(/\\n/g, '\n')
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

async function createServiceAccountToken(env) {
  const serviceAccountEmail = getServiceAccountEmail(env)
  const privateKey = getPrivateKey(env)
  if (!serviceAccountEmail || !privateKey) return null

  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64UrlEncode(JSON.stringify({
    iss: serviceAccountEmail,
    scope: SHEETS_SCOPE,
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

async function getAccessToken(env) {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.token
  }

  cachedAccessToken = await createServiceAccountToken(env)
  return cachedAccessToken?.token || null
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

function getKoreaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  }
}

function kstDateToUtcDate(year, month, day, hour, minute, second) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second))
}

function getUpcomingKoreaDates(date = new Date(), count = FORECAST_DAY_COUNT) {
  const { year, month, day } = getKoreaDateParts(date)
  const midnightToday = kstDateToUtcDate(year, month, day, 0, 0, 0)

  return Array.from({ length: count }, (_, index) => {
    const offsetMs = (index + 1) * 24 * 60 * 60 * 1000
    return getTodayInKorea(new Date(midnightToday.getTime() + offsetMs))
  })
}

function normalizeDate(value = '', defaultYear = getKoreaDateParts().year) {
  const dateText = String(value)
  const fullDateMatch = dateText.match(/(\d{4})\D*(\d{1,2})\D*(\d{1,2})/)

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

function cell(row = [], index) {
  const value = row[index]
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function parseSignedNumber(value = '') {
  const cleaned = String(value).replace(/[^0-9+\-.]/g, '')
  if (!cleaned) return 0
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : 0
}

function splitStaffNames(value = '') {
  return value.split(/[\n,、/]+/).map((name) => name.trim()).filter(Boolean)
}

function normalizeHeader(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findHeaderColumns(rows, header, headerRows) {
  const maxColumns = Math.max(...headerRows.map((rowIndex) => rows[rowIndex]?.length || 0), 0)
  return Array.from({ length: maxColumns }, (_, columnIndex) => columnIndex).filter((columnIndex) => (
    headerRows.some((rowIndex) => normalizeHeader(cell(rows[rowIndex], columnIndex)) === header)
  ))
}

function buildScheduleLayout(rows) {
  const staffGroups = STAFF_GROUP_DEFINITIONS.map(({ position, startColumn, endColumn }) => ({
    position,
    columns: Array.from(
      { length: endColumn - startColumn + 1 },
      (_, offset) => startColumn + offset,
    ),
  }))

  return {
    staffGroups,
    noteColumn: findHeaderColumns(rows, 'note', [0, 1])[0],
  }
}

function buildStaffGroups(row, layout) {
  return layout.staffGroups.map(({ position, columns }) => {
    const staffNames = columns.flatMap((column) => splitStaffNames(cell(row, column)))
    return { position, staffNames }
  }).filter((group) => group.staffNames.length > 0)
}

function quoteSheetName(title) {
  return `'${title.replaceAll("'", "''")}'`
}

function normalizeScheduleSheetTitle(title = '') {
  return String(title).replace(/\s/g, '')
}

function getSpreadsheetId(env) {
  return env.GOOGLE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID
}

async function fetchSheets(path, params, env) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${path}`)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  const headers = {}
  const accessToken = await getAccessToken(env)
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`
  } else if (env.GOOGLE_API_KEY) {
    url.searchParams.set('key', env.GOOGLE_API_KEY)
  }

  const response = await fetch(url, { headers })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || 'Google Spreadsheet 데이터를 읽지 못했습니다.')
  }

  return data
}

async function getScheduleSheetTitle(spreadsheetId, env) {
  const configuredTitle = env.GOOGLE_SCHEDULE_SHEET_NAME

  const data = await fetchSheets(spreadsheetId, {
    fields: 'sheets(properties(title,index))',
  }, env)

  const titles = data.sheets
    ?.map((sheet) => sheet.properties)
    .sort((left, right) => left.index - right.index)
    .map((properties) => properties.title)
    .filter(Boolean) || []

  const normalizedTargetTitles = [
    DEFAULT_SCHEDULE_SHEET_NAME,
    ...SCHEDULE_SHEET_NAME_ALIASES,
  ].map(normalizeScheduleSheetTitle)

  const normalizedConfiguredTitle = normalizeScheduleSheetTitle(configuredTitle)
  const matchingConfiguredTitle = configuredTitle
    ? titles.find((title) => normalizeScheduleSheetTitle(title) === normalizedConfiguredTitle)
    : ''
  const matchingKnownTitle = titles.find((title) => normalizedTargetTitles.includes(normalizeScheduleSheetTitle(title)))
    || titles.find((title) => normalizedTargetTitles.some((targetTitle) => normalizeScheduleSheetTitle(title).includes(targetTitle)))
  const matchingTitle = matchingConfiguredTitle || matchingKnownTitle

  if (!matchingTitle) {
    const availableTitles = titles.length ? titles.join(', ') : '없음'
    throw new Error(
      `Google Spreadsheet에서 ${DEFAULT_SCHEDULE_SHEET_NAME} 시트를 찾지 못했습니다. `
      + `발견된 시트: ${availableTitles}. `
      + '탭명이 다르면 GOOGLE_SCHEDULE_SHEET_NAME 환경변수에 실제 탭명을 설정해 주세요.',
    )
  }

  return matchingTitle
}

function buildDayEntry(date, row, layout) {
  if (!row) {
    return {
      date,
      hasData: false,
      checkOutRooms: 0,
      noShowAdjustment: 0,
      miscAdjustment: 0,
      actualCleaningRooms: 0,
      staffByPosition: [],
      note: '',
    }
  }

  const checkOutRooms = parseSignedNumber(cell(row, CHECKOUT_COLUMN_INDEX))
  const noShowAdjustment = parseSignedNumber(cell(row, NO_SHOW_COLUMN_INDEX))
  const miscAdjustment = parseSignedNumber(cell(row, ADJUSTMENT_COLUMN_INDEX))
  const rawActualCleaningRooms = cell(row, ACTUAL_CLEAN_COLUMN_INDEX)
  const actualCleaningRooms = rawActualCleaningRooms
    ? parseSignedNumber(rawActualCleaningRooms)
    : checkOutRooms - noShowAdjustment - miscAdjustment

  return {
    date,
    hasData: true,
    checkOutRooms,
    noShowAdjustment,
    miscAdjustment,
    actualCleaningRooms,
    staffByPosition: buildStaffGroups(row, layout),
    note: cell(row, layout.noteColumn),
  }
}

export async function buildCleaningForecast(env) {
  const spreadsheetId = getSpreadsheetId(env)
  const sheetTitle = await getScheduleSheetTitle(spreadsheetId, env)

  if (!sheetTitle) {
    throw new Error(`Google Spreadsheet에서 ${DEFAULT_SCHEDULE_SHEET_NAME} 시트를 찾지 못했습니다.`)
  }

  const data = await fetchSheets(`${spreadsheetId}/values/${encodeURIComponent(`${quoteSheetName(sheetTitle)}!${SCHEDULE_RANGE}`)}`, {
    valueRenderOption: 'FORMATTED_VALUE',
  }, env)

  const rows = data.values || []
  const layout = buildScheduleLayout(rows)
  const rowsByDate = new Map()

  rows.slice(2).forEach((row) => {
    const normalizedDate = normalizeDate(cell(row, DATE_COLUMN_INDEX))
    if (normalizedDate && !rowsByDate.has(normalizedDate)) {
      rowsByDate.set(normalizedDate, row)
    }
  })

  const days = getUpcomingKoreaDates().map((date) => buildDayEntry(date, rowsByDate.get(date), layout))

  return {
    spreadsheetId,
    sheetTitle,
    generatedAt: new Date().toISOString(),
    days,
  }
}

export async function onRequestGet({ env }) {
  try {
    return json(await buildCleaningForecast(env))
  } catch (error) {
    return json({
      message: error.message,
    }, 500)
  }
}
