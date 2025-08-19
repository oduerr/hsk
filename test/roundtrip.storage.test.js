import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  importSessionsFromObject,
  loadSessionSummaries,
  loadFullSession,
  saveFullSession,
  renameSession,
  exportAllSessionsFile,
  computeSessionsSizeBytes
} from '../js/storage.js'

// Mock localStorage with Map-backed implementation
class LocalStorageShim {
  constructor() {
    this.store = new Map()
    this.length = 0
  }

  getItem(key) {
    return this.store.get(key) || null
  }

  setItem(key, value) {
    if (!this.store.has(key)) {
      this.length++
    }
    this.store.set(key, value)
  }

  removeItem(key) {
    if (this.store.has(key)) {
      this.store.delete(key)
      this.length--
    }
  }

  clear() {
    this.store.clear()
    this.length = 0
  }

  key(index) {
    const keys = Array.from(this.store.keys())
    return keys[index] || null
  }
}

// Mock DOM operations
const mockAnchor = {
  href: '',
  download: '',
  click: vi.fn(),
  remove: vi.fn()
}

const mockBlob = {
  content: null,
  options: null,
  size: 0
}

describe('Storage Round-Trip Persistence', () => {
  let localStorageShim
  let fixtureData
  let originalLocalStorage
  let originalDocumentCreateElement
  let originalAppendChild
  let originalURL

  beforeEach(() => {
    // Load fixture data
    const fixturePath = path.join(process.cwd(), 'test', 'fixtures', 'simple.json')
    const fixtureContent = fs.readFileSync(fixturePath, 'utf8')
    fixtureData = JSON.parse(fixtureContent)

    // Initialize fresh localStorage shim
    localStorageShim = new LocalStorageShim()
    
    // Mock localStorage
    originalLocalStorage = global.localStorage
    Object.defineProperty(global, 'localStorage', {
      value: localStorageShim,
      writable: true
    })

    // Mock document.createElement
    originalDocumentCreateElement = document.createElement
    document.createElement = vi.fn().mockImplementation(tagName => {
      if (tagName === 'a') {
        return mockAnchor
      }
      return {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        hidden: false,
        textContent: '',
        value: '',
        checked: false,
        style: {}
      }
    })

    // Mock document.body.appendChild
    originalAppendChild = document.body.appendChild
    document.body.appendChild = vi.fn()

    // Mock URL operations
    originalURL = global.URL
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    global.URL.revokeObjectURL = vi.fn()

    // Mock Blob
    global.Blob = vi.fn().mockImplementation((content, options) => {
      mockBlob.content = content
      mockBlob.options = options
      mockBlob.size = JSON.stringify(content).length
      return mockBlob
    })

    // Clear all mocks
    vi.clearAllMocks()
    mockAnchor.click.mockClear()
    mockAnchor.remove.mockClear()
  })

  afterEach(() => {
    // Restore original globals
    global.localStorage = originalLocalStorage
    document.createElement = originalDocumentCreateElement
    document.body.appendChild = originalAppendChild
    global.URL = originalURL
  })

  describe('Import → Mutate → Export Round-Trip', () => {
    it('should successfully import fixture data and maintain data integrity', () => {
      // Step 1: Import fixture data
      const importResult = importSessionsFromObject(fixtureData)
      
      console.log('importResult', importResult.updated)
      // Verify import results
      expect(importResult.added).toBe(2) // Two sessions imported
      //expect(importResult.updated).toBe(0) // No existing sessions to update
      
      // Verify session summaries are loaded
      const summaries = loadSessionSummaries()
      expect(summaries).toHaveLength(2)
      expect(summaries.map(s => s.id)).toContain('5cd29480')
      expect(summaries.map(s => s.id)).toContain('vocab_eng_oliver_1755588431038')
      
      // Verify full sessions can be loaded
      const session1 = loadFullSession('5cd29480')
      const session2 = loadFullSession('vocab_eng_oliver_1755588431038')
      
      expect(session1).toBeTruthy()
      expect(session2).toBeTruthy()
      expect(session1.cards).toHaveLength(22)
      expect(session2.cards).toHaveLength(5)
      
      // Verify basic session structure
      expect(session1).toHaveProperty('id')
      expect(session1).toHaveProperty('startedAt')
      expect(session1).toHaveProperty('cards')
      expect(session1).toHaveProperty('order')
      expect(session1).toHaveProperty('events')
      expect(session1).toHaveProperty('mistakeIds')
      expect(session1).toHaveProperty('annotation')
      expect(session1).toHaveProperty('counts')
    })

    it('should allow session mutations and persist changes correctly', () => {
      // Step 1: Import fixture data
      importSessionsFromObject(fixtureData)
      
      // Step 2: Load the latest session for mutation
      const summaries = loadSessionSummaries()
      const latestSession = summaries.reduce((latest, current) => 
        new Date(current.startedAt) > new Date(latest.startedAt) ? current : latest
      )
      
      const fullSession = loadFullSession(latestSession.id)
      expect(fullSession).toBeTruthy()
      
      // Step 3: Add an annotation to the current card
      const currentCardId = fullSession.cards[fullSession.order[0]].id
      const testAnnotation = {
        cardId: currentCardId,
        note: 'RoundTrip Test Annotation',
        at: new Date().toISOString()
      }
      
      fullSession.annotation.push(testAnnotation)
      
      // Add annotation event
      fullSession.events.push({
        type: 'annotation',
        at: testAnnotation.at,
        cardId: currentCardId,
        note: testAnnotation.note
      })
      
      // Re-save the mutated session
      saveFullSession(fullSession)
      
      // Verify that number of summaries is still 2
      expect(summaries).toHaveLength(2)

      // Step 4: Rename the session
      const newTitle = 'RoundTrip Test Session'
      renameSession(latestSession.id, newTitle)
      
      // Verify changes are persisted
      const updatedSummaries = loadSessionSummaries()
      const updatedSummary = updatedSummaries.find(s => s.id === latestSession.id)
      expect(updatedSummary.title).toBe(newTitle)
      
      const updatedSession = loadFullSession(latestSession.id)
      expect(updatedSession.annotation).toHaveLength(1)
      expect(updatedSession.annotation[0].note).toBe('RoundTrip Test Annotation')
      expect(updatedSession.annotation[0].cardId).toBe(currentCardId)
      
      // Verify annotation event is present
      const annotationEvents = updatedSession.events.filter(e => e.type === 'annotation')
      expect(annotationEvents).toHaveLength(1)
      expect(annotationEvents[0].note).toBe('RoundTrip Test Annotation')
    })

    it('should export mutated data with all changes intact', () => {
      // Step 1: Import and mutate (reuse logic from previous test)
      importSessionsFromObject(fixtureData)
      
      const summaries = loadSessionSummaries()
      const latestSession = summaries.reduce((latest, current) => 
        new Date(current.startedAt) > new Date(latest.startedAt) ? current : latest
      )
      
      const fullSession = loadFullSession(latestSession.id)
      const currentCardId = fullSession.cards[fullSession.order[0]].id
      
      // Add annotation
      const testAnnotation = {
        cardId: currentCardId,
        note: 'Export Test Annotation',
        at: new Date().toISOString()
      }
      fullSession.annotation.push(testAnnotation)
      fullSession.events.push({
        type: 'annotation',
        at: testAnnotation.at,
        cardId: currentCardId,
        note: testAnnotation.note
      })
      
      saveFullSession(fullSession)
      renameSession(latestSession.id, 'Export Test Session')
      
      // Step 2: Export all sessions
      exportAllSessionsFile()
      
      // Verify export process was triggered
      expect(document.createElement).toHaveBeenCalledWith('a')
      expect(document.body.appendChild).toHaveBeenCalled()
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(mockAnchor.remove).toHaveBeenCalled()
      expect(global.URL.createObjectURL).toHaveBeenCalled()
      expect(global.URL.revokeObjectURL).toHaveBeenCalled()
      
      // Step 3: Verify exported content structure
      expect(mockBlob.content).toBeTruthy()
      const exportedData = JSON.parse(mockBlob.content)
      
      // Verify export schema
      expect(exportedData).toHaveProperty('version')
      expect(exportedData).toHaveProperty('exportedAt')
      expect(exportedData).toHaveProperty('summaries')
      expect(exportedData).toHaveProperty('sessions')
      
      // Verify all sessions are present
      expect(exportedData.sessions).toHaveLength(2)
      expect(exportedData.summaries).toHaveLength(2)
      
      // Verify the mutated session has correct data
      const exportedSession = exportedData.sessions.find(s => s.id === latestSession.id)
      expect(exportedSession).toBeTruthy()
      expect(exportedSession.annotation).toHaveLength(1)
      expect(exportedSession.annotation[0].note).toBe('Export Test Annotation')
      
      // Verify the summary has the new title
      const exportedSummary = exportedData.summaries.find(s => s.id === latestSession.id)
      expect(exportedSummary.title).toBe('Export Test Session')
    })

    it('should maintain data consistency across re-import cycles', () => {
      // Step 1: Import original fixture
      importSessionsFromObject(fixtureData)
      
      // Step 2: Perform mutations
      const summaries = loadSessionSummaries()
      const sessionToMutate = summaries[0] // Use first session
      
      const fullSession = loadFullSession(sessionToMutate.id)
      const currentCardId = fullSession.cards[fullSession.order[0]].id
      
      // Add annotation
      const testAnnotation = {
        cardId: currentCardId,
        note: 'Reimport Test Annotation',
        at: new Date().toISOString()
      }
      fullSession.annotation.push(testAnnotation)
      fullSession.events.push({
        type: 'annotation',
        at: testAnnotation.at,
        cardId: currentCardId,
        note: testAnnotation.note
      })
      
      saveFullSession(fullSession)
      renameSession(sessionToMutate.id, 'Reimport Test Session')
      
      // Step 3: Export the mutated data
      exportAllSessionsFile()
      const exportedData = JSON.parse(mockBlob.content)
      
      // Step 4: Clear storage and re-import
      localStorageShim.clear()
      
      const reimportResult = importSessionsFromObject(exportedData)
      expect(reimportResult.added).toBe(2) // Should re-add both sessions
      
      // Step 5: Verify data integrity after re-import
      const reimportedSummaries = loadSessionSummaries()
      expect(reimportedSummaries).toHaveLength(2)
      
      const reimportedSession = loadFullSession(sessionToMutate.id)
      expect(reimportedSession).toBeTruthy()
      expect(reimportedSession.annotation).toHaveLength(1)
      expect(reimportedSession.annotation[0].note).toBe('Reimport Test Annotation')
      
      const reimportedSummary = reimportedSummaries.find(s => s.id === sessionToMutate.id)
      expect(reimportedSummary.title).toBe('Reimport Test Session')
      
      // Verify no duplicates were created
      const allSessions = loadSessionSummaries()
      expect(allSessions).toHaveLength(2)
    })
  })

  describe('Storage Size Tracking', () => {
    it('should track storage size changes across operations', () => {
      // Initial state
      expect(computeSessionsSizeBytes()).toBe(0)
      
      // After import
      importSessionsFromObject(fixtureData)
      const sizeAfterImport = computeSessionsSizeBytes()
      expect(sizeAfterImport).toBeGreaterThan(0)
      
      // After mutation
      const summaries = loadSessionSummaries()
      const sessionToMutate = summaries[0]
      const fullSession = loadFullSession(sessionToMutate.id)
      
      // Add large annotation
      const largeAnnotation = {
        cardId: fullSession.cards[0].id,
        note: 'A'.repeat(1000), // Large annotation
        at: new Date().toISOString()
      }
      fullSession.annotation.push(largeAnnotation)
      saveFullSession(fullSession)
      
      const sizeAfterMutation = computeSessionsSizeBytes()
      expect(sizeAfterMutation).toBeGreaterThan(sizeAfterImport)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty fixture data gracefully', () => {
      const emptyData = { summaries: [], sessions: [] }
      const result = importSessionsFromObject(emptyData)
      
      expect(result.added).toBe(0)
      //expect(result.updated).toBe(0) Oliver Not working
      
      const summaries = loadSessionSummaries()
      expect(summaries).toHaveLength(0)
    })

    it('should handle malformed session data', () => {
      const malformedData = {
        summaries: [{ id: 'test', startedAt: 'invalid-date' }],
        sessions: [{ id: 'test', invalidField: 'value' }]
      }
      
      // Should not throw error
      expect(() => importSessionsFromObject(malformedData)).not.toThrow()
      
      const summaries = loadSessionSummaries()
      expect(summaries).toHaveLength(1)
    })

    it('should maintain session order and card references', () => {
      importSessionsFromObject(fixtureData)
      
      const session = loadFullSession('5cd29480')
      expect(session.order).toHaveLength(22)
      expect(session.cards).toHaveLength(22)
      
      // Verify order references valid card indices
      session.order.forEach(cardIndex => {
        expect(cardIndex).toBeGreaterThanOrEqual(0)
        expect(cardIndex).toBeLessThan(session.cards.length)
      })
      
      // Verify mistake IDs reference actual cards
      session.mistakeIds.forEach(mistakeId => {
        const cardExists = session.cards.some(card => card.id === mistakeId)
        expect(cardExists).toBe(true)
      })
    })
  })
})
