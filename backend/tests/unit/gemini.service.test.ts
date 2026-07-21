import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Gemini SDK. The service does `new GoogleGenAI(...)` at module load and
// calls `genai.models.generateContent(...)`. vi.mock is hoisted, so the shared
// mock fn is created via vi.hoisted to be reachable in both the factory and tests.
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  // The service imports `Type` for its response schema — provide a stub.
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY',
  },
}));

import { classifyLeafImage } from '../../src/services/gemini.service';

beforeEach(() => {
  generateContent.mockReset();
});

describe('classifyLeafImage — happy path', () => {
  it('maps a well-formed response and flags confidence vs threshold', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        disease_label: 'Late Blight',
        scientific_name: 'Phytophthora infestans',
        confidence: 0.95,
        is_healthy: false,
        top_k: [{ label: 'Late Blight', confidence: 0.95 }],
      }),
    });

    const r = await classifyLeafImage('base64data', 'image/jpeg', 'tomato');
    expect(r.disease_label).toBe('Late Blight');
    expect(r.confidence).toBe(0.95);
    expect(r.is_healthy).toBe(false);
    expect(r.low_confidence).toBe(false); // 0.95 >= 0.65 default threshold
    expect(r.model_version).toContain('gemini:');
    expect(r.model_version).not.toContain(':fallback');
    expect(r.top_k).toHaveLength(1);
  });

  it('clamps out-of-range confidences into [0,1]', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        disease_label: 'X',
        confidence: 5,
        is_healthy: false,
        top_k: [{ label: 'Y', confidence: -3 }],
      }),
    });
    const r = await classifyLeafImage('b', 'image/png', 'potato');
    expect(r.confidence).toBe(1);
    expect(r.top_k[0].confidence).toBe(0);
  });

  it('flags low_confidence when below the threshold', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        disease_label: 'Uncertain',
        confidence: 0.2,
        is_healthy: false,
      }),
    });
    const r = await classifyLeafImage('b', 'image/jpeg', 'rice');
    expect(r.low_confidence).toBe(true);
  });
});

describe('classifyLeafImage — degraded fallback (never throws)', () => {
  function expectFallback(r: Awaited<ReturnType<typeof classifyLeafImage>>) {
    expect(r.disease_label).toBe('Unknown');
    expect(r.confidence).toBe(0);
    expect(r.is_healthy).toBe(false);
    expect(r.top_k).toEqual([]);
    expect(r.low_confidence).toBe(true);
    expect(r.model_version).toContain(':fallback');
  }

  it('returns a fallback when the SDK throws (network/rate-limit/auth)', async () => {
    generateContent.mockRejectedValue(new Error('429 rate limited'));
    expectFallback(await classifyLeafImage('b', 'image/jpeg', 'tomato'));
  });

  it('returns a fallback on an empty response', async () => {
    generateContent.mockResolvedValue({ text: '' });
    expectFallback(await classifyLeafImage('b', 'image/jpeg', 'tomato'));
  });

  it('returns a fallback on unparseable JSON', async () => {
    generateContent.mockResolvedValue({ text: 'not json {{{' });
    expectFallback(await classifyLeafImage('b', 'image/jpeg', 'tomato'));
  });
});
