import type { AvailabilityDefinitions } from './availability/index';
import type { ChatDefinitions } from './chat/index';
import type { EventsDefinitions } from './events/index';
import type { ImageDefinitions } from './image/index';
import type { LegacyDefinitions } from './legacy/index';

export * from './availability/index';
export * from './chat/index';
export * from './events/index';
export * from './image/index';
export * from './legacy/index';
export * from './shared/index';

/**
 * Public on-device LLM plugin contract.
 *
 * @since 1.0.0
 * @example
 * import { LocalLLM } from '@rdlabo/capacitor-local-llm';
 */
export interface LocalLLMPlugin
  extends AvailabilityDefinitions, ChatDefinitions, ImageDefinitions, EventsDefinitions, LegacyDefinitions {}
