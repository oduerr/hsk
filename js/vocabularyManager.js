/**
 * Vocabulary Manager - Centralized component for vocabulary list reading and session management
 * Extracts functionality from main.js for reusability
 */

import { fetchCsvText, parseCsv, rowsToCards, discoverAvailableLevels } from './data.js';
import { state, newRun } from './state.js';
import { saveDeck, loadDeck, saveLastLevel, loadLastLevel } from './storage.js';

/**
 * Vocabulary Manager Class
 * Handles vocabulary discovery, loading, and session initialization
 */
export class VocabularyManager {
  constructor(options = {}) {
    this.onLevelsDiscovered = options.onLevelsDiscovered || (() => {});
    this.onLevelsLoaded = options.onLevelsLoaded || (() => {});
    this.onSessionStarted = options.onSessionStarted || (() => {});
    this.onError = options.onError || (() => {});
    
    // Session configuration
    this.sessionName = options.sessionName || '';
    this.sessionId = options.sessionId || this.generateSessionId();
    this.autoStart = options.autoStart !== false;
  }

  /**
   * Generate a unique session ID
   */
  generateSessionId() {
    const timestamp = new Date().toISOString();
    const salt = Math.random().toString(36).slice(2);
    return `session_${timestamp}_${salt}`.replace(/[:.]/g, '_');
  }

  /**
   * Discover available vocabulary levels from directory
   * @returns {Promise<string[]>} Array of available level numbers
   */
  async discoverAvailableLevels() {
    try {
      const levels = await discoverAvailableLevels();
      this.onLevelsDiscovered(levels);
      return levels;
    } catch (error) {
      this.onError('Failed to discover vocabulary levels', error);
      return [];
    }
  }

  /**
   * Load vocabulary from specified levels
   * @param {string[]} levels - Array of level numbers to load
   * @returns {Promise<Object>} Loaded vocabulary data
   */
  async loadLevels(levels) {
    try {
      // Fetch CSV texts from all specified levels
      const texts = await Promise.all(
        levels.map(l => fetchCsvText(`./data/hsk${l}.csv`).catch(() => ''))
      );

      // Parse and merge all CSV data
      const mergedRows = [];
      for (const text of texts) {
        if (!text) continue;
        const rows = parseCsv(text);
        mergedRows.push(...rows);
      }

      // Convert to card objects
      const cards = rowsToCards(mergedRows);
      
      if (cards.length === 0) {
        throw new Error('No vocabulary cards found in selected levels');
      }

      // Generate level label
      const levelLabel = levels.length === 1 
        ? `HSK ${levels[0]}` 
        : `HSK ${levels.join('+')}`;

      const result = {
        cards,
        levelLabel,
        levels,
        cardCount: cards.length,
        sessionName: this.sessionName || levelLabel,
        sessionId: this.sessionId
      };

      this.onLevelsLoaded(result);
      return result;

    } catch (error) {
      this.onError('Failed to load vocabulary levels', error);
      throw error;
    }
  }

  /**
   * Start a new session with loaded vocabulary
   * @param {Object} vocabularyData - Data from loadLevels()
   * @returns {Object} Session information
   */
  async startSession(vocabularyData) {
    try {
      // Save deck to storage
      saveDeck(vocabularyData.cards);
      
      // Initialize new run
      newRun(vocabularyData.cards);
      
      // Update state with session info
      state.levelLabel = vocabularyData.levelLabel;
      state.session.id = vocabularyData.sessionId;
      
      // Save last level preference
      const levelKey = vocabularyData.levels.length === 1 
        ? vocabularyData.levels[0] 
        : 'custom';
      saveLastLevel(levelKey);

      const sessionInfo = {
        sessionId: vocabularyData.sessionId,
        sessionName: vocabularyData.sessionName,
        levelLabel: vocabularyData.levelLabel,
        cardCount: vocabularyData.cardCount,
        levels: vocabularyData.levels,
        startedAt: new Date().toISOString()
      };

      this.onSessionStarted(sessionInfo);
      return sessionInfo;

    } catch (error) {
      this.onError('Failed to start session', error);
      throw error;
    }
  }

  /**
   * Complete workflow: discover, load, and start session
   * @param {string[]} levels - Levels to load (if not specified, will discover)
   * @returns {Promise<Object>} Complete session information
   */
  async discoverLoadAndStart(levels = null) {
    try {
      // Discover levels if not specified
      if (!levels) {
        const availableLevels = await this.discoverAvailableLevels();
        if (availableLevels.length === 0) {
          throw new Error('No vocabulary levels found');
        }
        // Default to first available level
        levels = [availableLevels[0]];
      }

      // Load vocabulary from levels
      const vocabularyData = await this.loadLevels(levels);
      
      // Start session if auto-start is enabled
      if (this.autoStart) {
        const sessionInfo = await this.startSession(vocabularyData);
        return { ...vocabularyData, ...sessionInfo };
      }

      return vocabularyData;

    } catch (error) {
      this.onError('Failed to complete vocabulary workflow', error);
      throw error;
    }
  }

  /**
   * Load vocabulary from custom CSV file
   * @param {File} file - CSV file to load
   * @returns {Promise<Object>} Loaded vocabulary data
   */
  async loadCustomCsv(file) {
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const cards = rowsToCards(rows);
      
      if (cards.length === 0) {
        throw new Error('No valid vocabulary cards found in CSV file');
      }

      const result = {
        cards,
        levelLabel: 'Custom CSV',
        levels: ['custom'],
        cardCount: cards.length,
        sessionName: this.sessionName || `Custom: ${file.name}`,
        sessionId: this.sessionId
      };

      this.onLevelsLoaded(result);
      return result;

    } catch (error) {
      this.onError('Failed to load custom CSV', error);
      throw error;
    }
  }

  /**
   * Get current session information
   * @returns {Object} Current session details
   */
  getCurrentSession() {
    if (!state.deck.length) return null;
    
    return {
      sessionId: state.session.id,
      sessionName: state.session.name || state.levelLabel,
      levelLabel: state.levelLabel,
      cardCount: state.deck.length,
      currentIndex: state.index,
      isFinished: state.index >= state.order.length,
      startedAt: state.session.startedAt,
      finishedAt: state.session.finishedAt
    };
  }

  /**
   * Update session name
   * @param {string} name - New session name
   */
  updateSessionName(name) {
    this.sessionName = name;
    if (state.session.id === this.sessionId) {
      state.session.name = name;
    }
  }

  /**
   * Update session ID
   * @param {string} id - New session ID
   */
  updateSessionId(id) {
    this.sessionId = id;
    if (state.session.id === this.sessionId) {
      state.session.id = id;
    }
  }
}

/**
 * Factory function to create a VocabularyManager instance
 * @param {Object} options - Configuration options
 * @returns {VocabularyManager} New instance
 */
export function createVocabularyManager(options = {}) {
  return new VocabularyManager(options);
}

/**
 * Default export for convenience
 */
export default VocabularyManager;
