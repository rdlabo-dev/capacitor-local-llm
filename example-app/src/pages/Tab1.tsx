import { useEffect, useRef, useState } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  IonButton,
  IonChip,
  IonContent,
  IonHeader,
  IonLabel,
  IonPage,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { LocalLLM, type GetImageAnalysisAvailabilityResult } from '@rdlabo/capacitor-local-llm';

import { fileToBase64 } from '../lib/image';
import './Tab1.css';
import { AcceptanceTests } from './Tab1/AcceptanceTests';

const DEFAULT_PROMPT = 'What is an LLM?';
const IMAGE_PROMPT = 'この画像に何が写っているか、日本語で簡潔に説明してください。';
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const DEFAULT_ANDROID_FALLBACK_PATH = '/data/user/0/io.ionic.starter/files/models/gemma-4-E2B-it.litertlm';

const formatError = (err: unknown): string => {
  const message = (err as Error).message ?? 'Unknown error';
  const code = (err as { code?: string }).code;
  return code ? `[${code}] ${message}` : message;
};

const statusColor = (status: string): string => {
  switch (status) {
    case 'available':
      return 'success';
    case 'unavailable':
    case 'device-not-eligible':
      return 'danger';
    case 'not-ready':
    case 'downloading':
    case 'downloadable':
    case 'not-enabled':
      return 'warning';
    default:
      return 'medium';
  }
};

const Tab1: React.FC = () => {
  const [availability, setAvailability] = useState<string | null>(null);
  const [downloadLabel, setDownloadLabel] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [chatId, setChatId] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [response, setResponse] = useState<string>('');
  const [fallbackModelPath, setFallbackModelPath] = useState<string>(DEFAULT_ANDROID_FALLBACK_PATH);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageAnalysis, setImageAnalysis] = useState<GetImageAnalysisAvailabilityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isConfiguringFallback, setIsConfiguringFallback] = useState<boolean>(false);

  const availabilityListenerRef = useRef<PluginListenerHandle | null>(null);
  const downloadProgressListenerRef = useRef<PluginListenerHandle | null>(null);
  const textChunkListenerRef = useRef<PluginListenerHandle | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const removeListener = async (ref: React.MutableRefObject<PluginListenerHandle | null>) => {
    await ref.current?.remove();
    ref.current = null;
  };

  const loadImageAnalysisAvailability = async () => {
    const result = await LocalLLM.getImageAnalysisAvailability();
    setImageAnalysis(result);
  };

  useEffect(() => {
    const setup = async () => {
      try {
        const { status } = await LocalLLM.getAvailability();
        setAvailability(status);
        await loadImageAnalysisAvailability();
      } catch (err) {
        setError(formatError(err));
      }

      availabilityListenerRef.current = await LocalLLM.addListener('availabilityChange', ({ status }) => {
        setAvailability(status);
      });
    };

    void setup();

    return () => {
      void removeListener(availabilityListenerRef);
      void removeListener(downloadProgressListenerRef);
      void removeListener(textChunkListenerRef);

      const id = chatIdRef.current;
      if (id) {
        void LocalLLM.deleteChat({ id }).catch(() => undefined);
      }
    };
  }, []);

  const onCheckAvailability = async () => {
    setError(null);
    try {
      const { status } = await LocalLLM.getAvailability();
      setAvailability(status);
    } catch (err) {
      setError(formatError(err));
    }
  };

  const onConfigureFallback = async () => {
    setError(null);
    setIsConfiguringFallback(true);

    try {
      await LocalLLM.configureFallbackModel({
        path: fallbackModelPath,
        maxTokens: 4096,
        maxImages: 1,
      });
      const { status } = await LocalLLM.getAvailability();
      setAvailability(status);
      await loadImageAnalysisAvailability();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsConfiguringFallback(false);
    }
  };

  const onDownloadModel = async () => {
    setError(null);
    setDownloadLabel(null);
    setIsDownloading(true);

    try {
      await removeListener(downloadProgressListenerRef);
      downloadProgressListenerRef.current = await LocalLLM.addListener('downloadProgress', (event) => {
        if (event.progress != null) {
          setDownloadLabel(`${Math.round(event.progress * 100)}%`);
        } else if (event.downloadedBytes != null) {
          setDownloadLabel(`${event.downloadedBytes} bytes`);
        } else {
          setDownloadLabel('Downloading…');
        }
      });

      await LocalLLM.downloadModel();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsDownloading(false);
      await removeListener(downloadProgressListenerRef);
    }
  };

  const ensureChat = async (): Promise<string> => {
    if (chatId) {
      return chatId;
    }

    const chat = await LocalLLM.createChat({
      instructions: 'Answer briefly in plain language.',
    });
    chatIdRef.current = chat.id;
    setChatId(chat.id);
    return chat.id;
  };

  const onSelectImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setError(null);
    if (file && file.type && !file.type.startsWith('image/')) {
      event.target.value = '';
      setSelectedImage(null);
      setPrompt(DEFAULT_PROMPT);
      setError('[LOCAL_LLM_INVALID_OPTIONS] Please select an image file.');
      return;
    }
    if (file && file.size > MAX_IMAGE_BYTES) {
      event.target.value = '';
      setSelectedImage(null);
      setPrompt(DEFAULT_PROMPT);
      setError('[LOCAL_LLM_IMAGE_TOO_LARGE] The image must not exceed 32 MiB.');
      return;
    }
    setSelectedImage(file);
    if (file) {
      setPrompt(IMAGE_PROMPT);
    }
  };

  const onClearImage = () => {
    setSelectedImage(null);
    setPrompt(DEFAULT_PROMPT);
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const onStream = async () => {
    setError(null);
    setResponse('');
    setGenerationId(null);
    setIsStreaming(true);

    let activeChatId: string | null = null;
    try {
      activeChatId = await ensureChat();
      await removeListener(textChunkListenerRef);

      textChunkListenerRef.current = await LocalLLM.addListener('textChunk', (event) => {
        if (event.chatId !== activeChatId) {
          return;
        }
        setGenerationId(event.generationId);
        setResponse((prev) => prev + event.text);
      });

      let imageBase64: string | undefined;
      if (selectedImage) {
        imageBase64 = await fileToBase64(selectedImage);
      }

      const result = await LocalLLM.streamText({
        chatId: activeChatId,
        prompt,
        ...(imageBase64 ? { images: [{ base64: imageBase64 }] } : {}),
      });
      setResponse(result.text);
      setGenerationId(result.generationId);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsStreaming(false);
      await removeListener(textChunkListenerRef);
    }
  };

  const onCancel = async () => {
    if (!chatId) {
      return;
    }

    setError(null);
    try {
      await LocalLLM.cancelGeneration({
        chatId,
        generationId: generationId ?? undefined,
      });
    } catch (err) {
      setError(formatError(err));
    }
  };

  const onDeleteChat = async () => {
    if (!chatId) {
      return;
    }

    setError(null);
    try {
      await LocalLLM.deleteChat({ id: chatId });
      chatIdRef.current = null;
      setChatId(null);
      setGenerationId(null);
      setResponse('');
    } catch (err) {
      setError(formatError(err));
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Chat</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonHeader collapse="condense">
          <IonToolbar>
            <IonTitle size="large">Chat</IonTitle>
          </IonToolbar>
        </IonHeader>
        <div className="container">
          <IonButton expand="block" onClick={onCheckAvailability}>
            Check Availability
          </IonButton>

          {availability && (
            <IonChip color={statusColor(availability)}>
              <IonLabel>{availability}</IonLabel>
            </IonChip>
          )}

          {availability === 'downloadable' && (
            <IonButton expand="block" disabled={isDownloading} onClick={onDownloadModel}>
              Download Model
            </IonButton>
          )}

          {downloadLabel && (
            <IonChip color="primary">
              <IonLabel>{downloadLabel}</IonLabel>
            </IonChip>
          )}

          <div className="control-group">
            <p className="control-group-label">Android fallback</p>
            <IonTextarea
              fill="outline"
              labelPlacement="floating"
              label="Fallback model path (Android)"
              value={fallbackModelPath}
              onIonInput={(e) => setFallbackModelPath(e.detail.value ?? '')}
            />

            <IonButton expand="block" disabled={isConfiguringFallback} onClick={onConfigureFallback}>
              Configure Fallback
            </IonButton>

            {isConfiguringFallback && (
              <div className="loading">
                <IonSpinner />
              </div>
            )}
          </div>

          {chatId && (
            <IonChip color="medium">
              <IonLabel>chat: {chatId.slice(0, 8)}…</IonLabel>
            </IonChip>
          )}

          <IonTextarea
            fill="outline"
            labelPlacement="floating"
            label="Prompt"
            value={prompt}
            onIonInput={(e) => setPrompt(e.detail.value ?? '')}
          />

          <div className="control-group">
            <label className="control-group-label" htmlFor="image-file-input">
              Image analysis
            </label>
            <input
              id="image-file-input"
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={onSelectImage}
            />

            {selectedImage && (
              <div className="image-file-row">
                <span className="image-file-name">{selectedImage.name}</span>
                <IonButton size="small" fill="outline" color="medium" onClick={onClearImage}>
                  Clear
                </IonButton>
              </div>
            )}

            {imageAnalysis && (
              <>
                <IonChip color={statusColor(imageAnalysis.status)}>
                  <IonLabel>image analysis: {imageAnalysis.status}</IonLabel>
                </IonChip>
                {imageAnalysis.backend && (
                  <IonChip color="medium">
                    <IonLabel>backend: {imageAnalysis.backend}</IonLabel>
                  </IonChip>
                )}
                {imageAnalysis.maxImages != null && (
                  <IonChip color="medium">
                    <IonLabel>max images: {imageAnalysis.maxImages}</IonLabel>
                  </IonChip>
                )}
              </>
            )}
          </div>

          <AcceptanceTests image={selectedImage} fallbackModelPath={fallbackModelPath} />

          <IonButton expand="block" disabled={isStreaming} onClick={onStream}>
            Stream Response
          </IonButton>

          <IonButton expand="block" fill="outline" disabled={!isStreaming} onClick={onCancel}>
            Cancel Generation
          </IonButton>

          <IonButton expand="block" fill="outline" color="medium" disabled={!chatId || isStreaming} onClick={onDeleteChat}>
            Delete Chat
          </IonButton>

          {isStreaming && (
            <div className="loading">
              <IonSpinner />
            </div>
          )}

          {error && <p className="response">{error}</p>}
          {response && <p className="response">{response}</p>}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Tab1;
