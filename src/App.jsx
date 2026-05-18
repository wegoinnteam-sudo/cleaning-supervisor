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

      {activeCategory === 'items' && (
        <section className="container-panel placeholder-panel">
          <div className="panel-heading">
            <p className="container-label">필요 품목 갯수</p>
            <h2>품목 집계</h2>
          </div>
          <p className="empty">필요 품목 갯수는 다음 단계에서 연결합니다.</p>
        </section>
      )}
    </main>
  )
}

export default App
