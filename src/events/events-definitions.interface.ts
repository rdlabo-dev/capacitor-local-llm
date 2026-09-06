import type { PluginListenerHandle } from '@capacitor/core';

import type {
  AvailabilityChangeListener,
  DownloadProgressListener,
  GenerationStateChangeListener,
  SystemAvailabilityChangeListener,
  TextChunkListener,
} from './events.interface';

export interface EventsDefinitions {
  /**
   * Listens for availability changes. Web emits changes observed during availability checks and session creation/download.
   *
   * @group Events
   * @since 2.0.0
   * @example
   * await LocalLLM.addListener('availabilityChange', (event) => console.log(event.status));
   */
  addListener(eventName: 'availabilityChange', listenerFunc: AvailabilityChangeListener): Promise<PluginListenerHandle>;

  /**
   * @deprecated Use `availabilityChange`.
   *
   * @group Events
   * @since 1.0.0
   * @example
   * await LocalLLM.addListener('systemAvailabilityChange', (event) => console.log(event.status));
   */
  addListener(
    eventName: 'systemAvailabilityChange',
    listenerFunc: SystemAvailabilityChangeListener,
  ): Promise<PluginListenerHandle>;

  /**
   * Listens for Android or Chrome Web download progress.
   *
   * @group Events
   * @since 2.0.0
   * @example
   * await LocalLLM.addListener('downloadProgress', (event) => console.log(event.progress));
   */
  addListener(eventName: 'downloadProgress', listenerFunc: DownloadProgressListener): Promise<PluginListenerHandle>;

  /**
   * Listens for native text chunks.
   *
   * @group Events
   * @since 2.0.0
   * @example
   * await LocalLLM.addListener('textChunk', (event) => console.log(event.text));
   */
  addListener(eventName: 'textChunk', listenerFunc: TextChunkListener): Promise<PluginListenerHandle>;

  /**
   * Listens for generation start, completion, cancellation, and failure.
   *
   * @group Events
   * @since 2.1.0
   * @example
   * await LocalLLM.addListener('generationStateChange', (event) => console.log(event.state));
   */
  addListener(
    eventName: 'generationStateChange',
    listenerFunc: GenerationStateChangeListener,
  ): Promise<PluginListenerHandle>;

  /**
   * Removes every plugin listener.
   *
   * @group Events
   * @since 1.0.0
   * @example
   * await LocalLLM.removeAllListeners();
   */
  removeAllListeners(): Promise<void>;
}
