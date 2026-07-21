/**
 * Gemini AI service — vision classification bridge.
 *
 * This is the core AI inference layer (Phase 3). It replaces the originally
 * planned Groq provider with Google's Gemini API. The public contract
 * (`classifyLeafImage` → `ClassificationResult`) is provider-agnostic, so the
 * scan pipeline (Phase 4) and any future provider swap depend only on this
 * abstraction — not on the SDK.
 *
 * Design notes:
 *  - Structured output is enforced with a responseSchema so parsing is safe.
 *  - Low temperature keeps classification deterministic.
 *  - On any API/parse failure we return a graceful degraded result
 *    (confidence 0, low_confidence true) per rules.md "Fallback responses",
 *    rather than throwing — the caller can still persist the scan and let the
 *    farmer provide feedback.
 */
import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  CLASSIFICATION_SYSTEM_PROMPT,
  PROMPT_VERSION,
  buildUserPrompt,
} from './prompts/classification.prompt';

export type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface TopKPrediction {
  label: string;
  confidence: number;
}

export interface ClassificationResult {
  disease_label: string;
  scientific_name: string;
  confidence: number;
  is_healthy: boolean;
  top_k: TopKPrediction[];
  model_version: string;
  low_confidence: boolean;
}

const genai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

// Response schema enforced by the SDK — guarantees a parseable JSON shape.
const CLASSIFICATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    disease_label: { type: Type.STRING },
    scientific_name: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    is_healthy: { type: Type.BOOLEAN },
    top_k: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
        },
        required: ['label', 'confidence'],
      },
    },
  },
  required: ['disease_label', 'confidence', 'is_healthy'],
} as const;

function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, n));
}

function modelVersion(): string {
  return `gemini:${env.GEMINI_VISION_MODEL}:${PROMPT_VERSION}`;
}

/** Degraded result returned when the AI provider fails (never throws to caller). */
function fallbackResult(): ClassificationResult {
  return {
    disease_label: 'Unknown',
    scientific_name: '',
    confidence: 0,
    is_healthy: false,
    top_k: [],
    model_version: `${modelVersion()}:fallback`,
    low_confidence: true,
  };
}

/**
 * Classify a single leaf image.
 *
 * @param imageBase64 Base64-encoded image bytes (no data-URI prefix).
 * @param mimeType    Image MIME type.
 * @param cropType    Crop hint (improves accuracy and grounds the prompt).
 * @returns Structured classification; a degraded fallback on provider failure.
 */
export async function classifyLeafImage(
  imageBase64: string,
  mimeType: SupportedMimeType,
  cropType: string,
): Promise<ClassificationResult> {
  const threshold = env.CONFIDENCE_THRESHOLD;

  try {
    const response = await genai.models.generateContent({
      model: env.GEMINI_VISION_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: buildUserPrompt(cropType) },
            { inlineData: { mimeType, data: imageBase64 } },
          ],
        },
      ],
      config: {
        systemInstruction: CLASSIFICATION_SYSTEM_PROMPT,
        temperature: 0.1,
        // Disable "thinking" — classification is a direct perception task, and
        // thinking tokens count against maxOutputTokens (they were truncating
        // the JSON). Disabling it is faster, cheaper, and deterministic.
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 800,
        responseMimeType: 'application/json',
        responseSchema: CLASSIFICATION_SCHEMA,
      },
    });

    const raw = response.text;
    if (!raw) {
      logger.error('Gemini returned empty classification response');
      return fallbackResult();
    }

    let parsed: {
      disease_label?: string;
      scientific_name?: string;
      confidence?: number;
      is_healthy?: boolean;
      top_k?: TopKPrediction[];
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.error('Gemini returned invalid JSON for classification', {
        preview: raw.slice(0, 200),
      });
      return fallbackResult();
    }

    const confidence = clampConfidence(parsed.confidence);
    const topK = Array.isArray(parsed.top_k)
      ? parsed.top_k
          .filter((t) => t && typeof t.label === 'string')
          .map((t) => ({
            label: t.label,
            confidence: clampConfidence(t.confidence),
          }))
      : [];

    return {
      disease_label: parsed.disease_label?.trim() || 'Unknown',
      scientific_name: parsed.scientific_name?.trim() ?? '',
      confidence,
      is_healthy: Boolean(parsed.is_healthy),
      top_k: topK,
      model_version: modelVersion(),
      low_confidence: confidence < threshold,
    };
  } catch (err) {
    // Network / rate-limit / auth errors — log and degrade gracefully.
    logger.error('Gemini classification failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallbackResult();
  }
}
