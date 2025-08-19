# CHANGELOG

## 5.11 - Refactor: Extract and Document Effects ✅ COMPLETED
Extracted all I/O operations and side effects into canonical effect functions, ensuring consistent and maintainable external interactions.

**Implementation Details:**
- **New Effect Functions**: Added TTS settings, voice preferences, version loading, and session size computation effects
- **Consolidated localStorage Access**: Moved all direct localStorage operations from main.js into storage.js effect functions
- **Comprehensive Documentation**: Created EFFECTS.md cataloging all effect functions with consistent schema
- **Eliminated Duplicates**: Removed duplicate computeSessionsSizeBytes function and consolidated TTS settings handling
- **Single Source of Truth**: Each effect now has only one canonical implementation

**New Effects Added:**
- `loadTtsSettings()` - Load TTS settings from localStorage
- `saveTtsSettings(settings)` - Save TTS settings to localStorage
- `loadTtsVoice()` - Load saved TTS voice preference
- `saveTtsVoice(voice)` - Save TTS voice preference
- `computeSessionsSizeBytes()` - Calculate total session data size
- `loadVersionFile()` - Load application version from file

**Refactored Modules:**
- `js/storage.js` - Added new effect functions for TTS and version handling
- `js/main.js` - Updated to use effect functions instead of direct localStorage access
- `EFFECTS.md` - Comprehensive documentation of all effects with consistent schema
- `CHANGELOG.md` - Added 5.11 documentation

**Benefits:**
- **Consistency**: All I/O operations go through named effect functions
- **Maintainability**: Effects are centralized and easier to modify
- **Error Handling**: Centralized error handling for all external operations
- **Testing**: Effects can be tested independently with proper mocking
- **Documentation**: Clear catalog of all side effects and their purposes

**Effect Categories Documented:**
- **Storage Effects**: localStorage operations for sessions, settings, and data
- **File I/O Effects**: CSV loading, file discovery, and version loading
- **Audio Effects**: Speech synthesis, TTS settings, and voice management
- **UI Effects**: DOM manipulation, rendering, and user feedback
- **Utility Effects**: Pure functions for data processing

**Files Modified:**
- `js/storage.js` - Added new effect functions
- `js/main.js` - Updated to use effect functions
- `EFFECTS.md` - Complete effects documentation
- `CHANGELOG.md` - Added 5.11 documentation

This refactoring ensures all external interactions are properly documented and centralized, making the codebase more maintainable and consistent.

## 5.10 - Refactor: Funnel All Core State Changes Through Actions ✅ COMPLETED
Refactored the application to ensure all core state changes happen through explicit action functions, improving maintainability, consistency, and debuggability.

**Implementation Details:**
- **New Action Functions**: Added `updateSessionMetadata()`, `setLevelLabel()`, and `removeAnnotation()` actions
- **Refactored Modules**: Updated `vocabularyManager.js` and `main.js` to use actions instead of direct state mutation
- **Comprehensive Documentation**: Created `STATE.md`, `ACTIONS.md`, and `CHANGELOG.md`
- **Test Suite**: Added lightweight tests for action functions using MockStates
- **State Mutation Rules**: Established clear rules for core vs UI-local state management

**Benefits:**
- **Consistency**: All state changes follow the same pattern through named actions
- **Maintainability**: State logic is centralized in action functions
- **Debuggability**: Actions provide clear entry points for state changes
- **Replay**: Event logging enables session replay and analysis
- **Testing**: Actions can be tested independently with mock state
- **Future-Proof**: Establishes foundation for advanced state management features

**New Actions Added:**
- `updateSessionMetadata(name, id)` - Update session name and/or ID
- `setLevelLabel(label)` - Update vocabulary level label
- `removeAnnotation(cardId)` - Remove annotation from specific card

**Files Modified:**
- `js/state.js` - Added new action functions
- `js/vocabularyManager.js` - Updated to use actions
- `js/main.js` - Updated to use actions
- `STATE.md` - Comprehensive state documentation
- `ACTIONS.md` - Complete action documentation
- `js/actions.test.js` - Test suite for actions
- `CHANGELOG.md` - Detailed change documentation

**State Mutation Rules:**
1. Core state must only be modified through action functions
2. UI-local state may be modified directly
3. All state changes should be logged via events when appropriate
4. State mutations should be atomic and consistent
5. External modules should only read state, never write to it directly

This refactoring establishes a solid foundation for future state management improvements while maintaining all existing functionality.
