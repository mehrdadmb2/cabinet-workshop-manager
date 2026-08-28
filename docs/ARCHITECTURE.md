# Architecture

## لایه‌های اصلی

### 1. Project Model
Project، customer، workbook، drawings، payments، snapshots.

### 2. Workbook Model
هر Sheet به یک آرایه دوبعدی از سلول‌ها تبدیل می‌شود:

- `v` = مقدار
- `f` = فرمول
- `t` = نوع داده
- `merges` = merge regions

### 3. Drawing Model
همه اشیاء در مختصات واقعی millimeter ذخیره می‌شوند. UI فقط Viewport را scale می‌کند.

### 4. Live Parts Sheet
هر بار Drawing تغییر کند، `نقشه-قطعات` بازسازی می‌شود. این Sheet منبع استاندارد Cut List در خروجی Excel است.

### 5. Persistence
IndexedDB → Auto Save → Snapshot → KWM export.

### 6. Backup
Browser → Cloudflare Worker → Telegram Bot API.

## اصل UX

هر عملیات باید سه مسیر داشته باشد:

1. دکمه واضح برای کاربر مبتدی
2. Shortcut برای کاربر سریع
3. Undo/Recovery یا Snapshot برای کاهش ریسک

## محدودیت تعمدی

این پروژه static-first است. هیچ credential حساسی در GitHub Pages منتشر نمی‌شود. Worker تنها مسئول credential و relay است.
