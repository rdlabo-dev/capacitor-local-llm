import { WebPlugin } from '@capacitor/core';

import type {
  CreateChatResult,
  GenerateImageResponse,
  GenerateTextResult,
  GetAvailabilityResult,
  GetImageAnalysisAvailabilityResult,
  LocalLLMPlugin,
  PromptResponse,
  StreamTextResult,
  SystemAvailabilityResponse,
} from './definitions';
import { LocalLLMException } from './definitions';

export class LocalLLMWeb extends WebPlugin implements LocalLLMPlugin {
  private unsupported(): never {
    throw new LocalLLMException('LOCAL_LLM_UNSUPPORTED', 'Local LLM is not supported on the web');
  }

  getAvailability(): Promise<GetAvailabilityResult> {
    return this.unsupported();
  }
  getImageAnalysisAvailability(): Promise<GetImageAnalysisAvailabilityResult> {
    return this.unsupported();
  }
  downloadModel(): Promise<void> {
    return this.unsupported();
  }
  configureFallbackModel(): Promise<void> {
    return this.unsupported();
  }
  warmup(): Promise<void> {
    return this.unsupported();
  }
  createChat(): Promise<CreateChatResult> {
    return this.unsupported();
  }
  deleteChat(): Promise<void> {
    return this.unsupported();
  }
  generateText(): Promise<GenerateTextResult> {
    return this.unsupported();
  }
  streamText(): Promise<StreamTextResult> {
    return this.unsupported();
  }
  cancelGeneration(): Promise<void> {
    return this.unsupported();
  }
  generateImage(): Promise<GenerateImageResponse> {
    return this.unsupported();
  }
  systemAvailability(): Promise<SystemAvailabilityResponse> {
    return this.unsupported();
  }
  download(): Promise<void> {
    return this.unsupported();
  }
  prompt(): Promise<PromptResponse> {
    return this.unsupported();
  }
  endSession(): Promise<void> {
    return this.unsupported();
  }
}
