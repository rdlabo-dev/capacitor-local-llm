---
title: Web (Chrome)
---

# Web (Chrome)

The plugin uses Chrome's built-in `LanguageModel` Prompt API for on-device text inference, with no server or API key. Model downloads are managed by Chrome and require a network connection initially; the plugin adds no model-serving dependency.

Use desktop Chrome exposing the Prompt API in a secure context (HTTPS or localhost). Google's current documentation lists Web support from Chrome 148; API exposure and model availability still depend on the browser version, hardware, storage, policy, and model readiness. Chrome on Android and iOS is not supported by this Web backend. Consult the [Chrome Prompt API documentation](https://developer.chrome.com/docs/ai/prompt-api) for current requirements. Earlier experimental builds may require Chrome flags or an origin trial; the plugin does not change browser settings.

Check `getAvailability()` at runtime. An absent API returns `unavailable`; attempting to create a chat in that browser rejects with `LOCAL_LLM_UNSUPPORTED`. An exposed API reporting `unavailable` rejects chat creation with `LOCAL_LLM_NOT_AVAILABLE`.

Call `downloadModel()` or the first `createChat()` from a user action, such as a button click, because Chrome requires user activation when downloading a model. Listen for `downloadProgress` to display progress. For cross-origin iframes the embedding page must delegate `allow="language-model"`. Web Workers are not supported.

```typescript
import { LocalLLM } from '@rdlabo/capacitor-local-llm';

// Register this handler on a button so Chrome can start a model download if needed.
async function onChatClick() {
  const { id } = await LocalLLM.createChat({ instructions: 'Answer briefly.' });
  try {
    const { text } = await LocalLLM.generateText({ chatId: id, prompt: 'What is an LLM?' });
    console.log(text);
  } finally {
    await LocalLLM.deleteChat({ id });
  }
}
```

Supported methods include text availability, model download, warmup, chat creation/deletion, text generation, streaming, cancellation, and the deprecated text/session aliases. `textChunk` contains incremental text; generation state events provide an ID from `started` through one terminal state. Cancellation rejects with `LOCAL_LLM_GENERATION_CANCELLED`, including when a chat is deleted during generation.

The plugin stores successful text turns in memory, dropping oldest whole turns to satisfy `maxMessages` (default 20, minimum 2) and `maxCharacters` (default 12000). Instructions are retained separately. Each generation creates a browser session from retained history and destroys it afterward, so cancelled/failed turns do not contaminate subsequent prompts. Chrome also enforces its context window; oversized inputs reject with `LOCAL_LLM_CONTEXT_WINDOW_EXCEEDED`. History is lost on page reload. `warmup()` creates and releases a temporary session, optionally with the chat context; it ignores the iOS-only `promptPrefix`.

## Limitations

- Omit `GenerationOptions` on Web. The normal Web Prompt API does not expose the plugin's numeric `temperature`, `topK`, or `maxOutputTokens` controls. Specifying them rejects with `LOCAL_LLM_INVALID_OPTIONS`; Chrome extension-only controls are not used.
- This adapter currently supports text input only. `getImageAnalysisAvailability()` returns `unavailable`; supplying `images` or `imagePaths` rejects with `LOCAL_LLM_UNSUPPORTED`. Chrome has separate multimodal capabilities, but those are not exposed by this adapter yet.
- `generateImage()` and Android-only `configureFallbackModel()` reject with `LOCAL_LLM_UNSUPPORTED`.
- Availability events are emitted when plugin calls observe a change and during model downloads. Web does not poll in the background.

## Verification

Run `npm run verify:web` for the package build, public type checks, and browser-adapter regression tests. These tests mock the Prompt API; actual model inference must also be checked in a supported Chrome browser with the example app (`cd example-app` then `npm run dev`).

### Manual text acceptance

Use the example app's **Prompt** tab in supported Chrome. The separate **Physical-device acceptance** suite requires vision input and is intended for native device checks.

1. Select **Check Availability**. If downloadable, select **Download Model** and wait for `available`.
2. Enter `Remember the code word ORCHID. Reply briefly.` and select **Stream Response**. Confirm that text appears progressively and the controls become available again.
3. Enter `What code word did I ask you to remember?` and stream again. Confirm that the answer uses the earlier turn. A Japanese follow-up can also verify multilingual output.
4. Request a long story. After the chat identifier appears and generation starts, select **Cancel Generation**. Confirm the cancellation error and that another short prompt succeeds afterward.
5. Select **Delete Chat**, then send another prompt. Confirm that a new chat identifier is created and the old conversation is not retained.
6. In a browser without the Prompt API, check that availability is `unavailable` and generation reports `LOCAL_LLM_UNSUPPORTED` without crashing the page.

Model wording is nondeterministic. Judge successful inference and lifecycle behavior separately from the exact generated text.

Streaming and cancellation continue in [Chat](./chat.md). Status handling is in [Availability](./availability.md); stable error codes are in [Error Handling](./errors.md).
