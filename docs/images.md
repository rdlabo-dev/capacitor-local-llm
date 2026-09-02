# Images

Image analysis (vision input) and image generation. Related guides: [Setup](./setup.md), [Android fallback model](./android-fallback.md), [Availability](./availability.md), [Chat](./chat.md).

Check [`getImageAnalysisAvailability()`](../README.md#getimageanalysisavailability) separately from text-model [`getAvailability()`](../README.md#getavailability) before supplying images, because text and vision availability can differ.

## Image analysis

### iOS

Image analysis uses native Foundation Models `Attachment` on iOS 27+ when the plugin is compiled with Xcode 27 / Swift 6.4. Each `images[]` item accepts either a readable local `uri` (`content://` is Android-only) or raw Base64 / a Base64 data URL. Up to 4 images are accepted, each limited to 32 MiB after decoding. Base64 inputs are converted to bounded temporary native files and removed after generation. On iOS 27 builds, `getImageAnalysisAvailability()` returns the text-model `status` plus `backend: 'foundation-models'` and `maxImages: 4`; builds made with older Xcode report `unavailable` and cannot include iOS 27 vision support. Check it independently before attaching images. After a successful generation, image attachments are removed from retained chat history while the text prompt and response remain.

### Android

Image analysis selects a native backend explicitly. `getImageAnalysisAvailability()` reports `ml-kit-prompt` when ML Kit Prompt's common feature status is `available`, because that SDK status does not expose a separate vision-capability flag. It reports `litert-lm` when a configured vision fallback is ready.

Android image input formats, ML Kit pixel budgets, the experimental multi-image path, `imagePaths` compatibility, and LiteRT-LM vision fallback configuration are documented in [Android fallback model](./android-fallback.md).

## Image generation (iOS only)

Image generation is available on iOS 18.4+ via `generateImage()`.

```typescript
import { LocalLLM } from '@rdlabo/capacitor-local-llm';

const { pngBase64Images } = await LocalLLM.generateImage({
  prompt: 'A serene mountain lake at sunrise, photorealistic',
  count: 2,
});

const src = `data:image/png;base64,${pngBase64Images[0]}`;
```
