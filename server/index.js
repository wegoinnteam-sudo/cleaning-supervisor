import cors from 'cors'
import cron from 'node-cron'
import dotenv from 'dotenv'
import express from 'express'
import { buildCleaningAssignment } from './services/cleaningAssignment.js'
import { buildCleaningForecast } from './services/cleaningForecast.js'
import { getLinenInventory, saveLinenInventory } from './services/linenInventory.js'

import { saveLinenStock } from './services/linenStock.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT || 3001)
let cachedAssignment = null
let lastError = null

app.use(cors())
app.use(express.json())

async function refreshAssignment() {
  try {
    cachedAssignment = await buildCleaningAssignment()
    lastError = null
    return cachedAssignment
  } catch (error) {
    lastError = error
    throw error
  }
}

cron.schedule('0 0 * * *', () => {
  refreshAssignment().catch((error) => {
    console.error('[cleaning-assignment] midnight refresh failed:', error.message)
  })
}, {
  timezone: 'Asia/Seoul',
})

app.get('/api/cleaning-assignment', async (request, response) => {
  const forceRefresh = request.query.refresh === 'true'

  try {
    const assignment = forceRefresh || !cachedAssignment
      ? await refreshAssignment()
      : cachedAssignment

    response.json(assignment)
  } catch (error) {
    response.status(500).json({
      message: error.message,
      lastError: lastError?.message || null,
    })
  }
})

app.get('/api/cleaning-forecast', async (request, response) => {
  try {
    response.json(await buildCleaningForecast())
  } catch (error) {
    response.status(500).json({
      message: error.message,
    })
  }
})

app.get('/api/linen-inventory', async (request, response) => {
  try {
    response.json(await getLinenInventory())
  } catch (error) {
    response.status(500).json({
      message: error.message,
    })
  }
})

app.post('/api/linen-inventory', async (request, response) => {
  try {
    response.json(await saveLinenInventory(request.body || {}))
  } catch (error) {
    response.status(500).json({
      message: error.message,
    })
  }
})

app.post('/api/linen-stock', async (request, response) => {
  try {
    response.json(await saveLinenStock(request.body || {}))
  } catch (error) {
    const status = error.status || error.response?.status || 500
    const code = [401, 403].includes(status) ? 'auth' : error instanceof TypeError || /^(ECONN|ENET|ETIMEDOUT|EAI_|ENOTFOUND)/.test(error.code || '') ? 'network' : 'api'
    console.error('[linen-stock]', code, error.message)
    response.status(status).json({ message: '저장에 실패했습니다. 다시 확인해 주세요.', code, detail: String(error?.message || error) })
  }
})

app.listen(port, () => {
  console.log(`Cleaning supervisor API listening on http://localhost:${port}`)
})
