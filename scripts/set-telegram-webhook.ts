/**
 * Register (or show/delete) the Telegram webhook pointing at the Vercel function.
 *
 *   npx tsx scripts/set-telegram-webhook.ts set   https://<app>.vercel.app/api/telegram
 *   npx tsx scripts/set-telegram-webhook.ts info
 *   npx tsx scripts/set-telegram-webhook.ts delete
 *
 * Requires TELEGRAM_BOT_TOKEN (and TELEGRAM_SECRET_TOKEN for `set`) in env/.env.
 */
import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set.');
  process.exit(1);
}
const api = `https://api.telegram.org/bot${token}`;

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'set') {
    const url = process.argv[3];
    if (!url) {
      console.error('Usage: set <https-webhook-url>');
      process.exit(1);
    }
    const secret = process.env.TELEGRAM_SECRET_TOKEN;
    const r = await fetch(`${api}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url,
        secret_token: secret || undefined,
        allowed_updates: ['message'],
        drop_pending_updates: true,
      }),
    });
    console.log(await r.json());
  } else if (cmd === 'info') {
    console.log(await (await fetch(`${api}/getWebhookInfo`)).json());
  } else if (cmd === 'delete') {
    console.log(await (await fetch(`${api}/deleteWebhook`, { method: 'POST' })).json());
  } else {
    console.error('Usage: set <url> | info | delete');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
