# Cabinet Workshop OS 2.3 — Exact File Placement & Deployment Checklist

## 1) GitHub repository
Repository: `mehrdadmb2/cabinet-workshop-manager`

Copy the **contents** of this package (not the outer folder) into the repository root:

```text
cabinet-workshop-manager/
├── index.html
├── config.js
├── manifest.json
├── sw.js
├── .nojekyll
├── robots.txt
├── README.md
├── START-HERE.md
├── DEPLOY-CHECKLIST.md
├── assets/
├── js/
├── docs/
└── cloudflare-worker/
```

Do not put the app under an extra `cabinet-workshop-os-v2/` directory.

## 2) GitHub Pages
Set Pages source to the `main` branch and the repository root. The site origin will normally be:
`https://mehrdadmb2.github.io`

The repository path is not part of the browser **Origin**, so `ALLOWED_ORIGINS` should not include `/cabinet-workshop-manager`.

## 3) Cloudflare Worker
Deploy:
`cloudflare-worker/worker.js`

Worker variables/secrets:

### Secret
`TELEGRAM_BOT_TOKEN` = your NEW BotFather token

### Text or Secret
`TELEGRAM_CHAT_ID` = the destination chat ID

### Text
`ALLOWED_ORIGINS` = `https://mehrdadmb2.github.io`

Optional:
`BACKUP_SHARED_KEY`
`TELEGRAM_THREAD_ID`

After editing variables/secrets, **Deploy** a new Worker version.

## 4) First Telegram test
1. Open `https://t.me/CabinetWorkshopBot`.
2. Press Start / send `/start`.
3. Open `https://YOUR-WORKER/health`.
4. Confirm `telegramConfigured: true`.
5. In the website open **Settings → تست واقعی Telegram**.
6. You must receive a real message.
7. Only after that test **Telegram Backup**.

## 5) If the website says Failed to fetch
Check, in this order:
- Worker URL in `config.js`
- Worker deployment is active
- `ALLOWED_ORIGINS` equals `https://mehrdadmb2.github.io`
- browser console is not reporting a CORS error
- `/health` is reachable

## 6) Security
Rotate the token that was previously pasted into chat or screenshots. Never put the new token in GitHub, `config.js`, HTML or JavaScript. Cloudflare Worker Secrets are the correct storage location.
