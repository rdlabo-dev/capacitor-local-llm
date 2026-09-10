---
title: Availability and platform behavior
---

# Availability and platform behavior

How to interpret [`getAvailability()`](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/api#getavailability) statuses and platform-specific runtime behavior. Related guides: [Setup](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/setup), [Android fallback model](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/android-fallback), [Chat](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/chat), [Images](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/images), [Events](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/events).

## Availability

[`getAvailability()`](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/api#getavailability) returns a semantic `status` value:

| Status                | Meaning                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `available`           | The text model is ready for generation.                                                                                                                                                   |
| `device-not-eligible` | The device or OS version does not support the on-device text model. iOS reports this precisely; Android's `FeatureStatus.UNAVAILABLE` does not expose a reason and maps to `unavailable`. |
| `not-enabled`         | The device supports on-device AI but the user has not enabled it (e.g. Apple Intelligence is off). Primarily reported on iOS.                                                             |
| `downloadable`        | The model can be downloaded (Android).                                                                                                                                                    |
| `downloading`         | A model download is in progress (Android).                                                                                                                                                |
| `not-ready`           | The model exists but is still initializing.                                                                                                                                               |
| `unavailable`         | The model is unavailable for another reason.                                                                                                                                              |

Subscribe to `availabilityChange` (or the deprecated `systemAvailabilityChange` alias) to receive updates while listeners are registered. On Android the plugin polls while listeners are active.

The deprecated `systemAvailability()` and `systemAvailabilityChange` fold detailed statuses into the original four-value contract: `available`, `unavailable`, `notready`, and `downloadable`. `downloading` and `not-ready` map to `notready`; `device-not-eligible`, `not-enabled`, and `unavailable` map to `unavailable`.

## Platform Behavior

### iOS

- **Text LLM requires iOS 26 and Apple Intelligence.** Below iOS 26, availability is reported as `device-not-eligible`. Only select iPhones (iPhone 15 Pro or later) and iPads support Apple Intelligence. [More information here](https://www.apple.com/apple-intelligence/).
- **Chats use the native Foundation Models transcript.** Conversation state lives in `LanguageModelSession`. Before generation, the plugin also applies a conservative character budget against the model's native `contextSize`, including instructions, the current prompt, and output headroom. When any limit is exceeded, it drops the oldest complete prompt/response turns, preserves instructions, and recreates the session.
- **`warmup({ chatId, promptPrefix })` prewarms a specific chat** created with `createChat()`.
- **`cancelGeneration()` cancels the in-flight `Task`** for the chat. The `streamText()` / `generateText()` promise rejects with `LOCAL_LLM_GENERATION_CANCELLED`; any text already streamed via `textChunk` remains in your UI.
- **Image analysis and image generation** details are in [Images](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/images).

### Android

- **Conversation history is structured in memory** by the plugin. Each chat stores user/assistant turns and trims by `history.maxMessages` (default **20**) and `history.maxCharacters` (default **12000**). Gemini Nano then uses ML Kit `countTokens()` to fit the context. LiteRT-LM uses a conservative one-character-per-token heuristic plus prompt and image reserves because version 0.16.1 has no stable token-count API. Both paths drop oldest whole turns; system instructions are stored separately and never trimmed. History does not persist across app restarts.
- **`warmup()` warms the model globally** and ignores `chatId` / `promptPrefix`.
- **`cancelGeneration()` is best-effort.** It cancels the plugin's coroutine; ML Kit may already have emitted partial output before cancellation completes. The promise rejects with `LOCAL_LLM_GENERATION_CANCELLED` when cancellation is observed.
- **Unsupported `GenerationOptions` values are rejected** with `LOCAL_LLM_INVALID_OPTIONS`, not silently clamped. `maxOutputTokens` must be within `1..min(device token limit, 4096)`; when omitted, the plugin default is **256**.
- **Native model operations run serially.** The plugin mutex protects Gemini Nano and LiteRT-LM generation, fallback configuration, warmup, download, and teardown, so concurrent generations in different chats are queued.
- **Not all API 29+ devices support Gemini Nano.** The device must have a compatible on-device AI stack. [More information here](https://developers.google.com/ml-kit/genai#device-support).
- **Apps may explicitly configure a LiteRT-LM fallback** when Gemini Nano is unavailable. Once initialization completes, `getAvailability()` reports `available`. See [Android fallback model](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/android-fallback).
- **Image analysis** backend selection is documented in [Images](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/images).
- **On-device models cannot be used while the app is in the background.** Inference requests made while backgrounded will fail.
- **AICore enforces per-app inference quotas.** Excessive requests can return busy or quota errors from the underlying SDK — consider exponential backoff.

### Web (Chrome)

Text availability maps Chrome's `available`, `downloadable`, `downloading`, and `unavailable` states directly. Missing APIs report `unavailable`. Availability events reflect changes observed by plugin checks and session creation/download, rather than background polling. Image analysis currently reports `unavailable`. See [Web](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/web) for setup, supported methods, and generation controls.
