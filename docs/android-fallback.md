---
title: Android fallback model
---

# Android fallback model

When ML Kit reports Gemini Nano unavailable, configure an explicit LiteRT-LM fallback. Related guides: [Setup](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/setup), [Availability](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/availability), [Images](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/images).

## Gemini Nano unavailable

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
  images: [{ uri: 'content://com.example.files/photo.jpg' }],
});
```

Each `images[]` item accepts exactly one of `uri` or `base64`. Android URI input accepts readable absolute paths, decoded `file://` URLs without an authority, and `content://` URIs. Base64 input accepts raw encoded bytes or a `data:image/...;base64,...` URL. The deprecated `imagePaths` option remains for compatibility and retains its v2.0 behavior of routing only to a configured LiteRT-LM fallback, even when ML Kit is available; do not pass both options. Each decoded image is limited to 32 MiB. Content URIs and Base64 inputs are converted on an I/O dispatcher to bounded temporary app cache files and removed after generation. Images apply only to the current turn and are not retained in chat history.

Call `getImageAnalysisAvailability()` before image input. Android treats ML Kit Prompt's common `available` status as availability for its documented image-input API and prefers that backend; otherwise it uses a configured image-capable LiteRT-LM fallback. ML Kit decodes images through Android APIs and bounds preprocessing to a 2048-pixel longest edge and roughly 4 megapixels per image, with a maximum of 4 images and roughly 8 megapixels in total per request. Consequently, `maxImages: 4` is only a count limit and four large images can still exceed the aggregate pixel budget. LiteRT-LM receives the resolved file directly. A text-only fallback rejects image input with `LOCAL_LLM_UNSUPPORTED` rather than silently ignoring it.

The ML Kit multi-image path is experimental until it has completed physical-device acceptance testing on a compatible Gemini Nano device. Do not treat ML Kit image analysis as production-ready solely from `getImageAnalysisAvailability()`; validate generate/stream, cancellation, multiple images, content URI cleanup, and oversized-image errors on every supported device family.

Prefer an app-managed absolute model path for large models. `/android_asset/...` is supported for convenience, but the plugin must copy that asset to private app files because the native engine needs a real path. It reuses the versioned private copy within the same app version, closes the old engine on reconfiguration, and removes older copies of the same asset after a successful new initialization. During an app upgrade, peak storage can temporarily include the packaged asset, the previous private copy, and the new temporary copy. The active engine remains loaded for the plugin lifetime; app-managed files must not be replaced or deleted until the plugin is destroyed or another model is successfully configured.

The fallback uses LiteRT-LM's structured messages, native streaming flow, and cancellation API. It currently runs the text and vision pipelines on CPU for broad compatibility and serializes generation, configuration, warmup, download, and teardown through the same plugin mutex. `downloadModel()` continues to manage only the ML Kit system model. LiteRT-LM is evolving quickly, so treat the fallback as opt-in and perform physical-device soak tests before release.

The Android dependency pins `kotlinx-coroutines` 1.11.0 because the LiteRT-LM 0.16.1 binary uses the newer `SendChannel` default-method ABI while its published POM still declares 1.9.0. Removing or downgrading that pin causes a `NoSuchMethodError` when native streaming completes; see upstream [LiteRT-LM issue #2812](https://github.com/google-ai-edge/LiteRT-LM/issues/2812).

The model is opt-in, but the LiteRT-LM runtime dependency is included in every Android consumer. Version 0.16.1 adds an AAR of roughly 20 MB compressed and native libraries of roughly 22 MB per arm64 build (universal debug APKs are larger; Android App Bundles normally split by ABI). Review final APK/AAB size and supported 64-bit ABIs. LiteRT-LM is Apache-2.0; model weights have separate licenses and usage terms. Preserve the runtime's `LICENSE` and `THIRD_PARTY_NOTICE.txt` in your app's OSS notices and review the selected model's terms independently.
