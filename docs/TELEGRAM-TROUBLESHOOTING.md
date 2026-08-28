# Telegram Troubleshooting

## Symptom: Health works, but no Telegram message
Check these in order:

1. Open `https://YOUR-WORKER/health` and confirm `telegramConfigured: true`.
2. Open `https://t.me/CabinetWorkshopBot` in Telegram and press **Start** (or send `/start`).
3. Verify `TELEGRAM_CHAT_ID` is the chat you actually want to receive files.
4. Verify `ALLOWED_ORIGINS` contains exactly the browser origin, for GitHub Pages usually `https://mehrdadmb2.github.io`.
5. Deploy the new Worker after changing secrets/variables.
6. From the app, run **Settings → تست واقعی Telegram**.

## What the test means
- `Bot token invalid`: replace the bot token in Cloudflare Secret.
- `Chat ID ... access`: the bot cannot access that chat. In a private chat, open the bot and press Start.
- `sendMessage failed`: token and chat were found, but Telegram rejected the actual message. The Worker returns Telegram's description.
- `Origin not allowed`: fix `ALLOWED_ORIGINS`.
- Browser `Failed to fetch`: usually CORS, DNS, a blocked Worker, or a wrong Worker URL.

## Telegram file limit
The Bot API currently documents `sendDocument` uploads up to 50 MB. The Worker rejects nothing below 50 MB and returns a per-file error when a file exceeds that limit.
