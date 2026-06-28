/**
 * Telegram webhook (Vercel serverless function).
 * Telegram pushes each message here; we run the orchestrator with the chat's
 * persisted history and reply via the Bot API. Stateless across invocations —
 * conversation state lives in Supabase (chat_session).
 *
 * Set TELEGRAM_BOT_TOKEN, TELEGRAM_SECRET_TOKEN, and the Supabase / OpenAI /
 * Anthropic keys as Vercel environment variables.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Orchestrator } from '../orchestrator/agent.js';
import {
  sendMessage,
  sendChatAction,
  loadHistory,
  saveHistory,
  clearHistory,
} from '../orchestrator/channels/telegram.js';

export const config = { maxDuration: 60 };

const WELCOME =
  'أهلاً بك في مساعد صندوق الشارقة للضمان الاجتماعي 👋\n' +
  'اسألني عن المعاش، نهاية الخدمة، شراء الخدمة، أو احسب تقديرك.\n\n' +
  'Welcome to the SSSF assistant. Ask about pensions, end-of-service, or run an estimate.\n' +
  '(اكتب /reset لبدء محادثة جديدة)';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(200).json({ ok: true, note: 'SSSF Telegram webhook' });
    return;
  }

  // Verify the request really comes from Telegram (secret set at setWebhook time).
  const secret = process.env.TELEGRAM_SECRET_TOKEN;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    res.status(401).json({ ok: false });
    return;
  }

  const update = req.body as {
    message?: { chat?: { id?: number }; text?: string };
  };
  const chat = update?.message?.chat?.id;
  const text = update?.message?.text?.trim();

  // Always 200 so Telegram doesn't retry; non-text updates are ignored.
  if (chat == null || !text) {
    res.status(200).json({ ok: true });
    return;
  }
  const chatId = String(chat);

  try {
    if (text === '/start') {
      await sendMessage(chatId, WELCOME);
      res.status(200).json({ ok: true });
      return;
    }
    if (text === '/reset') {
      await clearHistory(chatId);
      await sendMessage(chatId, 'تم بدء محادثة جديدة. / New conversation started.');
      res.status(200).json({ ok: true });
      return;
    }

    await sendChatAction(chatId, 'typing');

    // Persist only a clean text transcript — never tool_use/tool_result blocks,
    // which break the conversation if trimming ever orphans a pair.
    const prior = await loadHistory(chatId);
    const agent = new Orchestrator();
    agent.hydrate(prior);
    const turn = await agent.send(text);
    await saveHistory(chatId, [
      ...prior,
      { role: 'user', content: text },
      { role: 'assistant', content: turn.reply || '…' },
    ]);

    await sendMessage(chatId, turn.reply || '…');
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('telegram handler error:', err);
    try {
      await sendMessage(
        chatId,
        'عذراً، حدث خطأ مؤقت. حاول مرة أخرى أو تواصل مع موظف الصندوق.\n' +
          'Sorry, a temporary error occurred. Please try again or contact an SSSF officer.'
      );
    } catch {
      /* ignore secondary failure */
    }
    res.status(200).json({ ok: true });
  }
}
