# Sampoerna Gold · Stock Point Console

A desktop-first, responsive frontend for stock point staff, built by Newtn Technology. It retains the Sampoerna Gold palette and uses a minimum rendered font size of 10px.

This app runs entirely in the browser. It has no backend, Supabase, authentication provider, payment gateway, or environment-variable setup. Staff sign-in, customer records, prices, inventory, bookings, and reports are demo data. Changes reset when the page reloads. Do not enter real customer or identity information.

## Run locally

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open [the local console](http://127.0.0.1:4176/). Open it through the development server rather than opening `index.html` as a file.

```sh
npm test
npm run build
npm run preview
```

## Available flows

- **Overview:** stock point summary, pending pickups, recent activity, and operational exceptions.
- **Pickup orders:** search orders, inspect customer/order details, verify a demo pickup code, confirm identity and serial numbers, and record handover. Handover updates the local inventory and activity history.
- **Inventory:** inspect available, reserved, and released serialized gold by product.
- **Buyback:** look up a previously released serial, calculate a sample quote, confirm identity and physical condition, and record a booking. This does not process a payment or add bought-back gold to inventory.
- **Reconciliation:** compare physical counts with a stock snapshot, count cash, explain differences, and save a local balanced or exception report.

The console is a separate application from the Reseller + Buyer app. There is no role switcher, and data is not shared between separately deployed frontends.

## Deployment

See [Vercel deployment](docs/DEPLOYMENT.md). The included `vercel.json` configures a static Vite build and route fallback. No secrets, database, server functions, or external provider connections are required.

## Brand

- Primary red: `#B72731`
- Secondary gold: `#C3A753`
- Black: `#1C1C1C`
- White: `#FFFFFF`

The frontend uses React, TypeScript, Vite, and Lucide icons. It adapts the staff workflow to desktop, tablet, and mobile screens.
