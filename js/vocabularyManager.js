/**
 * Vocabulary Manager - Centralized component for vocabulary list reading and session management
 * Extracts functionality from main.js for reusability
 */

import { fetchCsvText, parseCsv, rowsToCards, discoverAvailableCsvFiles } from './data.js';
import { state, newRun, updateSessionMetadata, setLevelLabel } from './state.js';
import { saveDeck, saveLastLevel } from './storage.js';

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
   * Discover available vocabulary files from directory
   * @returns {Promise<Array<{filename: string, displayName: string, description: string, path: string}>>} Array of discovered files
   */
  async discoverAvailableCsvFiles() {
    try {
      const files = await discoverAvailableCsvFiles();
      this.onLevelsDiscovered(files);
      return files;
    } catch (error) {
      this.onError('Failed to discover vocabulary files', error);
      return [];
    }
  }

  /**
   * Load vocabulary from specified files
   * @param {string[]} filenames - Array of CSV filenames to load
   * @returns {Promise<Object>} Loaded vocabulary data
   */
  async loadLevels(filenames) {
    try {
      // Get discovered files to access locale information
      const discoveredFiles = await discoverAvailableCsvFiles();
      const fileMap = new Map(discoveredFiles.map(f => [f.filename, f]));
      
      // Fetch CSV texts from all specified files
      const texts = await Promise.all(
        filenames.map(filename => fetchCsvText(`./data/${filename}`).catch(() => ''))
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
        throw new Error('No vocabulary cards found in selected files');
      }

      // Determine locale from the files
      let locale = 'zh-CN'; // Default
      if (filenames.length === 1) {
        const discoveredFile = fileMap.get(filenames[0]);
        if (discoveredFile && discoveredFile.locale) {
          locale = discoveredFile.locale;
        }
      } else {
        // For multiple files, use the first non-default locale or default to zh-CN
        for (const filename of filenames) {
          const discoveredFile = fileMap.get(filename);
          if (discoveredFile && discoveredFile.locale && discoveredFile.locale !== 'zh-CN') {
            locale = discoveredFile.locale;
            break;
          }
        }
      }

      // Generate level label from filenames
      const levelLabel = filenames.length === 1 
        ? this.getDisplayNameFromFilename(filenames[0])
        : `${filenames.length} Files Combined`;

      const result = {
        cards,
        levelLabel,
        filenames,
        cardCount: cards.length,
        sessionName: this.sessionName || levelLabel,
        sessionId: this.sessionId,
        locale
      };

      this.onLevelsLoaded(result);
      return result;

    } catch (error) {
      this.onError('Failed to load vocabulary files', error);
      throw error;
    }
  }

  /**
   * Get display name from filename
   * @param {string} filename - CSV filename
   * @returns {string} Display name
   */
  getDisplayNameFromFilename(filename) {
    const name = filename.replace(/\.csv$/i, '');
    
    if (name.match(/^hsk\d+$/i)) {
      const level = name.match(/\d+/)[0];
      if (level === '0') return 'HSK 0 (Test)';
      if (level === '7') return 'HSK 7 (English)';
      return `HSK ${level}`;
    }
    
    return name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]/g, ' ');
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
      
      // Update state with session info using actions
      setLevelLabel(vocabularyData.levelLabel);
      updateSessionMetadata(vocabularyData.sessionName, vocabularyData.sessionId);
      
      // Set session locale if available
      if (vocabularyData.locale) {
        const { setSessionLocale } = await import('./state.js');
        setSessionLocale(vocabularyData.locale);
      }
      
      // Save last level preference
      const levelKey = vocabularyData.filenames.length === 1 
        ? vocabularyData.filenames[0].replace(/\.csv$/i, '') 
        : 'custom';
      saveLastLevel(levelKey);

      const sessionInfo = {
        sessionId: vocabularyData.sessionId,
        sessionName: vocabularyData.sessionName,
        levelLabel: vocabularyData.levelLabel,
        cardCount: vocabularyData.cardCount,
        filenames: vocabularyData.filenames,
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
   * @param {string[]} filenames - Files to load (if not specified, will discover)
   * @returns {Promise<Object>} Complete session information
   */
  async discoverLoadAndStart(filenames = null) {
    try {
      // Discover files if not specified
      if (!filenames) {
        const availableFiles = await this.discoverAvailableCsvFiles();
        if (availableFiles.length === 0) {
          throw new Error('No vocabulary files found');
        }
        // Default to first available file
        filenames = [availableFiles[0].filename];
      }

      // Load vocabulary from files
      const vocabularyData = await this.loadLevels(filenames);
      
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
        filenames: ['custom'],
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
      updateSessionMetadata(name, undefined);
    }
  }

  /**
   * Update session ID
   * @param {string} id - New session ID
   */
  updateSessionId(id) {
    this.sessionId = id;
    if (state.session.id === this.sessionId) {
      updateSessionMetadata(undefined, id);
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
