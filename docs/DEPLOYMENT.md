# Deployment

## A) GitHub Pages

### محل فایل‌ها
همه فایل‌های ریشه این بسته را در ریشه repository `mehrdadmb2/cabinet-workshop-manager` قرار بده.

ساختار باید دقیقاً شبیه این باشد:

```text
cabinet-workshop-manager/
├── index.html
├── config.js
├── manifest.json
├── sw.js
├── .nojekyll
├── assets/
├── js/
├── cloudflare-worker/
└── docs/
```

GitHub Pages برای انتشار branch-based به `index.html` در ریشه publishing source نیاز دارد. citeturn827515search0turn827515search2

## B) Cloudflare Worker

فقط پوشه `cloudflare-worker` برای Worker است؛ آن را داخل GitHub Pages اجرا نکن.

### Secrets

`TELEGRAM_BOT_TOKEN` → Secret

`TELEGRAM_CHAT_ID` → Text یا Secret

اختیاری:

`ALLOWED_ORIGIN` → origin دقیق سایت

مثال:

```text
https://mehrdadmb2.github.io
```

`BACKUP_SHARED_KEY` → یک Secret اضافی در صورت نیاز

Cloudflare تأکید می‌کند credentialهای حساس را در Secrets نگه دارید، نه در vars عمومی. citeturn546536search0turn546536search1

## C) بررسی Worker

```text
GET  /health
POST /test-telegram
POST /backup
```

درخواست `/test-telegram` به `getMe` تلگرام وصل می‌شود؛ بنابراین فقط وجود Worker را بررسی نمی‌کند، بلکه اعتبار Bot Token و دسترسی Bot API را هم تست می‌کند.

`sendDocument` برای ارسال فایل استفاده می‌شود. Telegram Bot API در حال حاضر سقف مستندشده 50 MB برای این متد دارد؛ Worker پروژه سقف محافظه‌کارانه 45 MB اعمال می‌کند. citeturn546536search11

## D) وضعیت Worker فعلی شما

آدرس:

`https://cabinet-backup-worker.game-developer-mb.workers.dev/`

در بررسی مستقیم `GET /` با 405 پاسخ داد. این نشان می‌دهد Worker Deploy شده با نسخه‌ای که قبلاً در کد پروژه نوشته شده بود یکسان نیست؛ به همین دلیل نسخه جدید endpointهای مشخص و قابل تست دارد.
