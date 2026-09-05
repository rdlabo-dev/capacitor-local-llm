---
title: Error Handling
---

# Error Handling

Stable error codes exposed by native Capacitor errors and the web stub. Related guides: [Chat](./chat.md), [Availability](./availability.md), [Images](./images.md), [Migration](./migration.md).

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

## `LocalLLMErrorCode`

| Code                                | Description                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `LOCAL_LLM_NOT_AVAILABLE`           | The on-device text model is unavailable.                                            |
| `LOCAL_LLM_DEVICE_NOT_ELIGIBLE`     | The device or OS does not support on-device text generation.                        |
| `LOCAL_LLM_NOT_ENABLED`             | On-device AI is supported but not enabled by the user.                              |
| `LOCAL_LLM_MODEL_NOT_READY`         | The model is downloading or initializing (`downloading` / `not-ready`).             |
| `LOCAL_LLM_MODEL_DOWNLOAD_REQUIRED` | The model must be downloaded first (`downloadable`).                                |
| `LOCAL_LLM_CONTEXT_WINDOW_EXCEEDED` | The prompt and requested output cannot fit even after removable history is trimmed. |
| `LOCAL_LLM_CHAT_NOT_FOUND`          | The `chatId` does not exist.                                                        |
| `LOCAL_LLM_CHAT_BUSY`               | A generation is already in progress for this chat.                                  |
| `LOCAL_LLM_GENERATION_NOT_FOUND`    | No matching in-flight generation (or `generationId` mismatch).                      |
| `LOCAL_LLM_GENERATION_CANCELLED`    | The generation was cancelled via `cancelGeneration()` or `deleteChat()`.            |
| `LOCAL_LLM_INVALID_OPTIONS`         | An option value is missing or out of range.                                         |
| `LOCAL_LLM_UNSUPPORTED`             | The method or feature is not supported on this platform or OS version.              |
| `LOCAL_LLM_IMAGE_NOT_READABLE`      | An image URI cannot be resolved, opened, or decoded.                                |
| `LOCAL_LLM_IMAGE_TOO_LARGE`         | An image exceeds the platform input-size policy.                                    |
| `LOCAL_LLM_GENERATION_FAILED`       | Generation failed for a stable, platform-mapped reason.                             |
| `LOCAL_LLM_IMAGE_GENERATION_FAILED` | Image generation failed (e.g. no available style).                                  |
| `LOCAL_LLM_UNKNOWN_ERROR`           | An unexpected underlying SDK error. Check `message` for details.                    |
