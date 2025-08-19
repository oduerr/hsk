/**
 * Lightweight tests for action functions
 * Tests state deltas and ensures actions work correctly
 */

// Mock state for testing
function createMockState() {
  return {
    deck: [
      { id: 'card1', hanzi: '你好', pinyin: 'nǐ hǎo', english: 'Hello' },
      { id: 'card2', hanzi: '谢谢', pinyin: 'xiè xie', english: 'Thank you' },
      { id: 'card3', hanzi: '再见', pinyin: 'zài jiàn', english: 'Goodbye' }
    ],
    order: [0, 1, 2],
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
  };
}

// Test reveal action
async function testReveal() {
  console.log('Testing reveal action...');
  const mockState = createMockState();
  
  // Mock the state object
  const originalState = global.state;
  global.state = mockState;
  
  try {
    // Import and test reveal
    const { reveal } = await import('./state.js');
    
    // Test initial state
    if (mockState.face !== 'front') {
      throw new Error('Initial face should be front');
    }
    
    // Test reveal action
    reveal();
    
    // Check state delta
    if (mockState.face !== 'back') {
      throw new Error('Face should be back after reveal');
    }
    
    // Check event logging
    const revealEvent = mockState.session.events.find(e => e.type === 'reveal');
    if (!revealEvent) {
      throw new Error('Reveal event should be logged');
    }
    
    console.log('✅ reveal action test passed');
  } catch (error) {
    console.error('❌ reveal action test failed:', error.message);
  } finally {
    global.state = originalState;
  }
}

// Test markMistake action
async function testMarkMistake() {
  console.log('Testing markMistake action...');
  const mockState = createMockState();
  
  const originalState = global.state;
  global.state = mockState;
  
  try {
    const { markMistake } = await import('./state.js');
    
    // Test initial state
    if (mockState.mistakes.size !== 0) {
      throw new Error('Initial mistakes should be empty');
    }
    
    // Test markMistake action
    markMistake();
    
    // Check state delta
    if (!mockState.mistakes.has('card1')) {
      throw new Error('Current card should be marked as mistake');
    }
    
    // Check event logging
    const mistakeEvent = mockState.session.events.find(e => e.type === 'mistake');
    if (!mistakeEvent || mistakeEvent.cardId !== 'card1') {
      throw new Error('Mistake event should be logged with correct card ID');
    }
    
    console.log('✅ markMistake action test passed');
  } catch (error) {
    console.error('❌ markMistake action test failed:', error.message);
  } finally {
    global.state = originalState;
  }
}

// Test nextCard action
async function testNextCard() {
  console.log('Testing nextCard action...');
  const mockState = createMockState();
  
  const originalState = global.state;
  global.state = mockState;
  
  try {
    const { nextCard } = await import('./state.js');
    
    // Test initial state
    if (mockState.index !== 0) {
      throw new Error('Initial index should be 0');
    }
    if (mockState.face !== 'front') {
      throw new Error('Initial face should be front');
    }
    
    // Test nextCard action
    nextCard();
    
    // Check state delta
    if (mockState.index !== 1) {
      throw new Error('Index should increment to 1');
    }
    if (mockState.face !== 'front') {
      throw new Error('Face should reset to front');
    }
    
    // Check event logging
    const nextEvent = mockState.session.events.find(e => e.type === 'next');
    if (!nextEvent) {
      throw new Error('Next event should be logged');
    }
    
    console.log('✅ nextCard action test passed');
  } catch (error) {
    console.error('❌ nextCard action test failed:', error.message);
  } finally {
    global.state = originalState;
  }
}

// Test markAnnotation action
async function testMarkAnnotation() {
  console.log('Testing markAnnotation action...');
  const mockState = createMockState();
  
  const originalState = global.state;
  global.state = mockState;
  
  try {
    const { markAnnotation } = await import('./state.js');
    
    // Test initial state
    if (mockState.session.annotation.length !== 0) {
      throw new Error('Initial annotations should be empty');
    }
    
    // Test markAnnotation action
    const testNote = 'This is a test note';
    markAnnotation(testNote);
    
    // Check state delta
    if (mockState.session.annotation.length !== 1) {
      throw new Error('Annotation should be added');
    }
    
    const annotation = mockState.session.annotation[0];
    if (annotation.cardId !== 'card1' || annotation.note !== testNote) {
      throw new Error('Annotation should have correct card ID and note');
    }
    
    // Check event logging
    const annotationEvent = mockState.session.events.find(e => e.type === 'annotation');
    if (!annotationEvent || annotationEvent.cardId !== 'card1' || annotationEvent.note !== testNote) {
      throw new Error('Annotation event should be logged with correct data');
    }
    
    console.log('✅ markAnnotation action test passed');
  } catch (error) {
    console.error('❌ markAnnotation action test failed:', error.message);
  } finally {
    global.state = originalState;
  }
}

// Run all tests
async function runAllTests() {
  console.log('🧪 Running action function tests...\n');
  
  await testReveal();
  await testMarkMistake();
  await testNextCard();
  await testMarkAnnotation();
  
  console.log('\n🎯 Action function tests completed!');
}

// Export for use in other test runners
export { runAllTests, createMockState };

// Run tests if this file is executed directly
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  // Node.js environment
  runAllTests().catch(console.error);
}
