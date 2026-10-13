# Frontend verification

Verified on 13 October 2026.

- Production build: `npm run build` passes TypeScript and Vite.
- Domain tests: `npm test` passes 19 tests covering local pickup verification, exact serial matching, idempotent release, location isolation, buyback eligibility, expired quotes, reconciliation snapshots, and exception records.
- Browser: incorrect pickup codes are rejected; matching code, identity confirmation, and serial allow handover. Order status, stock counts, and activity history update together.
- Browser: a released serial produces a sample buyback quote; both verification checkboxes are required; booking creates a local record.
- Browser: reconciliation requires a note for a variance, records the report, and prevents a second report that day.
- Browser: location switching uses separate sample records. Demo exit and re-entry require no credentials.
- Responsive checks: desktop 1440px, mobile 390px and 320px. The pickup page has no horizontal overflow at 320px; visible text has a minimum 10px font. Desktop tables adapt to cards for pickup and inventory; buyback and reconciliation tables can scroll within their panels.

All operations use in-memory data. Reloading restores sample records. No backend, environment variables, provider connections, or shared data service are used. Vercel deployment is prepared, not published.
