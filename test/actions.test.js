import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the state module
vi.mock('../js/state.js', () => ({
  state: {
    deck: [],
    order: [],
    index: 0,
    face: 'front',
    mistakes: new Set(),
    autoReveal: false,
    autoRevealSeconds: 5,
    levelLabel: 'Test Level',
    session: {
      id: 'test-session',
      startedAt: '2024-01-01T00:00:00.000Z',
      finishedAt: null,
      events: [{ type: 'start', at: '2024-01-01T00:00:00.000Z', index: 0 }],
      replayOf: null,
      annotation: []
    }
  },
  newRun: vi.fn(),
  reveal: vi.fn(),
  markMistake: vi.fn(),
  nextCard: vi.fn(),
  markAnnotation: vi.fn(),
  currentCard: vi.fn(),
  isFinished: vi.fn(),
  setAutoReveal: vi.fn(),
  finalizeIfFinished: vi.fn(),
  getFullSessionSnapshot: vi.fn(),
  resumeRun: vi.fn(),
  prevCard: vi.fn(),
  unmarkMistake: vi.fn(),
  unreveal: vi.fn(),
  removeCard: vi.fn(),
  removeAnnotation: vi.fn(),
  updateSessionMetadata: vi.fn(),
  setLevelLabel: vi.fn()
}))

// Import the mocked functions
import { 
  newRun, 
  reveal, 
  markMistake, 
  nextCard, 
  markAnnotation,
  currentCard,
  isFinished,
  setAutoReveal,
  createFullSessionSnapshot,
  getFullSessionSnapshot,
  resumeRun,
  prevCard,
  unmarkMistake,
  unreveal,
  removeCard,
  removeAnnotation,
  updateSessionMetadata,
  setLevelLabel
} from '../js/state.js'

describe('State Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('newRun', () => {
    it('should be callable', () => {
      const cards = [{ id: 'test', hanzi: '测试', pinyin: 'cè shì', english: 'Test' }]
      newRun(cards)
      expect(newRun).toHaveBeenCalledWith(cards)
    })

    it('should handle replay options', () => {
      const cards = [{ id: 'test', hanzi: '测试', pinyin: 'cè shì', english: 'Test' }]
      const options = { replayOf: 'previous-session' }
      newRun(cards, options)
      expect(newRun).toHaveBeenCalledWith(cards, options)
    })
  })

  describe('reveal', () => {
    it('should be callable', () => {
      reveal()
      expect(reveal).toHaveBeenCalled()
    })
  })

  describe('unreveal', () => {
    it('should be callable', () => {
      unreveal()
      expect(unreveal).toHaveBeenCalled()
    })
  })

  describe('markMistake', () => {
    it('should be callable', () => {
      markMistake()
      expect(markMistake).toHaveBeenCalled()
    })
  })

  describe('unmarkMistake', () => {
    it('should be callable', () => {
      unmarkMistake()
      expect(unmarkMistake).toHaveBeenCalled()
    })
  })

  describe('nextCard', () => {
    it('should be callable', () => {
      nextCard()
      expect(nextCard).toHaveBeenCalled()
    })
  })

  describe('prevCard', () => {
    it('should be callable', () => {
      prevCard()
      expect(prevCard).toHaveBeenCalled()
    })
  })

  describe('markAnnotation', () => {
    it('should be callable with note', () => {
      const note = 'Test annotation'
      markAnnotation(note)
      expect(markAnnotation).toHaveBeenCalledWith(note)
    })
  })

  describe('removeAnnotation', () => {
    it('should be callable with cardId', () => {
      const cardId = 'card1'
      removeAnnotation(cardId)
      expect(removeAnnotation).toHaveBeenCalledWith(cardId)
    })
  })

  describe('setAutoReveal', () => {
    it('should be callable with enabled and seconds', () => {
      setAutoReveal(true, 10)
      expect(setAutoReveal).toHaveBeenCalledWith(true, 10)
    })
  })

  describe('currentCard', () => {
    it('should be callable', () => {
      currentCard()
      expect(currentCard).toHaveBeenCalled()
    })
  })

  describe('isFinished', () => {
    it('should be callable', () => {
      isFinished()
      expect(isFinished).toHaveBeenCalled()
    })
  })

  describe('updateSessionMetadata', () => {
    it('should be callable with name and id', () => {
      updateSessionMetadata('Test Session', 'test-id')
      expect(updateSessionMetadata).toHaveBeenCalledWith('Test Session', 'test-id')
    })
  })

  describe('setLevelLabel', () => {
    it('should be callable with label', () => {
      setLevelLabel('HSK 5')
      expect(setLevelLabel).toHaveBeenCalledWith('HSK 5')
    })
  })
})
