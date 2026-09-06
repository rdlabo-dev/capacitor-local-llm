const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { LocalLLMWeb } = require('./.build/web.js');

const originalModel = globalThis.LanguageModel;
afterEach(() => {
  if (originalModel === undefined) delete globalThis.LanguageModel;
  else globalThis.LanguageModel = originalModel;
});

function fakeModel(overrides = {}) {
  const sessions = [];
  const model = {
    availability: async () => 'available',
    create: async (options) => {
      const session = {
        options,
        destroyed: false,
        prompt: async () => 'Answer',
        promptStreaming: () =>
          new ReadableStream({
            start(controller) {
              for (const chunk of ['Hello', ' ', 'Hello']) controller.enqueue(chunk);
              controller.close();
            },
          }),
        destroy() {
          this.destroyed = true;
        },
      };
      sessions.push(session);
      return session;
    },
    ...overrides,
  };
  globalThis.LanguageModel = model;
  return { model, sessions };
}

const rejectsCode = (promise, code) => assert.rejects(promise, { code });

test('unsupported browsers and SSR can inspect availability', async () => {
  delete globalThis.LanguageModel;
  const plugin = new LocalLLMWeb();
  assert.deepEqual(await plugin.getAvailability(), { status: 'unavailable' });
  assert.deepEqual(await plugin.getImageAnalysisAvailability(), { status: 'unavailable' });
  await rejectsCode(plugin.createChat(), 'LOCAL_LLM_UNSUPPORTED');
  await rejectsCode(plugin.download(), 'LOCAL_LLM_UNSUPPORTED');
});

test('availability mapping, download progress, and listener removal', async () => {
  const { model, sessions } = fakeModel();
  let status = 'downloadable';
  model.availability = async () => status;
  const create = model.create;
  model.create = async (options) => {
    const monitor = new EventTarget();
    options.monitor(monitor);
    for (const loaded of [0, 0.5, 1]) {
      const event = new Event('downloadprogress');
      Object.assign(event, { loaded });
      monitor.dispatchEvent(event);
    }
    status = 'available';
    return create(options);
  };
  const plugin = new LocalLLMWeb();
  const availability = [],
    legacy = [],
    progress = [];
  await plugin.addListener('availabilityChange', (event) => availability.push(event.status));
  await plugin.addListener('systemAvailabilityChange', (event) => legacy.push(event.status));
  const listener = await plugin.addListener('downloadProgress', (event) => progress.push(event.progress));
  assert.deepEqual(await plugin.systemAvailability(), { status: 'downloadable' });
  await plugin.downloadModel();
  assert.deepEqual(availability, ['downloadable', 'downloading', 'available']);
  assert.deepEqual(legacy, ['downloadable', 'notready', 'available']);
  assert.deepEqual(progress, [0, 0.5, 1]);
  assert.ok(sessions.every((session) => session.destroyed));
  await listener.remove();
  await plugin.download();
  assert.equal(progress.length, 3);
});

test('stream chunks are deltas, IDs correlate, and history retains complete turns', async () => {
  const { sessions } = fakeModel();
  const plugin = new LocalLLMWeb();
  const { id } = await plugin.createChat({ instructions: 'Be brief', history: { maxMessages: 2 } });
  const chunks = [],
    states = [];
  await plugin.addListener('textChunk', (event) => chunks.push(event));
  await plugin.addListener('generationStateChange', (event) => states.push(event));
  const result = await plugin.streamText({ chatId: id, prompt: 'First' });
  assert.equal(result.text, 'Hello Hello');
  assert.equal(chunks.map((event) => event.text).join(''), result.text);
  assert.ok(chunks.every((event) => event.chatId === id && event.generationId === result.generationId));
  assert.deepEqual(
    states.map((event) => event.state),
    ['started', 'completed'],
  );
  await plugin.generateText({ chatId: id, prompt: 'Second' });
  await plugin.generateText({ chatId: id, prompt: 'Third' });
  assert.deepEqual(sessions.at(-1).options.initialPrompts, [
    { role: 'system', content: 'Be brief' },
    { role: 'user', content: 'Second' },
    { role: 'assistant', content: 'Answer' },
  ]);
  assert.ok(sessions.every((session) => session.destroyed));
  await plugin.deleteChat({ id });
  await rejectsCode(plugin.generateText({ chatId: id, prompt: 'Gone' }), 'LOCAL_LLM_CHAT_NOT_FOUND');
});

test('character limit discards oversized turns without losing instructions', async () => {
  const { sessions } = fakeModel();
  const plugin = new LocalLLMWeb();
  const { id } = await plugin.createChat({ instructions: 'Keep', history: { maxCharacters: 3 } });
  await plugin.generateText({ chatId: id, prompt: 'Long' });
  await plugin.generateText({ chatId: id, prompt: 'Next' });
  assert.deepEqual(sessions.at(-1).options.initialPrompts, [{ role: 'system', content: 'Keep' }]);
});

test('cancelling from started prevents model work and emits exactly one terminal event', async () => {
  const { sessions } = fakeModel();
  const plugin = new LocalLLMWeb();
  const { id } = await plugin.createChat();
  const states = [];
  await plugin.addListener('generationStateChange', (event) => {
    states.push(event);
    if (event.state === 'started') void plugin.cancelGeneration(event);
  });
  await rejectsCode(plugin.streamText({ chatId: id, prompt: 'Hello' }), 'LOCAL_LLM_GENERATION_CANCELLED');
  assert.equal(sessions.length, 1);
  assert.deepEqual(
    states.map((event) => event.state),
    ['started', 'cancelled'],
  );
  assert.equal(states[1].errorCode, 'LOCAL_LLM_GENERATION_CANCELLED');
});

test('busy guard, generation mismatch, deletion during session creation, and late cleanup', async () => {
  const { model, sessions } = fakeModel();
  const plugin = new LocalLLMWeb();
  const { id } = await plugin.createChat();
  const create = model.create;
  let release, entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  model.create = async (options) => {
    entered();
    await new Promise((resolve) => {
      release = resolve;
    });
    return create(options);
  };
  const pending = plugin.generateText({ chatId: id, prompt: 'Wait' });
  await ready;
  await rejectsCode(plugin.generateText({ chatId: id, prompt: 'Overlap' }), 'LOCAL_LLM_CHAT_BUSY');
  await rejectsCode(plugin.cancelGeneration({ chatId: id, generationId: 'wrong' }), 'LOCAL_LLM_GENERATION_NOT_FOUND');
  await plugin.deleteChat({ id });
  release();
  await rejectsCode(pending, 'LOCAL_LLM_GENERATION_CANCELLED');
  assert.ok(sessions.every((session) => session.destroyed));
});

test('stream cancellation preserves partial UI output but does not retain a failed turn', async () => {
  const { sessions } = fakeModel();
  const plugin = new LocalLLMWeb();
  const { id } = await plugin.createChat();
  const listener = await plugin.addListener('textChunk', (event) => {
    void plugin.cancelGeneration(event);
  });
  await rejectsCode(plugin.streamText({ chatId: id, prompt: 'Discard' }), 'LOCAL_LLM_GENERATION_CANCELLED');
  await listener.remove();
  await plugin.generateText({ chatId: id, prompt: 'Retry' });
  assert.deepEqual(sessions.at(-1).options.initialPrompts, []);
});

test('browser errors map to stable codes and chats can retry', async () => {
  const { model } = fakeModel();
  const plugin = new LocalLLMWeb();
  const { id } = await plugin.createChat();
  const states = [];
  await plugin.addListener('generationStateChange', (event) => states.push(event.state));
  const create = model.create;
  model.create = async () => {
    throw new DOMException('too large', 'QuotaExceededError');
  };
  await rejectsCode(plugin.generateText({ chatId: id, prompt: 'Hello' }), 'LOCAL_LLM_CONTEXT_WINDOW_EXCEEDED');
  model.create = create;
  await plugin.generateText({ chatId: id, prompt: 'Retry' });
  assert.deepEqual(states, ['started', 'failed', 'started', 'completed']);
});

test('invalid options and platform-exclusive features reject explicitly', async () => {
  fakeModel();
  const plugin = new LocalLLMWeb();
  const { id } = await plugin.createChat();
  for (const history of [{ maxMessages: 1 }, { maxMessages: NaN }, { maxCharacters: 0 }]) {
    await rejectsCode(plugin.createChat({ history }), 'LOCAL_LLM_INVALID_OPTIONS');
  }
  for (const options of [{ temperature: 0.2 }, { topK: 4 }, { maxOutputTokens: 256 }]) {
    await rejectsCode(plugin.generateText({ chatId: id, prompt: 'Hello', options }), 'LOCAL_LLM_INVALID_OPTIONS');
  }
  await rejectsCode(plugin.generateText({ chatId: id, prompt: ' ' }), 'LOCAL_LLM_INVALID_OPTIONS');
  await rejectsCode(
    plugin.generateText({ chatId: id, prompt: 'Image', images: [{ base64: 'abc' }] }),
    'LOCAL_LLM_UNSUPPORTED',
  );
  await rejectsCode(plugin.generateImage(), 'LOCAL_LLM_UNSUPPORTED');
  await rejectsCode(plugin.configureFallbackModel(), 'LOCAL_LLM_UNSUPPORTED');
  await rejectsCode(plugin.cancelGeneration({ chatId: id }), 'LOCAL_LLM_GENERATION_NOT_FOUND');
});

test('legacy sessions retain history, one-shot calls do not, and warmup releases resources', async () => {
  const { sessions } = fakeModel();
  const plugin = new LocalLLMWeb();
  await plugin.prompt({ sessionId: 'legacy', instructions: 'Keep', prompt: 'One' });
  await plugin.prompt({ sessionId: 'legacy', instructions: 'Ignored', prompt: 'Two' });
  assert.equal(sessions.at(-1).options.initialPrompts.length, 3);
  assert.equal(sessions.at(-1).options.initialPrompts[0].content, 'Keep');
  await plugin.warmup({ sessionId: 'legacy' });
  await plugin.endSession({ sessionId: 'legacy' });
  await plugin.endSession({ sessionId: 'legacy' });
  await plugin.prompt({ prompt: 'Isolated' });
  await plugin.prompt({ prompt: 'Isolated again' });
  assert.deepEqual(sessions.at(-1).options.initialPrompts, []);
  await plugin.warmup();
  assert.ok(sessions.every((session) => session.destroyed));
});

test('ready-model progress does not falsely announce a new download', async () => {
  const { model } = fakeModel();
  const create = model.create;
  model.create = async (options) => {
    const monitor = new EventTarget();
    options.monitor(monitor);
    const event = new Event('downloadprogress');
    Object.assign(event, { loaded: 1 });
    monitor.dispatchEvent(event);
    return create(options);
  };
  const plugin = new LocalLLMWeb();
  const states = [];
  await plugin.addListener('availabilityChange', (event) => states.push(event.status));
  await plugin.createChat();
  assert.deepEqual(states, ['available']);
});

test('legacy prompts report unsupported before accessing secure-context crypto', async () => {
  delete globalThis.LanguageModel;
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
  try {
    const plugin = new LocalLLMWeb();
    await rejectsCode(plugin.prompt({ prompt: 'Hi' }), 'LOCAL_LLM_UNSUPPORTED');
    await rejectsCode(plugin.prompt({ sessionId: 'legacy', prompt: 'Hi' }), 'LOCAL_LLM_UNSUPPORTED');
  } finally {
    Object.defineProperty(globalThis, 'crypto', originalCrypto);
  }
});

test('throwing observers cannot corrupt generation, skip other observers, or leak sessions', async (t) => {
  const { sessions } = fakeModel();
  const plugin = new LocalLLMWeb();
  const errors = t.mock.method(console, 'error', () => {});
  for (const name of ['availabilityChange', 'downloadProgress', 'textChunk', 'generationStateChange']) {
    await plugin.addListener(name, () => {
      throw new Error('Consumer callback failed');
    });
  }
  await plugin.addListener('generationStateChange', async () => {
    throw new Error('Async consumer failed');
  });
  const states = [],
    chunks = [];
  await plugin.addListener('generationStateChange', (event) => states.push(event.state));
  await plugin.addListener('textChunk', (event) => chunks.push(event.text));
  const { id } = await plugin.createChat();
  assert.equal((await plugin.streamText({ chatId: id, prompt: 'Hello' })).text, 'Hello Hello');
  assert.deepEqual(states, ['started', 'completed']);
  assert.equal(chunks.join(''), 'Hello Hello');
  assert.ok(sessions.every((session) => session.destroyed));
  assert.ok(errors.mock.callCount() >= 5);
  await plugin.generateText({ chatId: id, prompt: 'Next' });
  assert.deepEqual(states, ['started', 'completed', 'started', 'completed']);
  await plugin.deleteChat({ id });
});

test('legacy cleanup is idempotent without creating a model session or retaining old history', async () => {
  const { sessions } = fakeModel();
  const plugin = new LocalLLMWeb();
  await plugin.endSession({ sessionId: 'never-created' });
  assert.equal(sessions.length, 0);
  await plugin.prompt({ sessionId: 'legacy', instructions: 'Old instructions', prompt: 'Old turn' });
  await Promise.all([plugin.endSession({ sessionId: 'legacy' }), plugin.endSession({ sessionId: 'legacy' })]);
  await plugin.endSession({ sessionId: 'legacy' });
  assert.equal(sessions.length, 1);
  await plugin.prompt({ sessionId: 'legacy', prompt: 'Fresh turn' });
  assert.deepEqual(sessions.at(-1).options.initialPrompts, []);
  await plugin.endSession({ sessionId: 'legacy' });
  assert.ok(sessions.every((session) => session.destroyed));
});
