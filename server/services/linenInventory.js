import { google } from 'googleapis'

const DEFAULT_SPREADSHEET_ID = '1ALRPlfA777W1KHiHycva9RuGrPAaSwLg1mJLWS5bJcU'
const KOREA_TIME_ZONE = 'Asia/Seoul'
const INVENTORY_RANGE = 'A1:ZZ1000'

const linenItems = [
  {
    key: 'singleDuvetCover',
    labels: ['싱글 이불커버', '싱글이불커버', 'single duvet cover'],
    packSize: 5,
  },
  {
    key: 'doubleDuvetCover',
    labels: ['더블 이불커버', '더블이불커버', 'double duvet cover'],
    packSize: 5,
  },
  {
    key: 'singleMattressCover',
    labels: ['싱글 매트리스커버', '싱글매트리스커버', '싱글 배트리스커버', 'single mattress cover'],
    packSize: null,
  },
  {
    key: 'doubleMattressCover',
    labels: ['더블 매트리스커버', '더블매트리스커버', 'double mattress cover'],
    packSize: null,
  },
  {
    key: 'pillowCover',
    labels: ['베개커버', 'pillow cover'],
    packSize: 50,
  },
  {
    key: 'bathMat',
    labels: ['발매트', 'bath mat'],
    packSize: 20,
  },
]

const metricAliases = {
  currentQuantity: ['현재수량', '현제수량'],
  requiredQuantity: ['세탁필요수량', '세탁 필요 수량'],
  incomingQuantity: ['들어온수량', '들어온 수량', '입고수량', '입고 수량'],
  currentStock: ['현재재고', '현제재고', '현재 재고', '현제 재고'],
}

function getSpreadsheetId() {
  return process.env.GOOGLE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID
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
  if (Number.isFinite(serialDate) && serialDate > 30000) {
    return normalizeDate(serialDate, defaultYear)
  }

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

function getPrivateKey() {
  if (process.env.GOOGLE_PRIVATE_KEY_BASE64) {
    return Buffer.from(process.env.GOOGLE_PRIVATE_KEY_BASE64, 'base64').toString('utf8').trim()
  }

  return process.env.GOOGLE_PRIVATE_KEY || process.env.PRIVATE_KEY || ''
}

function getGoogleAuth(scopes) {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    || process.env.GOOGLE_CLIENT_EMAIL
    || process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL
    || process.env.CLIENT_EMAIL
    || ''
  const privateKey = getPrivateKey()
  const hasUsableServiceAccount = /^[^@]+@[^@]+\.iam\.gserviceaccount\.com$/.test(serviceAccountEmail)
    && privateKey.includes('BEGIN PRIVATE KEY')
    && privateKey.includes('END PRIVATE KEY')

  if (hasUsableServiceAccount) {
    return new google.auth.JWT({
      email: serviceAccountEmail,
      key: normalizePrivateKey(privateKey),
      scopes,
    })
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return new google.auth.GoogleAuth({ scopes })
  }

  return undefined
}

function getSheetsClient(scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly']) {
  return google.sheets({
    version: 'v4',
    auth: getGoogleAuth(scopes),
  })
}

function ensureWritableAuth() {
  if (getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets'])) return

  throw new Error('Google Sheet 저장에는 GOOGLE_SERVICE_ACCOUNT_EMAIL과 실제 GOOGLE_PRIVATE_KEY가 필요합니다.')
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

function getConfiguredSheetTitle() {
  return process.env.GOOGLE_LINEN_SHEET_NAME || process.env.GOOGLE_INVENTORY_SHEET_NAME || ''
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

async function listSheetTitles(sheets, spreadsheetId) {
  const configuredSheetTitle = getConfiguredSheetTitle()
  if (configuredSheetTitle) return [configuredSheetTitle]

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    key: process.env.GOOGLE_API_KEY,
    fields: 'sheets(properties(title,index))',
  })

  return response.data.sheets
    ?.map((sheet) => sheet.properties)
    .sort((left, right) => left.index - right.index)
    .map((properties) => properties.title)
    .filter(Boolean) || []
}

async function readSheetRows(sheets, spreadsheetId, sheetTitle) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    key: process.env.GOOGLE_API_KEY,
    range: `${quoteSheetName(sheetTitle)}!${INVENTORY_RANGE}`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  })

  return response.data.values || []
}

async function findInventoryLayout(sheets, spreadsheetId, date) {
  const sheetTitles = await listSheetTitles(sheets, spreadsheetId)

  for (const sheetTitle of sheetTitles) {
    const rows = await readSheetRows(sheets, spreadsheetId, sheetTitle)
    const dateRowIndex = findDateRowIndex(rows, date)
    if (dateRowIndex === -1) continue

    const columns = findColumns(rows, sheetTitle)
    const hasRequiredColumns = linenItems.some((item) => (
      columns[item.key]?.requiredQuantity !== undefined || columns[item.key]?.incomingQuantity !== undefined
    ))

    if (hasRequiredColumns) {
      return {
        sheetTitle,
        rows,
        dateRowIndex,
        columns,
      }
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
    }]
  }))
}

export async function getLinenInventory() {
  const sheets = getSheetsClient()
  const spreadsheetId = getSpreadsheetId()
  const date = getTodayInKorea()
  const layout = await findInventoryLayout(sheets, spreadsheetId, date)

  return {
    spreadsheetId,
    sheetTitle: layout.sheetTitle,
    date,
    inventory: readInventoryValues(layout),
  }
}

export async function saveLinenInventory({ requiredQuantities = {}, receivedInputs = {} }) {
  ensureWritableAuth()

  const sheets = getSheetsClient(['https://www.googleapis.com/auth/spreadsheets'])
  const spreadsheetId = getSpreadsheetId()
  const date = getTodayInKorea()
  const layout = await findInventoryLayout(sheets, spreadsheetId, date)
  const incomingQuantities = buildIncomingQuantities(receivedInputs)
  const data = []

  linenItems.forEach((item) => {
    const itemColumns = layout.columns[item.key] || {}
    const requiredColumn = itemColumns.requiredQuantity
    const incomingColumn = itemColumns.incomingQuantity

    if (requiredColumn !== undefined) {
      data.push({
        range: `${quoteSheetName(layout.sheetTitle)}!${columnToA1(requiredColumn)}${layout.dateRowIndex + 1}`,
        values: [[toNumber(requiredQuantities[item.key])]],
      })
    }

    if (incomingColumn !== undefined) {
      data.push({
        range: `${quoteSheetName(layout.sheetTitle)}!${columnToA1(incomingColumn)}${layout.dateRowIndex + 1}`,
        values: [[incomingQuantities[item.key]]],
      })
    }
  })

  if (!data.length) {
    throw new Error('저장할 세탁필요수량 또는 들어온수량 컬럼을 찾지 못했습니다.')
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  })

  const refreshedLayout = await findInventoryLayout(sheets, spreadsheetId, date)

  return {
    spreadsheetId,
    sheetTitle: layout.sheetTitle,
    date,
    incomingQuantities,
    updatedRanges: data.map((entry) => entry.range),
    inventory: readInventoryValues(refreshedLayout),
  }
}
