---
title: Setup
---

# Setup

Platform requirements and native project setup for iOS and Android. Related guides: [Android fallback model](./android-fallback.md), [Availability](./availability.md), [Images](./images.md).

## Platform Requirements

| Platform | Minimum OS              | Notes                                                                                                                                                                  |
| -------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS      | **18.4**                | Image generation requires iOS 18.4+. Text LLM requires iOS 26+. Image analysis uses Foundation Models `Attachment` on iOS 27+ when compiled with Xcode 27 / Swift 6.4. |
| Android  | **API 29 (Android 10)** | Gemini Nano via ML Kit requires a compatible physical device (e.g. Pixel 9+).                                                                                          |

## iOS Setup

CocoaPods users need no additional configuration. Foundation Models and Image Playground are system frameworks available automatically on supported devices with Apple Intelligence enabled.

For Capacitor projects using Swift Package Manager, the current Capacitor CLI generates `CapApp-SPM/Package.swift` with an iOS 18.0 deployment target and does not preserve the required minor version. After every `npx cap sync ios`, change its platform declaration to `platforms: [.iOS("18.4")]`. The included example app automates this with `npm run cap:sync`; see [`example-app/scripts/sync-capacitor.mjs`](https://github.com/rdlabo-dev/capacitor-local-llm/blob/main/example-app/scripts/sync-capacitor.mjs) for the small, fail-fast wrapper.

Call [`getAvailability()`](../README.md#getavailability) at runtime to check whether the text model is ready before creating chats or generating text. Check [`getImageAnalysisAvailability()`](../README.md#getimageanalysisavailability) separately before supplying images because text and vision availability can differ. See [Images](./images.md) for image analysis details.

On iOS versions below 26, only `getAvailability()` reports `'device-not-eligible'` for the text LLM. Text and chat APIs such as `createChat()`, `deleteChat()`, `generateText()`, and `streamText()` reject with `LOCAL_LLM_UNSUPPORTED`. Image generation via `generateImage()` is available on iOS 18.4+.

[`downloadModel()`](../README.md#downloadmodel) is not available on iOS — the OS manages the model. Use `getAvailability()` or the `availabilityChange` event to observe readiness.

## Android Setup

The plugin's minimum Android SDK is **29**, higher than Capacitor's current default (24). Update `android/variables.gradle` in your application:

```gradle
ext {
    minSdkVersion = 29
}
```

Gemini Nano is distributed via Google Play Services and must be downloaded to the device before use. The model is not bundled with your app.

When Gemini Nano is unavailable, apps may configure an explicit LiteRT-LM fallback. See [Android fallback model](./android-fallback.md).

### Check availability and download

Call [`getAvailability()`](../README.md#getavailability) to inspect the current state. If the status is `downloadable`, start the download with [`downloadModel()`](../README.md#downloadmodel) and listen for `downloadProgress` and/or `availabilityChange` until the status becomes `available`.

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
