
# Kasir Sambelan Caping Gung — Ready-to-Deploy Web POS

This project is a ready-to-deploy React + Vite web application (TailwindCSS, Recharts, SheetJS, optional Firebase).
It contains the full-featured Kasir (POS) for "Sambelan Caping Gunung".

## What is included
- React + Vite app
- TailwindCSS setup
- Charts (recharts) integrated
- Export to Excel (xlsx)
- IndexedDB persistence (offline-ready)
- BroadcastChannel local sync (multi-tab)
- Firebase integration hooks (optional) — add your config in `src/firebase-config.js`
- Full dashboard with stok, laporan, cetak struk, nomor meja, catatan, pending orders

## How to deploy to Vercel (recommended, free)
1. Unzip this project.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Test locally:
   ```bash
   npm run dev
   ```
   Open http://localhost:5173

4. Deploy to Vercel:
   - Go to https://vercel.com and login (or create an account).
   - Click "New Project" → Import from Git (you can push this folder to GitHub) or use "Deploy" → "Upload" to upload the ZIP.
   - Vercel will detect the Vite project. Build command: `npm run build`, Output directory: `dist`.
   - After deploy, you will get a URL like `https://kasir-sambelan-caping-gung.vercel.app`.

## Firebase (optional)
If you want cloud sync, create a Firebase Realtime Database project and paste the config into `src/firebase-config.js` then set `USE_FIREBASE = true` in the App file.

## Notes
- The project is ready for you to upload to Vercel. If you want, I can prepare the GitHub repository and deploy for you; otherwise follow the README steps.

Enjoy — open the app and try creating orders, adding stok, and exporting reports.
