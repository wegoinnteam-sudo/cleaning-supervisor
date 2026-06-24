import { buildCleaningAssignment } from '../cleaning-assignment.js'
import { buildRequiredLinenQuantities } from '../_linenRequired.js'
import { saveRequiredLinenQuantities } from '../linen-inventory.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function isAuthorized(request, env) {
  const secret = env.AUTO_REFRESH_SECRET || ''
  if (!secret) return false

  return request.headers.get('x-auto-refresh-secret') === secret
}

export async function onRequestPost({ request, env }) {
  if (!isAuthorized(request, env)) {
    return json({ message: 'Unauthorized auto refresh request.' }, 401)
  }

  try {
    const assignment = await buildCleaningAssignment(env)
    const { requiredQuantities, unmatchedRoomTypes } = buildRequiredLinenQuantities(assignment)
    const result = await saveRequiredLinenQuantities(env, requiredQuantities)

    return json({
      ...result,
      assignmentDate: assignment.date,
      extraFootTowelCount: assignment.extraFootTowelCount,
      unmatchedRoomTypes,
    })
  } catch (error) {
    return json({ message: error.message }, 500)
  }
}
