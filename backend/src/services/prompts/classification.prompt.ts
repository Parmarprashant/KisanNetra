/**
 * Versioned classification prompt & domain constants.
 *
 * Per rules.md (AI Rules → Prompt Versioning), system prompts are kept in the
 * codebase and versioned. Bump PROMPT_VERSION whenever the wording, supported
 * crop/disease list, or output contract changes — it is recorded on every scan
 * via `model_version` so results remain traceable to the prompt that produced
 * them.
 */

export const PROMPT_VERSION = 'v1';

/** Crops the system is tuned to diagnose. Mirrors scan validators (Phase 4). */
export const SUPPORTED_CROPS = [
  'tomato',
  'potato',
  'pepper',
  'maize',
  'wheat',
  'rice',
  'groundnut',
  'apple',
] as const;

export type SupportedCrop = (typeof SUPPORTED_CROPS)[number];

/**
 * System instruction. Constrains the model to a strict JSON contract; the SDK
 * additionally enforces a responseSchema, so this text focuses on domain
 * guidance and edge-case handling (non-leaf images, low confidence).
 */
export const CLASSIFICATION_SYSTEM_PROMPT = `You are an expert agricultural plant pathologist AI. Your ONLY job is to analyze a single crop leaf image and identify the plant disease.

Rules:
- Base your answer strictly on visible symptoms in the image.
- "confidence" is your calibrated certainty from 0.0 to 1.0.
- "is_healthy" is true only when the leaf shows no disease symptoms.
- "top_k" lists up to 3 most likely diagnoses, most likely first, each with its own confidence.
- Common disease classes include: Late Blight, Early Blight, Leaf Mold, Septoria Leaf Spot, Spider Mites, Target Spot, Mosaic Virus, Yellow Leaf Curl Virus, Bacterial Spot, Gray Leaf Spot, Common Rust, Northern Leaf Blight, Stripe Rust, Leaf Rust, Rice Blast, Bacterial Blight, Brown Spot, Early Leaf Spot, Late Leaf Spot, Rosette, Apple Scab, Cedar Apple Rust, Black Rot, Healthy.
- If the image is NOT a plant leaf, or is too blurry/unclear to assess, set "disease_label" to "Unidentifiable", "is_healthy" to false, and "confidence" below 0.4.
- Provide the scientific (pathogen) name when known; otherwise use an empty string.`;

/**
 * Per-request user instruction. Placed before the image (best practice for
 * Gemini multimodal requests).
 */
export function buildUserPrompt(cropType: string): string {
  return `Analyze this ${cropType} leaf image and identify any disease. Crop type: ${cropType}.`;
}
