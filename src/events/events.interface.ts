import type { GetAvailabilityResult } from '../availability';
import type { SystemAvailabilityResponse } from '../legacy';
import type { LocalLLMErrorCode } from '../shared';

/**
 * Incremental text emitted by `streamText()`.
 *
 * @since 2.0.0
 * @example
 * LocalLLM.addListener('textChunk', (event: TextChunkEvent) => console.log(event.text));
 */
export interface TextChunkEvent {
  /**
   * Chat that owns the generation.
   *
   * @since 2.0.0
   * @example
   * event.chatId === chat.id;
   */
  chatId: string;
  /**
   * Identifier of this generation.
   *
   * @since 2.0.0
   * @example
   * event.generationId === result.generationId;
   */
  generationId: string;
  /**
   * Newly generated text only, not the accumulated snapshot.
   *
   * @since 2.0.0
   * @example
   * process.stdout.write(event.text);
   */
  text: string;
}

/**
 * Native generation lifecycle state.
 *
 * @since 2.1.0
 * @example
 * event.state === 'started';
 */
export type GenerationState = 'started' | 'completed' | 'cancelled' | 'failed';

/**
 * Lifecycle event emitted for both `generateText()` and `streamText()`.
 *
 * @since 2.1.0
 * @example
 * LocalLLM.addListener('generationStateChange', (event) => console.log(event.state));
 */
export interface GenerationStateChangeEvent {
  /**
   * Chat that owns the generation.
   *
   * @since 2.1.0
   * @example
   * event.chatId === chat.id;
   */
  chatId: string;
  /**
   * Native generation identifier, available from the `started` event.
   *
   * @since 2.1.0
   * @example
   * console.log(event.generationId);
   */
  generationId: string;
  /**
   * Current lifecycle state.
   *
   * @since 2.1.0
   * @example
   * event.state === 'completed';
   */
  state: GenerationState;
  /**
   * Stable error code for `cancelled` and `failed` states.
   *
   * @since 2.1.0
   * @example
   * event.errorCode === 'LOCAL_LLM_GENERATION_CANCELLED';
   */
  errorCode?: LocalLLMErrorCode;
}

/**
 * Model download progress. Intermediate Android events omit `progress` because ML Kit has no total byte count.
 *
 * @since 2.0.0
 * @example
 * LocalLLM.addListener('downloadProgress', (event: DownloadProgressEvent) => console.log(event.progress));
 */
export interface DownloadProgressEvent {
  /**
   * Known normalized progress: 0 at start and 1 at completion.
   *
   * @since 2.0.0
   * @example
   * event.progress === 1;
   */
  progress?: number;
  /**
   * Bytes downloaded so far when supplied by ML Kit.
   *
   * @since 2.0.0
   * @example
   * console.log(event.downloadedBytes);
   */
  downloadedBytes?: number;
  /**
   * Total bytes, when a platform SDK supplies it. Currently omitted on Android.
   *
   * @since 2.0.0
   * @example
   * console.log(event.totalBytes);
   */
  totalBytes?: number;
}

/**
 * Listener for availability changes.
 *
 * @since 2.0.0
 * @example
 * const listener: AvailabilityChangeListener = (event) => console.log(event.status);
 */
export type AvailabilityChangeListener = (event: GetAvailabilityResult) => void;

/**
 * @deprecated Use {@link AvailabilityChangeListener}.
 *
 * @since 1.0.0
 * @example
 * const listener: SystemAvailabilityChangeListener = (event) => console.log(event.status);
 */
export type SystemAvailabilityChangeListener = (event: SystemAvailabilityResponse) => void;

/**
 * Listener for model download progress.
 *
 * @since 2.0.0
 * @example
 * const listener: DownloadProgressListener = (event) => console.log(event.progress);
 */
export type DownloadProgressListener = (event: DownloadProgressEvent) => void;

/**
 * Listener for native generation chunks.
 *
 * @since 2.0.0
 * @example
 * const listener: TextChunkListener = (event) => console.log(event.text);
 */
export type TextChunkListener = (event: TextChunkEvent) => void;

/**
 * Listener for native generation lifecycle changes.
 *
 * @since 2.1.0
 * @example
 * const listener: GenerationStateChangeListener = (event) => console.log(event.state);
 */
export type GenerationStateChangeListener = (event: GenerationStateChangeEvent) => void;
