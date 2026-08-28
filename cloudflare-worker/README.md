# Cloudflare Worker — Cabinet Workshop OS

## 1) Deploy
این پوشه مستقل است. لازم نیست GitHub Actions بسازی.

در Cloudflare Workers یک Worker با نام `cabinet-backup-worker` بساز و محتوای `worker.js` را Deploy کن.

یا با Wrangler:

```bash
npx wrangler deploy cloudflare-worker/worker.js --config cloudflare-worker/wrangler.toml
```

## 2) Secrets
در Cloudflare Dashboard → Worker → Settings → Variables and Secrets این دو مقدار را بساز:

- `TELEGRAM_BOT_TOKEN` → **Secret**
- `TELEGRAM_CHAT_ID` → می‌تواند Text باشد؛ برای امنیت بیشتر Secret هم قابل استفاده است.

اختیاری:

- `ALLOWED_ORIGIN` → آدرس دقیق GitHub Pages
- `BACKUP_SHARED_KEY` → Secret اضافی برای حفاظت از endpoint
- `TELEGRAM_THREAD_ID` → اگر مقصد یک Forum Topic است

Cloudflare توصیه می‌کند API key و auth token فقط به‌صورت Secret ذخیره شوند و در Worker از طریق `env.SECRET_NAME` خوانده شوند. citeturn546536search0turn546536search8

## 3) تست
این آدرس باید JSON برگرداند:

`GET https://YOUR-WORKER/health`

و اپ از این endpoint برای تست واقعی Telegram استفاده می‌کند:

`POST https://YOUR-WORKER/test-telegram`

اگر این endpoint موفق شود، Worker واقعاً توانسته به Bot API متصل شود.

## 4) Backup
اپ درخواست `multipart/form-data` به `/backup` می‌فرستد و سه فایل را ارسال می‌کند:

- `.kwm`
- `.xlsx`
- `.pdf`

Worker هر فایل را جداگانه به Telegram `sendDocument` می‌فرستد. Bot API برای `sendDocument` در حال حاضر فایل‌های تا 50 MB را مستند می‌کند؛ Worker برای احتیاط سقف 45 MB دارد. citeturn546536search11

## 5) مشکل Worker قبلی شما
آدرس فعلی شما هنگام بررسی مستقیم `GET /` با HTTP 405 پاسخ داد. این با نسخه Worker که در پروژه قبلی نوشته شده بود (`GET /` باید 200 بدهد) سازگار نیست؛ بنابراین به احتمال زیاد نسخه Deploy شده با فایل محلی شما یکی نیست یا route دیگری روی Worker فعال است.

نسخه جدید عمداً endpointهای واضح `/health`, `/test-telegram`, `/backup` دارد تا عیب‌یابی ساده شود.

CORS نیز روی OPTIONS و پاسخ‌های واقعی باید اعمال شود؛ Worker آن را روی همه endpointهای این نسخه انجام می‌دهد. citeturn546536search4turn546536search9
