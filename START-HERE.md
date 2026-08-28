# START HERE

## 1) GitHub
محتویات این پوشه را در ریشه repository قرار بده.

این فایل باید وجود داشته باشد:

`/index.html`

نه:

`/cabinet-workshop-manager-final/index.html`

## 2) GitHub Pages

`Settings → Pages → Deploy from a branch → main → /(root) → Save`

## 3) Cloudflare

از `cloudflare-worker/worker.js` یک Worker مستقل بساز.

در Variables and Secrets:

- `TELEGRAM_BOT_TOKEN` → Secret
- `TELEGRAM_CHAT_ID` → مقدار 381200758 شما یا مقصد مدنظر، ترجیحاً در فضای امن

سپس Worker را Deploy کن.

## 4) تست

در مرورگر:

`https://YOUR-WORKER/health`

باید JSON با `ok:true` ببینی.

بعد داخل سایت:

`تنظیمات → بررسی Health`

و سپس:

`تنظیمات → تست واقعی Telegram`

## 5) چرا Worker قبلی مشکل داشت؟

درخواست مستقیم `GET /` برای Worker فعلی شما 405 برگرداند. نسخه جدید به جای تکیه به `/` از `/health`, `/test-telegram`, `/backup` استفاده می‌کند و خطاها را JSON و قابل تشخیص برمی‌گرداند.
