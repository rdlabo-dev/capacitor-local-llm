/**
 * @deprecated Use {@link Availability}.
 *
 * @since 1.0.0
 * @example
 * const status: LLMAvailability = 'available';
 */
export type LLMAvailability = 'available' | 'unavailable' | 'notready' | 'downloadable';

/**
 * @deprecated Use {@link GetAvailabilityResult}.
 *
 * @since 1.0.0
 * @example
 * const response: SystemAvailabilityResponse = await LocalLLM.systemAvailability();
 */
export interface SystemAvailabilityResponse {
  /**
   * Legacy availability value. Detailed states are folded into the original four-value contract.
   *
   * @since 1.0.0
   * @example
   * response.status === 'notready';
   */
  status: LLMAvailability;
}

/**
 * @deprecated Use {@link GenerationOptions}.
 *
 * @since 1.0.0
 * @example
 * const options: LLMOptions = { temperature: 0.2, maximumOutputTokens: 256 };
 */
export interface LLMOptions {
  /**
   * Sampling temperature.
   *
   * @since 1.0.0
   * @example
   * options.temperature = 0.2;
   */
  temperature?: number;
  /**
   * Maximum generated tokens.
   *
   * @since 1.0.0
   * @example
   * options.maximumOutputTokens = 256;
   */
  maximumOutputTokens?: number;
}

/**
 * Legacy prompt options.
 *
 * @since 1.0.0
 * @example
 * await LocalLLM.prompt({ prompt: 'Hello', instructions: 'Be brief.' });
 */
export interface PromptOptions {
  /**
   * Optional legacy session identifier.
   *
   * @since 1.0.0
   * @example
   * options.sessionId = 'session-1';
   */
  sessionId?: string;
  /**
   * Instructions used when the legacy session is first created.
   *
   * @since 1.0.0
   * @example
   * options.instructions = 'Be brief.';
   */
  instructions?: string;
  /**
   * Legacy generation controls.
   *
   * @since 1.0.0
   * @example
   * options.options = { temperature: 0.2 };
   */
  options?: LLMOptions;
  /**
   * User prompt.
   *
   * @since 1.0.0
   * @example
   * options.prompt = 'Hello';
   */
  prompt: string;
}

/**
 * Legacy prompt response.
 *
 * @since 1.0.0
 * @example
 * const { text } = await LocalLLM.prompt({ prompt: 'Hello' });
 */
export interface PromptResponse {
  /**
   * Complete generated text.
   *
   * @since 1.0.0
   * @example
   * console.log(response.text);
   */
  text: string;
}

/**
 * Legacy session deletion options.
 *
 * @since 1.0.0
 * @example
 * await LocalLLM.endSession({ sessionId: 'session-1' });
 */
export interface EndSessionOptions {
  /**
   * Legacy session identifier.
   *
   * @since 1.0.0
   * @example
   * options.sessionId = 'session-1';
   */
  sessionId: string;
}
