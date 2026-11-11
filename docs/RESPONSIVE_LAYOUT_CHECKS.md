# Responsive layout checks

Build the frontend with a Node version supported by `frontend/package.json`, then run from the repository root:

```powershell
cd frontend
npm run build
cd ..
node scripts/check-responsive-layout.cjs
```

The script uses the installed frontend Playwright package and Microsoft Edge in headless mode. It serves only the local production build on a temporary loopback port. API responses are isolated fixtures; it does not access production records or send real messages. The MFA login response is mocked. Other API mutations are blocked, and unexpected GET endpoints fail the audit.

The default matrix covers 320×568, 390×844, 430×932, 768×1024, 1024×768, 1440×900, and 1920×1080 CSS pixels across public, customer, and administrator routes. Additional states open registration, package/add-on editors, customer deactivation, the reports payment tab, booking calendar/add-ons/review/payment selection, cancellation/payment dialogs, MFA setup, password reset forms, and QR assignment. Fixture names, amounts, and account labels exercise wrapping.

Checks detect page overflow, content extending past the viewport, overflowing text, modal bounds, mobile reservation action alignment, excessive reservation-header spacing, browser exceptions, and unexpected redirects. Production Google font requests are fetched and cached for the run; loaded font families appear in the report. Screenshots and JSON are written under ignored `.codex-temp/responsive/`. Inspect the screenshots as well: geometry checks alone do not establish visual correctness.

For a focused repeat:

```powershell
node scripts/check-responsive-layout.cjs --widths=320,768 --states-only
```

`--audit-only` records findings without failing for layout violations. Normal runs fail when layout violations or unhandled API endpoints remain.

These checks establish local Chromium/Edge layout evidence. They do not replace testing on physical devices, Safari/Firefox, browser zoom settings, assistive technologies, or every possible record and interaction state.

## Verified on 2026-11-12

- 49 route/form/dialog states at seven sizes: 343 browser checks, zero reported layout violations, browser exceptions, or unhandled API endpoints.
- 98 focused booking, reservation, and card tests passed; the production frontend build passed.
- Corrected mobile administrator reservation actions, tablet customer reservation headers, narrow administrator QR cards/forms, and clipped mobile booking-step button labels.
- Existing build warnings remain for the booking stylesheet warning budget and the QR library's CommonJS dependencies. The build remains within its error limits.
