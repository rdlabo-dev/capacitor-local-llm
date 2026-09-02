import type { LocalLLMErrorCode } from './local-llm-error-code.type';

/**
 * Web-only convenience error. Native Capacitor errors expose the same stable `code` property.
 *
 * @since 1.0.0
 * @example
 * throw new LocalLLMException('LOCAL_LLM_NOT_AVAILABLE', 'Model is not available.');
 */
export class LocalLLMException extends Error {
  constructor(
    public readonly code: LocalLLMErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LocalLLMException';
  }
}
