import type { GenerateImageOptions, GenerateImageResponse } from './image-options.interface';

export interface ImageDefinitions {
  /**
   * Generates PNG images on iOS.
   *
   * @group Image
   * @since 1.0.0
   * @example
   * await LocalLLM.generateImage({ prompt: 'A lake' });
   */
  generateImage(options: GenerateImageOptions): Promise<GenerateImageResponse>;
}
