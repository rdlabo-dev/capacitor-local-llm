# @rdlabo/capacitor-local-llm

> [!IMPORTANT]
> This project is an independently maintained fork of Ionic's [`@capacitor/local-llm`](https://github.com/ionic-team/capacitor-local-llm), based on upstream version 1.0.0 at commit [`5bceb55`](https://github.com/ionic-team/capacitor-local-llm/commit/5bceb559ed19382efc71df2f918d290ca419d282). It is not an official Ionic or Capacitor package and is not affiliated with or supported by Ionic.

Run large language models entirely on-device using Apple Intelligence (Foundation Models) on iOS and Gemini Nano on Android. Inference runs on-device with no API keys and no prompt or response data leaving the device. On Android, downloading the Gemini Nano model via `downloadModel()` may use the network.

> **Note:** On-device LLMs require physical hardware. Android emulators are not supported. iOS simulators are supported so long as the host Mac supports Apple Intelligence and has it enabled.

## Support and upstream

Report fork-specific bugs and questions in the [rdlabo-dev issue tracker](https://github.com/rdlabo-dev/capacitor-local-llm/issues), not to Ionic. When a problem is confirmed to originate upstream, the fork maintainers may propose the fix back to Ionic. Before production release, validate streaming, cancellation, availability, and model download on the physical devices your app supports.

## Install

```bash
npm install @rdlabo/capacitor-local-llm
npx cap sync
```

## Platform Requirements

| Platform | Minimum OS | Notes |
|----------|------------|-------|
| iOS | **18.4** | Image generation requires iOS 18.4+. Text LLM (Foundation Models / Apple Intelligence) requires iOS 26+. |
| Android | **API 29 (Android 10)** | Gemini Nano via ML Kit requires a compatible physical device (e.g. Pixel 9+). |

## iOS Setup

CocoaPods users need no additional configuration. Foundation Models and Image Playground are system frameworks available automatically on supported devices with Apple Intelligence enabled.

For Capacitor projects using Swift Package Manager, the current Capacitor CLI generates `CapApp-SPM/Package.swift` with an iOS 18.0 deployment target and does not preserve the required minor version. After every `npx cap sync ios`, change its platform declaration to `platforms: [.iOS("18.4")]`. The included example app automates this with `npm run cap:sync`; see [`example-app/scripts/sync-capacitor.mjs`](example-app/scripts/sync-capacitor.mjs) for the small, fail-fast wrapper.

Call [`getAvailability()`](#getavailability) at runtime to check whether the text model is ready before creating chats or generating text.

On iOS versions below 26, only `getAvailability()` reports `'device-not-eligible'` for the text LLM. Text and chat APIs such as `createChat()`, `deleteChat()`, `generateText()`, and `streamText()` reject with `LOCAL_LLM_UNSUPPORTED`. Image generation via `generateImage()` is available on iOS 18.4+.

[`downloadModel()`](#downloadmodel) is not available on iOS — the OS manages the model. Use `getAvailability()` or the `availabilityChange` event to observe readiness.

## Android Setup

The plugin's minimum Android SDK is **29**, higher than Capacitor's current default (24). Update `android/variables.gradle` in your application:

```gradle
ext {
    minSdkVersion = 29
}
```

Gemini Nano is distributed via Google Play Services and must be downloaded to the device before use. The model is not bundled with your app.

### Check availability and download

Call [`getAvailability()`](#getavailability) to inspect the current state. If the status is `downloadable`, start the download with [`downloadModel()`](#downloadmodel) and listen for `downloadProgress` and/or `availabilityChange` until the status becomes `available`.

```typescript
import { LocalLLM } from '@rdlabo/capacitor-local-llm';

const availabilityListener = await LocalLLM.addListener('availabilityChange', ({ status }) => {
  console.log('availability:', status);
});

const progressListener = await LocalLLM.addListener('downloadProgress', (event) => {
  if (event.progress != null) {
    console.log('download progress:', event.progress);
  } else if (event.downloadedBytes != null) {
    console.log('downloaded bytes:', event.downloadedBytes);
  }
});

const { status } = await LocalLLM.getAvailability();

if (status === 'downloadable') {
  await LocalLLM.downloadModel();
}

await availabilityListener.remove();
await progressListener.remove();
```

### Android fallback model (Gemini Nano unavailable)

When ML Kit reports Gemini Nano unavailable (including devices without the required AICore feature), an app can explicitly configure a local [LiteRT-LM](https://github.com/google-ai-edge/LiteRT-LM) `.litertlm` model. Gemini Nano remains preferred for ordinary text generation whenever it is available. The plugin does not bundle or silently download model weights: the app owns the model file, its download UX, storage, updates, and license compliance.

Fallback configuration is image-first and defaults `supportsImages` to `true`, as LiteRT-LM 0.16.1 does not expose stable modality introspection. Use a multimodal model, or pass `supportsImages: false` for a text-only model. The recommended starting point for image-capable apps is a model from the official [LiteRT multimodality collection](https://huggingface.co/collections/litert-community/multi-modality-models), such as Gemma 4 E2B. Be aware that Gemma 4 E2B is about 2.6 GB; model size and memory use must be evaluated on every supported device. A smaller LFM2.5-VL-450M conversion exists, but its model card documents a current vision-positioning defect, so it is not the default recommendation.

```typescript
// Rename the downloaded model as desired and either package it in android/app/src/main/assets
// or provide a readable absolute app-managed file path.
await LocalLLM.configureFallbackModel({
  path: '/android_asset/gemma-4-E2B-it.litertlm',
  maxTokens: 4096,
  maxImages: 1,
  // supportsImages defaults to true
});

const { id: chatId } = await LocalLLM.createChat({
  instructions: 'Answer questions about the supplied image.',
});

const result = await LocalLLM.generateText({
  chatId,
  prompt: 'Describe this image concisely.',
  imagePaths: ['content://com.example.files/photo.jpg'],
});
```

`imagePaths` accepts readable absolute paths, decoded `file://` URLs without an authority, and `content://` URIs. Each image is limited to 32 MiB. Content URIs are copied on an I/O dispatcher to a bounded temporary app cache file for the native engine and removed after generation. Images are supported only by the configured Android fallback; iOS, Web, Gemini Nano, and text-only fallback models reject them with `LOCAL_LLM_UNSUPPORTED` instead of ignoring them. Image files are input for the current turn and are not retained in chat history.

Prefer an app-managed absolute model path for large models. `/android_asset/...` is supported for convenience, but the plugin must copy that asset to private app files because the native engine needs a real path. It reuses the versioned private copy within the same app version, closes the old engine on reconfiguration, and removes older copies of the same asset after a successful new initialization. During an app upgrade, peak storage can temporarily include the packaged asset, the previous private copy, and the new temporary copy. The active engine remains loaded for the plugin lifetime; app-managed files must not be replaced or deleted until the plugin is destroyed or another model is successfully configured.

The fallback uses LiteRT-LM's structured messages, native streaming flow, and cancellation API. It currently runs the text and vision pipelines on CPU for broad compatibility and serializes generation, configuration, warmup, download, and teardown through the same plugin mutex. `downloadModel()` continues to manage only the ML Kit system model. LiteRT-LM is evolving quickly, so treat the fallback as opt-in and perform physical-device soak tests before release.

The Android dependency pins `kotlinx-coroutines` 1.11.0 because the LiteRT-LM 0.16.1 binary uses the newer `SendChannel` default-method ABI while its published POM still declares 1.9.0. Removing or downgrading that pin causes a `NoSuchMethodError` when native streaming completes; see upstream [LiteRT-LM issue #2812](https://github.com/google-ai-edge/LiteRT-LM/issues/2812).

The model is opt-in, but the LiteRT-LM runtime dependency is included in every Android consumer. Version 0.16.1 adds an AAR of roughly 20 MB compressed and native libraries of roughly 22 MB per arm64 build (universal debug APKs are larger; Android App Bundles normally split by ABI). Review final APK/AAB size and supported 64-bit ABIs. LiteRT-LM is Apache-2.0; model weights have separate licenses and usage terms. Preserve the runtime's `LICENSE` and `THIRD_PARTY_NOTICE.txt` in your app's OSS notices and review the selected model's terms independently.

## Availability

[`getAvailability()`](#getavailability) returns a semantic `status` value:

| Status | Meaning |
|--------|---------|
| `available` | The text model is ready for generation. |
| `device-not-eligible` | The device or OS version does not support the on-device text model. iOS reports this precisely; Android's `FeatureStatus.UNAVAILABLE` does not expose a reason and maps to `unavailable`. |
| `not-enabled` | The device supports on-device AI but the user has not enabled it (e.g. Apple Intelligence is off). Primarily reported on iOS. |
| `downloadable` | The model can be downloaded (Android). |
| `downloading` | A model download is in progress (Android). |
| `not-ready` | The model exists but is still initializing. |
| `unavailable` | The model is unavailable for another reason. |

Subscribe to `availabilityChange` (or the deprecated `systemAvailabilityChange` alias) to receive updates while listeners are registered. On Android the plugin polls while listeners are active.

The deprecated `systemAvailability()` and `systemAvailabilityChange` fold detailed statuses into the original four-value contract: `available`, `unavailable`, `notready`, and `downloadable`. `downloading` and `not-ready` map to `notready`; `device-not-eligible`, `not-enabled`, and `unavailable` map to `unavailable`.

## Platform Behavior

### iOS

- **Text LLM requires iOS 26 and Apple Intelligence.** Below iOS 26, availability is reported as `device-not-eligible`. Only select iPhones (iPhone 15 Pro or later) and iPads support Apple Intelligence. [More information here](https://www.apple.com/apple-intelligence/).
- **Chats use the native Foundation Models transcript.** Conversation state lives in `LanguageModelSession`. Before generation, the plugin also applies a conservative character budget against the model's native `contextSize`, including instructions, the current prompt, and output headroom. When any limit is exceeded, it drops the oldest complete prompt/response turns, preserves instructions, and recreates the session.
- **`warmup({ chatId, promptPrefix })` prewarms a specific chat** created with `createChat()`.
- **`cancelGeneration()` cancels the in-flight `Task`** for the chat. The `streamText()` / `generateText()` promise rejects with `LOCAL_LLM_GENERATION_CANCELLED`; any text already streamed via `textChunk` remains in your UI.
- **Image generation** is available on iOS 18.4+ via `generateImage()`.

### Android

- **Conversation history is structured in memory** by the plugin. Each chat stores user/assistant turns and trims by `history.maxMessages` (default **20**) and `history.maxCharacters` (default **12000**). Gemini Nano then uses ML Kit `countTokens()` to fit the context. LiteRT-LM uses a conservative one-character-per-token heuristic plus prompt and image reserves because version 0.16.1 has no stable token-count API. Both paths drop oldest whole turns; system instructions are stored separately and never trimmed. History does not persist across app restarts.
- **`warmup()` warms the model globally** and ignores `chatId` / `promptPrefix`.
- **`cancelGeneration()` is best-effort.** It cancels the plugin's coroutine; ML Kit may already have emitted partial output before cancellation completes. The promise rejects with `LOCAL_LLM_GENERATION_CANCELLED` when cancellation is observed.
- **Unsupported `GenerationOptions` values are rejected** with `LOCAL_LLM_INVALID_OPTIONS`, not silently clamped. `maxOutputTokens` must be within `1..min(device token limit, 4096)`; when omitted, the plugin default is **256**.
- **Native model operations run serially.** The plugin mutex protects Gemini Nano and LiteRT-LM generation, fallback configuration, warmup, download, and teardown, so concurrent generations in different chats are queued.
- **Not all API 29+ devices support Gemini Nano.** The device must have a compatible on-device AI stack. [More information here](https://developers.google.com/ml-kit/genai#device-support).
- **Apps may explicitly configure a LiteRT-LM fallback** when Gemini Nano is unavailable. Once initialization completes, `getAvailability()` reports `available`.
- **On-device models cannot be used while the app is in the background.** Inference requests made while backgrounded will fail.
- **AICore enforces per-app inference quotas.** Excessive requests can return busy or quota errors from the underlying SDK — consider exponential backoff.

## Usage

### Chat lifecycle

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

### Streaming with `textChunk`

`streamText()` emits incremental chunks through the `textChunk` event and resolves with the complete text when finished.

```typescript
import { LocalLLM } from '@rdlabo/capacitor-local-llm';

const { id: chatId } = await LocalLLM.createChat();

const chunkListener = await LocalLLM.addListener('textChunk', (event) => {
  if (event.chatId !== chatId) return;
  process.stdout.write(event.text); // newly generated text only
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

### Cancel an in-flight generation

```typescript
import { LocalLLM } from '@rdlabo/capacitor-local-llm';

const streamPromise = LocalLLM.streamText({ chatId, prompt: 'Write a long essay.' });

// Cancel the active generation for this chat (optionally pass generationId)
await LocalLLM.cancelGeneration({ chatId });

try {
  await streamPromise;
} catch (err) {
  // LOCAL_LLM_GENERATION_CANCELLED on both platforms when cancellation is observed
}
```

`deleteChat()` also cancels any active generation for that chat.

### Reduce first-response latency with warmup

```typescript
import { LocalLLM } from '@rdlabo/capacitor-local-llm';

const { id: chatId } = await LocalLLM.createChat({
  instructions: 'You are a customer support agent for Acme Corp.',
});

// iOS: prewarm this chat. Android: global model warmup (chatId ignored).
await LocalLLM.warmup({ chatId, promptPrefix: 'You are a customer support agent for Acme Corp.' });
```

### Image generation (iOS only)

```typescript
import { LocalLLM } from '@rdlabo/capacitor-local-llm';

const { pngBase64Images } = await LocalLLM.generateImage({
  prompt: 'A serene mountain lake at sunrise, photorealistic',
  count: 2,
});

const src = `data:image/png;base64,${pngBase64Images[0]}`;
```

## Events

| Event | Description |
|-------|-------------|
| `availabilityChange` | Fired when text-model availability changes while listeners are registered. |
| `downloadProgress` | Fired during Android `downloadModel()`. Intermediate events may include only `downloadedBytes` because ML Kit does not expose a total byte count; `progress` is `0` at start and `1` on completion when known. |
| `textChunk` | Fired during `streamText()` with incremental text for the matching `chatId` / `generationId`. |

Remove listeners with the returned `PluginListenerHandle.remove()` or `removeAllListeners()`.

## Deprecated compatibility APIs

v1 APIs remain available but are deprecated in favor of explicit chat and availability methods:

| Deprecated | Replacement |
|------------|-------------|
| `systemAvailability()` | `getAvailability()` |
| `download()` | `downloadModel()` |
| `prompt()` | `createChat()` + `generateText()` / `streamText()` |
| `endSession()` | `deleteChat()` |
| `addListener('systemAvailabilityChange', …)` | `addListener('availabilityChange', …)` |
| `warmup({ sessionId })` | `warmup({ chatId })` |

`systemAvailability()` and `systemAvailabilityChange` return the legacy four-value `LLMAvailability` contract (`available`, `unavailable`, `notready`, `downloadable`) by folding the detailed `Availability` statuses described above.

`prompt()` without `sessionId` still performs a one-shot generation for backward compatibility.

### Migrating from Ionic upstream v1

This fork is not a complete drop-in replacement. Change the dependency and imports to `@rdlabo/capacitor-local-llm`, adopt `getAvailability()` and the explicit `createChat()` / `generateText()` / `deleteChat()` lifecycle, and handle the detailed status and stable error codes. The minimums are iOS 18.4 and Android API 29. Deprecated v1 entry points remain as a transition layer, including the original four availability values.

## Error Handling

Native Capacitor errors and the web stub expose a stable string `code` matching `LocalLLMErrorCode`. On web, failures throw `LocalLLMException`, which extends `Error` and sets `code`.

```typescript
import { LocalLLM, LocalLLMException } from '@rdlabo/capacitor-local-llm';

try {
  await LocalLLM.generateText({ chatId: 'missing', prompt: 'Hello' });
} catch (err) {
  const code = err instanceof LocalLLMException ? err.code : (err as { code?: string }).code;
  console.log(code, (err as Error).message);
}
```

### `LocalLLMErrorCode`

| Code | Description |
|------|-------------|
| `LOCAL_LLM_NOT_AVAILABLE` | The on-device text model is unavailable. |
| `LOCAL_LLM_DEVICE_NOT_ELIGIBLE` | The device or OS does not support on-device text generation. |
| `LOCAL_LLM_NOT_ENABLED` | On-device AI is supported but not enabled by the user. |
| `LOCAL_LLM_MODEL_NOT_READY` | The model is downloading or initializing (`downloading` / `not-ready`). |
| `LOCAL_LLM_MODEL_DOWNLOAD_REQUIRED` | The model must be downloaded first (`downloadable`). |
| `LOCAL_LLM_CONTEXT_WINDOW_EXCEEDED` | The prompt and requested output cannot fit even after removable history is trimmed. |
| `LOCAL_LLM_CHAT_NOT_FOUND` | The `chatId` does not exist. |
| `LOCAL_LLM_CHAT_BUSY` | A generation is already in progress for this chat. |
| `LOCAL_LLM_GENERATION_NOT_FOUND` | No matching in-flight generation (or `generationId` mismatch). |
| `LOCAL_LLM_GENERATION_CANCELLED` | The generation was cancelled via `cancelGeneration()` or `deleteChat()`. |
| `LOCAL_LLM_INVALID_OPTIONS` | An option value is missing or out of range. |
| `LOCAL_LLM_UNSUPPORTED` | The method or feature is not supported on this platform or OS version. |
| `LOCAL_LLM_IMAGE_GENERATION_FAILED` | Image generation failed (e.g. no available style). |
| `LOCAL_LLM_UNKNOWN_ERROR` | An unexpected underlying SDK error. Check `message` for details. |

## API

<docgen-index>

* [`getAvailability()`](#getavailability)
* [`downloadModel()`](#downloadmodel)
* [`configureFallbackModel(...)`](#configurefallbackmodel)
* [`warmup(...)`](#warmup)
* [`createChat(...)`](#createchat)
* [`deleteChat(...)`](#deletechat)
* [`generateText(...)`](#generatetext)
* [`streamText(...)`](#streamtext)
* [`cancelGeneration(...)`](#cancelgeneration)
* [`generateImage(...)`](#generateimage)
* [`systemAvailability()`](#systemavailability)
* [`download()`](#download)
* [`prompt(...)`](#prompt)
* [`endSession(...)`](#endsession)
* [`addListener('availabilityChange', ...)`](#addlisteneravailabilitychange-)
* [`addListener('systemAvailabilityChange', ...)`](#addlistenersystemavailabilitychange-)
* [`addListener('downloadProgress', ...)`](#addlistenerdownloadprogress-)
* [`addListener('textChunk', ...)`](#addlistenertextchunk-)
* [`removeAllListeners()`](#removealllisteners)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

Public on-device LLM plugin contract.

### getAvailability()

```typescript
getAvailability() => Promise<GetAvailabilityResult>
```

Returns detailed text-model availability.

**Returns:** <code>Promise&lt;<a href="#getavailabilityresult">GetAvailabilityResult</a>&gt;</code>

**Since:** 2.0.0

--------------------


### downloadModel()

```typescript
downloadModel() => Promise<void>
```

Starts an Android model download.

**Since:** 2.0.0

--------------------


### configureFallbackModel(...)

```typescript
configureFallbackModel(options: ConfigureFallbackModelOptions) => Promise<void>
```

Initializes an explicit Android LiteRT-LM fallback model. Gemini Nano remains preferred when available.
Configuring a model performs local file I/O and may take significant time. iOS and Web reject this API.

| Param         | Type                                                                                    |
| ------------- | --------------------------------------------------------------------------------------- |
| **`options`** | <code><a href="#configurefallbackmodeloptions">ConfigureFallbackModelOptions</a></code> |

**Since:** 2.0.0

--------------------


### warmup(...)

```typescript
warmup(options?: WarmupOptions | undefined) => Promise<void>
```

Warms native model resources.

| Param         | Type                                                    |
| ------------- | ------------------------------------------------------- |
| **`options`** | <code><a href="#warmupoptions">WarmupOptions</a></code> |

**Since:** 1.0.0

--------------------


### createChat(...)

```typescript
createChat(options?: CreateChatOptions | undefined) => Promise<CreateChatResult>
```

Creates a chat owned by the plugin until deletion.

| Param         | Type                                                            |
| ------------- | --------------------------------------------------------------- |
| **`options`** | <code><a href="#createchatoptions">CreateChatOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#createchatresult">CreateChatResult</a>&gt;</code>

**Since:** 2.0.0

--------------------


### deleteChat(...)

```typescript
deleteChat(options: DeleteChatOptions) => Promise<void>
```

Deletes a chat and cancels its generation.

| Param         | Type                                                            |
| ------------- | --------------------------------------------------------------- |
| **`options`** | <code><a href="#deletechatoptions">DeleteChatOptions</a></code> |

**Since:** 2.0.0

--------------------


### generateText(...)

```typescript
generateText(options: GenerateTextOptions) => Promise<GenerateTextResult>
```

Generates complete text.

| Param         | Type                                                                |
| ------------- | ------------------------------------------------------------------- |
| **`options`** | <code><a href="#generatetextoptions">GenerateTextOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#generatetextresult">GenerateTextResult</a>&gt;</code>

**Since:** 2.0.0

--------------------


### streamText(...)

```typescript
streamText(options: StreamTextOptions) => Promise<StreamTextResult>
```

Streams native chunks and returns complete text.

| Param         | Type                                                                |
| ------------- | ------------------------------------------------------------------- |
| **`options`** | <code><a href="#generatetextoptions">GenerateTextOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#generatetextresult">GenerateTextResult</a>&gt;</code>

**Since:** 2.0.0

--------------------


### cancelGeneration(...)

```typescript
cancelGeneration(options: CancelGenerationOptions) => Promise<void>
```

Cancels an in-flight generation.

| Param         | Type                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| **`options`** | <code><a href="#cancelgenerationoptions">CancelGenerationOptions</a></code> |

**Since:** 2.0.0

--------------------


### generateImage(...)

```typescript
generateImage(options: GenerateImageOptions) => Promise<GenerateImageResponse>
```

Generates PNG images on iOS.

| Param         | Type                                                                  |
| ------------- | --------------------------------------------------------------------- |
| **`options`** | <code><a href="#generateimageoptions">GenerateImageOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#generateimageresponse">GenerateImageResponse</a>&gt;</code>

**Since:** 1.0.0

--------------------


### systemAvailability()

```typescript
systemAvailability() => Promise<SystemAvailabilityResponse>
```

**Returns:** <code>Promise&lt;<a href="#systemavailabilityresponse">SystemAvailabilityResponse</a>&gt;</code>

**Since:** 1.0.0

--------------------


### download()

```typescript
download() => Promise<void>
```

**Since:** 1.0.0

--------------------


### prompt(...)

```typescript
prompt(options: PromptOptions) => Promise<PromptResponse>
```

| Param         | Type                                                    |
| ------------- | ------------------------------------------------------- |
| **`options`** | <code><a href="#promptoptions">PromptOptions</a></code> |

**Returns:** <code>Promise&lt;<a href="#promptresponse">PromptResponse</a>&gt;</code>

**Since:** 1.0.0

--------------------


### endSession(...)

```typescript
endSession(options: EndSessionOptions) => Promise<void>
```

| Param         | Type                                                            |
| ------------- | --------------------------------------------------------------- |
| **`options`** | <code><a href="#endsessionoptions">EndSessionOptions</a></code> |

**Since:** 1.0.0

--------------------


### addListener('availabilityChange', ...)

```typescript
addListener(eventName: 'availabilityChange', listenerFunc: AvailabilityChangeListener) => Promise<PluginListenerHandle>
```

Listens for availability changes.

| Param              | Type                                                                              |
| ------------------ | --------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'availabilityChange'</code>                                                 |
| **`listenerFunc`** | <code><a href="#availabilitychangelistener">AvailabilityChangeListener</a></code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

**Since:** 2.0.0

--------------------


### addListener('systemAvailabilityChange', ...)

```typescript
addListener(eventName: 'systemAvailabilityChange', listenerFunc: SystemAvailabilityChangeListener) => Promise<PluginListenerHandle>
```

| Param              | Type                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'systemAvailabilityChange'</code>                                                       |
| **`listenerFunc`** | <code><a href="#systemavailabilitychangelistener">SystemAvailabilityChangeListener</a></code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

**Since:** 1.0.0

--------------------


### addListener('downloadProgress', ...)

```typescript
addListener(eventName: 'downloadProgress', listenerFunc: DownloadProgressListener) => Promise<PluginListenerHandle>
```

Listens for Android download progress.

| Param              | Type                                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| **`eventName`**    | <code>'downloadProgress'</code>                                               |
| **`listenerFunc`** | <code><a href="#downloadprogresslistener">DownloadProgressListener</a></code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

**Since:** 2.0.0

--------------------


### addListener('textChunk', ...)

```typescript
addListener(eventName: 'textChunk', listenerFunc: TextChunkListener) => Promise<PluginListenerHandle>
```

Listens for native text chunks.

| Param              | Type                                                            |
| ------------------ | --------------------------------------------------------------- |
| **`eventName`**    | <code>'textChunk'</code>                                        |
| **`listenerFunc`** | <code><a href="#textchunklistener">TextChunkListener</a></code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

**Since:** 2.0.0

--------------------


### removeAllListeners()

```typescript
removeAllListeners() => Promise<void>
```

Removes every plugin listener.

**Since:** 1.0.0

--------------------


### Interfaces


#### GetAvailabilityResult

Result returned by availability checks.

| Prop         | Type                                                  | Description                      | Since |
| ------------ | ----------------------------------------------------- | -------------------------------- | ----- |
| **`status`** | <code><a href="#availability">Availability</a></code> | Current text-model availability. | 2.0.0 |


#### ConfigureFallbackModelOptions

Configures an opt-in Android LiteRT-LM fallback used when Gemini Nano is unavailable.
The model must already exist as an app asset or a readable app-managed file. iOS and Web reject this API.

| Prop                 | Type                 | Description                                                                                               | Since |
| -------------------- | -------------------- | --------------------------------------------------------------------------------------------------------- | ----- |
| **`path`**           | <code>string</code>  | `.litertlm` model path. Use `/android_asset/...` for bundled assets or an absolute app-managed file path. | 2.0.0 |
| **`maxTokens`**      | <code>number</code>  | Combined context capacity passed to LiteRT-LM. Defaults to 4096.                                          | 2.0.0 |
| **`maxImages`**      | <code>number</code>  | Maximum images accepted by one generation for a vision-capable model. Defaults to 1.                      | 2.0.0 |
| **`supportsImages`** | <code>boolean</code> | Initializes LiteRT-LM's vision pipeline. Defaults to `true`; set to `false` only for a text-only model.   | 2.0.0 |


#### WarmupOptions

Warmup options. Android performs global model warmup; iOS can prewarm a chat.

| Prop               | Type                | Description                                       | Since |
| ------------------ | ------------------- | ------------------------------------------------- | ----- |
| **`chatId`**       | <code>string</code> | Explicit chat identifier to prewarm on iOS.       | 2.0.0 |
| **`sessionId`**    | <code>string</code> |                                                   | 1.0.0 |
| **`promptPrefix`** | <code>string</code> | Optional prompt prefix used by Foundation Models. | 1.0.0 |


#### CreateChatResult

Result containing the plugin-owned chat identifier.

| Prop     | Type                | Description                                           | Since |
| -------- | ------------------- | ----------------------------------------------------- | ----- |
| **`id`** | <code>string</code> | Identifier required by generation and deletion calls. | 2.0.0 |


#### CreateChatOptions

Options for creating an owned chat.

| Prop               | Type                                                              | Description                                            | Since |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------ | ----- |
| **`instructions`** | <code>string</code>                                               | Persistent system instructions for this chat.          | 2.0.0 |
| **`history`**      | <code><a href="#chathistoryoptions">ChatHistoryOptions</a></code> | History limits applied by both native implementations. | 2.0.0 |


#### ChatHistoryOptions

Chat history limits. Both native implementations retain instructions and discard oldest whole turns.

| Prop                | Type                | Description                                             | Since |
| ------------------- | ------------------- | ------------------------------------------------------- | ----- |
| **`maxMessages`**   | <code>number</code> | Maximum retained messages. Defaults to 20.              | 2.0.0 |
| **`maxCharacters`** | <code>number</code> | Maximum retained message characters. Defaults to 12000. | 2.0.0 |


#### DeleteChatOptions

Options for deleting a chat.

| Prop     | Type                | Description                                 | Since |
| -------- | ------------------- | ------------------------------------------- | ----- |
| **`id`** | <code>string</code> | Chat identifier returned by `createChat()`. | 2.0.0 |


#### GenerateTextResult

Result of a text generation.

| Prop               | Type                | Description                                                  | Since |
| ------------------ | ------------------- | ------------------------------------------------------------ | ----- |
| **`text`**         | <code>string</code> | Complete generated text.                                     | 2.0.0 |
| **`generationId`** | <code>string</code> | Identifier that can correlate diagnostics with a generation. | 2.0.0 |


#### GenerateTextOptions

Options for a non-streaming generation.

| Prop             | Type                                                            | Description                                                                                                                                                                                                                                                         | Since |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`chatId`**     | <code>string</code>                                             | Chat identifier returned by `createChat()`.                                                                                                                                                                                                                         | 2.0.0 |
| **`prompt`**     | <code>string</code>                                             | User prompt.                                                                                                                                                                                                                                                        | 2.0.0 |
| **`imagePaths`** | <code>string[]</code>                                           | Local image paths supplied to a vision-capable Android LiteRT-LM fallback model. Absolute paths, `file://` URLs, and readable `content://` URIs are accepted. iOS, Web, Gemini Nano, and text-only fallback models reject image input with `LOCAL_LLM_UNSUPPORTED`. | 2.0.0 |
| **`options`**    | <code><a href="#generationoptions">GenerationOptions</a></code> | Optional generation controls.                                                                                                                                                                                                                                       | 2.0.0 |


#### GenerationOptions

Cross-platform text generation controls. Unsupported values are rejected, not clamped.

| Prop                  | Type                | Description                            | Since |
| --------------------- | ------------------- | -------------------------------------- | ----- |
| **`temperature`**     | <code>number</code> | Sampling temperature.                  | 2.0.0 |
| **`topK`**            | <code>number</code> | Samples from the k most likely tokens. | 2.0.0 |
| **`maxOutputTokens`** | <code>number</code> | Maximum generated tokens.              | 2.0.0 |


#### CancelGenerationOptions

Options for cancelling an in-flight generation.

| Prop               | Type                | Description                                                         | Since |
| ------------------ | ------------------- | ------------------------------------------------------------------- | ----- |
| **`chatId`**       | <code>string</code> | Chat that owns the generation.                                      | 2.0.0 |
| **`generationId`** | <code>string</code> | Optional generation identifier; a mismatch is treated as not found. | 2.0.0 |


#### GenerateImageResponse

Image generation result.

| Prop                  | Type                  | Description                                      | Since |
| --------------------- | --------------------- | ------------------------------------------------ | ----- |
| **`pngBase64Images`** | <code>string[]</code> | Raw base64 PNG images without a data-URI prefix. | 1.0.0 |


#### GenerateImageOptions

Image generation options. Image generation is available only on iOS 18.4+.

| Prop               | Type                  | Description                          | Since |
| ------------------ | --------------------- | ------------------------------------ | ----- |
| **`prompt`**       | <code>string</code>   | Image description.                   | 1.0.0 |
| **`promptImages`** | <code>string[]</code> | Optional base64 reference images.    | 1.0.0 |
| **`count`**        | <code>number</code>   | Number of variations. Defaults to 1. | 1.0.0 |


#### SystemAvailabilityResponse

| Prop         | Type                                                        | Description                                                                                  | Since |
| ------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----- |
| **`status`** | <code><a href="#llmavailability">LLMAvailability</a></code> | Legacy availability value. Detailed states are folded into the original four-value contract. | 1.0.0 |


#### PromptResponse

Legacy prompt response.

| Prop       | Type                | Description              | Since |
| ---------- | ------------------- | ------------------------ | ----- |
| **`text`** | <code>string</code> | Complete generated text. | 1.0.0 |


#### PromptOptions

Legacy prompt options.

| Prop               | Type                                              | Description                                                 | Since |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------- | ----- |
| **`sessionId`**    | <code>string</code>                               | Optional legacy session identifier.                         | 1.0.0 |
| **`instructions`** | <code>string</code>                               | Instructions used when the legacy session is first created. | 1.0.0 |
| **`options`**      | <code><a href="#llmoptions">LLMOptions</a></code> | Legacy generation controls.                                 | 1.0.0 |
| **`prompt`**       | <code>string</code>                               | User prompt.                                                | 1.0.0 |


#### LLMOptions

| Prop                      | Type                | Description               | Since |
| ------------------------- | ------------------- | ------------------------- | ----- |
| **`temperature`**         | <code>number</code> | Sampling temperature.     | 1.0.0 |
| **`maximumOutputTokens`** | <code>number</code> | Maximum generated tokens. | 1.0.0 |


#### EndSessionOptions

Legacy session deletion options.

| Prop            | Type                | Description                | Since |
| --------------- | ------------------- | -------------------------- | ----- |
| **`sessionId`** | <code>string</code> | Legacy session identifier. | 1.0.0 |


#### PluginListenerHandle

| Prop         | Type                                      |
| ------------ | ----------------------------------------- |
| **`remove`** | <code>() =&gt; Promise&lt;void&gt;</code> |


#### DownloadProgressEvent

Model download progress. Intermediate Android events omit `progress` because ML Kit has no total byte count.

| Prop                  | Type                | Description                                                                 | Since |
| --------------------- | ------------------- | --------------------------------------------------------------------------- | ----- |
| **`progress`**        | <code>number</code> | Known normalized progress: 0 at start and 1 at completion.                  | 2.0.0 |
| **`downloadedBytes`** | <code>number</code> | Bytes downloaded so far when supplied by ML Kit.                            | 2.0.0 |
| **`totalBytes`**      | <code>number</code> | Total bytes, when a platform SDK supplies it. Currently omitted on Android. | 2.0.0 |


#### TextChunkEvent

Incremental text emitted by `streamText()`.

| Prop               | Type                | Description                                              | Since |
| ------------------ | ------------------- | -------------------------------------------------------- | ----- |
| **`chatId`**       | <code>string</code> | Chat that owns the generation.                           | 2.0.0 |
| **`generationId`** | <code>string</code> | Identifier of this generation.                           | 2.0.0 |
| **`text`**         | <code>string</code> | Newly generated text only, not the accumulated snapshot. | 2.0.0 |


### Type Aliases


#### Availability

The semantic availability of the on-device text model.

<code>'available' | 'device-not-eligible' | 'not-enabled' | 'downloadable' | 'downloading' | 'not-ready' | 'unavailable'</code>


#### StreamTextOptions

Options for native streaming generation.

<code><a href="#generatetextoptions">GenerateTextOptions</a></code>


#### StreamTextResult

Final result of a native streaming generation.

<code><a href="#generatetextresult">GenerateTextResult</a></code>


#### LLMAvailability

<code>'available' | 'unavailable' | 'notready' | 'downloadable'</code>


#### AvailabilityChangeListener

Listener for availability changes.

<code>(event: <a href="#getavailabilityresult">GetAvailabilityResult</a>): void</code>


#### SystemAvailabilityChangeListener

<code>(event: <a href="#systemavailabilityresponse">SystemAvailabilityResponse</a>): void</code>


#### DownloadProgressListener

Listener for model download progress.

<code>(event: <a href="#downloadprogressevent">DownloadProgressEvent</a>): void</code>


#### TextChunkListener

Listener for native generation chunks.

<code>(event: <a href="#textchunkevent">TextChunkEvent</a>): void</code>

</docgen-api>
