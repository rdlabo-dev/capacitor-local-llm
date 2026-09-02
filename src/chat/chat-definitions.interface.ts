import type {
  CancelGenerationOptions,
  CreateChatOptions,
  CreateChatResult,
  DeleteChatOptions,
  GenerateTextOptions,
  GenerateTextResult,
  StreamTextOptions,
  StreamTextResult,
} from './chat-options.interface';

export interface ChatDefinitions {
  /**
   * Creates a chat owned by the plugin until deletion.
   *
   * @group Chat
   * @since 2.0.0
   * @example
   * await LocalLLM.createChat();
   */
  createChat(options?: CreateChatOptions): Promise<CreateChatResult>;

  /**
   * Deletes a chat and cancels its generation.
   *
   * @group Chat
   * @since 2.0.0
   * @example
   * await LocalLLM.deleteChat({ id });
   */
  deleteChat(options: DeleteChatOptions): Promise<void>;

  /**
   * Generates complete text.
   *
   * @group Chat
   * @since 2.0.0
   * @example
   * await LocalLLM.generateText({ chatId, prompt: 'Hi' });
   */
  generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;

  /**
   * Streams native chunks and returns complete text.
   *
   * @group Chat
   * @since 2.0.0
   * @example
   * await LocalLLM.streamText({ chatId, prompt: 'Hi' });
   */
  streamText(options: StreamTextOptions): Promise<StreamTextResult>;

  /**
   * Cancels an in-flight generation.
   *
   * @group Chat
   * @since 2.0.0
   * @example
   * await LocalLLM.cancelGeneration({ chatId });
   */
  cancelGeneration(options: CancelGenerationOptions): Promise<void>;
}
