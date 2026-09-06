# @rdlabo/capacitor-local-llm

> [!IMPORTANT]
> This project is an independently maintained fork of Ionic's [`@capacitor/local-llm`](https://github.com/ionic-team/capacitor-local-llm), based on upstream version 1.0.0 at commit [`5bceb55`](https://github.com/ionic-team/capacitor-local-llm/commit/5bceb559ed19382efc71df2f918d290ca419d282). It is not an official Ionic or Capacitor package and is not affiliated with or supported by Ionic.

Run large language models entirely on-device using Apple Intelligence (Foundation Models) on iOS and Gemini Nano on Android. Inference runs on-device with no API keys and no prompt or response data leaving the device. On Android, downloading the Gemini Nano model via `downloadModel()` may use the network.

> **Note:** On-device LLMs require physical hardware. Android emulators are not supported. iOS simulators are supported so long as the host Mac supports Apple Intelligence and has it enabled.

## Install

```bash
npm install @rdlabo/capacitor-local-llm
npx cap sync
```

Requires Capacitor 8 or later. Text generation also works in supported desktop Chrome browsers through the built-in Prompt API. See [Web setup](docs/web.md) for requirements and limitations.

This README and the guides describe the checked-out source. When using an npm release, consult
the documentation at its matching Git tag and check the API's `Since` annotation. In particular,
APIs marked `2.1.0` must not be assumed to exist in `2.0.0`.

## Platform summary

| Platform | Minimum OS              | Notes                                                                                                                                                                  |
| -------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS      | **18.4**                | Image generation requires iOS 18.4+. Text LLM requires iOS 26+. Image analysis uses Foundation Models `Attachment` on iOS 27+ when compiled with Xcode 27 / Swift 6.4. |
| Android  | **API 29 (Android 10)** | Gemini Nano via ML Kit requires a compatible physical device (e.g. Pixel 9+).                                                                                          |

Native project setup (SPM deployment target, `minSdkVersion`, and model download) is in [Setup](docs/setup.md).

## Quick start

After [Install](#install) and [Setup](docs/setup.md), check availability, create a chat, and generate text:

```typescript
import { LocalLLM } from '@rdlabo/capacitor-local-llm';

const { status } = await LocalLLM.getAvailability();
if (status !== 'available') {
  throw new Error(`Model not ready: ${status}`);
}

const { id: chatId } = await LocalLLM.createChat({
  instructions: 'You are a helpful assistant.',
});

try {
  const { text } = await LocalLLM.generateText({
    chatId,
    prompt: 'What is the capital of France?',
  });
  console.log(text);
} finally {
  await LocalLLM.deleteChat({ id: chatId });
}
```

Streaming, cancellation, and warmup: [Chat](docs/chat.md). Image input and generation: [Images](docs/images.md).

## Documentation

- [Setup](docs/setup.md) — platform requirements, iOS SPM target, Android `minSdkVersion`, and Gemini Nano download.
- [Android fallback model](docs/android-fallback.md) — LiteRT-LM when Gemini Nano is unavailable.
- [Availability](docs/availability.md) — status values and platform behavior.
- [Chat](docs/chat.md) — chat lifecycle, streaming, cancellation, and warmup.
- [Images](docs/images.md) — image analysis (iOS / Android) and image generation (iOS).
- [Events](docs/events.md) — availability, download, chunk, and generation lifecycle events.
- [Migration](docs/migration.md) — deprecated v1 APIs and upstream migration.
- [Error Handling](docs/errors.md) — stable `LocalLLMErrorCode` values.

Method signatures are in the API section below.

<!-- rdlabo-docs-omit -->

## Support and maintenance

Report fork-specific bugs and questions in the [rdlabo-dev issue tracker](https://github.com/rdlabo-dev/capacitor-local-llm/issues), not to Ionic. When a problem is confirmed to originate upstream, the fork maintainers may propose the fix back to Ionic. Before production release, validate streaming, cancellation, availability, and model download on the physical devices your app supports.

Maintainers: see [Releasing](docs/releasing.md) for npm Trusted Publishing and release channels.

<!-- /rdlabo-docs-omit -->

## API

<docgen-index>

* [`getAvailability()`](#getavailability)
* [`getImageAnalysisAvailability()`](#getimageanalysisavailability)
* [`downloadModel()`](#downloadmodel)
* [`configureFallbackModel(...)`](#configurefallbackmodel)
* [`warmup(...)`](#warmup)
* [`createChat(...)`](#createchat)
* [`deleteChat(...)`](#deletechat)
* [`generateText(...)`](#generatetext)
* [`streamText(...)`](#streamtext)
* [`cancelGeneration(...)`](#cancelgeneration)
* [`addListener('availabilityChange', ...)`](#addlisteneravailabilitychange-)
* [`addListener('systemAvailabilityChange', ...)`](#addlistenersystemavailabilitychange-)
* [`addListener('downloadProgress', ...)`](#addlistenerdownloadprogress-)
* [`addListener('textChunk', ...)`](#addlistenertextchunk-)
* [`addListener('generationStateChange', ...)`](#addlistenergenerationstatechange-)
* [`removeAllListeners()`](#removealllisteners)
* [`generateImage(...)`](#generateimage)
* [`systemAvailability()`](#systemavailability)
* [`download()`](#download)
* [`prompt(...)`](#prompt)
* [`endSession(...)`](#endsession)
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

Returns detailed text-model availability. Web feature-detects Chrome's Prompt API; unsupported browsers return `unavailable`.

**Returns:** <code>Promise&lt;<a href="#getavailabilityresult">GetAvailabilityResult</a>&gt;</code>

**Since:** 2.0.0

--------------------


### getImageAnalysisAvailability()

```typescript
getImageAnalysisAvailability() => Promise<GetImageAnalysisAvailabilityResult>
```

Returns image-analysis availability and the native backend that would handle vision input.
On iOS 27 builds compiled with Xcode 27 / Swift 6.4, returns the text-model `status` plus
`backend: 'foundation-models'` and `maxImages: 4`. Builds made with older Xcode report
`unavailable` and cannot include iOS 27 vision support. Android reports Gemini Nano prompt
APIs or a configured LiteRT-LM fallback. Web currently reports `unavailable` for image analysis.

**Returns:** <code>Promise&lt;<a href="#getimageanalysisavailabilityresult">GetImageAnalysisAvailabilityResult</a>&gt;</code>

**Since:** 2.1.0

--------------------


### downloadModel()

```typescript
downloadModel() => Promise<void>
```

Starts an Android or Chrome Web model download. On Web, invoke from a user gesture; Chrome manages the model.

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

Warms model resources. Web creates and destroys a temporary text session; `promptPrefix` is iOS-only.

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


### addListener('availabilityChange', ...)

```typescript
addListener(eventName: 'availabilityChange', listenerFunc: AvailabilityChangeListener) => Promise<PluginListenerHandle>
```

Listens for availability changes. Web emits changes observed during availability checks and session creation/download.

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

Listens for Android or Chrome Web download progress.

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


### addListener('generationStateChange', ...)

```typescript
addListener(eventName: 'generationStateChange', listenerFunc: GenerationStateChangeListener) => Promise<PluginListenerHandle>
```

Listens for generation start, completion, cancellation, and failure.

| Param              | Type                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'generationStateChange'</code>                                                    |
| **`listenerFunc`** | <code><a href="#generationstatechangelistener">GenerationStateChangeListener</a></code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

**Since:** 2.1.0

--------------------


### removeAllListeners()

```typescript
removeAllListeners() => Promise<void>
```

Removes every plugin listener.

**Since:** 1.0.0

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

Ends a legacy session. Already-ended or unknown session identifiers succeed without effect.

| Param         | Type                                                            |
| ------------- | --------------------------------------------------------------- |
| **`options`** | <code><a href="#endsessionoptions">EndSessionOptions</a></code> |

**Since:** 1.0.0

--------------------


### Interfaces


#### GetAvailabilityResult

Result returned by availability checks.

| Prop         | Type                                                  | Description                      | Since |
| ------------ | ----------------------------------------------------- | -------------------------------- | ----- |
| **`status`** | <code><a href="#availability">Availability</a></code> | Current text-model availability. | 2.0.0 |


#### GetImageAnalysisAvailabilityResult

Result returned by image-analysis availability checks.

| Prop            | Type                                                                  | Description                                                       | Since |
| --------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- | ----- |
| **`status`**    | <code><a href="#availability">Availability</a></code>                 | Current image-analysis availability.                              | 2.1.0 |
| **`backend`**   | <code><a href="#imageanalysisbackend">ImageAnalysisBackend</a></code> | Native backend that would handle image analysis when available.   | 2.1.0 |
| **`maxImages`** | <code>number</code>                                                   | Maximum images accepted in one generation for the active backend. | 2.1.0 |


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
Web creates and releases a temporary session, optionally using a chat's context.

| Prop               | Type                | Description                                                                  | Since |
| ------------------ | ------------------- | ---------------------------------------------------------------------------- | ----- |
| **`chatId`**       | <code>string</code> | Explicit chat identifier to prewarm on iOS or use as context for Web warmup. | 2.0.0 |
| **`sessionId`**    | <code>string</code> |                                                                              | 1.0.0 |
| **`promptPrefix`** | <code>string</code> | Optional prompt prefix used by Foundation Models.                            | 1.0.0 |


#### CreateChatResult

Result containing the plugin-owned chat identifier.

| Prop     | Type                | Description                                           | Since |
| -------- | ------------------- | ----------------------------------------------------- | ----- |
| **`id`** | <code>string</code> | Identifier required by generation and deletion calls. | 2.0.0 |


#### CreateChatOptions

Options for creating an owned chat.

| Prop               | Type                                                              | Description                                      | Since |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------ | ----- |
| **`instructions`** | <code>string</code>                                               | Persistent system instructions for this chat.    | 2.0.0 |
| **`history`**      | <code><a href="#chathistoryoptions">ChatHistoryOptions</a></code> | History limits applied on iOS, Android, and Web. | 2.0.0 |


#### ChatHistoryOptions

Chat history limits. All implementations retain instructions and discard oldest whole turns.

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

| Prop             | Type                                                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Since |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`chatId`**     | <code>string</code>                                             | Chat identifier returned by `createChat()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 2.0.0 |
| **`prompt`**     | <code>string</code>                                             | User prompt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 2.0.0 |
| **`images`**     | <code>ImageInput[]</code>                                       | Images supplied to a vision-capable backend. On iOS 27+ (builds compiled with Xcode 27 / Swift 6.4), Foundation Models `Attachment` accepts up to 4 images of at most 32 MiB each via readable absolute paths, `file://` URLs, raw Base64, or Base64 data URLs; after a successful generation, attachments are removed from retained chat history while the text prompt and response remain. Android uses Gemini Nano prompt APIs or a configured LiteRT-LM fallback with absolute/`file://`/`content://`/Base64 input and ML Kit aggregate pixel limits. Web and text-only backends reject image input with `LOCAL_LLM_UNSUPPORTED`. | 2.1.0 |
| **`imagePaths`** | <code>string[]</code>                                           | Local image paths supplied to a vision-capable Android LiteRT-LM fallback model. Absolute paths, `file://` URLs, and readable `content://` URIs are accepted. This compatibility path retains the v2.0 LiteRT-LM routing even when ML Kit is available.                                                                                                                                                                                                                                                                                                                                                                               | 2.0.0 |
| **`options`**    | <code><a href="#generationoptions">GenerationOptions</a></code> | Optional generation controls.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 2.0.0 |


#### ImageUriInput

Local URI image input.

| Prop         | Type                | Description                                                                                                                                     | Since |
| ------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **`uri`**    | <code>string</code> | Image URI. iOS accepts readable absolute local paths and `file://` URLs. Android accepts absolute paths, `file://` URLs, and `content://` URIs. | 2.1.0 |
| **`base64`** |                     | Base64 and URI inputs are mutually exclusive.                                                                                                   | 2.1.0 |


#### Base64ImageInput

Base64-encoded image input.

| Prop         | Type                | Description                                                                                            | Since |
| ------------ | ------------------- | ------------------------------------------------------------------------------------------------------ | ----- |
| **`base64`** | <code>string</code> | Raw Base64 image bytes or a `data:image/...;base64,...` URL. The decoded image must not exceed 32 MiB. | 2.1.0 |
| **`uri`**    |                     | Base64 and URI inputs are mutually exclusive.                                                          | 2.1.0 |


#### GenerationOptions

Cross-platform text generation controls. Unsupported values are rejected, not clamped. Chrome Web requires these controls to be omitted.

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


#### PluginListenerHandle

| Prop         | Type                                      |
| ------------ | ----------------------------------------- |
| **`remove`** | <code>() =&gt; Promise&lt;void&gt;</code> |


#### SystemAvailabilityResponse

| Prop         | Type                                                        | Description                                                                                  | Since |
| ------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----- |
| **`status`** | <code><a href="#llmavailability">LLMAvailability</a></code> | Legacy availability value. Detailed states are folded into the original four-value contract. | 1.0.0 |


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


#### GenerationStateChangeEvent

Lifecycle event emitted for both `generateText()` and `streamText()`.

| Prop               | Type                                                            | Description                                                       | Since |
| ------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------- | ----- |
| **`chatId`**       | <code>string</code>                                             | Chat that owns the generation.                                    | 2.1.0 |
| **`generationId`** | <code>string</code>                                             | Native generation identifier, available from the `started` event. | 2.1.0 |
| **`state`**        | <code><a href="#generationstate">GenerationState</a></code>     | Current lifecycle state.                                          | 2.1.0 |
| **`errorCode`**    | <code><a href="#localllmerrorcode">LocalLLMErrorCode</a></code> | Stable error code for `cancelled` and `failed` states.            | 2.1.0 |


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


### Type Aliases


#### Availability

The semantic availability of the on-device text model.

<code>'available' | 'device-not-eligible' | 'not-enabled' | 'downloadable' | 'downloading' | 'not-ready' | 'unavailable'</code>


#### ImageAnalysisBackend

Native backend selected for on-device image analysis.

<code>'foundation-models' | 'ml-kit-prompt' | 'litert-lm'</code>


#### ImageInput

Image reference for vision-capable text generation.

<code><a href="#imageuriinput">ImageUriInput</a> | <a href="#base64imageinput">Base64ImageInput</a></code>


#### StreamTextOptions

Options for native streaming generation.

<code><a href="#generatetextoptions">GenerateTextOptions</a></code>


#### StreamTextResult

Final result of a native streaming generation.

<code><a href="#generatetextresult">GenerateTextResult</a></code>


#### AvailabilityChangeListener

Listener for availability changes.

<code>(event: <a href="#getavailabilityresult">GetAvailabilityResult</a>): void</code>


#### SystemAvailabilityChangeListener

<code>(event: <a href="#systemavailabilityresponse">SystemAvailabilityResponse</a>): void</code>


#### LLMAvailability

<code>'available' | 'unavailable' | 'notready' | 'downloadable'</code>


#### DownloadProgressListener

Listener for model download progress.

<code>(event: <a href="#downloadprogressevent">DownloadProgressEvent</a>): void</code>


#### TextChunkListener

Listener for native generation chunks.

<code>(event: <a href="#textchunkevent">TextChunkEvent</a>): void</code>


#### GenerationStateChangeListener

Listener for native generation lifecycle changes.

<code>(event: <a href="#generationstatechangeevent">GenerationStateChangeEvent</a>): void</code>


#### GenerationState

Native generation lifecycle state.

<code>'started' | 'completed' | 'cancelled' | 'failed'</code>


#### LocalLLMErrorCode

Stable Local LLM error codes.

<code>'LOCAL_LLM_NOT_AVAILABLE' | 'LOCAL_LLM_DEVICE_NOT_ELIGIBLE' | 'LOCAL_LLM_NOT_ENABLED' | 'LOCAL_LLM_MODEL_NOT_READY' | 'LOCAL_LLM_MODEL_DOWNLOAD_REQUIRED' | 'LOCAL_LLM_CONTEXT_WINDOW_EXCEEDED' | 'LOCAL_LLM_CHAT_NOT_FOUND' | 'LOCAL_LLM_CHAT_BUSY' | 'LOCAL_LLM_GENERATION_NOT_FOUND' | 'LOCAL_LLM_GENERATION_CANCELLED' | 'LOCAL_LLM_INVALID_OPTIONS' | 'LOCAL_LLM_UNSUPPORTED' | 'LOCAL_LLM_IMAGE_NOT_READABLE' | 'LOCAL_LLM_IMAGE_TOO_LARGE' | 'LOCAL_LLM_GENERATION_FAILED' | 'LOCAL_LLM_IMAGE_GENERATION_FAILED' | 'LOCAL_LLM_UNKNOWN_ERROR'</code>

</docgen-api>
