import type {
  ConfigureFallbackModelOptions,
  GetAvailabilityResult,
  GetImageAnalysisAvailabilityResult,
  WarmupOptions,
} from './availability-options.interface';

export interface AvailabilityDefinitions {
  /**
   * Returns detailed text-model availability.
   *
   * @group Availability
   * @since 2.0.0
   * @example
   * await LocalLLM.getAvailability();
   */
  getAvailability(): Promise<GetAvailabilityResult>;

  /**
   * Returns image-analysis availability and the native backend that would handle vision input.
   * On iOS 27 builds compiled with Xcode 27 / Swift 6.4, returns the text-model `status` plus
   * `backend: 'foundation-models'` and `maxImages: 4`. Builds made with older Xcode report
   * `unavailable` and cannot include iOS 27 vision support. Android reports Gemini Nano prompt
   * APIs or a configured LiteRT-LM fallback. Web rejects this API.
   *
   * @group Availability
   * @since 2.1.0
   * @example
   * await LocalLLM.getImageAnalysisAvailability();
   */
  getImageAnalysisAvailability(): Promise<GetImageAnalysisAvailabilityResult>;

  /**
   * Starts an Android model download.
   *
   * @group Availability
   * @since 2.0.0
   * @example
   * await LocalLLM.downloadModel();
   */
  downloadModel(): Promise<void>;

  /**
   * Initializes an explicit Android LiteRT-LM fallback model. Gemini Nano remains preferred when available.
   * Configuring a model performs local file I/O and may take significant time. iOS and Web reject this API.
   *
   * @group Availability
   * @since 2.0.0
   * @example
   * await LocalLLM.configureFallbackModel({ path: '/android_asset/gemma.litertlm' });
   */
  configureFallbackModel(options: ConfigureFallbackModelOptions): Promise<void>;

  /**
   * Warms native model resources.
   *
   * @group Availability
   * @since 1.0.0
   * @example
   * await LocalLLM.warmup();
   */
  warmup(options?: WarmupOptions): Promise<void>;
}
