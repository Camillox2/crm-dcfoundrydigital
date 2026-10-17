import { describe, it, expect } from 'vitest';
import { BlogInput, InvoiceInput, markdownHtml, slugify } from '@dcfoundry/shared';
import { askGemini } from '../apps/api/src/assistant-provider.js';
describe('Publishing and module contracts', () => {
  it('requires actual content and future scheduling, and escapes executable HTML', () => {
    expect(
      BlogInput.safeParse({ title: 'Artigo', slug: 'artigo', status: 'published', content: '' })
        .success,
    ).toBe(false);
    expect(
      BlogInput.safeParse({
        title: 'Artigo',
        slug: 'artigo',
        status: 'scheduled',
        content: 'Texto suficiente para ser publicado',
        scheduledAt: new Date(0).toISOString(),
      }).success,
    ).toBe(false);
    const html = markdownHtml(
      '## Um título\n\n<script>alert(1)</script>\n\n[perigo](javascript:alert(1))',
    );
    expect(html).toContain('<h3>Um título</h3>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
    expect(slugify('Inovação & Software em Curitiba')).toBe('inovacao-software-em-curitiba');
  });
  it('does not accept impossible invoice dates or false paid states', () => {
    const base = {
      title: 'Cobrança',
      client: 'Empresa',
      amountCents: 10000,
      dueDate: '2026-02-31',
    };
    expect(InvoiceInput.safeParse(base).success).toBe(false);
    expect(InvoiceInput.safeParse({ ...base, dueDate: '2026-02-28', status: 'paid' }).success).toBe(
      false,
    );
  });
  it('tries configured Gemini alternatives after provider failure without inventing a response', async () => {
    const originalKey = process.env.GEMINI_API_KEY,
      originalModels = process.env.GEMINI_MODELS;
    process.env.GEMINI_API_KEY = 'unit-test-only';
    process.env.GEMINI_MODELS = 'flash-test-1,flash-test-2';
    const calls: string[] = [];
    const send = (async (url: string) => {
      calls.push(url);
      return calls.length === 1
        ? new Response('{}', { status: 429 })
        : Response.json({
            candidates: [
              {
                finishReason: 'STOP',
                content: { parts: [{ text: 'Uma resposta real do provedor de teste.' }] },
              },
            ],
          });
    }) as typeof fetch;
    try {
      const result = await askGemini('Ajude a equipe.', 'Contexto cadastrado.', send);
      expect(result.model).toBe('flash-test-2');
      expect(calls).toHaveLength(2);
    } finally {
      if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalKey;
      if (originalModels === undefined) delete process.env.GEMINI_MODELS;
      else process.env.GEMINI_MODELS = originalModels;
    }
  });
});
