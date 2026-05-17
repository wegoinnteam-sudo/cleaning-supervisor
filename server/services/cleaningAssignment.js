import { google } from 'googleapis'

const DEFAULT_SPREADSHEET_ID = '1ALRPlfA777W1KHiHycva9RuGrPAaSwLg1mJLWS5bJcU'
const DATA_RANGE = 'A2:ZZ46'
const KOREA_TIME_ZONE = 'Asia/Seoul'
const ROOM_START_ROW_INDEX = 2
const ROOM_TYPE_COLUMN_INDEX = 2
const ROOM_NUMBER_COLUMN_INDEX = 4

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

function normalizeDate(value = '') {
  const match = String(value).match(/(\d{4})\D?(\d{1,2})\D?(\d{1,2})/)
  if (!match) return ''
  const [, year, month, day] = match
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

function isRedOrGray(color = {}) {
  const red = color.red ?? 1
  const green = color.green ?? 1
  const blue = color.blue ?? 1
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const luma = red * 0.299 + green * 0.587 + blue * 0.114
  const isRed = red >= 0.65 && red - green >= 0.18 && red - blue >= 0.18
  const isGray = max - min <= 0.12 && luma >= 0.15 && luma <= 0.88

  return isRed || isGray
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

function getGoogleAuth() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
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

async function getFirstSheetTitle(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    key: process.env.GOOGLE_API_KEY,
    fields: 'sheets(properties(title,index))',
  })

  return response.data.sheets
    ?.map((sheet) => sheet.properties)
    .sort((left, right) => left.index - right.index)[0]?.title
}

export async function buildCleaningAssignment() {
  const sheets = getSheetsClient()
  const spreadsheetId = getSpreadsheetId()
  const today = getTodayInKorea()
  const sheetTitle = process.env.GOOGLE_SHEET_NAME || await getFirstSheetTitle(sheets, spreadsheetId)

  if (!sheetTitle) {
    throw new Error('Google Spreadsheet에서 읽을 시트를 찾지 못했습니다.')
  }

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    key: process.env.GOOGLE_API_KEY,
    includeGridData: true,
    ranges: [`${quoteSheetName(sheetTitle)}!${DATA_RANGE}`],
    fields: 'sheets(data(rowData(values(formattedValue,effectiveValue,effectiveFormat(backgroundColor,backgroundColorStyle)))))',
  })

  const rowData = response.data.sheets?.[0]?.data?.[0]?.rowData || []
  const dateRow = rowData[0]?.values || []
  const dateColumnIndex = dateRow.findIndex((cell) => normalizeDate(getCellValue(cell)) === today)

  if (dateColumnIndex === -1) {
    throw new Error(`${sheetTitle} 시트 2행에서 오늘 날짜(${today}) 열을 찾지 못했습니다.`)
  }

  const rooms = rowData
    .slice(ROOM_START_ROW_INDEX)
    .map((row) => {
      const values = row.values || []
      const roomNumber = getCellValue(values[ROOM_NUMBER_COLUMN_INDEX])
      const roomType = getCellValue(values[ROOM_TYPE_COLUMN_INDEX]).toUpperCase()
      const assignmentCell = values[dateColumnIndex]
      const staffName = getCellValue(assignmentCell)

      if (!roomNumber || !roomType || !staffName || !assignmentCell || !isRedOrGray(getCellColor(assignmentCell))) {
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
