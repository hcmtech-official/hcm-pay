# HCM Pay

A payment-tracking dashboard built under the HCM brand. First real use case: tracking Harish's recurring payments to K.M.

## What's in here

- `index.html` / `style.css` / `app.js` — a static, no-build-step site (plain HTML/CSS/JS). No npm install needed.
- Login gate: username `admin`, password `frog123`
- Payer view / Payee view toggle at the top
- Month progress "tank" (fills red → green as payments land)
- Payment schedule with **log payment** (supports partial payments + rescheduling the remainder to a new date, repeatable)
- "Add extra amount due" — either role can add a one-off amount for any date
- Payday list — Harish's paydays projected every 2 weeks for a year
- Payment history line chart (last 6 months)
- Calendar heatmap for the current month
- Optional "Coin Run" mini-game — pop coins to reveal upcoming amounts/dates, off by default, doesn't touch the main dashboard

## Data

Everything is stored in the browser's `localStorage`, seeded on first load with:
- This month: a one-off catch-up amount of **$1,700** due today
- From next month: **$1,000 every 2 weeks on a Wednesday**, for a year

Because it's `localStorage`, each device/browser has its own copy — there's no shared server database yet. If you and K.M. open the site from different devices, you won't see each other's changes live. That's fine for a first version; worth knowing going in.

## ⚠️ About the login

This is a **client-side-only** gate — the username and password live in `app.js`, visible to anyone who views the page source. It stops a casual visitor from immediately seeing the numbers, but it is **not real security**. Don't use this pattern for anything more sensitive than "keep it out of a random stranger's view."

## Deploying to GitHub Pages

1. Create a new repo under `hcmtech-official`, e.g. `hcm-pay`.
2. Push these three files (`index.html`, `style.css`, `app.js`) to the repo root on `main`.
3. In the repo's Settings → Pages, set the source to deploy from the `main` branch, root folder.
4. Your link will be `https://hcmtech-official.github.io/hcm-pay/`

No build step, no GitHub Actions workflow needed — it's already static.
