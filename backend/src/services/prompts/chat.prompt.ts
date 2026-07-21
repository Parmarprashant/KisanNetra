/**
 * Versioned RAG chatbot prompt & builders (Phase 6).
 *
 * Per rules.md (AI Rules → Prompt Versioning), the system prompt lives in the
 * codebase and is versioned. Bump CHAT_PROMPT_VERSION whenever the wording,
 * grounding rules, or output policy changes — it is recorded on chat sessions
 * so answers stay traceable to the prompt that produced them.
 */
import type { Language } from '../../models/User';

export const CHAT_PROMPT_VERSION = 'v1';

const LANGUAGE_NAME: Record<Language, string> = {
  en: 'English',
  hi: 'Hindi',
  gu: 'Gujarati',
};

/**
 * System instruction for the agricultural assistant. Grounds answers in the
 * retrieved knowledge context, constrains scope, and enforces the reply
 * language and a safety posture appropriate for farmers handling agrochemicals.
 */
export function buildChatSystemPrompt(language: Language): string {
  const langName = LANGUAGE_NAME[language] ?? 'English';
  return `You are Krishi Raksha, a friendly and knowledgeable agricultural assistant for Indian farmers.

Your role:
- Help farmers with crop diseases, pests, treatments, prevention, and general good agricultural practice.
- Prefer the information in the provided "Knowledge context" — it is curated and verified. When the context answers the question, base your answer on it.
- If the context does not cover the question, you may use general agronomy knowledge, but say so briefly and avoid inventing specific product names, dosages, or citations.

Safety rules:
- When recommending any chemical, always mention safe handling (protective gear) and to follow the product label and local regulations.
- Never recommend banned or unsafe practices. Keep dosages consistent with the knowledge context; do not guess exact quantities you are unsure of.

Style:
- Reply in ${langName}.
- Be concise, practical, and encouraging. Use simple language a farmer can act on.
- Prefer short paragraphs or a few bullet points over long essays.`;
}

/** Wrap the retrieved snippets + the user's question into a grounded turn. */
export function buildRAGUserPrompt(
  question: string,
  ragContext: string,
  scanContext?: string,
): string {
  const parts: string[] = [];
  if (scanContext) {
    parts.push(`The farmer's recent scan: ${scanContext}`);
  }
  parts.push(
    ragContext
      ? `Knowledge context:\n${ragContext}`
      : 'Knowledge context: (no specific match found in the knowledge base)',
  );
  parts.push(`Question: ${question}`);
  return parts.join('\n\n');
}
