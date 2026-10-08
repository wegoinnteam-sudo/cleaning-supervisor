import test from 'node:test'
import assert from 'node:assert/strict'
import { saveStock, stockRow, stockDate, STOCK_ITEMS } from '../../shared/linenStock.js'
const quantities = Object.fromEntries(STOCK_ITEMS.map(([key], index) => [key, index + 1]))
const requestId = '12345678-1234-4234-8234-123456789abc'
const headers = ['날짜', 'Dirty sheet', 'sv', 'Rewash', '이불(싱글)', '이불(더블)', '베개', '발매트', '(침대커버)싱글', '(침대커버)더블']
function mock(rows = [[], headers], titles = ['extra linen']) {
  let writes = 0
  const records = new Map()
  const call = async (path, params, options = {}) => {
    if (path.endsWith('developerMetadata:search')) {
      const id = options.body.dataFilters[0].developerMetadataLookup.metadataId
      return { matchedDeveloperMetadata: records.has(id) ? [{ developerMetadata: records.get(id) }] : [] }
    }
    if (path.endsWith(':batchUpdate')) {
      const requests = options.body.requests
      const metadata = requests[1].createDeveloperMetadata.developerMetadata
      if (records.has(metadata.metadataId)) throw new Error('duplicate metadata')
      assert.equal(requests[0].appendCells.sheetId, 1483534891)
      assert.equal(requests[0].appendCells.fields, 'userEnteredValue')
      rows.push(requests[0].appendCells.rows[0].values.map(c => c.userEnteredValue.numberValue ?? c.userEnteredValue.stringValue))
      records.set(metadata.metadataId, metadata)
      writes++
      return { replies: [{}, {}] }
    }
    if (path.endsWith('values:batchGetByDataFilter')) return { valueRanges: options.body.dataFilters.map(() => ({ valueRange: { values: [rows[1]] } })) }
    if (path.includes('/values/')) return { values: rows }
    return { sheets: titles.map(title => ({ properties: { title, sheetId: title === 'extra linen' || title === 'custom linen' ? 1483534891 : 7 } })) }
  }
  return { call, rows, writes: () => writes }
}
test('Korean midnight and exact mapping with numeric zero', () => {
  assert.equal(stockDate(new Date('2026-10-07T15:00:00Z')), '2026. 10. 8')
  assert.equal(stockDate(new Date('2026-10-07T14:59:59Z')), '2026. 10. 7')
  assert.deepEqual(stockRow(quantities, new Date('2026-10-08T00:00:00Z')), ['2026. 10. 8', 'Dirty sheet', 'sv', 'Rewash', 1, 2, 5, 6, 3, 4])
  assert.equal(stockRow({ ...quantities, bathMat: 0 })[7], 0)
})
test('reject negatives, decimals, strings, missing values, unsafe integers and all zero', () => {
  for (const value of [-1, 0.5, '1', undefined, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => stockRow({ ...quantities, bathMat: value }))
  assert.throws(() => stockRow(Object.fromEntries(STOCK_ITEMS.map(([key]) => [key, 0]))))
})
test('empty sheet starts at row 3; repeated request is deduplicated, same day new ID appends', async () => {
  const m = mock()
  await saveStock(m.call, {}, { requestId, quantities })
  assert.equal(m.rows.length, 3)
  assert.equal((await saveStock(m.call, {}, { requestId, quantities })).alreadySaved, true)
  await saveStock(m.call, {}, { requestId: '12345678-1234-4234-8234-123456789abd', quantities })
  assert.equal(m.writes(), 2)
  await assert.rejects(saveStock(m.call, {}, { requestId, quantities: { ...quantities, bathMat: 8 } }))
})
test('internal A gaps and older dates preserved; append follows last record', async () => {
  const rows = [[], headers, ['2099. 1. 1'], [], ['2099. 2. 1']]
  const before = structuredClone(rows)
  const m = mock(rows)
  await saveStock(m.call, {}, { requestId, quantities }, new Date('2026-10-08T00:00:00Z'))
  assert.deepEqual(rows.slice(0, 5), before)
  assert.equal(rows[5][0], '2026. 10. 8')
})
test('header match ignores spaces and letter case', async () => {
  const m = mock([[], headers.map(header => ` ${header.toUpperCase().replace(' ', '')} `)])
  await saveStock(m.call, {}, { requestId, quantities })
  assert.equal(m.writes(), 1)
})
test('fail closed for ambiguous tabs and wrong item headers', async () => {
  for (const m of [mock([[], headers], ['a', 'b']), mock([[], ['wrong']])]) {
    await assert.rejects(saveStock(m.call, {}, { requestId, quantities }))
    assert.equal(m.writes(), 0)
  }
})
test('default target is extra linen even when other tabs have matching headers', async () => {
  const m = mock([[], headers], ['other linen', 'extra linen'])
  const call = async (path, params, options = {}) => {
    if (path.endsWith('values:batchGetByDataFilter')) {
      assert.deepEqual(options.body.dataFilters, [{ a1Range: "'extra linen'!A2:J2" }])
    }
    return m.call(path, params, options)
  }
  const result = await saveStock(call, {}, { requestId, quantities })
  assert.equal(result.sheetTitle, 'extra linen')
  assert.equal(m.writes(), 1)
})
test('missing extra linen never falls back to another matching tab', async () => {
  const m = mock([[], headers], ['other linen'])
  await assert.rejects(saveStock(m.call, {}, { requestId, quantities }), /extra linen/)
  assert.equal(m.writes(), 0)
})
test('a matching name with the wrong gid cannot receive a write', async () => {
  const m = mock()
  const call = async (path, params, options) => params.fields
    ? { sheets: [{ properties: { title: 'extra linen', sheetId: 7 } }] }
    : m.call(path, params, options)
  await assert.rejects(saveStock(call, {}, { requestId, quantities }), /1483534891/)
  assert.equal(m.writes(), 0)
})
test('target tab ID is respected even after renaming or with stale name configuration', async () => {
  const m = mock([[], headers], ['custom linen'])
  const result = await saveStock(m.call, { GOOGLE_STOCK_SHEET_TAB_NAME: 'custom linen' }, { requestId, quantities })
  assert.equal(result.sheetTitle, 'custom linen')
})
test('Google API/network failure never returns success', async () => {
  await assert.rejects(saveStock(async () => { throw new TypeError('network') }, {}, { requestId, quantities }))
})
test('concurrent identical requests cannot append twice; distinct IDs append independently', async () => {
  const m = mock()
  await Promise.allSettled([saveStock(m.call, {}, { requestId, quantities }), saveStock(m.call, {}, { requestId, quantities })])
  assert.equal(m.writes(), 1)
  assert.equal((await saveStock(m.call, {}, { requestId, quantities })).alreadySaved, true)
  await Promise.all([saveStock(m.call, {}, { requestId: '12345678-1234-4234-8234-123456789abd', quantities }), saveStock(m.call, {}, { requestId: '12345678-1234-4234-8234-123456789abe', quantities })])
  assert.equal(m.writes(), 3)
})
test('lost success response is recovered using the same request ID without a second write', async () => {
  const m = mock()
  const lostResponse = async (...args) => {
    const result = await m.call(...args)
    if (args[0].endsWith(':batchUpdate')) throw new TypeError('response lost')
    return result
  }
  await assert.rejects(saveStock(lostResponse, {}, { requestId, quantities }))
  assert.equal((await saveStock(m.call, {}, { requestId, quantities })).alreadySaved, true)
  assert.equal(m.writes(), 1)
})
test('both runtime adapters fail without write credentials', async () => {
  const { saveLinenStock } = await import('../services/linenStock.js')
  await assert.rejects(saveLinenStock({ requestId, quantities }), /인증 설정/)
  const { onRequestPost } = await import('../../functions/api/linen-stock.js')
  const response = await onRequestPost({ env: {}, request: new Request('https://example.com/api/linen-stock', { method: 'POST', body: JSON.stringify({ requestId, quantities }) }) })
  assert.equal(response.status, 401)
  assert.equal((await response.json()).saved, undefined)
})

test('actual extra linen headers only match E:J; A:D contain fixed values', async () => {
  const actualHeaders = ['Date', 'Room #', 'Staff(본인)', '사유', ...headers.slice(4)]
  const m = mock([[], actualHeaders])
  await saveStock(m.call, {}, { requestId, quantities }, new Date('2026-10-08T00:00:00Z'))
  assert.deepEqual(m.rows[2], ['2026. 10. 8', 'Dirty sheet', 'sv', 'Rewash', 1, 2, 5, 6, 3, 4])
})
test('quantities follow matching header columns when E:J are reordered', async () => {
  const m = mock([[], ['', '', '', '', ...headers.slice(4).reverse()]])
  await saveStock(m.call, {}, { requestId, quantities })
  assert.deepEqual(m.rows[2].slice(4), [4, 3, 6, 5, 2, 1])
})
test('duplicate or missing item headers cannot route quantities', async () => {
  const m = mock([[], [...headers.slice(0, 9), headers[8]]])
  await assert.rejects(saveStock(m.call, {}, { requestId, quantities }))
  assert.equal(m.writes(), 0)
})
test('31 existing rows append all values into empty row 32', async () => {
  const m = mock([[], headers, ...Array.from({ length: 29 }, () => ['2026. 10. 7'])])
  await saveStock(m.call, {}, { requestId, quantities })
  assert.equal(m.rows.length, 32)
  assert.deepEqual(m.rows[31].slice(1), ['Dirty sheet', 'sv', 'Rewash', 1, 2, 5, 6, 3, 4])
})

test('a final record without a date still appends after that record', async () => {
  const rows = [[], headers, ['2026. 10. 7'], [], ['', 'room', 'staff']]
  const before = structuredClone(rows)
  const m = mock(rows)
  await saveStock(m.call, {}, { requestId, quantities })
  assert.deepEqual(rows.slice(0, 5), before)
  assert.equal(rows[5][1], 'Dirty sheet')
})
