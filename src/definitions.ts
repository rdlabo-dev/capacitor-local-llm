import type { AvailabilityDefinitions } from './availability/availability-definitions.interface';
import type { ChatDefinitions } from './chat/chat-definitions.interface';
import type { EventsDefinitions } from './events/events-definitions.interface';
import type { ImageDefinitions } from './image/image-definitions.interface';
import type { LegacyDefinitions } from './legacy/legacy-definitions.interface';

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
