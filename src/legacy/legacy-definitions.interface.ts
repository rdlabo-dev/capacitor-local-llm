import type {
  EndSessionOptions,
  PromptOptions,
  PromptResponse,
  SystemAvailabilityResponse,
} from './legacy-options.interface';

export interface LegacyDefinitions {
  /**
   * @deprecated Use `getAvailability()`.
   *
   * @group Deprecated
   * @since 1.0.0
   * @example
   * await LocalLLM.systemAvailability();
   */
  systemAvailability(): Promise<SystemAvailabilityResponse>;

  /**
   * @deprecated Use `downloadModel()`.
   *
   * @group Deprecated
   * @since 1.0.0
   * @example
   * await LocalLLM.download();
   */
  download(): Promise<void>;

  /**
   * @deprecated Use explicit chat APIs. Calls without `sessionId` remain one-shot.
   *
   * @group Deprecated
   * @since 1.0.0
   * @example
   * await LocalLLM.prompt({ prompt: 'Hello' });
   */
  prompt(options: PromptOptions): Promise<PromptResponse>;

  /**
   * @deprecated Use `deleteChat()`.
   *
   * @group Deprecated
   * @since 1.0.0
   * @example
   * await LocalLLM.endSession({ sessionId });
   */
  endSession(options: EndSessionOptions): Promise<void>;
}
