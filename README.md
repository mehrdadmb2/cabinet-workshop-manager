# Cabinet Workshop OS 2.0

یک Web App حرفه‌ای و Mobile-first برای جایگزین کردن گردش کار Excel در کارگاه کابینت و کمد.

## نکته اصلی معماری

Excel در این پروژه «سیستم اصلی» نیست. Excel فقط برای **Import/Export** استفاده می‌شود. بعد از Import، داده‌ها به مدل داخلی پروژه منتقل می‌شوند و ادامه کار در خود سایت انجام می‌شود.

### قابلیت‌ها

- داشبورد ساده و مناسب کاربر مبتدی
- مدیریت پروژه و مشتری
- Import چندشیتی Excel به پروژه
- ویرایش همه Sheetها داخل Web App
- افزودن/حذف Sheet، ردیف و ستون
- نمایش Workbook به صورت Grid شبیه Excel
- Drawing Studio دوبعدی با واحد واقعی
- ابزار Select / Line / Polyline / Rectangle / Circle / Dimension / Text / Pan
- Grid و Snap قابل تنظیم
- Zoom و Fit
- نمایش خودکار اندازه شیء انتخاب‌شده
- ویرایش دقیق X/Y/Width/Height در Property panel
- شیت زنده `نقشه-قطعات` که با Drawing به‌صورت خودکار همگام می‌شود
- Snapshot
- Auto Save در IndexedDB
- فایل قابل انتقال `.kwm`
- خروجی `.xlsx`
- خروجی PDF پروژه
- خروجی PDF نقشه
- خروجی CSV
- Telegram Backup از مسیر امن Cloudflare Worker
- PWA و استفاده روی گوشی/تبلت/دسکتاپ
- بدون نیاز به GitHub Actions برای انتشار سایت

## ساختار پوشه

```text
/                           ← ریشه ریپو و GitHub Pages
│
├── index.html              ← نقطه ورود سایت
├── config.js               ← آدرس Worker و تنظیمات اپ
├── manifest.json           ← PWA
├── sw.js                   ← Offline cache
├── .nojekyll               ← جلوگیری از Jekyll processing
│
├── assets/
│   ├── app.css             ← کل استایل اپ
│   └── icon.svg            ← آیکون PWA
│
├── js/
│   └── app.js              ← منطق اصلی اپ
│
├── cloudflare-worker/
│   ├── worker.js           ← API امن Telegram
│   ├── wrangler.toml       ← تنظیمات Worker
│   └── README.md           ← نصب و تنظیم
│
└── docs/
    ├── ARCHITECTURE.md
    ├── DEPLOYMENT.md
    ├── WORKBOOK-MAPPING.md
    └── USER-GUIDE.md
```

## نصب روی GitHub Pages

تمام محتویات این بسته را مستقیماً در ریشه repository قرار بده؛ `index.html` باید در ریشه Publishing Source باشد. GitHub Pages سایت‌های branch-based را از `/` یا `/docs` منتشر می‌کند و در حالت root وجود `index.html` ضروری است. برای branch-based static publishing نیازی به GitHub Actions نداری. citeturn827515search0turn827515search2

بعد از Push، از:

`Repository → Settings → Pages`

گزینه `Deploy from a branch` را انتخاب کن، Branch را `main` و Folder را `/(root)` بگذار.

## نکته مهم درباره Excel

این نسخه محتویات سلولی، فرمول‌های متنی، merge و عرض ستون‌های اصلی را Import می‌کند. Shapeهای پیچیده Excel مثل SmartArt/Connectorهای Office ممکن است در خروجی browser-based بازسازی دقیق ۱:۱ نشوند. برای همین Drawing Studio مستقل و واقعی داخل Web App قرار داده شده است؛ نقشه جدید باید در سایت ساخته شود تا اندازه‌ها و قطعات به صورت ساختاریافته ذخیره شوند.

## امنیت Telegram

هیچ Bot Tokenی نباید در Frontend قرار بگیرد. Token فقط روی Cloudflare Worker به‌صورت Secret ذخیره می‌شود. Cloudflare برای API tokenها و credentialها استفاده از Secrets را توصیه می‌کند. citeturn546536search0turn546536search8
