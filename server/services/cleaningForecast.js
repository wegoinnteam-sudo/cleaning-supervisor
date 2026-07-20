import { google } from 'googleapis'

const DEFAULT_SPREADSHEET_ID = '1ALRPlfA777W1KHiHycva9RuGrPAaSwLg1mJLWS5bJcU'
const DEFAULT_SCHEDULE_SHEET_NAME = '청소스케쥴'
const SCHEDULE_SHEET_NAME_ALIASES = ['청소스케줄']
const SCHEDULE_RANGE = 'A1:Z3000'
const KOREA_TIME_ZONE = 'Asia/Seoul'
const FORECAST_DAY_COUNT = 7

const DATE_COLUMN_INDEX = 1 // B
const CHECKOUT_COLUMN_INDEX = 3 // D
const NO_SHOW_COLUMN_INDEX = 4 // E
const ADJUSTMENT_COLUMN_INDEX = 5 // F
const ACTUAL_CLEAN_COLUMN_INDEX = 6 // G
const NOTE_COLUMN_INDEX = 26 // AA

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

function findMergedHeaderColumns(rows, header, rowIndex, merges = []) {
  return findHeaderColumns(rows, header, [rowIndex]).flatMap((columnIndex) => {
    const mergedRange = merges.find((range) => (
      range.startRowIndex <= rowIndex
      && range.endRowIndex > rowIndex
      && range.startColumnIndex === columnIndex
    ))
    const endColumn = mergedRange?.endColumnIndex ?? columnIndex + 1
    return Array.from({ length: endColumn - columnIndex }, (_, offset) => columnIndex + offset)
  })
}

function buildScheduleLayout(rows, merges) {
  const staffGroups = [
    { position: 'Exchange Staff', columns: findMergedHeaderColumns(rows, 'exchangestaff', 0, merges) },
    { position: 'Part-Time', columns: findMergedHeaderColumns(rows, 'parttime', 0, merges) },
    { position: 'SV', columns: findHeaderColumns(rows, 'sv', [1]) },
    { position: 'SUB', columns: findHeaderColumns(rows, 'sub', [1]) },
  ]

  return {
    staffGroups,
    noteColumn: NOTE_COLUMN_INDEX,
  }
}

function buildStaffGroups(row, layout) {
  return layout.staffGroups.map(({ position, columns }) => {
    const staffNames = columns.flatMap((column) => splitStaffNames(cell(row, column)))
    return { position, staffNames }
  }).filter((group) => group.staffNames.length > 0)
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

function getGoogleAuth() {
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
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
  }

  return undefined
}

function getSheetsClient() {
  return google.sheets({
    version: 'v4',
    auth: getGoogleAuth(),
  })
}

function quoteSheetName(title) {
  return `'${title.replaceAll("'", "''")}'`
}

function normalizeScheduleSheetTitle(title = '') {
  return String(title).replace(/\s/g, '')
}

async function getScheduleSheetInfo(sheets, spreadsheetId) {
  const configuredTitle = process.env.GOOGLE_SCHEDULE_SHEET_NAME

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    key: process.env.GOOGLE_API_KEY,
    fields: 'sheets(properties(title,index),merges)',
  })

  const sheetEntries = response.data.sheets
    ?.sort((left, right) => left.properties.index - right.properties.index) || []
  const titles = sheetEntries
    .map((sheet) => sheet.properties.title)
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

  const sheet = sheetEntries.find((entry) => entry.properties.title === matchingTitle)
  return { title: matchingTitle, merges: sheet?.merges || [] }
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

export async function buildCleaningForecast() {
  const sheets = getSheetsClient()
  const spreadsheetId = getSpreadsheetId()
  const sheetInfo = await getScheduleSheetInfo(sheets, spreadsheetId)
  const sheetTitle = sheetInfo.title

  if (!sheetTitle) {
    throw new Error(`Google Spreadsheet에서 ${DEFAULT_SCHEDULE_SHEET_NAME} 시트를 찾지 못했습니다.`)
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    key: process.env.GOOGLE_API_KEY,
    range: `${quoteSheetName(sheetTitle)}!${SCHEDULE_RANGE}`,
    valueRenderOption: 'FORMATTED_VALUE',
  })

  const rows = response.data.values || []
  const layout = buildScheduleLayout(rows, sheetInfo.merges)
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
