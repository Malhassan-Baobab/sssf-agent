/**
 * Telegram channel helpers: Bot API calls + conversation persistence.
 * Keeps the webhook handler thin and testable.
 */
import { createClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';

const TG_API = 'https://api.telegram.org';

/** Keep the stored history bounded so it never grows without limit. */
const MAX_HISTORY_MESSAGES = 24;

export function tgToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  return t;
}

export async function sendMessage(chatId: number | string, text: string): Promise<void> {
  // Telegram caps messages at 4096 chars.
  const body = { chat_id: chatId, text: text.slice(0, 4096) };
  await fetch(`${TG_API}/bot${tgToken()}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function sendChatAction(chatId: number | string, action = 'typing'): Promise<void> {
  await fetch(`${TG_API}/bot${tgToken()}/sendChatAction`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}

function db() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function loadHistory(chatId: string): Promise<Anthropic.MessageParam[]> {
  const { data } = await db()
    .from('chat_session')
    .select('history')
    .eq('channel', 'telegram')
    .eq('chat_id', chatId)
    .maybeSingle();
  return (data?.history as Anthropic.MessageParam[]) ?? [];
}

export async function saveHistory(chatId: string, history: Anthropic.MessageParam[]): Promise<void> {
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  await db()
    .from('chat_session')
    .upsert(
      { channel: 'telegram', chat_id: chatId, history: trimmed, updated_at: new Date().toISOString() },
      { onConflict: 'channel,chat_id' }
    );
}

export async function clearHistory(chatId: string): Promise<void> {
  await db().from('chat_session').delete().eq('channel', 'telegram').eq('chat_id', chatId);
}
