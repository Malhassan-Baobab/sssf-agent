/**
 * Web chat endpoint (Vercel serverless). Powers the browser chat page and the
 * Teams "Website" tab. Stateless: the page sends the running history with each
 * request (clean text only), we hydrate the orchestrator, reply, and the page
 * appends the turn. Optional access code via CHAT_ACCESS_CODE env.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Anthropic from '@anthropic-ai/sdk';
import { Orchestrator } from '../orchestrator/agent.js';

export const config = { maxDuration: 60 };

interface ChatBody {
  message?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  code?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(200).json({ ok: true, note: 'SSSF web chat endpoint' });
    return;
  }

  const body = (req.body ?? {}) as ChatBody;

  const required = process.env.CHAT_ACCESS_CODE;
  if (required && body.code !== required) {
    res.status(401).json({ error: 'unauthorized', message: 'رمز الدخول غير صحيح / Invalid access code.' });
    return;
  }

  const message = (body.message ?? '').trim();
  if (!message) {
    res.status(400).json({ error: 'empty', message: 'Empty message.' });
    return;
  }

  // Keep only clean text turns, bound the length, ensure it starts with a user turn.
  let history: Anthropic.MessageParam[] = (body.history ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content }))
    .slice(-24);
  while (history.length && history[0].role !== 'user') history = history.slice(1);

  try {
    const agent = new Orchestrator();
    agent.hydrate(history);
    const turn = await agent.send(message);
    res.status(200).json({ reply: turn.reply || '…' });
  } catch (err) {
    console.error('web chat error:', err);
    res.status(200).json({
      reply:
        'عذراً، حدث خطأ مؤقت. حاول مرة أخرى.\nSorry, a temporary error occurred — please try again.',
    });
  }
}
