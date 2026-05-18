const KOREA_TIME_ZONE = 'Asia/Seoul'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
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

function getStorageKey(date) {
  return `room-checks:${date}`
}

function getRoomChecksStore(env) {
  if (!env.ROOM_CHECKS) {
    throw new Error('ROOM_CHECKS KV binding is not configured.')
  }

  return env.ROOM_CHECKS
}

async function readCheckedRoomKeys(env, date) {
  const store = getRoomChecksStore(env)
  const checkedRoomKeys = await store.get(getStorageKey(date), 'json')
  return Array.isArray(checkedRoomKeys) ? checkedRoomKeys : []
}

async function writeCheckedRoomKeys(env, date, checkedRoomKeys) {
  const store = getRoomChecksStore(env)
  const uniqueRoomKeys = [...new Set(checkedRoomKeys)].sort()
  await store.put(getStorageKey(date), JSON.stringify(uniqueRoomKeys))
  return uniqueRoomKeys
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const date = url.searchParams.get('date') || getTodayInKorea()

  try {
    return json({
      date,
      checkedRoomKeys: await readCheckedRoomKeys(env, date),
    })
  } catch (error) {
    return json({ message: error.message }, 500)
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json()
    const date = body.date || getTodayInKorea()
    const roomKey = String(body.roomKey || '').trim()
    const checked = Boolean(body.checked)

    if (!roomKey) {
      return json({ message: 'roomKey is required.' }, 400)
    }

    const checkedRoomKeys = new Set(await readCheckedRoomKeys(env, date))

    if (checked) {
      checkedRoomKeys.add(roomKey)
    } else {
      checkedRoomKeys.delete(roomKey)
    }

    return json({
      date,
      checkedRoomKeys: await writeCheckedRoomKeys(env, date, [...checkedRoomKeys]),
    })
  } catch (error) {
    return json({ message: error.message }, 500)
  }
}
