import { useRef, useState } from 'react'
import { STOCK_ITEMS } from '../shared/linenStock.js'
import './LinenStock.css'
const FAILURE_REASONS = {
  auth: 'Google 인증 정보 또는 스프레드시트 공유 권한을 확인해 주세요.',
  network: 'API 서버에 연결하지 못했습니다.',
  api: 'Google Sheets 저장 중 오류가 발생했습니다.',
}
const zeroes = () => Object.fromEntries(STOCK_ITEMS.map(([key]) => [key, '0']))
export default function LinenStock() {
  const [inputs, setInputs] = useState(zeroes)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [reason, setReason] = useState('')
  const pending = useRef(null)
  const [locked, setLocked] = useState(false)
  const busy = useRef(false)
  async function save(event) {
    event.preventDefault()
    if (busy.current) return
    const quantities = Object.fromEntries(STOCK_ITEMS.map(([key]) => [key, Number(inputs[key])]))
    if (STOCK_ITEMS.some(([key]) => !/^\d+$/.test(inputs[key]) || !Number.isSafeInteger(quantities[key]))) return setMessage('0 이상의 정수를 입력해 주세요.')
    if (Object.values(quantities).every(q => q === 0)) return setMessage('수량을 하나 이상 입력해 주세요.')
    pending.current ||= { requestId: crypto.randomUUID(), quantities }
    busy.current = true
    setSaving(true)
    setMessage('')
    setReason('')
    try {
      const response = await fetch('/api/linen-stock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pending.current) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.saved !== true || data.requestId !== pending.current.requestId) {
        // 4xx: the server rejected the request before writing, so a fresh request ID is safe.
        if (response.status >= 400 && response.status < 500) pending.current = null
        const code = data.code || (response.status >= 500 && !data.message ? 'network' : 'api')
        throw Object.assign(new Error(data.detail || data.message || `HTTP ${response.status}`), { code })
      }
      pending.current = null
      setInputs(zeroes())
      setMessage('린넨 재고가 정상적으로 저장되었습니다.')
    } catch (error) {
      const code = error.code || 'network'
      console.error('[linen-stock]', code, error)
      setMessage('저장에 실패했습니다. 다시 확인해 주세요.')
      setReason(`${FAILURE_REASONS[code] || FAILURE_REASONS.api} (${error.message})`)
    } finally {
      busy.current = false
      setSaving(false)
      setLocked(Boolean(pending.current))
    }
  }
  return <section className="container-panel linen-stock-entry">
    <div className="panel-heading">
      <p className="container-label">린넨 재고파악</p>
      <h2>린넨 재고 파악</h2>
    </div>
    <form onSubmit={save}>
      {STOCK_ITEMS.map(([key, label]) => <label className="stock-entry-row" key={key}>
        <span>{label}</span>
        <input aria-label={`${label} 수량`} type="text" inputMode="numeric" pattern="[0-9]+" required value={inputs[key]} disabled={saving || locked} onChange={event => {
          const value = event.target.value
          if (/^\d*$/.test(value) && (value === '' || Number.isSafeInteger(Number(value)))) setInputs(current => ({ ...current, [key]: value }))
        }} onBlur={() => { if (inputs[key] === '') setInputs(current => ({ ...current, [key]: '0' })) }} />
      </label>)}
      <button className="refresh-button stock-save-button" disabled={saving} type="submit">{saving ? '저장 중…' : '저장하기'}</button>
      {message && <p role="status" aria-live="polite">{message}</p>}
      {reason && <p className="stock-failure-reason">{reason}</p>}
      {locked && !saving && <p>저장 결과를 확인하지 못해 입력값을 잠갔습니다. 저장하기를 다시 누르면 중복 없이 저장 여부를 확인합니다.</p>}
    </form>
  </section>
}
