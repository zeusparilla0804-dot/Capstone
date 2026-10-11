# Responsive Browser QA

## Automated Admin Evidence

On 2026-10-03, Playwright verified the administrator login and dashboard at `390`, `768`, `1024`, and `1440` pixels using Microsoft Edge/Chromium. Each case checks page-level horizontal overflow. The 390 px case also opens the navigation drawer by keyboard, closes it, and confirms it is fully off-canvas before capture.

The end-to-end journey verifies administrator login, the dashboard proof queue, authorized inline receipt rendering, keyboard-accessible receipt zoom, the proof page at 390 px, booking detail navigation, proof verification, customer login, and the customer's verified booking state. Run it with:

```powershell
cd frontend
npm run test:e2e
```

Screenshots are written to `frontend/test-results/admin-dashboard-<width>.png`. They are generated evidence and are intentionally ignored by Git.

## Automated Recovery Evidence

On 2026-10-11, Playwright verified customer and administrator forgot/reset routes at `390`, `768`, `1024`, and `1440` pixels in Microsoft Edge/Chromium. Every route-width combination checks page-level horizontal overflow and captures generated evidence under `frontend/test-results/recovery-<route>-<width>.png`.

The recovery journey also verifies keyboard submission, exact customer/admin API selection, generic sent copy that does not reveal account existence, missing and rejected token states, role-correct return links, successful password-change copy, and removal of the token-bearing query string through history replacement.

## Manual Release Matrix

Automated checks do not replace device and assistive-technology review. Before production, test widths `320`, `375`, `390`, `768`, `1024`, and `1440` with representative short and long data values.

| Area | Screens | Required checks |
| --- | --- | --- |
| Public | Header, Home, Packages, Login, Recovery, 404 | Mobile menu, image gallery, filters, CTA wrapping, labels, errors, token-free success URL |
| Booking | Event details, package/add-ons, review, checkout | Stepper, field sizing, totals, pending state, retained input |
| Customer | Dashboard, My Bookings, Payment Proof, Invoice | Drawer, cards, long references, upload states, table/print layout |
| Admin | Login, Dashboard, Bookings, Customers, Payments, Outbox, Audit, Catalog | Drawer, filters, record layouts, proof viewer, dialogs, status actions |

At each width:

1. Load every route directly and through navigation.
2. Check `document.documentElement.scrollWidth <= window.innerWidth` outside intentional table scrollers.
3. Open and close public, customer, and admin mobile navigation using touch and keyboard.
4. Tab through links, controls, dialogs, and primary actions; verify visible focus and logical order.
5. Trigger validation, loading, empty, conflict, expired-session, and API-error states.
6. Test long names, venues, references, filenames, reasons, and currency values.
7. Confirm tables scroll inside their own container without moving the page.
8. Test proof upload/viewing on a real phone and verify no browser input zoom or trapped horizontal gestures.
9. Verify invoice screen and print preview.
10. Check reduced-motion mode, 200% zoom, screen-reader names, and color contrast.

Record browser/OS, device, date, tester, failures, fixes, and retest result before release approval.
