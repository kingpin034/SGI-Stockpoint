# Deploy the Stock Point Console to Vercel

The console is a static, interactive frontend. No backend services or environment variables are needed.

## Project settings

1. Put this folder in a Git repository and import the repository into Vercel.
2. Select **Vite** as the framework. If this app is a subfolder of the repository, set **Root Directory** to that folder.
3. Use the included settings:

| Setting | Value |
| --- | --- |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js | 22.12 or newer |
| Environment variables | None |

4. Deploy and open the generated Vercel URL.

The included `vercel.json` provides the build settings, static route fallback, and standard response headers. Keep the Stock Point Console as its own Vercel project to give it a separate URL from the Reseller + Buyer app.

## Verify before sharing

```sh
npm ci
npm test
npm run build
npm run preview
```

Open `http://127.0.0.1:4176/` while the preview server is running. Check the desktop console and a narrow mobile viewport. Exercise pickup verification and handover, a buyback booking, and a stock reconciliation with a variance note.

## Demo behavior

- All records, staff access, prices, codes, payments, and inventory movements are simulated in browser memory.
- Reloading starts a fresh dataset. Data is not shared across browsers, users, devices, tabs, or the other SGI applications.
- A successful demo sign-in does not authenticate against a real staff account.
- Pickup handover, buyback booking, exception reporting, and reconciliation change only the local demonstration state.
- Buyback booking does not transfer funds, and reconciliation does not send a report to finance.
- There are no backend endpoints, provider credentials, Supabase dependencies, or live financial connections.

Use only sample customer data when demonstrating the console. A future production system would require a separate implementation for authentication, persistent records, and integrations.
