const DEFAULT_SPREADSHEET_ID = '1ALRPlfA777W1KHiHycva9RuGrPAaSwLg1mJLWS5bJcU'
const DEFAULT_SHEET_GID = '160745438'
const DATA_RANGE = 'A2:ZZ46'
const KOREA_TIME_ZONE = 'Asia/Seoul'
const ROOM_START_ROW_INDEX = 2
const ROOM_TYPE_COLUMN_INDEX = 2
const ROOM_NUMBER_COLUMN_INDEX = 4
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

let cachedAssignment = null
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

function normalizeDate(value = '', defaultYear = new Date().getFullYear()) {
  const dateText = String(value)
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

function getCellValue(cell = {}) {
  const value = cell.formattedValue ?? cell.effectiveValue?.stringValue ?? ''
  return String(value).replaceAll('$', '').trim()
}

function getCellColor(cell = {}) {
  return cell.effectiveFormat?.backgroundColorStyle?.rgbColor
    || cell.effectiveFormat?.backgroundColor
    || {}
}

function isTargetCleaningColor(color = {}) {
  const red = color.red ?? 1
  const green = color.green ?? 1
  const blue = color.blue ?? 1
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const luma = red * 0.299 + green * 0.587 + blue * 0.114
  const isRed = red >= 0.65 && red - green >= 0.18 && red - blue >= 0.18
  const isGray = max - min <= 0.12 && luma >= 0.15 && luma <= 0.88
  const isLightGreen = green >= 0.6 && green - red >= 0.12 && green - blue >= 0.12 && luma >= 0.45

  return isRed || isGray || isLightGreen
}

function compareRoomNumber(left, right) {
  return String(left.roomNumber).localeCompare(String(right.roomNumber), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function groupByStaff(rooms) {
  return rooms.reduce((groups, room) => {
    const staffName = room.staffName
    if (!groups[staffName]) groups[staffName] = []
    groups[staffName].push(room)
    return groups
  }, {})
}

function countByRoomType(rooms) {
  return rooms.reduce((counts, room) => {
    counts[room.roomType] = (counts[room.roomType] || 0) + 1
    return counts
  }, {})
}

function quoteSheetName(title) {
  return `'${title.replaceAll("'", "''")}'`
}

function getSpreadsheetId(env) {
  return env.GOOGLE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID
}

function getSheetGid(env) {
  return env.GOOGLE_SHEET_GID || DEFAULT_SHEET_GID
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

async function getTargetSheetTitle(spreadsheetId, env) {
  const data = await fetchSheets(spreadsheetId, {
    fields: 'sheets(properties(sheetId,title,index))',
  }, env)
  const sheetProperties = data.sheets
    ?.map((sheet) => sheet.properties)
    .sort((left, right) => left.index - right.index) || []
  const targetGid = Number(getSheetGid(env))

  if (Number.isFinite(targetGid)) {
    const targetSheet = sheetProperties.find((sheet) => sheet.sheetId === targetGid)
    if (targetSheet?.title) return targetSheet.title
  }

  return sheetProperties[0]?.title
}

async function buildCleaningAssignment(env) {
  const spreadsheetId = getSpreadsheetId(env)
  const today = getTodayInKorea()
  const todayYear = today.slice(0, 4)
  const sheetTitle = env.GOOGLE_SHEET_NAME || await getTargetSheetTitle(spreadsheetId, env)

  if (!sheetTitle) {
    throw new Error('Google Spreadsheet에서 읽을 시트를 찾지 못했습니다.')
  }

  const data = await fetchSheets(spreadsheetId, {
    includeGridData: 'true',
    ranges: `${quoteSheetName(sheetTitle)}!${DATA_RANGE}`,
    fields: 'sheets(data(rowData(values(formattedValue,effectiveValue,effectiveFormat(backgroundColor,backgroundColorStyle)))))',
  }, env)

  const rowData = data.sheets?.[0]?.data?.[0]?.rowData || []
  const dateRow = rowData[0]?.values || []
  const dateColumnIndex = dateRow.findIndex((cell) => normalizeDate(getCellValue(cell), todayYear) === today)

  if (dateColumnIndex === -1) {
    throw new Error(`${sheetTitle} 시트 2행에서 오늘 날짜(${today}) 열을 찾지 못했습니다.`)
  }

  let currentRoomType = ''
  const rooms = rowData
    .slice(ROOM_START_ROW_INDEX)
    .map((row) => {
      const values = row.values || []
      const roomNumber = getCellValue(values[ROOM_NUMBER_COLUMN_INDEX])
      const explicitRoomType = getCellValue(values[ROOM_TYPE_COLUMN_INDEX])
      if (explicitRoomType) currentRoomType = explicitRoomType
      const roomType = currentRoomType.toUpperCase()
      const assignmentCell = values[dateColumnIndex]
      const staffName = getCellValue(assignmentCell)

      if (!roomNumber || !roomType || !staffName || !assignmentCell || !isTargetCleaningColor(getCellColor(assignmentCell))) {
        return null
      }

      return {
        roomNumber,
        roomType,
        staffName,
      }
    })
    .filter(Boolean)
    .sort(compareRoomNumber)

  const byStaff = groupByStaff(rooms)
  Object.values(byStaff).forEach((staffRooms) => staffRooms.sort(compareRoomNumber))

  return {
    spreadsheetId,
    sheetTitle,
    date: today,
    updatedAt: new Date().toISOString(),
    rooms,
    countsByType: countByRoomType(rooms),
    total: rooms.length,
    byStaff,
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const forceRefresh = url.searchParams.get('refresh') === 'true'
  const today = getTodayInKorea()

  try {
    if (forceRefresh || !cachedAssignment || cachedAssignment.date !== today) {
      cachedAssignment = await buildCleaningAssignment(env)
    }

    return json(cachedAssignment)
  } catch (error) {
    return json({
      message: error.message,
    }, 500)
  }
}
