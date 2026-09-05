---
title: Chat
---

# Chat

Chat lifecycle, streaming, cancellation, and warmup. Related guides: [Availability](./availability.md), [Images](./images.md), [Events](./events.md), [Error Handling](./errors.md).

## Chat lifecycle

Create an owned chat, generate text against it, and delete it when finished. Each chat allows one in-flight generation at a time.

```typescript
import { LocalLLM } from '@rdlabo/capacitor-local-llm';

const { status } = await LocalLLM.getAvailability();
if (status !== 'available') {
  throw new Error(`Model not ready: ${status}`);
}

const { id: chatId } = await LocalLLM.createChat({
  instructions: 'You are a helpful assistant.',
  history: { maxMessages: 20, maxCharacters: 12000 }, // both platforms; iOS trims the Foundation Models transcript
});

const { text } = await LocalLLM.generateText({
  chatId,
  prompt: 'What is the capital of France?',
  options: { temperature: 0.2, maxOutputTokens: 256 },
});

const followUp = await LocalLLM.generateText({
  chatId,
  prompt: 'What is the population of that city?',
});

console.log(text, followUp.text);

await LocalLLM.deleteChat({ id: chatId });
```

## Streaming with `textChunk`

`streamText()` emits incremental chunks through the `textChunk` event and resolves with the complete text when finished.

```typescript
import { LocalLLM } from '@rdlabo/capacitor-local-llm';

const { id: chatId } = await LocalLLM.createChat();

let streamedText = '';
const chunkListener = await LocalLLM.addListener('textChunk', (event) => {
  if (event.chatId !== chatId) return;
  streamedText += event.text;
  console.log(streamedText); // replace with an update to your app's UI
});

try {
  const { text, generationId } = await LocalLLM.streamText({
    chatId,
    prompt: 'Summarize the theory of relativity in one paragraph.',
  });
  console.log('\ncomplete:', text, generationId);
} finally {
  await chunkListener.remove();
  await LocalLLM.deleteChat({ id: chatId });
}
```

## Cancel an in-flight generation

```typescript
import { LocalLLM } from '@rdlabo/capacitor-local-llm';

const stateListener = await LocalLLM.addListener('generationStateChange', (event) => {
  if (event.chatId === chatId && event.state === 'started') {
    void LocalLLM.cancelGeneration({ chatId, generationId: event.generationId });
  }
});

const streamPromise = LocalLLM.streamText({ chatId, prompt: 'Write a long essay.' });

try {
  await streamPromise;
} catch (err) {
  // LOCAL_LLM_GENERATION_CANCELLED on both platforms when cancellation is observed
} finally {
  await stateListener.remove();
}
```

`generationStateChange` is emitted for both `generateText()` and `streamText()`. It reports `started` as soon as the native layer accepts a generation, before the first text chunk, followed by one terminal state: `completed`, `cancelled`, or `failed`. Use its `generationId` for deterministic cancellation. `deleteChat()` also cancels any active generation for that chat.

## Reduce first-response latency with warmup

```typescript
import { LocalLLM } from '@rdlabo/capacitor-local-llm';

const { id: chatId } = await LocalLLM.createChat({
  instructions: 'You are a customer support agent for Acme Corp.',
});

// iOS: prewarm this chat. Android: global model warmup (chatId ignored).
await LocalLLM.warmup({ chatId, promptPrefix: 'You are a customer support agent for Acme Corp.' });
```
