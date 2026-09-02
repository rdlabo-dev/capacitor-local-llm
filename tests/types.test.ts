import type {
  Availability,
  LLMAvailability,
  GenerationOptions,
  LocalLLMErrorCode,
  LocalLLMPlugin,
  TextChunkEvent,
} from '../src/definitions';

const legacyAvailability: LLMAvailability = 'notready';
void legacyAvailability;

declare const plugin: LocalLLMPlugin;

const options: GenerationOptions = { temperature: 0.2, topK: 16, maxOutputTokens: 256 };
const availability: Availability = 'downloading';
const code: LocalLLMErrorCode = 'LOCAL_LLM_CONTEXT_WINDOW_EXCEEDED';
const chunk: TextChunkEvent = { chatId: 'chat', generationId: 'generation', text: 'hello' };

void plugin.createChat({ instructions: 'Be concise', history: { maxMessages: 10, maxCharacters: 8000 } });
void plugin.configureFallbackModel({
  path: '/android_asset/vision-model.litertlm',
  maxTokens: 4096,
  maxImages: 1,
  supportsImages: true,
});
void plugin.generateText({ chatId: chunk.chatId, prompt: chunk.text, imagePaths: ['content://photo'], options });
void plugin.streamText({ chatId: chunk.chatId, prompt: 'continue' });
void plugin.cancelGeneration({ chatId: chunk.chatId, generationId: chunk.generationId });
void plugin.deleteChat({ id: chunk.chatId });
void plugin.addListener('textChunk', (event) => event.text);
void plugin.addListener('downloadProgress', (event) => event.downloadedBytes);
void plugin.addListener('availabilityChange', (event) => event.status);

// @ts-expect-error chatId is required by the explicit generation API.
void plugin.generateText({ prompt: 'missing chat' });
// @ts-expect-error availability is a closed semantic union.
const invalidAvailability: Availability = 'notready';

void availability;
void code;
void invalidAvailability;
