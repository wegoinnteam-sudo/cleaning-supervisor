import { useEffect, useMemo, useState } from 'react'
import './App.css'

const formatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  dateStyle: 'full',
  timeStyle: 'short',
})

function getRoomKey(room) {
  return `${room.roomNumber}-${room.roomType}`
}

const supplyColumns = [
  { key: 'singleDuvetCover', label: '싱글 이불커버' },
  { key: 'doubleDuvetCover', label: '더블 이불커버' },
  { key: 'singleMattressCover', label: '싱글 매트리스커버' },
  { key: 'doubleMattressCover', label: '더블 매트리스커버' },
  { key: 'pillowCover', label: '베개커버' },
  { key: 'towel', label: '수건' },
  { key: 'bathMat', label: '발매트' },
]

const roomTypeSupplyRules = {
  SINGLE: {
    capacity: '1명',
    bedSetup: '싱글베드 1',
    singleDuvetCover: 1,
    doubleDuvetCover: 0,
    singleMattressCover: 1,
    doubleMattressCover: 0,
    pillowCover: 1,
    towel: 2,
    bathMat: 1,
  },
  DOUBLE: {
    capacity: '2명',
    bedSetup: '더블베드 1',
    singleDuvetCover: 0,
    doubleDuvetCover: 1,
    singleMattressCover: 0,
    doubleMattressCover: 1,
    pillowCover: 2,
    towel: 4,
    bathMat: 1,
  },
  HANDIC: {
    capacity: '2명',
    bedSetup: '더블베드 1',
    singleDuvetCover: 0,
    doubleDuvetCover: 1,
    singleMattressCover: 0,
    doubleMattressCover: 1,
    pillowCover: 2,
    towel: 4,
    bathMat: 1,
  },
  'TWIN BUNK': {
    capacity: '2명',
    bedSetup: '싱글 2층침대 1개',
    singleDuvetCover: 2,
    doubleDuvetCover: 0,
    singleMattressCover: 2,
    doubleMattressCover: 0,
    pillowCover: 2,
    towel: 4,
    bathMat: 1,
  },
  TWIN: {
    capacity: '2명',
    bedSetup: '싱글베드 2',
    singleDuvetCover: 2,
    doubleDuvetCover: 0,
    singleMattressCover: 2,
    doubleMattressCover: 0,
    pillowCover: 2,
    towel: 4,
    bathMat: 1,
  },
  TRIPLE: {
    capacity: '3명',
    bedSetup: '싱글베드 1 + 더블베드 1',
    singleDuvetCover: 1,
    doubleDuvetCover: 1,
    singleMattressCover: 1,
    doubleMattressCover: 1,
    pillowCover: 3,
    towel: 6,
    bathMat: 1,
  },
  '4 BUNK': {
    capacity: '4명',
    bedSetup: '싱글 2층침대 2개',
    singleDuvetCover: 4,
    doubleDuvetCover: 0,
    singleMattressCover: 4,
    doubleMattressCover: 0,
    pillowCover: 4,
    towel: 8,
    bathMat: 1,
  },
  'STANDARD FAMILY': {
    capacity: '4명',
    bedSetup: '더블베드 2',
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
  return floor ? `${floor}층` : '미지정'
}

function createSupplyTotals() {
  return Object.fromEntries(supplyColumns.map((column) => [column.key, 0]))
}

function App() {
  const [assignment, setAssignment] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [checkedRooms, setCheckedRooms] = useState(() => new Set())
  const [activeCategory, setActiveCategory] = useState('rooms')

  async function fetchAssignment(forceRefresh = false) {
    const response = await fetch(`/api/cleaning-assignment${forceRefresh ? '?refresh=true' : ''}`)
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || '청소 배정 정보를 불러오지 못했습니다.')
    }

    return data
  }

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

  useEffect(() => {
    let ignore = false

    fetchAssignment()
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
  }, [])

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

  const supplySummary = useMemo(() => {
    const totals = createSupplyTotals()
    const byRoomType = {}
    const byFloor = {}
    const unmatchedRoomTypes = new Set()

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
          capacity: rule.capacity,
          bedSetup: rule.bedSetup,
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
  }, [assignment])

  function toggleRoom(room) {
    const roomKey = getRoomKey(room)

    setCheckedRooms((current) => {
      const next = new Set(current)
      if (next.has(roomKey)) {
        next.delete(roomKey)
      } else {
        next.add(roomKey)
      }
      return next
    })
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
          aria-label={`${room.roomNumber} ${room.roomType} 완료`}
        />
      </label>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Cleaning Supervisor</p>
          <h1>객실 청소 배정</h1>
          <p className="subtle">
            한국시간 {assignment?.date || '오늘'} 기준 Google Spreadsheet 실시간 데이터
          </p>
        </div>
        <button type="button" className="refresh-button" onClick={refreshAssignment}>
          새로고침
        </button>
      </header>

      <nav className="category-tabs" aria-label="카테고리">
        <button
          type="button"
          className={activeCategory === 'rooms' ? 'active' : ''}
          onClick={() => setActiveCategory('rooms')}
        >
          객실 청소배정
        </button>
        <button
          type="button"
          className={activeCategory === 'items' ? 'active' : ''}
          onClick={() => setActiveCategory('items')}
        >
          필요 품목 갯수
        </button>
      </nav>

      {error && (
        <section className="notice" role="alert">
          <strong>데이터를 읽을 수 없습니다.</strong>
          <span>{error}</span>
        </section>
      )}

      {loading && (
        <section className="notice">
          <strong>불러오는 중</strong>
          <span>스프레드시트의 날짜 열, 객실 정보, 셀 배경색을 확인하고 있습니다.</span>
        </section>
      )}

      {activeCategory === 'rooms' && assignment && (
        <section className="summary-strip" aria-label="요약">
          <div>
            <span>시트</span>
            <strong>{assignment.sheetTitle}</strong>
          </div>
          <div>
            <span>총 청소 객실</span>
            <strong>{assignment.total}</strong>
          </div>
          <div>
            <span>마지막 갱신</span>
            <strong>{formatter.format(new Date(assignment.updatedAt))}</strong>
          </div>
        </section>
      )}

      {activeCategory === 'rooms' && assignment && (
        <div className="container-grid">
          <section className="container-panel">
            <div className="panel-heading">
              <p className="container-label">컨테이너 1</p>
              <h2>오늘 청소해야 하는 객실 목록</h2>
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
                        <span>체크된 객실</span>
                        <strong>{completedRooms.length}</strong>
                      </div>
                      {completedRooms.map((room) => renderRoomRow(room, true))}
                    </div>
                  )}
                </>
              ) : (
                <p className="empty">오늘 청소 대상 객실이 없습니다.</p>
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
                <span>TOTAL:</span>
                <strong>{assignment.total}</strong>
              </div>
            </div>
          </section>

          <section className="container-panel">
            <div className="panel-heading">
              <p className="container-label">컨테이너 2</p>
              <h2>직원별 청소 배정 리스트</h2>
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
                <p className="empty">직원 배정 내역이 없습니다.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {activeCategory === 'items' && assignment && (
        <div className="item-count-layout">
          <section className="container-panel">
            <div className="panel-heading">
              <p className="container-label">필요 품목 갯수</p>
              <h2>전체 품목 합계</h2>
            </div>
            <div className="item-total-grid">
              {supplyColumns.map((column) => (
                <div className="item-total" key={column.key}>
                  <span>{column.label}</span>
                  <strong>{supplySummary.totals[column.key]}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="container-panel">
            <div className="panel-heading">
              <p className="container-label">Floor</p>
              <h2>층별 필요 품목</h2>
            </div>
            <div className="item-table-wrap">
              <table className="item-table floor-item-table">
                <thead>
                  <tr>
                    <th>층</th>
                    <th>객실</th>
                    {supplyColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supplySummary.byFloor.map((floor) => (
                    <tr key={floor.floor}>
                      <td>{floor.floor}</td>
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
              <p className="container-label">Room Type</p>
              <h2>타입별 품목 계산</h2>
            </div>
            <div className="item-table-wrap">
              <table className="item-table">
                <thead>
                  <tr>
                    <th>Room Type</th>
                    <th>객실</th>
                    <th>기준 인원</th>
                    <th>침대 구성</th>
                    {supplyColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
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
              <strong>품목 기준이 없는 Room Type이 있습니다.</strong>
              <span>{supplySummary.unmatchedRoomTypes.join(', ')}</span>
            </section>
          )}
        </div>
      )}
    </main>
  )
}

export default App
