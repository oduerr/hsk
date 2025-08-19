# CHANGELOG

## 5.21 - Keyboard Shortcut Input Field Protection ✅ COMPLETED

**Date**: 2025-01-27

**Summary**: Implemented comprehensive input field detection to prevent global keyboard shortcuts from interfering with user typing in input fields, textareas, and content-editable elements.

**Changes Made**:

### Input Field Detection
- **New Function**: Added `isUserTyping(target)` helper function for comprehensive input context detection
- **Input Types Covered**: 
  - Standard HTML inputs (`<input>`, `<textarea>`)
  - Content-editable elements
  - Elements inside content-editable containers
  - Annotation editor components
  - Modal input fields (including rename dialogs)

### Global Shortcut Bypass
- **Smart Detection**: Global keyboard shortcuts are automatically disabled when users are typing
- **Context Awareness**: Shortcuts only activate when no input field is focused
- **User Experience**: Users can type freely without triggering card navigation or other actions

### Technical Implementation
- **Event Handler Update**: Modified `onKeyDown()` function to check input state before processing shortcuts
- **Comprehensive Coverage**: Handles all common input scenarios including nested content-editable elements
- **Performance Optimized**: Lightweight detection with early return for better performance

**Files Modified**:
- `js/main.js` - Added `isUserTyping()` function and updated global keyboard handler

**Benefits**:
- **Uninterrupted Typing**: Users can type numbers, letters, and special characters without interference
- **Better Input Experience**: Rename dialogs, annotation editor, and other inputs work as expected
- **Professional Behavior**: Follows standard web application patterns for keyboard handling
- **Reduced Frustration**: No more accidental card navigation while typing in input fields
- **Improved Accessibility**: Better support for users who rely on keyboard navigation

**Example Scenarios Fixed**:
- **Before**: Typing "123" in rename dialog would trigger card navigation
- **After**: Numbers, letters, and special characters work normally in all input fields
- **Before**: Arrow keys in annotation editor would navigate cards
- **After**: Arrow keys work for text navigation within input fields
- **Before**: Space key in rename dialog would reveal cards
- **After**: Space key works normally for typing spaces

---

## 5.20 - Session Manager UI Enhancements ✅ COMPLETED

**Date**: 2025-01-27

**Summary**: Enhanced the session management interface with improved naming, tooltips, and keyboard event handling.

**Changes Made**:

### UI Improvements
- **Modal Title**: Changed "Replay past session" to "Session Manager" for better clarity
- **Session Display**: Sessions now show meaningful names/titles instead of cryptic IDs
- **Session ID Tooltips**: Session IDs are displayed in tooltips for technical reference
- **Action Button Tooltips**: Added descriptive tooltips for "Replay mistakes" and "Resume checkpoint" buttons

### Keyboard Event Handling
- **Renaming Input**: Fixed keyboard event conflicts during session renaming
- **Event Propagation**: Prevented space key, arrow keys, enter, and escape from interfering with card navigation
- **User Experience**: Users can now type freely in the rename input without triggering card actions

### Technical Details
- **Session Identification**: Primary display shows `session.name` or `session.title`, falling back to "Untitled Session"
- **Tooltip Content**: 
  - "Replay mistakes": "Replay only the cards you marked as mistakes in this session"
  - "Resume checkpoint": "Continue this session from where you left off"
- **Event Handling**: Added `preventDefault()` and `stopPropagation()` for navigation keys during renaming

**Files Modified**:
- `index.html` - Updated modal title from "Replay past session" to "Session Manager"
- `js/main.js` - Enhanced session list rendering with names, tooltips, and improved keyboard handling

**Benefits**:
- **Better Usability**: Users can easily identify sessions by meaningful names
- **Improved Accessibility**: Clear descriptions of what each action button does
- **Enhanced Workflow**: Renaming sessions no longer interferes with card navigation
- **Professional Interface**: More descriptive and user-friendly session management

---

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
