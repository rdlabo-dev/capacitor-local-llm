import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { IonButton, IonChip, IonLabel, IonSpinner } from '@ionic/react';
import { LocalLLM } from '@rdlabo/capacitor-local-llm';

import { fileToBase64 } from '../../lib/image';

type StepStatus = 'pending' | 'running' | 'passed' | 'failed';

interface TestStep {
  name: string;
  status: StepStatus;
  detail?: string;
}

const STEP_NAMES = [
  'Availability',
  'Create chat',
  'Base64 image stream',
  'Text-only history',
  'Cancel generation',
  'Generate after cancellation',
  'Delete chat',
] as const;

const initialSteps = (): TestStep[] => STEP_NAMES.map((name) => ({ name, status: 'pending' }));

const errorCode = (error: unknown): string | undefined => (error as { code?: string }).code;

const errorText = (error: unknown): string => {
  const message = (error as Error).message ?? 'Unknown error';
  const code = errorCode(error);
  return code ? `[${code}] ${message}` : message;
};

const requireValue: (condition: boolean, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const AcceptanceTests: React.FC<{ image: File | null; fallbackModelPath: string }> = ({
  image,
  fallbackModelPath,
}) => {
  const [steps, setSteps] = useState<TestStep[]>(initialSteps);
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const updateStep = (index: number, status: StepStatus, detail?: string) => {
    setSteps((current) => current.map((step, stepIndex) => (stepIndex === index ? { ...step, status, detail } : step)));
  };

  const runStep = async (index: number, action: () => Promise<string | void>) => {
    updateStep(index, 'running');
    try {
      const detail = await action();
      updateStep(index, 'passed', detail || undefined);
    } catch (error) {
      updateStep(index, 'failed', errorText(error));
      throw error;
    }
  };

  const runAll = async () => {
    if (!image || isRunning) return;

    setSteps(initialSteps());
    setSummary(null);
    setIsRunning(true);
    let chatId: string | undefined;

    try {
      await runStep(0, async () => {
        if (Capacitor.getPlatform() === 'android') {
          await LocalLLM.configureFallbackModel({
            path: fallbackModelPath,
            maxTokens: 4096,
            maxImages: 1,
            supportsImages: true,
          });
        }
        const [text, vision] = await Promise.all([
          LocalLLM.getAvailability(),
          LocalLLM.getImageAnalysisAvailability(),
        ]);
        requireValue(text.status === 'available', `Text model is ${text.status}`);
        requireValue(vision.status === 'available', `Image analysis is ${vision.status}`);
        return vision.backend ?? 'available';
      });

      await runStep(1, async () => {
        const chat = await LocalLLM.createChat({ instructions: '日本語で簡潔に回答してください。' });
        chatId = chat.id;
        return chat.id.slice(0, 8);
      });

      const base64 = await fileToBase64(image);
      await runStep(2, async () => {
        const activeChatId = chatId;
        requireValue(activeChatId != null, 'Chat was not created');
        let chunkCount = 0;
        const states: Array<{ generationId: string; state: string }> = [];
        const chunkListener = await LocalLLM.addListener('textChunk', (event) => {
          if (event.chatId === activeChatId && event.text) chunkCount += 1;
        });
        const stateListener = await LocalLLM.addListener('generationStateChange', (event) => {
          if (event.chatId === activeChatId) states.push({ generationId: event.generationId, state: event.state });
        });
        try {
          const result = await LocalLLM.streamText({
            chatId: activeChatId,
            prompt: 'この画像に何が写っているか、日本語で簡潔に説明してください。',
            images: [{ base64 }],
          });
          requireValue(result.text.trim().length > 0, 'Image response was empty');
          requireValue(chunkCount > 0, 'No textChunk event was received');
          requireValue(
            states.some((event) => event.generationId === result.generationId && event.state === 'started'),
            'No matching started lifecycle event was received',
          );
          requireValue(
            states.some((event) => event.generationId === result.generationId && event.state === 'completed'),
            'No matching completed lifecycle event was received',
          );
          return `${chunkCount} chunks`;
        } finally {
          await Promise.all([chunkListener.remove(), stateListener.remove()]);
        }
      });

      await runStep(3, async () => {
        const activeChatId = chatId;
        requireValue(activeChatId != null, 'Chat was not created');
        const result = await LocalLLM.generateText({
          chatId: activeChatId,
          prompt: '直前の画像について、さきほどの回答内容を一文で言い直してください。',
        });
        requireValue(result.text.trim().length > 0, 'History response was empty');
        return result.text;
      });

      await runStep(4, async () => {
        const activeChatId = chatId;
        requireValue(activeChatId != null, 'Chat was not created');
        let cancellation: Promise<void> | undefined;
        let generationId: string | undefined;
        let cancelledErrorCode: string | undefined;
        const listener = await LocalLLM.addListener('generationStateChange', (event) => {
          if (event.chatId === activeChatId && event.state === 'started' && cancellation == null) {
            generationId = event.generationId;
            cancellation = LocalLLM.cancelGeneration({ chatId: activeChatId, generationId: event.generationId });
          }
          if (event.chatId === activeChatId && event.generationId === generationId && event.state === 'cancelled') {
            cancelledErrorCode = event.errorCode;
          }
        });
        try {
          try {
            await LocalLLM.streamText({
              chatId: activeChatId,
              prompt: 'ローカルLLMの仕組み、利点、制約について2000字程度で詳しく説明してください。',
            });
            throw new Error('Generation completed before cancellation');
          } catch (error) {
            requireValue(cancellation != null, 'No started lifecycle event was received');
            await cancellation;
            requireValue(errorCode(error) === 'LOCAL_LLM_GENERATION_CANCELLED', errorText(error));
            requireValue(cancelledErrorCode != null, 'No cancelled lifecycle event was received');
            requireValue(
              cancelledErrorCode === 'LOCAL_LLM_GENERATION_CANCELLED',
              `Unexpected cancelled event error: ${cancelledErrorCode}`,
            );
          }
          return 'LOCAL_LLM_GENERATION_CANCELLED';
        } finally {
          await listener.remove();
        }
      });

      await runStep(5, async () => {
        const activeChatId = chatId;
        requireValue(activeChatId != null, 'Chat was not created');
        const result = await LocalLLM.generateText({
          chatId: activeChatId,
          prompt: '「OK」とだけ回答してください。',
        });
        requireValue(result.text.trim().length > 0, 'Recovery response was empty');
        return result.text;
      });

      await runStep(6, async () => {
        const activeChatId = chatId;
        requireValue(activeChatId != null, 'Chat was not created');
        await LocalLLM.deleteChat({ id: activeChatId });
        chatId = undefined;
      });

      setSummary('All acceptance tests passed.');
    } catch (error) {
      setSummary(`Acceptance test failed: ${errorText(error)}`);
    } finally {
      if (chatId) await LocalLLM.deleteChat({ id: chatId }).catch(() => undefined);
      setIsRunning(false);
    }
  };

  return (
    <div className="control-group">
      <p className="control-group-label">Physical-device acceptance</p>
      <IonButton expand="block" disabled={!image || isRunning} onClick={runAll}>
        Run All Acceptance Tests
      </IonButton>
      {!image && <p className="acceptance-hint">Select an image first.</p>}
      <div className="acceptance-steps">
        {steps.map((step) => (
          <div className="acceptance-step" key={step.name}>
            <IonChip color={step.status === 'passed' ? 'success' : step.status === 'failed' ? 'danger' : 'medium'}>
              <IonLabel>{step.status}</IonLabel>
            </IonChip>
            <span>
              {step.name}
              {step.detail && <small>{step.detail}</small>}
            </span>
          </div>
        ))}
      </div>
      {isRunning && <IonSpinner />}
      {summary && <p className="response">{summary}</p>}
    </div>
  );
};
