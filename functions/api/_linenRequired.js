const requiredLinenKeys = [
  'singleDuvetCover',
  'doubleDuvetCover',
  'singleMattressCover',
  'doubleMattressCover',
  'pillowCover',
  'bathMat',
]

const roomTypeLinenRules = {
  SINGLE: {
    singleDuvetCover: 1,
    doubleDuvetCover: 0,
    singleMattressCover: 1,
    doubleMattressCover: 0,
    pillowCover: 1,
    bathMat: 1,
  },
  DOUBLE: {
    singleDuvetCover: 0,
    doubleDuvetCover: 1,
    singleMattressCover: 0,
    doubleMattressCover: 1,
    pillowCover: 2,
    bathMat: 1,
  },
  HANDIC: {
    singleDuvetCover: 0,
    doubleDuvetCover: 1,
    singleMattressCover: 0,
    doubleMattressCover: 1,
    pillowCover: 2,
    bathMat: 1,
  },
  'TWIN BUNK': {
    singleDuvetCover: 2,
    doubleDuvetCover: 0,
    singleMattressCover: 2,
    doubleMattressCover: 0,
    pillowCover: 2,
    bathMat: 1,
  },
  TWIN: {
    singleDuvetCover: 2,
    doubleDuvetCover: 0,
    singleMattressCover: 2,
    doubleMattressCover: 0,
    pillowCover: 2,
    bathMat: 1,
  },
  TRIPLE: {
    singleDuvetCover: 1,
    doubleDuvetCover: 1,
    singleMattressCover: 1,
    doubleMattressCover: 1,
    pillowCover: 3,
    bathMat: 1,
  },
  '4 BUNK': {
    singleDuvetCover: 4,
    doubleDuvetCover: 0,
    singleMattressCover: 4,
    doubleMattressCover: 0,
    pillowCover: 4,
    bathMat: 1,
  },
  'STANDARD FAMILY': {
    singleDuvetCover: 0,
    doubleDuvetCover: 2,
    singleMattressCover: 0,
    doubleMattressCover: 2,
    pillowCover: 4,
    bathMat: 1,
  },
  DELUXE: {
    singleDuvetCover: 0,
    doubleDuvetCover: 2,
    singleMattressCover: 0,
    doubleMattressCover: 2,
    pillowCover: 4,
    bathMat: 1,
  },
}

function normalizeRoomType(roomType = '') {
  return String(roomType).replace(/\s+/g, ' ').trim().toUpperCase()
}

function createRequiredTotals() {
  return Object.fromEntries(requiredLinenKeys.map((key) => [key, 0]))
}

export function buildRequiredLinenQuantities(assignment = {}) {
  const totals = createRequiredTotals()
  const unmatchedRoomTypes = new Set()

  assignment.rooms?.forEach((room) => {
    const roomType = normalizeRoomType(room.roomType)
    const rule = roomTypeLinenRules[roomType]

    if (!rule) {
      unmatchedRoomTypes.add(roomType)
      return
    }

    requiredLinenKeys.forEach((key) => {
      totals[key] += rule[key] || 0
    })
  })

  totals.bathMat += Number(assignment.extraFootTowelCount) || 0

  return {
    requiredQuantities: totals,
    unmatchedRoomTypes: [...unmatchedRoomTypes].sort(),
  }
}
