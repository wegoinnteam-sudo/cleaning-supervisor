import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const ASSIGNMENT_REFRESH_INTERVAL_MS = 10_000

const translations = {
  ko: {
    locale: 'ko-KR',
    productName: '청소 관리',
    title: '객실 청소 배정',
    subtitle: (date) => `한국시간 ${date || '오늘'} 기준 Google Spreadsheet 실시간 데이터`,
    refresh: '새로고침',
    roomsTab: '객실 청소배정',
    itemsTab: '필요 품목 갯수',
    linenTab: '린넨 재고파악',
    forecastTab: '예상 객실 청소배정',
    loadErrorTitle: '데이터를 읽을 수 없습니다.',
    loadErrorFallback: '청소 배정 정보를 불러오지 못했습니다.',
    forecastLoadErrorTitle: '예상 청소배정 정보를 읽을 수 없습니다.',
    forecastLoadErrorFallback: '예상 청소배정 정보를 불러오지 못했습니다.',
    forecastRange: '예상 기간',
    forecastDateLabel: '날짜',
    forecastCheckOut: 'CHECK OUT',
    forecastActualClean: '실제 청소',
    forecastStaff: '근무자',
    forecastNoStaff: '근무자 정보가 없습니다.',
    forecastNote: 'NOTE',
    forecastNoNote: '특이사항 없음',
    forecastNoDayData: '시트에서 해당 날짜 데이터를 찾지 못했습니다.',
    forecastSvOn: 'SV 근무',
    forecastSvOff: 'SV 없음',
    forecastBusyBadge: '혼잡 예상',
    forecastRoomsValue: (count) => `${count}개 객실`,
    checkSyncErrorTitle: '체크 상태를 저장할 수 없습니다.',
    checkSyncErrorFallback: '공유 체크 상태를 저장하지 못했습니다.',
    linenSyncErrorTitle: '린넨 재고를 저장할 수 없습니다.',
    linenSyncErrorFallback: '린넨 재고 정보를 저장하지 못했습니다.',
    linenInventory: '린넨 재고파악',
    todayLaundryNeed: '오늘 세탁 필요 수량',
    laundryIncoming: '세탁업체 입고 입력',
    finalInventory: '오늘 최종 재고',
    itemName: '품목',
    requiredQuantity: '세탁필요수량',
    inputQuantity: '입력',
    incomingQuantity: '들어온수량',
    currentQuantity: '현재수량',
    currentStock: '현재재고',
    totalQuantity: '총수량',
    saveTodayLinen: '제출하기',
    saving: '저장 중',
    saved: '저장 완료',
    packUnit: (size) => `팩 (${size}장/팩)`,
    eaUnit: 'EA',
    loadingTitle: '불러오는 중',
    loadingMessage: '스프레드시트의 날짜 열, 객실 정보, 셀 배경색을 확인하고 있습니다.',
    sheet: '시트',
    totalCleaningRooms: '총 청소 객실',
    lastUpdated: '마지막 갱신',
    containerOne: '컨테이너 1',
    todayRooms: '오늘 청소해야 하는 객실 목록',
    checkedRooms: '체크된 객실',
    noCleaningRooms: '오늘 청소 대상 객실이 없습니다.',
    total: 'TOTAL',
    containerTwo: '컨테이너 2',
    staffAssignments: '직원별 청소 배정 리스트',
    noStaffAssignments: '직원 배정 내역이 없습니다.',
    completedLabel: (room) => `${room.roomNumber} ${room.roomType} 완료`,
    supplyCount: '필요 품목 갯수',
    totalSupplyCount: '전체 품목 합계',
    floor: '층',
    rooms: '객실',
    floorSupplyCount: '층별 필요 품목',
    roomType: '객실 타입',
    roomTypeSupplyCount: '타입별 품목 계산',
    capacity: '기준 인원',
    bedSetup: '침대 구성',
    missingRuleTitle: '품목 기준이 없는 Room Type이 있습니다.',
    unspecified: '미지정',
    floorLabel: (floor) => `${floor}층`,
  },
  en: {
    locale: 'en-US',
    productName: 'Cleaning Supervisor',
    title: 'Room Cleaning Assignment',
    subtitle: (date) => `Live Google Spreadsheet data for ${date || 'today'} in Korea time`,
    refresh: 'Refresh',
    roomsTab: 'Room Cleaning Assignment',
    itemsTab: 'Required Item Count',
    linenTab: 'Linen Inventory',
    forecastTab: 'Upcoming Cleaning Forecast',
    loadErrorTitle: 'Unable to read data.',
    loadErrorFallback: 'Unable to load cleaning assignment data.',
    forecastLoadErrorTitle: 'Unable to read the upcoming cleaning forecast.',
    forecastLoadErrorFallback: 'Unable to load the upcoming cleaning forecast.',
    forecastRange: 'Forecast Range',
    forecastDateLabel: 'Date',
    forecastCheckOut: 'CHECK OUT',
    forecastActualClean: 'Actual Cleaning',
    forecastStaff: 'Staff',
    forecastNoStaff: 'No staff assigned.',
    forecastNote: 'NOTE',
    forecastNoNote: 'No special notes',
    forecastNoDayData: 'No data found in the sheet for this date.',
    forecastSvOn: 'SV On Duty',
    forecastSvOff: 'No SV',
    forecastBusyBadge: 'Busy',
    forecastRoomsValue: (count) => `${count} Rooms`,
    checkSyncErrorTitle: 'Unable to save check status.',
    checkSyncErrorFallback: 'Unable to save shared check status.',
    linenSyncErrorTitle: 'Unable to save linen inventory.',
    linenSyncErrorFallback: 'Unable to save linen inventory data.',
    linenInventory: 'Linen Inventory',
    todayLaundryNeed: 'Today Laundry Need',
    laundryIncoming: 'Laundry Incoming Entry',
    finalInventory: 'Final Inventory Today',
    itemName: 'Item',
    requiredQuantity: 'Required Quantity',
    inputQuantity: 'Input',
    incomingQuantity: 'Incoming Quantity',
    currentQuantity: 'Current Quantity',
    currentStock: 'Current Stock',
    totalQuantity: 'Total Quantity',
    saveTodayLinen: 'Submit',
    saving: 'Saving',
    saved: 'Saved',
    packUnit: (size) => `Pack (${size} each)`,
    eaUnit: 'EA',
    loadingTitle: 'Loading',
    loadingMessage: 'Checking the spreadsheet date column, room information, and cell background colors.',
    sheet: 'Sheet',
    totalCleaningRooms: 'Total Cleaning Rooms',
    lastUpdated: 'Last Updated',
    containerOne: 'Container 1',
    todayRooms: 'Rooms to Clean Today',
    checkedRooms: 'Checked Rooms',
    noCleaningRooms: 'There are no rooms to clean today.',
    total: 'TOTAL',
    containerTwo: 'Container 2',
    staffAssignments: 'Cleaning Assignments by Staff',
    noStaffAssignments: 'There are no staff assignments.',
    completedLabel: (room) => `${room.roomNumber} ${room.roomType} completed`,
    supplyCount: 'Required Item Count',
    totalSupplyCount: 'Total Required Items',
    floor: 'Floor',
    rooms: 'Rooms',
    floorSupplyCount: 'Required Items by Floor',
    roomType: 'Room Type',
    roomTypeSupplyCount: 'Required Items by Room Type',
    capacity: 'Capacity',
    bedSetup: 'Bed Setup',
    missingRuleTitle: 'Some Room Types do not have item rules.',
    unspecified: 'Unspecified',
    floorLabel: (floor) => `Floor ${floor}`,
  },
}

function getRoomKey(room) {
  return `${room.roomNumber}-${room.roomType}`
}

const supplyColumns = [
  { key: 'singleDuvetCover', label: { ko: '싱글 이불커버', en: 'Single Duvet Cover' } },
  { key: 'doubleDuvetCover', label: { ko: '더블 이불커버', en: 'Double Duvet Cover' } },
  { key: 'singleMattressCover', label: { ko: '싱글 매트리스커버', en: 'Single Mattress Cover' } },
  { key: 'doubleMattressCover', label: { ko: '더블 매트리스커버', en: 'Double Mattress Cover' } },
  { key: 'pillowCover', label: { ko: '베개커버', en: 'Pillow Cover' } },
  { key: 'towel', label: { ko: '수건', en: 'Towels' } },
  { key: 'bathMat', label: { ko: '발매트', en: 'Bath Mat' } },
]

const linenInputSettings = {
  singleDuvetCover: { packSize: 5 },
  doubleDuvetCover: { packSize: 5 },
  singleMattressCover: { packSize: null },
  doubleMattressCover: { packSize: null },
  pillowCover: { packSize: 50 },
  bathMat: { packSize: 20 },
}

const linenColumns = supplyColumns.filter((column) => column.key in linenInputSettings)

function createLinenInputs() {
  return Object.fromEntries(linenColumns.map((column) => [column.key, '']))
}

const roomTypeSupplyRules = {
  SINGLE: {
    capacity: { ko: '1명', en: '1 person' },
    bedSetup: { ko: '싱글베드 1', en: '1 single bed' },
    singleDuvetCover: 1,
    doubleDuvetCover: 0,
    singleMattressCover: 1,
    doubleMattressCover: 0,
    pillowCover: 1,
    towel: 2,
    bathMat: 1,
  },
  DOUBLE: {
    capacity: { ko: '2명', en: '2 people' },
    bedSetup: { ko: '더블베드 1', en: '1 double bed' },
    singleDuvetCover: 0,
    doubleDuvetCover: 1,
    singleMattressCover: 0,
    doubleMattressCover: 1,
    pillowCover: 2,
    towel: 4,
    bathMat: 1,
  },
  HANDIC: {
    capacity: { ko: '2명', en: '2 people' },
    bedSetup: { ko: '더블베드 1', en: '1 double bed' },
    singleDuvetCover: 0,
    doubleDuvetCover: 1,
    singleMattressCover: 0,
    doubleMattressCover: 1,
    pillowCover: 2,
    towel: 4,
    bathMat: 1,
  },
  'TWIN BUNK': {
    capacity: { ko: '2명', en: '2 people' },
    bedSetup: { ko: '싱글 2층침대 1개', en: '1 single bunk bed' },
    singleDuvetCover: 2,
    doubleDuvetCover: 0,
    singleMattressCover: 2,
    doubleMattressCover: 0,
    pillowCover: 2,
    towel: 4,
    bathMat: 1,
  },
  TWIN: {
    capacity: { ko: '2명', en: '2 people' },
    bedSetup: { ko: '싱글베드 2', en: '2 single beds' },
    singleDuvetCover: 2,
    doubleDuvetCover: 0,
    singleMattressCover: 2,
    doubleMattressCover: 0,
    pillowCover: 2,
    towel: 4,
    bathMat: 1,
  },
  TRIPLE: {
    capacity: { ko: '3명', en: '3 people' },
    bedSetup: { ko: '싱글베드 1 + 더블베드 1', en: '1 single bed + 1 double bed' },
    singleDuvetCover: 1,
    doubleDuvetCover: 1,
    singleMattressCover: 1,
    doubleMattressCover: 1,
    pillowCover: 3,
    towel: 6,
    bathMat: 1,
  },
  '4 BUNK': {
    capacity: { ko: '4명', en: '4 people' },
    bedSetup: { ko: '싱글 2층침대 2개', en: '2 single bunk beds' },
    singleDuvetCover: 4,
    doubleDuvetCover: 0,
    singleMattressCover: 4,
    doubleMattressCover: 0,
    pillowCover: 4,
    towel: 8,
    bathMat: 1,
  },
  'STANDARD FAMILY': {
    capacity: { ko: '4명', en: '4 people' },
    bedSetup: { ko: '더블베드 2', en: '2 double beds' },
    singleDuvetCover: 0,
    doubleDuvetCover: 2,
    singleMattressCover: 0,
    doubleMattressCover: 2,
    pillowCover: 4,
    towel: 8,
    bathMat: 1,
  },
  DELUXE: {
    capacity: { ko: '4명', en: '4 people' },
    bedSetup: { ko: '더블베드 2', en: '2 double beds' },
    singleDuvetCover: 0,
    doubleDuvetCover: 2,
    singleMattressCover: 0,
    doubleMattressCover: 2,
    pillowCover: 4,
    towel: 8,
    bathMat: 1,
  },
}

function normalizeRoomType(roomType = '') {
  return String(roomType).replace(/\s+/g, ' ').trim().toUpperCase()
}

function getRoomFloor(roomNumber = '') {
  const floor = String(roomNumber).trim().charAt(0)
  return floor || ''
}

function createSupplyTotals() {
  return Object.fromEntries(supplyColumns.map((column) => [column.key, 0]))
}

function App() {
  const [assignment, setAssignment] = useState(null)
  const [error, setError] = useState('')
  const [checkError, setCheckError] = useState('')
  const [linenError, setLinenError] = useState('')
  const [linenInventory, setLinenInventory] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [forecastError, setForecastError] = useState('')
  const [linenInputs, setLinenInputs] = useState(createLinenInputs)
  const [linenSaving, setLinenSaving] = useState(false)
  const [linenSavedAt, setLinenSavedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [checkedRooms, setCheckedRooms] = useState(() => new Set())
  const [activeCategory, setActiveCategory] = useState('rooms')
  const [language, setLanguage] = useState('ko')
  const t = translations[language]
  const formatter = useMemo(() => new Intl.DateTimeFormat(t.locale, {
    timeZone: 'Asia/Seoul',
    dateStyle: 'full',
    timeStyle: 'short',
  }), [t.locale])

  const fetchAssignment = useCallback(async (forceRefresh = false) => {
    const response = await fetch(`/api/cleaning-assignment${forceRefresh ? '?refresh=true' : ''}`, {
      cache: 'no-store',
    })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || t.loadErrorFallback)
    }

    return data
  }, [t.loadErrorFallback])

  const fetchRoomChecks = useCallback(async (date) => {
    const response = await fetch(`/api/room-checks?date=${encodeURIComponent(date)}`)
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || t.checkSyncErrorFallback)
    }

    return data.checkedRoomKeys || []
  }, [t.checkSyncErrorFallback])

  const saveRoomCheck = useCallback(async ({ date, roomKey, checked }) => {
    const response = await fetch('/api/room-checks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date, roomKey, checked }),
    })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || t.checkSyncErrorFallback)
    }

    return data.checkedRoomKeys || []
  }, [t.checkSyncErrorFallback])

  const fetchLinenInventory = useCallback(async () => {
    const response = await fetch('/api/linen-inventory', { cache: 'no-store' })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || t.linenSyncErrorFallback)
    }

    return data
  }, [t.linenSyncErrorFallback])

  const fetchForecast = useCallback(async () => {
    const response = await fetch('/api/cleaning-forecast', { cache: 'no-store' })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || t.forecastLoadErrorFallback)
    }

    return data
  }, [t.forecastLoadErrorFallback])

  async function refreshAssignment() {
    setLoading(true)
    setError('')

    try {
      setAssignment(await fetchAssignment(true))
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  async function refreshActive() {
    if (activeCategory === 'forecast') {
      setLoading(true)
      setForecastError('')

      try {
        setForecast(await fetchForecast())
      } catch (loadError) {
        setForecastError(loadError.message)
      } finally {
        setLoading(false)
      }
      return
    }

    await refreshAssignment()
  }

  useEffect(() => {
    let ignore = false

    fetchAssignment(true)
      .then((data) => {
        if (!ignore) setAssignment(data)
      })
      .catch((loadError) => {
        if (!ignore) setError(loadError.message)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [fetchAssignment])

  useEffect(() => {
    if (activeCategory !== 'rooms') return undefined

    let ignore = false
    let refreshInProgress = false

    async function syncAssignment() {
      if (document.visibilityState === 'hidden' || refreshInProgress) return

      refreshInProgress = true

      try {
        const data = await fetchAssignment(true)
        if (!ignore) {
          setAssignment(data)
          setError('')
        }
      } catch (loadError) {
        if (!ignore) setError(loadError.message)
      } finally {
        refreshInProgress = false
      }
    }

    const intervalId = window.setInterval(syncAssignment, ASSIGNMENT_REFRESH_INTERVAL_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncAssignment()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      ignore = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [activeCategory, fetchAssignment])

  useEffect(() => {
    if (activeCategory !== 'forecast') return undefined

    let ignore = false
    let refreshInProgress = false

    async function syncForecast() {
      if (document.visibilityState === 'hidden' || refreshInProgress) return

      refreshInProgress = true

      try {
        const data = await fetchForecast()
        if (!ignore) {
          setForecast(data)
          setForecastError('')
        }
      } catch (loadError) {
        if (!ignore) setForecastError(loadError.message)
      } finally {
        refreshInProgress = false
      }
    }

    syncForecast()
    const intervalId = window.setInterval(syncForecast, ASSIGNMENT_REFRESH_INTERVAL_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncForecast()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      ignore = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [activeCategory, fetchForecast])

  useEffect(() => {
    if (!assignment?.date) return

    let ignore = false

    fetchRoomChecks(assignment.date)
      .then((checkedRoomKeys) => {
        if (!ignore) {
          setCheckError('')
          setCheckedRooms(new Set(checkedRoomKeys))
        }
      })
      .catch((loadError) => {
        if (!ignore) setCheckError(loadError.message)
      })

    return () => {
      ignore = true
    }
  }, [assignment?.date, fetchRoomChecks])

  useEffect(() => {
    if (activeCategory !== 'linen') return undefined

    let ignore = false

    fetchLinenInventory()
      .then((data) => {
        if (!ignore) {
          setLinenInventory(data)
          setLinenError('')
        }
      })
      .catch((loadError) => {
        if (!ignore) setLinenError(loadError.message)
      })

    return () => {
      ignore = true
    }
  }, [activeCategory, fetchLinenInventory])

  const staffNames = useMemo(() => {
    if (!assignment?.byStaff) return []
    return Object.keys(assignment.byStaff).sort((left, right) => (
      left.localeCompare(right, 'ko-KR', { numeric: true, sensitivity: 'base' })
    ))
  }, [assignment])

  const roomTypeCounts = useMemo(() => {
    if (!assignment?.countsByType) return []
    return Object.entries(assignment.countsByType).sort(([left], [right]) => (
      left.localeCompare(right, 'ko-KR', { sensitivity: 'base' })
    ))
  }, [assignment])

  const pendingRooms = useMemo(() => {
    if (!assignment?.rooms) return []
    return assignment.rooms.filter((room) => !checkedRooms.has(getRoomKey(room)))
  }, [assignment, checkedRooms])

  const completedRooms = useMemo(() => {
    if (!assignment?.rooms) return []
    return assignment.rooms.filter((room) => checkedRooms.has(getRoomKey(room)))
  }, [assignment, checkedRooms])

  const forecastDays = useMemo(() => {
    const days = forecast?.days || []
    const knownRoomCounts = days.filter((day) => day.hasData).map((day) => day.actualCleaningRooms)
    const minRooms = knownRoomCounts.length ? Math.min(...knownRoomCounts) : 0
    const maxRooms = knownRoomCounts.length ? Math.max(...knownRoomCounts) : 0
    const roomRange = maxRooms - minRooms

    return days.map((day) => {
      let tier = 'normal'
      if (day.hasData && roomRange > 0) {
        const ratio = (day.actualCleaningRooms - minRooms) / roomRange
        if (ratio >= 0.66) tier = 'high'
        else if (ratio >= 0.33) tier = 'medium'
      }

      const hasSupervisor = day.staffByPosition.some((group) => (
        group.position.trim().toUpperCase() === 'SV' && group.staffNames.length > 0
      ))

      return { ...day, tier, hasSupervisor }
    })
  }, [forecast])

  const linenIncomingSummary = useMemo(() => Object.fromEntries(linenColumns.map((column) => {
    const inputValue = Number(linenInputs[column.key])
    const safeInputValue = Number.isFinite(inputValue) && inputValue >= 0 ? inputValue : 0
    const packSize = linenInputSettings[column.key].packSize
    return [column.key, packSize ? safeInputValue * packSize : safeInputValue]
  })), [linenInputs])

  const supplySummary = useMemo(() => {
    const totals = createSupplyTotals()
    const byRoomType = {}
    const byFloor = {}
    const unmatchedRoomTypes = new Set()

    const extraFootTowelCount = Number(assignment?.extraFootTowelCount) || 0

    assignment?.rooms?.forEach((room) => {
      const roomType = normalizeRoomType(room.roomType)
      const rule = roomTypeSupplyRules[roomType]

      if (!rule) {
        unmatchedRoomTypes.add(roomType)
        return
      }

      if (!byRoomType[roomType]) {
        byRoomType[roomType] = {
          roomType,
          count: 0,
          capacity: rule.capacity[language],
          bedSetup: rule.bedSetup[language],
          totals: createSupplyTotals(),
        }
      }

      const floor = getRoomFloor(room.roomNumber)
      if (!byFloor[floor]) {
        byFloor[floor] = {
          floor,
          count: 0,
          totals: createSupplyTotals(),
        }
      }

      byRoomType[roomType].count += 1
      byFloor[floor].count += 1
      supplyColumns.forEach((column) => {
        totals[column.key] += rule[column.key]
        byRoomType[roomType].totals[column.key] += rule[column.key]
        byFloor[floor].totals[column.key] += rule[column.key]
      })
    })

    totals.bathMat += extraFootTowelCount

    return {
      totals,
      byFloor: Object.values(byFloor).sort((left, right) => (
        left.floor.localeCompare(right.floor, 'ko-KR', { numeric: true, sensitivity: 'base' })
      )),
      byRoomType: Object.values(byRoomType).sort((left, right) => (
        left.roomType.localeCompare(right.roomType, 'ko-KR', { numeric: true, sensitivity: 'base' })
      )),
      unmatchedRoomTypes: [...unmatchedRoomTypes].sort(),
    }
  }, [assignment, language])

  function updateLinenInput(key, value) {
    setLinenInputs((current) => ({
      ...current,
      [key]: value,
    }))
    setLinenSavedAt('')
  }

  async function saveTodayLinen() {
    setLinenSaving(true)
    setLinenError('')
    setLinenSavedAt('')

    try {
      const requiredQuantities = Object.fromEntries(linenColumns.map((column) => [
        column.key,
        supplySummary.totals[column.key] || 0,
      ]))
      const response = await fetch('/api/linen-inventory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          date: assignment.date,
          requiredQuantities,
          receivedInputs: linenInputs,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || t.linenSyncErrorFallback)
      }

      setLinenInventory(data)
      setLinenSavedAt(new Date().toISOString())
    } catch (saveError) {
      setLinenError(saveError.message)
    } finally {
      setLinenSaving(false)
    }
  }

  async function toggleRoom(room) {
    if (!assignment?.date) return

    const roomKey = getRoomKey(room)
    const checked = !checkedRooms.has(roomKey)
    const previousCheckedRooms = checkedRooms

    setCheckedRooms((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(roomKey)
      } else {
        next.delete(roomKey)
      }
      return next
    })
    setCheckError('')

    try {
      const checkedRoomKeys = await saveRoomCheck({
        date: assignment.date,
        roomKey,
        checked,
      })
      setCheckedRooms(new Set(checkedRoomKeys))
    } catch (saveError) {
      setCheckedRooms(previousCheckedRooms)
      setCheckError(saveError.message)
    }
  }

  function renderRoomRow(room, isChecked = false) {
    return (
      <label className={`room-row${isChecked ? ' is-checked' : ''}`} key={getRoomKey(room)}>
        <span>{room.roomNumber}</span>
        <strong>{room.roomType}</strong>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => toggleRoom(room)}
          aria-label={t.completedLabel(room)}
        />
      </label>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{t.productName}</p>
          <h1>{t.title}</h1>
          <p className="subtle">
            {t.subtitle(assignment?.date)}
          </p>
        </div>
        <div className="topbar-actions">
          <div className="language-toggle" aria-label="Language">
            <button
              type="button"
              className={language === 'ko' ? 'active' : ''}
              onClick={() => setLanguage('ko')}
            >
              한국어
            </button>
            <button
              type="button"
              className={language === 'en' ? 'active' : ''}
              onClick={() => setLanguage('en')}
            >
              English
            </button>
          </div>
          <button type="button" className="refresh-button" onClick={refreshActive}>
            {t.refresh}
          </button>
        </div>
      </header>

      <nav className="category-tabs" aria-label="Category">
        <button
          type="button"
          className={activeCategory === 'rooms' ? 'active' : ''}
          onClick={() => setActiveCategory('rooms')}
        >
          {t.roomsTab}
        </button>
        <button
          type="button"
          className={activeCategory === 'items' ? 'active' : ''}
          onClick={() => setActiveCategory('items')}
        >
          {t.itemsTab}
        </button>
        <button
          type="button"
          className={activeCategory === 'linen' ? 'active' : ''}
          onClick={() => setActiveCategory('linen')}
        >
          {t.linenTab}
        </button>
        <button
          type="button"
          className={activeCategory === 'forecast' ? 'active' : ''}
          onClick={() => setActiveCategory('forecast')}
        >
          {t.forecastTab}
        </button>
      </nav>

      {error && (
        <section className="notice" role="alert">
          <strong>{t.loadErrorTitle}</strong>
          <span>{error}</span>
        </section>
      )}

      {checkError && (
        <section className="notice" role="alert">
          <strong>{t.checkSyncErrorTitle}</strong>
          <span>{checkError}</span>
        </section>
      )}

      {linenError && (
        <section className="notice" role="alert">
          <strong>{t.linenSyncErrorTitle}</strong>
          <span>{linenError}</span>
        </section>
      )}

      {forecastError && (
        <section className="notice" role="alert">
          <strong>{t.forecastLoadErrorTitle}</strong>
          <span>{forecastError}</span>
        </section>
      )}

      {loading && (
        <section className="notice">
          <strong>{t.loadingTitle}</strong>
          <span>{t.loadingMessage}</span>
        </section>
      )}

      {activeCategory === 'rooms' && assignment && (
        <section className="summary-strip" aria-label="Summary">
          <div>
            <span>{t.sheet}</span>
            <strong>{assignment.sheetTitle}</strong>
          </div>
          <div>
            <span>{t.totalCleaningRooms}</span>
            <strong>{assignment.total}</strong>
          </div>
          <div>
            <span>{t.lastUpdated}</span>
            <strong>{formatter.format(new Date(assignment.updatedAt))}</strong>
          </div>
        </section>
      )}

      {activeCategory === 'rooms' && assignment && (
        <div className="container-grid">
          <section className="container-panel">
            <div className="panel-heading">
              <p className="container-label">{t.containerOne}</p>
              <h2>{t.todayRooms}</h2>
            </div>

            <div className="room-list">
              {assignment.rooms.length > 0 ? (
                <>
                  <div className="room-section">
                    {pendingRooms.map((room) => renderRoomRow(room))}
                  </div>

                  {completedRooms.length > 0 && (
                    <div className="room-section completed-room-section">
                      <div className="room-section-heading">
                        <span>{t.checkedRooms}</span>
                        <strong>{completedRooms.length}</strong>
                      </div>
                      {completedRooms.map((room) => renderRoomRow(room, true))}
                    </div>
                  )}
                </>
              ) : (
                <p className="empty">{t.noCleaningRooms}</p>
              )}
            </div>

            <div className="type-counts">
              {roomTypeCounts.map(([roomType, count]) => (
                <div key={roomType}>
                  <span>{roomType}:</span>
                  <strong>{count}</strong>
                </div>
              ))}
              <div className="total-row">
                <span>{t.total}:</span>
                <strong>{assignment.total}</strong>
              </div>
            </div>
          </section>

          <section className="container-panel">
            <div className="panel-heading">
              <p className="container-label">{t.containerTwo}</p>
              <h2>{t.staffAssignments}</h2>
            </div>

            <div className="staff-list">
              {staffNames.length > 0 ? staffNames.map((staffName) => (
                <section className="staff-group" key={staffName}>
                  <h3>[{staffName}]</h3>
                  {assignment.byStaff[staffName].map((room) => (
                    <div className="assignment-row" key={`${staffName}-${room.roomNumber}-${room.roomType}`}>
                      <span>{room.roomNumber}</span>
                      <strong>{room.roomType}</strong>
                    </div>
                  ))}
                </section>
              )) : (
                <p className="empty">{t.noStaffAssignments}</p>
              )}
            </div>
          </section>
        </div>
      )}

      {activeCategory === 'linen' && assignment && (
        <div className="linen-layout">
          <section className="container-panel">
            <div className="panel-heading">
              <p className="container-label">{t.linenInventory}</p>
              <h2>{t.todayLaundryNeed}</h2>
            </div>
            <div className="item-total-grid linen-total-grid">
              {linenColumns.map((column) => (
                <div className="item-total" key={column.key}>
                  <span>{column.label[language]}</span>
                  <strong>{supplySummary.totals[column.key]}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="container-panel">
            <div className="panel-heading linen-action-heading">
              <div>
                <p className="container-label">{t.laundryIncoming}</p>
                <h2>{t.incomingQuantity}</h2>
              </div>
              <button
                type="button"
                className="refresh-button"
                onClick={saveTodayLinen}
                disabled={linenSaving}
              >
                {linenSaving ? t.saving : t.saveTodayLinen}
              </button>
            </div>
            <div className="item-table-wrap">
              <table className="item-table linen-input-table">
                <thead>
                  <tr>
                    <th>{t.itemName}</th>
                    <th>{t.inputQuantity}</th>
                    <th>{t.incomingQuantity}</th>
                  </tr>
                </thead>
                <tbody>
                  {linenColumns.map((column) => {
                    const packSize = linenInputSettings[column.key].packSize
                    return (
                      <tr key={column.key}>
                        <td>{column.label[language]}</td>
                        <td>
                          <label className="linen-input-cell">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={linenInputs[column.key]}
                              onChange={(event) => updateLinenInput(column.key, event.target.value)}
                            />
                            <span>{packSize ? t.packUnit(packSize) : t.eaUnit}</span>
                          </label>
                        </td>
                        <td>{linenIncomingSummary[column.key]}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {linenSavedAt && (
              <div className="linen-save-status">
                <strong>{t.saved}</strong>
                <span>{formatter.format(new Date(linenSavedAt))}</span>
              </div>
            )}
          </section>

          <section className="container-panel">
            <div className="panel-heading">
              <p className="container-label">{linenInventory?.sheetTitle || t.sheet}</p>
              <h2>{t.finalInventory}</h2>
            </div>
            <div className="item-table-wrap">
              <table className="item-table linen-stock-table">
                <thead>
                  <tr>
                    <th>{t.itemName}</th>
                    <th>{t.currentQuantity}</th>
                    <th>{t.requiredQuantity}</th>
                    <th>{t.incomingQuantity}</th>
                    <th>{t.currentStock}</th>
                    <th>{t.totalQuantity}</th>
                  </tr>
                </thead>
                <tbody>
                  {linenColumns.map((column) => {
                    const inventory = linenInventory?.inventory?.[column.key] || {}
                    return (
                      <tr key={column.key}>
                        <td>{column.label[language]}</td>
                        <td>{inventory.currentQuantity ?? '-'}</td>
                        <td>{inventory.requiredQuantity ?? supplySummary.totals[column.key]}</td>
                        <td>{inventory.incomingQuantity ?? linenIncomingSummary[column.key]}</td>
                        <td>{inventory.currentStock ?? '-'}</td>
                        <td>{inventory.totalQuantity ?? '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeCategory === 'items' && assignment && (
        <div className="item-count-layout">
          <section className="container-panel">
            <div className="panel-heading">
              <p className="container-label">{t.supplyCount}</p>
              <h2>{t.totalSupplyCount}</h2>
            </div>
            <div className="item-total-grid">
              {supplyColumns.map((column) => (
                <div className="item-total" key={column.key}>
                  <span>{column.label[language]}</span>
                  <strong>{supplySummary.totals[column.key]}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="container-panel">
            <div className="panel-heading">
              <p className="container-label">{t.floor}</p>
              <h2>{t.floorSupplyCount}</h2>
            </div>
            <div className="item-table-wrap">
              <table className="item-table floor-item-table">
                <thead>
                  <tr>
                    <th>{t.floor}</th>
                    <th>{t.rooms}</th>
                    {supplyColumns.map((column) => (
                      <th key={column.key}>{column.label[language]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supplySummary.byFloor.map((floor) => (
                    <tr key={floor.floor}>
                      <td>{floor.floor ? t.floorLabel(floor.floor) : t.unspecified}</td>
                      <td>{floor.count}</td>
                      {supplyColumns.map((column) => (
                        <td key={column.key}>{floor.totals[column.key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="container-panel">
            <div className="panel-heading">
              <p className="container-label">{t.roomType}</p>
              <h2>{t.roomTypeSupplyCount}</h2>
            </div>
            <div className="item-table-wrap">
              <table className="item-table">
                <thead>
                  <tr>
                    <th>{t.roomType}</th>
                    <th>{t.rooms}</th>
                    <th>{t.capacity}</th>
                    <th>{t.bedSetup}</th>
                    {supplyColumns.map((column) => (
                      <th key={column.key}>{column.label[language]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supplySummary.byRoomType.map((roomType) => (
                    <tr key={roomType.roomType}>
                      <td>{roomType.roomType}</td>
                      <td>{roomType.count}</td>
                      <td>{roomType.capacity}</td>
                      <td>{roomType.bedSetup}</td>
                      {supplyColumns.map((column) => (
                        <td key={column.key}>{roomType.totals[column.key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {supplySummary.unmatchedRoomTypes.length > 0 && (
            <section className="notice" role="alert">
              <strong>{t.missingRuleTitle}</strong>
              <span>{supplySummary.unmatchedRoomTypes.join(', ')}</span>
            </section>
          )}
        </div>
      )}

      {activeCategory === 'forecast' && forecast && (
        <>
          <section className="summary-strip" aria-label="Summary">
            <div>
              <span>{t.sheet}</span>
              <strong>{forecast.sheetTitle}</strong>
            </div>
            <div>
              <span>{t.forecastRange}</span>
              <strong>{forecastDays[0]?.date} ~ {forecastDays[forecastDays.length - 1]?.date}</strong>
            </div>
            <div>
              <span>{t.lastUpdated}</span>
              <strong>{formatter.format(new Date(forecast.generatedAt))}</strong>
            </div>
          </section>

          <div className="forecast-grid">
            {forecastDays.map((day) => (
              <article
                className={`forecast-card forecast-card--${day.tier}${day.hasData ? '' : ' forecast-card--empty'}`}
                key={day.date}
              >
                <header className="forecast-card-header">
                  <div className="forecast-date">
                    <span>{t.forecastDateLabel}</span>
                    <strong>{day.date}</strong>
                  </div>
                  <div className={`forecast-sv-badge ${day.hasSupervisor ? 'is-on' : 'is-off'}`}>
                    {day.hasSupervisor ? t.forecastSvOn : t.forecastSvOff}
                  </div>
                </header>

                <div className="forecast-metrics">
                  <div className="forecast-metric">
                    <span>{t.forecastCheckOut}</span>
                    <strong>{t.forecastRoomsValue(day.checkOutRooms)}</strong>
                  </div>
                  <div className={`forecast-metric forecast-metric--actual${day.tier === 'high' ? ' is-busy' : ''}`}>
                    <span>{t.forecastActualClean}</span>
                    <strong>
                      {t.forecastRoomsValue(day.actualCleaningRooms)}
                      {day.tier === 'high' && <em className="forecast-busy-badge">{t.forecastBusyBadge}</em>}
                    </strong>
                  </div>
                </div>

                <div className="forecast-staff">
                  <p className="forecast-section-label">{t.forecastStaff}</p>
                  {day.staffByPosition.length > 0 ? (
                    day.staffByPosition.map((group) => (
                      <div
                        className={`forecast-staff-group${group.position.trim().toUpperCase() === 'SV' ? ' forecast-staff-group--sv' : ''}`}
                        key={group.position}
                      >
                        <h4>{group.position}</h4>
                        <ul>
                          {group.staffNames.map((name, index) => (
                            <li key={`${group.position}-${name}-${index}`}>{name}</li>
                          ))}
                        </ul>
                      </div>
                    ))
                  ) : (
                    <p className="empty">{t.forecastNoStaff}</p>
                  )}
                </div>

                <div className="forecast-note">
                  <p className="forecast-section-label">{t.forecastNote}</p>
                  <p>{day.hasData ? (day.note || t.forecastNoNote) : t.forecastNoDayData}</p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  )
}

export default App
