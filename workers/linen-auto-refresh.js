export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(refreshLinenInventory(env))
  },
}

async function refreshLinenInventory(env) {
  const endpoint = env.AUTO_REFRESH_ENDPOINT || 'https://cleaning-supervisor.pages.dev/api/linen-inventory/auto-refresh'
  const secret = env.AUTO_REFRESH_SECRET || ''

  if (!secret) {
    throw new Error('AUTO_REFRESH_SECRET is required.')
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-auto-refresh-secret': secret,
    },
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.message || `Auto refresh failed with ${response.status}`)
  }

  console.log(JSON.stringify({
    date: data.date,
    extraFootTowelCount: data.extraFootTowelCount,
    updatedRanges: data.updatedRanges,
  }))
}
