import type {
  Availability,
  ImageAnalysisBackend,
  ImageInput,
  LLMAvailability,
  GenerationOptions,
  GenerationStateChangeEvent,
  GetImageAnalysisAvailabilityResult,
  LocalLLMErrorCode,
  LocalLLMPlugin,
  TextChunkEvent,
} from '../src/definitions';

const legacyAvailability: LLMAvailability = 'notready';
void legacyAvailability;

declare const plugin: LocalLLMPlugin;

const options: GenerationOptions = { temperature: 0.2, topK: 16, maxOutputTokens: 256 };
const availability: Availability = 'downloading';
const code: LocalLLMErrorCode = 'LOCAL_LLM_IMAGE_NOT_READABLE';
const chunk: TextChunkEvent = { chatId: 'chat', generationId: 'generation', text: 'hello' };
const generationState: GenerationStateChangeEvent = {
  chatId: 'chat',
  generationId: 'generation',
  state: 'started',
};

void plugin.createChat({ instructions: 'Be concise', history: { maxMessages: 10, maxCharacters: 8000 } });
void plugin.configureFallbackModel({
  path: '/android_asset/vision-model.litertlm',
  maxTokens: 4096,
  maxImages: 1,
  supportsImages: true,
});
const image: ImageInput = { uri: 'content://photo' };
const base64Image: ImageInput = { base64: '/9j/4AAQSkZJRgABAQ...' };
const ambiguousImage = { uri: 'content://photo', base64: '/9j/4AAQSkZJRgABAQ...' };
// @ts-expect-error URI and Base64 image inputs are mutually exclusive.
const invalidImage: ImageInput = ambiguousImage;
const imageAnalysis: GetImageAnalysisAvailabilityResult = {
  status: 'available',
  backend: 'foundation-models',
  maxImages: 1,
};
void plugin.getImageAnalysisAvailability();
void plugin.generateText({ chatId: chunk.chatId, prompt: chunk.text, images: [image], options });
void plugin.generateText({ chatId: chunk.chatId, prompt: chunk.text, images: [base64Image], options });
void plugin.generateText({ chatId: chunk.chatId, prompt: chunk.text, imagePaths: ['content://photo'], options });
void plugin.streamText({ chatId: chunk.chatId, prompt: 'continue' });
void plugin.cancelGeneration({ chatId: chunk.chatId, generationId: chunk.generationId });
void plugin.deleteChat({ id: chunk.chatId });
void plugin.addListener('textChunk', (event) => event.text);
void plugin.addListener('generationStateChange', (event) => event.state);
void plugin.addListener('downloadProgress', (event) => event.downloadedBytes);
void plugin.addListener('availabilityChange', (event) => event.status);

// @ts-expect-error chatId is required by the explicit generation API.
void plugin.generateText({ prompt: 'missing chat' });
// @ts-expect-error availability is a closed semantic union.
const invalidAvailability: Availability = 'notready';
// @ts-expect-error backend is a closed semantic union.
const invalidBackend: ImageAnalysisBackend = 'gemini-nano';

void availability;
void code;
void image;
void imageAnalysis;
void invalidImage;
void generationState;
void invalidAvailability;
void invalidBackend;
