# Events

Plugin events for availability, download progress, streaming chunks, and generation lifecycle. Related guides: [Availability](./availability.md), [Chat](./chat.md), [Setup](./setup.md), [Error Handling](./errors.md).

| Event                   | Description                                                                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `availabilityChange`    | Fired when text-model availability changes while listeners are registered.                                                                                                                                     |
| `downloadProgress`      | Fired during Android `downloadModel()`. Intermediate events may include only `downloadedBytes` because ML Kit does not expose a total byte count; `progress` is `0` at start and `1` on completion when known. |
| `textChunk`             | Fired during `streamText()` with incremental text for the matching `chatId` / `generationId`.                                                                                                                  |
| `generationStateChange` | Fired for accepted text generations with `started`, then `completed`, `cancelled`, or `failed`. Terminal error events include a stable `errorCode`.                                                            |

Remove listeners with the returned `PluginListenerHandle.remove()` or `removeAllListeners()`.
