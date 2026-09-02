/**
 * Image generation options. Image generation is available only on iOS 18.4+.
 *
 * @since 1.0.0
 * @example
 * await LocalLLM.generateImage({ prompt: 'A mountain lake at sunrise' });
 */
export interface GenerateImageOptions {
  /**
   * Image description.
   *
   * @since 1.0.0
   * @example
   * options.prompt = 'A mountain lake at sunrise';
   */
  prompt: string;
  /**
   * Optional base64 reference images.
   *
   * @since 1.0.0
   * @example
   * options.promptImages = [base64Image];
   */
  promptImages?: string[];
  /**
   * Number of variations. Defaults to 1.
   *
   * @since 1.0.0
   * @example
   * options.count = 2;
   */
  count?: number;
}

/**
 * Image generation result.
 *
 * @since 1.0.0
 * @example
 * const { pngBase64Images } = await LocalLLM.generateImage({ prompt: 'A lake' });
 */
export interface GenerateImageResponse {
  /**
   * Raw base64 PNG images without a data-URI prefix.
   *
   * @since 1.0.0
   * @example
   * const dataUrl = `data:image/png;base64,${response.pngBase64Images[0]}`;
   */
  pngBase64Images: string[];
}
