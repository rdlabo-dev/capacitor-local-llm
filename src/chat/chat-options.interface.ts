import type { ImageInput } from '../image/image-input.interface';

/**
 * Cross-platform text generation controls. Unsupported values are rejected, not clamped.
 *
 * @since 2.0.0
 * @example
 * const options: GenerationOptions = { temperature: 0.2, maxOutputTokens: 256 };
 */
export interface GenerationOptions {
  /**
   * Sampling temperature.
   *
   * @since 2.0.0
   * @example
   * options.temperature = 0.2;
   */
  temperature?: number;
  /**
   * Samples from the k most likely tokens.
   *
   * @since 2.0.0
   * @example
   * options.topK = 16;
   */
  topK?: number;
  /**
   * Maximum generated tokens.
   *
   * @since 2.0.0
   * @example
   * options.maxOutputTokens = 256;
   */
  maxOutputTokens?: number;
}

/**
 * Chat history limits. Both native implementations retain instructions and discard oldest whole turns.
 *
 * @since 2.0.0
 * @example
 * const history: ChatHistoryOptions = { maxMessages: 12, maxCharacters: 8000 };
 */
export interface ChatHistoryOptions {
  /**
   * Maximum retained messages. Defaults to 20.
   *
   * @since 2.0.0
   * @example
   * history.maxMessages = 12;
   */
  maxMessages?: number;
  /**
   * Maximum retained message characters. Defaults to 12000.
   *
   * @since 2.0.0
   * @example
   * history.maxCharacters = 8000;
   */
  maxCharacters?: number;
}

/**
 * Options for creating an owned chat.
 *
 * @since 2.0.0
 * @example
 * const chat = await LocalLLM.createChat({ instructions: 'Answer briefly.' });
 */
export interface CreateChatOptions {
  /**
   * Persistent system instructions for this chat.
   *
   * @since 2.0.0
   * @example
   * options.instructions = 'Answer briefly.';
   */
  instructions?: string;
  /**
   * History limits applied by both native implementations.
   *
   * @since 2.0.0
   * @example
   * options.history = { maxMessages: 12 };
   */
  history?: ChatHistoryOptions;
}

/**
 * Result containing the plugin-owned chat identifier.
 *
 * @since 2.0.0
 * @example
 * const { id } = await LocalLLM.createChat();
 */
export interface CreateChatResult {
  /**
   * Identifier required by generation and deletion calls.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.generateText({ chatId: chat.id, prompt: 'Hi' });
   */
  id: string;
}

/**
 * Options for deleting a chat.
 *
 * @since 2.0.0
 * @example
 * await LocalLLM.deleteChat({ id: chat.id });
 */
export interface DeleteChatOptions {
  /**
   * Chat identifier returned by `createChat()`.
   *
   * @since 2.0.0
   * @example
   * options.id = chat.id;
   */
  id: string;
}

/**
 * Options for a non-streaming generation.
 *
 * @since 2.0.0
 * @example
 * await LocalLLM.generateText({ chatId, prompt: 'Hello' });
 */
export interface GenerateTextOptions {
  /**
   * Chat identifier returned by `createChat()`.
   *
   * @since 2.0.0
   * @example
   * options.chatId = chat.id;
   */
  chatId: string;
  /**
   * User prompt.
   *
   * @since 2.0.0
   * @example
   * options.prompt = 'Hello';
   */
  prompt: string;
  /**
   * Images supplied to a vision-capable backend. On iOS 27+ (builds compiled with Xcode 27 /
   * Swift 6.4), Foundation Models `Attachment` accepts up to 4 images of at most 32 MiB each
   * via readable absolute paths, `file://` URLs, raw Base64, or Base64 data URLs; after a
   * successful generation, attachments are removed from retained chat history while the text
   * prompt and response remain. Android uses Gemini Nano prompt APIs or a configured LiteRT-LM
   * fallback with absolute/`file://`/`content://`/Base64 input and ML Kit aggregate pixel limits.
   * Web and text-only backends reject image input with `LOCAL_LLM_UNSUPPORTED`.
   *
   * @since 2.1.0
   * @example
   * options.images = [{ uri: 'file:///data/user/0/com.example.app/files/photo.jpg' }];
   */
  images?: ImageInput[];
  /**
   * Local image paths supplied to a vision-capable Android LiteRT-LM fallback model.
   * Absolute paths, `file://` URLs, and readable `content://` URIs are accepted. This
   * compatibility path retains the v2.0 LiteRT-LM routing even when ML Kit is available.
   *
   * @deprecated Use {@link GenerateTextOptions.images} instead.
   * @since 2.0.0
   * @example
   * options.imagePaths = ['file:///data/user/0/com.example.app/files/photo.jpg'];
   */
  imagePaths?: string[];
  /**
   * Optional generation controls.
   *
   * @since 2.0.0
   * @example
   * options.options = { temperature: 0.2 };
   */
  options?: GenerationOptions;
}

/**
 * Result of a text generation.
 *
 * @since 2.0.0
 * @example
 * const { text, generationId } = await LocalLLM.generateText({ chatId, prompt: 'Hi' });
 */
export interface GenerateTextResult {
  /**
   * Complete generated text.
   *
   * @since 2.0.0
   * @example
   * console.log(result.text);
   */
  text: string;
  /**
   * Identifier that can correlate diagnostics with a generation.
   *
   * @since 2.0.0
   * @example
   * await LocalLLM.cancelGeneration({ chatId, generationId: result.generationId });
   */
  generationId: string;
}

/**
 * Options for native streaming generation.
 *
 * @since 2.0.0
 * @example
 * await LocalLLM.streamText({ chatId, prompt: 'Hello' });
 */
export type StreamTextOptions = GenerateTextOptions;

/**
 * Final result of a native streaming generation.
 *
 * @since 2.0.0
 * @example
 * const result: StreamTextResult = await LocalLLM.streamText({ chatId, prompt: 'Hi' });
 */
export type StreamTextResult = GenerateTextResult;

/**
 * Options for cancelling an in-flight generation.
 *
 * @since 2.0.0
 * @example
 * await LocalLLM.cancelGeneration({ chatId, generationId });
 */
export interface CancelGenerationOptions {
  /**
   * Chat that owns the generation.
   *
   * @since 2.0.0
   * @example
   * options.chatId = chat.id;
   */
  chatId: string;
  /**
   * Optional generation identifier; a mismatch is treated as not found.
   *
   * @since 2.0.0
   * @example
   * options.generationId = result.generationId;
   */
  generationId?: string;
}
