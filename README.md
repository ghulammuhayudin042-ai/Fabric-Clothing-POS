# Fabric & Clothing Store POS
Node.js 22+ (built-in SQLite, no npm install needed) + plain JavaScript UI.

## Run (Windows PowerShell, inside this folder)
    npm run seed      # optional demo data (23 products, 20 rolls, 8 customers, 30 days of sales, returns, expenses), all marked [DEMO]. Skip for a clean database.
    npm start         # then open http://localhost:3000
    npm test          # 18 automated tests
Clean database: stop the server, delete data/pos.db, start again (an admin account is created automatically).
Demo logins: admin/admin123, manager/manager123, cashier/cashier123 (change them). Clean DB: admin/admin123.

## Folder layout
- db/schema.sql - full schema (PKs, FKs, indexes, constraints); applied automatically on start
- src/money.js - integer money (paisa) and quantity (thousandths) helpers
- src/core.js - business logic in DB transactions (sales, returns, exchange, purchases, shifts, users, adjustments)
- src/server.js - HTTP API, sessions, role checks; public/index.html - UI, print templates, labels
- test/ - automated tests; scripts/restore.js - restore a backup; electron/main.js - desktop wrapper (untested)
- docs/Fabric_POS_Report.pdf - setup, design, test checklist, limitations, screenshots; screenshots/ - raw images

## Rules implemented
Costing: weighted average. Profit = net sales (after discounts/returns) - cost of goods sold; operating expenses are NOT deducted and are reported separately.
Backup: Settings > Backup now (writes data/backup-*.db). Restore: stop server, `node scripts/restore.js data/backup-XXXX.db`.
Known limitations: see the PDF (no physical-printer test, Electron installer not built, currency display fixed to PKR).


## Frontend (React + Vite)
The screen you see is a React app in `client/`. A ready-built copy is in `client/dist`, so `npm start` is all you need.
- Icons: react-icons (Lucide set) · Charts: Recharts · Barcodes: JsBarcode (Code128) · Camera scanning: html5-qrcode
- Change the UI: `npm run dev:client` (hot reload on http://localhost:5173, API proxied to :3000), then `npm run build` to refresh `client/dist`.

## Barcode scanning
- **USB / Bluetooth scanner:** plug in and scan. It works anywhere on the New Sale, Returns, Products, Purchases and Stock screens, with no need to click a box first.
- **Camera:** press the Camera button (phone or laptop webcam). Needs `http://localhost` or HTTPS.
- **Labels:** Products > select items > Barcode labels (40x25, 50x30, 58x40 mm). Receipts carry a Code128 barcode of the invoice number; scan it on the Returns screen to open that invoice.

## Put it online (Render)
1. Push this folder to GitHub. 2. On render.com choose New > Blueprint (or Web Service) and pick the repo.
3. If asked: Build `npm run build`, Start `npm run seed && npm start`, env `NODE_VERSION=22`.
The free plan resets the database on every deploy (demo data returns). Change the default passwords before sharing the link.
Netlify and other static hosts cannot run this app because it needs the Node server.
