import { useRef, useState } from 'react'
import { STOCK_ITEMS } from '../shared/linenStock.js'
import './LinenStock.css'
const zeroes = () => Object.fromEntries(STOCK_ITEMS.map(([key]) => [key, '0']))
export default function LinenStock() {
  const [inputs, setInputs] = useState(zeroes)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
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
    try {
      const response = await fetch('/api/linen-stock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pending.current) })
      const data = await response.json()
      if (!response.ok || data.saved !== true || data.requestId !== pending.current.requestId) {
        if (response.status === 400) pending.current = null
        throw new Error(`${data.code || 'api'}: ${data.message || response.status}`)
      }
      pending.current = null
      setInputs(zeroes())
      setMessage('린넨 재고가 정상적으로 저장되었습니다.')
    } catch (error) {
      console.error('[linen-stock]', error)
      setMessage('저장에 실패했습니다. 다시 확인해 주세요.')
    } finally {
      busy.current = false
      setSaving(false)
      setLocked(Boolean(pending.current))
    }
  }
  return <section className="container-panel linen-stock-entry">
    <div className="panel-heading"><h2>린넨 재고 파악</h2></div>
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
      {locked && !saving && <p>입력값은 유지됩니다. 저장하기를 다시 누르면 같은 요청 ID로 저장 여부를 확인합니다.</p>}
    </form>
  </section>
}
