# HSK Flashcard Application - JSON Data Format Specification

## Overview

This document describes the JSON format used for exporting and importing session data in the HSK Flashcard Application. The format is designed to be portable, versioned, and backward-compatible.

## File Naming Convention

Export files follow the pattern: `flash_sessions_YYYYMMDD.json`

Example: `flash_sessions_20241215.json`

## Root Structure

```json
{
  "version": 1,
  "exportedAt": "2024-12-15T10:30:00.000Z",
  "summaries": [...],
  "sessions": [...]
}
```

### Root Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `version` | number | Yes | Format version (currently 1) |
| `exportedAt` | string | Yes | ISO 8601 timestamp of export |
| `summaries` | array | Yes | Array of session summaries |
| `sessions` | array | Yes | Array of full session data |

## Session Summary Structure

Session summaries provide lightweight metadata for quick browsing and selection.

```json
{
  "id": "abc123def456",
  "startedAt": "2024-12-15T09:00:00.000Z",
  "finishedAt": "2024-12-15T09:45:00.000Z",
  "mistakeIds": ["card1", "card2", "card3"],
  "counts": {
    "total": 50,
    "mistakes": 3
  },
  "inProgress": false,
  "title": "HSK5 Practice Session 1"
}
```

### Summary Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique session identifier (FNV-1a hash) |
| `startedAt` | string | Yes | ISO 8601 timestamp when session started |
| `finishedAt` | string | No | ISO 8601 timestamp when session completed (null if in progress) |
| `mistakeIds` | array | Yes | Array of card IDs marked as mistakes |
| `counts` | object | Yes | Session statistics |
| `counts.total` | number | Yes | Total number of cards in session |
| `counts.mistakes` | number | Yes | Number of mistakes made |
| `counts.removed` | number | Yes | Number of cards removed during session |
| `inProgress` | boolean | Yes | Whether session is still active |
| `name` | string | No | User-defined session name (optional) |
| `lastPlayedAt` | string | Yes | ISO 8601 timestamp of last user action |
| `locale` | string | Yes | BCP-47 locale identifier (e.g., zh-CN, de-DE) |
| `annotationCount` | number | Yes | Number of annotations made during session |

## Full Session Structure

Full sessions contain complete event logs and card data for detailed analysis and replay.

```json
{
  "id": "abc123def456",
  "startedAt": "2024-12-15T09:00:00.000Z",
  "finishedAt": "2024-12-15T09:45:00.000Z",
  "cards": [...],
  "order": [0, 1, 2, 3, ...],
  "mistakeIds": ["card1", "card2", "card3"],
  "events": [...],
  "annotation": [...],
  "replayOf": null,
  "counts": {
    "total": 50,
    "mistakes": 3,
    "removed": 0
  }
}
```

### Full Session Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique session identifier |
| `startedAt` | string | Yes | ISO 8601 timestamp when session started |
| `finishedAt` | string | No | ISO 8601 timestamp when session completed |
| `cards` | array | Yes | Array of card objects |
| `order` | array | Yes | Shuffled indices defining card sequence |
| `mistakeIds` | array | Yes | Array of card IDs marked as mistakes |
| `events` | array | Yes | Chronological log of user actions |
| `annotation` | array | Yes | User notes and annotations |
| `replayOf` | string | No | ID of session being replayed (if applicable) |
| `name` | string | No | User-defined session name (optional) |
| `lastPlayedAt` | string | Yes | ISO 8601 timestamp of last user action |
| `locale` | string | Yes | BCP-47 locale identifier (e.g., zh-CN, de-DE) |
| `counts` | object | Yes | Session statistics |
| `counts.total` | number | Yes | Total number of cards in session |
| `counts.mistakes` | number | Yes | Number of mistakes made |
| `counts.removed` | number | Yes | Number of cards removed during session |

## Card Structure

Cards represent individual vocabulary items with Chinese characters, pinyin, and English definitions.

```json
{
  "id": "card1",
  "hanzi": "爱护",
  "pinyin": "ài hù",
  "english": "to cherish"
}
```

### Card Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique card identifier (FNV-1a hash) |
| `hanzi` | string | Yes | Chinese characters |
| `pinyin` | string | Yes | Pinyin with tone marks |
| `english` | string | Yes | English definition/translation |

## Event Structure

Events log user interactions during a session for analysis and replay.

```json
{
  "type": "mistake",
  "at": "2024-12-15T09:15:30.000Z",
  "index": 12,
  "cardId": "card1",
  "note": "Optional additional information"
}
```

### Event Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | Event type (see Event Types below) |
| `at` | string | Yes | ISO 8601 timestamp of event |
| `index` | number | Yes | Position in card sequence (0-based) |
| `cardId` | string | No | Associated card ID (if applicable) |
| `note` | string | No | Additional event information |

### Event Types

| Type | Description | Card ID Required |
|------|-------------|------------------|
| `start` | Session started | No |
| `reveal` | Card revealed | No |
| `unreveal` | Card hidden | No |
| `next` | Moved to next card | No |
| `back` | Moved to previous card | No |
| `mistake` | Card marked as mistake | Yes |
| `unmistake` | Mistake mark removed | Yes |
| `annotation` | Note added to card | Yes |
| `remove` | Card removed from session | Yes |
| `finish` | Session completed | No |

## Annotation Structure

Annotations allow users to add personal notes to specific cards.

```json
{
  "cardId": "card1",
  "at": "2024-12-15T09:20:00.000Z",
  "note": "Remember: this means 'to cherish' not 'to love'"
}
```

### Annotation Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `cardId` | string | Yes | ID of annotated card |
| `at` | string | Yes | ISO 8601 timestamp of annotation |
| `note` | string | Yes | User's note text |

## Import Compatibility

The application supports multiple JSON formats for backward compatibility:

### Standard Format (Recommended)
```json
{
  "version": 1,
  "exportedAt": "...",
  "summaries": [...],
  "sessions": [...]
}
```

### Simplified Format
```json
{
  "summaries": [...],
  "sessions": [...]
}
```

### Legacy Format (Flat Array)
```json
[
  { /* full session object */ },
  { /* full session object */ }
]
```

## Data Validation

### Required Fields
- All session objects must have an `id` field
- All card objects must have `id`, `hanzi`, `pinyin`, and `english` fields
- All event objects must have `type`, `at`, and `index` fields

### Data Types
- `id` fields must be non-empty strings
- Timestamps must be valid ISO 8601 format
- Numeric fields must be valid numbers
- Arrays must contain objects of the expected type

### Constraints
- Session IDs must be unique within a file
- Card IDs must be consistent across sessions
- Event indices must be within the bounds of the session's order array
- Mistake IDs must reference valid card IDs

## Export Process

1. **Session Collection**: Gather all completed and in-progress sessions
2. **Summary Generation**: Create summaries for quick browsing
3. **Data Serialization**: Convert to JSON with proper formatting
4. **File Download**: Generate downloadable file with timestamped name

## Import Process

1. **File Validation**: Check JSON syntax and structure
2. **Data Deduplication**: Merge sessions by ID, avoiding duplicates
3. **Summary Synthesis**: Generate summaries for imported sessions if missing
4. **Storage Integration**: Save to local storage for immediate use

## Use Cases

### Session Backup
- Export before clearing browser data
- Transfer sessions between devices
- Archive completed study sessions

### Data Analysis
- Review learning patterns over time
- Analyze mistake frequency and types
- Track study session duration and progress

### Collaborative Learning
- Share session data with tutors
- Compare performance with study partners
- Import curated vocabulary sets

## Limitations and Considerations

### File Size
- Large session histories may result in large export files
- Consider regular exports to manage storage usage
- Browser storage limits may affect import capacity

### Data Integrity
- Import process validates data but cannot guarantee semantic correctness
- Corrupted JSON files will be rejected with error messages
- Always verify exported data before clearing local storage

### Version Compatibility
- Current version (1) is stable and backward-compatible
- Future versions may add new fields while maintaining compatibility
- Unknown fields are ignored during import

## Example Export File

```json
{
  "version": 1,
  "exportedAt": "2024-12-15T10:30:00.000Z",
  "summaries": [
    {
      "id": "abc123def456",
      "startedAt": "2024-12-15T09:00:00.000Z",
      "finishedAt": "2024-12-15T09:45:00.000Z",
      "mistakeIds": ["card1", "card2"],
      "counts": {
        "total": 25,
        "mistakes": 2,
        "removed": 0
      },
      "inProgress": false,
      "name": "HSK5 Morning Practice",
      "lastPlayedAt": "2024-12-15T09:45:00.000Z",
      "locale": "zh-CN",
      "annotationCount": 1
    }
  ],
  "sessions": [
    {
      "id": "abc123def456",
      "startedAt": "2024-12-15T09:00:00.000Z",
      "finishedAt": "2024-12-15T09:45:00.000Z",
      "cards": [
        {
          "id": "card1",
          "hanzi": "爱护",
          "pinyin": "ài hù",
          "english": "to cherish"
        }
      ],
      "order": [0, 1, 2, 3, 4],
      "mistakeIds": ["card1", "card2"],
      "events": [
        {
          "type": "start",
          "at": "2024-12-15T09:00:00.000Z",
          "index": 0
        },
        {
          "type": "mistake",
          "at": "2024-12-15T09:05:00.000Z",
          "index": 0,
          "cardId": "card1"
        }
      ],
      "annotation": [
        {
          "cardId": "card1",
          "at": "2024-12-15T09:05:00.000Z",
          "note": "Need to practice this one more"
        }
      ],
      "replayOf": null,
      "name": "HSK5 Morning Practice",
      "lastPlayedAt": "2024-12-15T09:45:00.000Z",
      "locale": "zh-CN",
      "counts": {
        "total": 25,
        "mistakes": 2,
        "removed": 0
      }
    }
  ]
}
```

