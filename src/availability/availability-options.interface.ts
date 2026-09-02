/**
 * The semantic availability of the on-device text model.
 *
 * @since 2.0.0
 * @example
 * const status: Availability = 'available';
 */
export type Availability =
  | 'available'
  | 'device-not-eligible'
  | 'not-enabled'
  | 'downloadable'
  | 'downloading'
  | 'not-ready'
  | 'unavailable';

/**
 * Native backend selected for on-device image analysis.
 *
 * @since 2.1.0
 * @example
 * const backend: ImageAnalysisBackend = 'foundation-models';
 */
export type ImageAnalysisBackend = 'foundation-models' | 'ml-kit-prompt' | 'litert-lm';

/**
 * Result returned by image-analysis availability checks.
 *
 * @since 2.1.0
 * @example
 * const { status } = await LocalLLM.getImageAnalysisAvailability();
 */
export interface GetImageAnalysisAvailabilityResult {
  /**
   * Current image-analysis availability.
   *
   * @since 2.1.0
   * @example
   * result.status === 'available';
   */
  status: Availability;
  /**
   * Native backend that would handle image analysis when available.
   *
   * @since 2.1.0
   * @example
   * result.backend === 'foundation-models';
   */
  backend?: ImageAnalysisBackend;
  /**
   * Maximum images accepted in one generation for the active backend.
   *
   * @since 2.1.0
   * @example
   * result.maxImages === 4;
   */
  maxImages?: number;
}

/**
 * Result returned by availability checks.
 *
 * @since 2.0.0
 * @example
 * const { status } = await LocalLLM.getAvailability();
 */
export interface GetAvailabilityResult {
  /**
   * Current text-model availability.
   *
   * @since 2.0.0
   * @example
   * result.status === 'available';
   */
  status: Availability;
}

/**
 * Configures an opt-in Android LiteRT-LM fallback used when Gemini Nano is unavailable.
 * The model must already exist as an app asset or a readable app-managed file. iOS and Web reject this API.
 *
 * @since 2.0.0
 * @example
 * await LocalLLM.configureFallbackModel({ path: '/android_asset/gemma.litertlm' });
 */
export interface ConfigureFallbackModelOptions {
  /**
   * `.litertlm` model path. Use `/android_asset/...` for bundled assets or an absolute app-managed file path.
   *
   * @since 2.0.0
   * @example
   * options.path = '/android_asset/gemma.litertlm';
   */
  path: string;
  /**
   * Combined context capacity passed to LiteRT-LM. Defaults to 4096.
   *
   * @since 2.0.0
   * @example
   * options.maxTokens = 4096;
   */
  maxTokens?: number;
  /**
   * Maximum images accepted by one generation for a vision-capable model. Defaults to 1.
   *
   * @since 2.0.0
   * @example
   * options.maxImages = 1;
   */
  maxImages?: number;
  /**
   * Initializes LiteRT-LM's vision pipeline. Defaults to `true`; set to `false` only for a
   * text-only model.
   *
   * @since 2.0.0
   * @example
   * options.supportsImages = true;
   */
  supportsImages?: boolean;
}

/**
 * Warmup options. Android performs global model warmup; iOS can prewarm a chat.
 *
 * @since 1.0.0
 * @example
 * await LocalLLM.warmup({ chatId: chat.id });
 */
export interface WarmupOptions {
  /**
   * Explicit chat identifier to prewarm on iOS.
   *
   * @since 2.0.0
   * @example
   * options.chatId = chat.id;
   */
  chatId?: string;
  /**
   * @deprecated Legacy alias for `chatId`.
   *
   * @since 1.0.0
   * @example
   * options.sessionId = 'session-1';
   */
  sessionId?: string;
  /**
   * Optional prompt prefix used by Foundation Models.
   *
   * @since 1.0.0
   * @example
   * options.promptPrefix = 'You are a helpful assistant.';
   */
  promptPrefix?: string;
}
