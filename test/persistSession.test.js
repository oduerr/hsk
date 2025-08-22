import { describe, it, expect, vi, beforeEach } from 'vitest'
import { persistSession } from '../js/storage.js'

// Minimal mock state resembling js/state.js shape
function buildMockState() {
  const now = new Date().toISOString()
  return {
    deck: [{ id: 'c1', hanzi: '你', pinyin: 'ni3', english: 'you' }],
    order: [0],
    index: 0,
    face: 'front',
    mistakes: new Set(['c1']),
    levelLabel: 'Test',
    sessionLocale: 'zh-CN',
    session: {
      id: 'sess-1',
      startedAt: now,
      finishedAt: null,
      events: [{ type: 'start', at: now, index: 0 }],
      replayOf: null,
      annotation: [],
      lastPlayedAt: now,
      name: 'Test Session'
    }
  }
}

// Reuse localStorage mock from global setup
const localStorageMock = window.localStorage

describe('persistSession()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockClear()
    localStorageMock.setItem.mockClear()
  })

  it('writes full session and summary with correct fields', () => {
    const state = buildMockState()

    const res = persistSession(state, { reason: 'manual' })

    // Should return sessionId and indicate a summary write
    expect(res.sessionId).toBe('sess-1')

    // Verify full session write
    const fullKey = 'hsk.flash.session.' + state.session.id
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      fullKey,
      expect.stringContaining('"id":"sess-1"')
    )

    // Verify summary write
    const summaryKey = 'hsk.flash.sessions'
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      summaryKey,
      expect.any(String)
    )

    // Inspect summary payload
    const calls = localStorageMock.setItem.mock.calls
    const summaryCall = calls.find(c => c[0] === summaryKey)
    expect(summaryCall).toBeTruthy()
    const summaries = JSON.parse(summaryCall[1])
    const summary = summaries.find(s => s.id === 'sess-1')
    expect(summary).toBeTruthy()
    expect(summary.inProgress).toBe(true)
    expect(summary.lastPlayedAt).toBe(state.session.lastPlayedAt)
    expect(summary.counts.total).toBe(1)
    expect(summary.counts.mistakes).toBe(1)
  })
})


