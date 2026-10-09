import { useRef, useState } from 'react'
import { STOCK_ITEMS } from '../shared/linenStock.js'
import './LinenStock.css'
const translations = {
  ko: {
    title: '린넨 재고파악', heading: '재새탁 수량 파악', quantity: '수량',
    save: '저장하기', saving: '저장 중…',
    invalid: '0 이상의 정수를 입력해 주세요.', empty: '수량을 하나 이상 입력해 주세요.',
    success: '린넨 재고가 정상적으로 저장되었습니다.', failure: '저장에 실패했습니다. 다시 확인해 주세요.',
    auth: 'Google 인증 정보 또는 스프레드시트 공유 권한을 확인해 주세요.',
    network: 'API 서버에 연결하지 못했습니다.', api: 'Google Sheets 저장 중 오류가 발생했습니다.',
    locked: '저장 결과를 확인하지 못해 입력값을 잠갔습니다. 저장하기를 다시 누르면 중복 없이 저장 여부를 확인합니다.',
  },
  en: {
    title: 'Linen Inventory', heading: 'Rewash Quantity Check', quantity: 'quantity',
    save: 'Save', saving: 'Saving…',
    invalid: 'Enter a non-negative whole number.', empty: 'Enter at least one quantity greater than zero.',
    success: 'Linen inventory saved successfully.', failure: 'Unable to save. Please check and try again.',
    auth: 'Check your Google credentials and spreadsheet sharing permissions.',
    network: 'Unable to connect to the API server.', api: 'An error occurred while saving to Google Sheets.',
    locked: 'The save result could not be confirmed, so the inputs are locked. Click Save again to check without creating a duplicate.',
  },
}
const englishItems = {
  singleDuvetCover: 'Single duvet cover', doubleDuvetCover: 'Double duvet cover',
  singleMattressCover: 'Single mattress cover', doubleMattressCover: 'Double mattress cover',
  pillowCover: 'Pillow cover', bathMat: 'Bath mat',
}
// Inputs start blank; a blank field counts as 0.
const blanks = () => Object.fromEntries(STOCK_ITEMS.map(([key]) => [key, '']))
export default function LinenStock({ language = 'ko' }) {
  const t = translations[language] || translations.ko
  const [inputs, setInputs] = useState(blanks)
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
    if (STOCK_ITEMS.some(([key]) => !/^\d*$/.test(inputs[key]) || !Number.isSafeInteger(quantities[key]))) return setMessage('invalid')
    if (Object.values(quantities).every(q => q === 0)) return setMessage('empty')
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
      setInputs(blanks())
      setMessage('success')
    } catch (error) {
      const code = error.code || 'network'
      console.error('[linen-stock]', code, error)
      setMessage('failure')
      setReason(['auth', 'network', 'api'].includes(code) ? code : 'api')
    } finally {
      busy.current = false
      setSaving(false)
      setLocked(Boolean(pending.current))
    }
  }
  return <section className="container-panel linen-stock-entry">
    <div className="panel-heading">
      <p className="container-label">{t.title}</p>
      <h2>{t.heading}</h2>
    </div>
    <form onSubmit={save}>
      {STOCK_ITEMS.map(([key, koreanLabel]) => {
        const label = language === 'en' ? englishItems[key] : koreanLabel
        return <label className="stock-entry-row" key={key}>
        <span>{label}</span>
        <input aria-label={`${label} ${t.quantity}`} type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={inputs[key]} disabled={saving || locked} onChange={event => {
          const value = event.target.value
          if (/^\d*$/.test(value) && (value === '' || Number.isSafeInteger(Number(value)))) setInputs(current => ({ ...current, [key]: value }))
        }} />
      </label>
      })}
      <button className="refresh-button stock-save-button" disabled={saving} type="submit">{saving ? t.saving : t.save}</button>
      {message && <p role="status" aria-live="polite">{t[message]}</p>}
      {reason && <p className="stock-failure-reason">{t[reason]}</p>}
      {locked && !saving && <p>{t.locked}</p>}
    </form>
  </section>
}
