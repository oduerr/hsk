# Testing Guide

This project uses [Vitest](https://vitest.dev/) as the testing framework, providing fast, modern testing with excellent TypeScript support and browser API mocking.

## Quick Start

### Run All Tests
```bash
npm test
```

### Run Tests Once (CI Mode)
```bash
npm run test:run
```

### Run Tests with UI
```bash
npm run test:ui
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Watch Mode
```bash
npm run test:watch
```

## Test Structure

```
test/
├── setup.js           # Global test configuration and mocks
├── actions.test.js    # Tests for state action functions
└── effects.test.js    # Tests for I/O and side effect functions
```

## Test Categories

### 1. Actions Tests (`test/actions.test.js`)
Tests for pure state mutation functions that modify the application state:
- **Session Management**: `newRun`, `resumeRun`
- **Card Navigation**: `nextCard`, `prevCard`, `reveal`, `unreveal`
- **Mistake Management**: `markMistake`, `unmarkMistake`
- **Annotation System**: `markAnnotation`, `removeAnnotation`
- **Configuration**: `setAutoReveal`, `updateSessionMetadata`, `setLevelLabel`

### 2. Effects Tests (`test/effects.test.js`)
Tests for I/O operations and side effects:
- **Storage Effects**: localStorage operations for sessions, settings, and data
- **File I/O Effects**: CSV loading, file discovery, and version loading
- **Audio Effects**: Speech synthesis, TTS settings, and voice management
- **UI Effects**: DOM manipulation, rendering, and user feedback

## Mocking Strategy

### Browser APIs
The test setup mocks common browser APIs to ensure tests run in Node.js:

```javascript
// localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
}

// Web Speech API
Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn().mockReturnValue([])
  }
})

// Audio Context
global.AudioContext = vi.fn().mockImplementation(() => ({
  createOscillator: vi.fn(),
  createGain: vi.fn(),
  destination: {},
  currentTime: 0,
  state: 'running'
}))
```

### DOM Operations
DOM operations are mocked to avoid errors in the Node.js environment:

```javascript
// Mock document.createElement
document.createElement = vi.fn().mockImplementation(tagName => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  hidden: false,
  textContent: '',
  value: '',
  checked: false,
  style: {}
}))

// Mock URL operations
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
global.URL.revokeObjectURL = vi.fn()
```

## Writing Tests

### Test Structure
```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
    vi.clearAllMocks()
  })

  it('should do something specific', () => {
    // Arrange
    const input = 'test data'
    
    // Act
    const result = functionUnderTest(input)
    
    // Assert
    expect(result).toBe('expected output')
  })
})
```

### Testing Actions
Actions are pure functions that modify state. Test them by:
1. Setting up initial state
2. Calling the action
3. Verifying state changes
4. Checking event logging

```javascript
it('should mark current card as mistake', () => {
  // Arrange
  const initialState = { mistakes: new Set(), index: 0 }
  
  // Act
  markMistake()
  
  // Assert
  expect(state.mistakes.has('card1')).toBe(true)
  expect(state.session.events).toContainEqual({
    type: 'mistake',
    cardId: 'card1'
  })
})
```

### Testing Effects
Effects perform I/O operations. Test them by:
1. Mocking external dependencies
2. Calling the effect function
3. Verifying side effects occurred
4. Testing error conditions

```javascript
it('should save session to localStorage', () => {
  // Arrange
  const session = { id: 'test', data: 'test-data' }
  
  // Act
  saveFullSession(session)
  
  // Assert
  expect(localStorageMock.setItem).toHaveBeenCalledWith(
    'hsk.flash.session.test',
    JSON.stringify(session)
  )
})
```

## Test Utilities

### Mock State
Create consistent test data with helper functions:

```javascript
const createMockState = () => ({
  deck: [
    { id: 'card1', hanzi: '你好', pinyin: 'nǐ hǎo', english: 'Hello' }
  ],
  order: [0],
  index: 0,
  face: 'front',
  mistakes: new Set(),
  session: {
    id: 'test-session',
    events: [],
    annotation: []
  }
})
```

### Mock Functions
Use Vitest's mocking utilities:

```javascript
// Mock a function
const mockFunction = vi.fn()

// Mock return values
mockFunction.mockReturnValue('mocked result')

// Mock resolved promises
mockFunction.mockResolvedValue('async result')

// Mock rejected promises
mockFunction.mockRejectedValue(new Error('test error'))

// Verify calls
expect(mockFunction).toHaveBeenCalledWith('expected arg')
expect(mockFunction).toHaveBeenCalledTimes(1)
```

## Coverage

Generate coverage reports to identify untested code:

```bash
npm run test:coverage
```

This will:
- Run all tests
- Generate coverage reports in multiple formats
- Output results to console and HTML files
- Exclude test files and configuration from coverage

## Continuous Integration

The test setup is designed to work in CI environments:

```yaml
# Example GitHub Actions
- name: Run Tests
  run: npm run test:run

- name: Run Tests with Coverage
  run: npm run test:coverage
```

## Troubleshooting

### Common Issues

1. **Mock Not Working**: Ensure mocks are defined before imports
2. **DOM Errors**: Check that DOM operations are properly mocked
3. **Async Issues**: Use `await` for async operations and `vi.waitFor()` for timing-dependent tests
4. **State Pollution**: Use `beforeEach` to reset state between tests

### Debug Mode
Run tests with verbose output:

```bash
npm test -- --reporter=verbose
```

### Isolated Testing
Run specific test files:

```bash
npm test test/actions.test.js
npm test test/effects.test.js
```

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Descriptive Names**: Use clear, descriptive test names
3. **Arrange-Act-Assert**: Structure tests consistently
4. **Mock External Dependencies**: Don't test external libraries
5. **Test Edge Cases**: Include error conditions and boundary cases
6. **Keep Tests Fast**: Avoid unnecessary setup and teardown
7. **Use Meaningful Assertions**: Test behavior, not implementation details

## Future Enhancements

- **Integration Tests**: Test component interactions
- **E2E Tests**: Test complete user workflows
- **Performance Tests**: Measure function performance
- **Visual Regression Tests**: Test UI consistency
- **Accessibility Tests**: Ensure accessibility compliance
