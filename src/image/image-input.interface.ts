/**
 * Image reference for vision-capable text generation.
 *
 * @since 2.1.0
 * @example
 * const image: ImageInput = { base64: encodedImage };
 */
export type ImageInput = ImageUriInput | Base64ImageInput;

/**
 * Local URI image input.
 *
 * @since 2.1.0
 * @example
 * const image: ImageUriInput = { uri: 'file:///data/user/0/com.example.app/files/photo.jpg' };
 */
export interface ImageUriInput {
  /**
   * Image URI. iOS accepts readable absolute local paths and `file://` URLs.
   * Android accepts absolute paths, `file://` URLs, and `content://` URIs.
   *
   * @since 2.1.0
   * @example
   * image.uri = 'content://media/external/images/media/42';
   */
  uri: string;
  /**
   * Base64 and URI inputs are mutually exclusive.
   *
   * @since 2.1.0
   */
  base64?: never;
}

/**
 * Base64-encoded image input.
 *
 * @since 2.1.0
 * @example
 * const image: Base64ImageInput = { base64: encodedImage };
 */
export interface Base64ImageInput {
  /**
   * Raw Base64 image bytes or a `data:image/...;base64,...` URL. The decoded image must not
   * exceed 32 MiB.
   *
   * @since 2.1.0
   * @example
   * image.base64 = '/9j/4AAQSkZJRgABAQ...';
   */
  base64: string;
  /**
   * Base64 and URI inputs are mutually exclusive.
   *
   * @since 2.1.0
   */
  uri?: never;
}
