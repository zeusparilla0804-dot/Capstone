# LA Chef Portal Dashboard Visual System Design

**Date:** 2026-10-13
**Status:** Approved

## Objective

Redesign the authenticated customer and administrator portals so they share a refined LA Chef identity: a white operational canvas, near-black navigation, and restrained antique-gold rules and accents. The portals must feel premium and editorial without becoming decorative, slow, or difficult to scan.

The implementation must preserve all existing routes, API calls, authentication behavior, booking logic, forms, and database behavior. Preview content was illustrative only; the application must render actual service data and Philippine peso values.

## Scope

### Included

- Shared dashboard sidebar styling and behavior
- Desktop sidebar expansion and collapse
- Mobile sidebar drawer behavior
- Accessible navigation badges sourced from existing application data
- Customer dashboard information hierarchy and responsive layout
- Admin dashboard information hierarchy and responsive layout
- Shared portal colors, spacing, typography, dividers, controls, loading, empty, and error states
- Visual consistency across existing customer and admin portal pages that already consume the shared sidebar
- Component, unit, production build, and browser viewport verification

### Excluded

- Public homepage, packages page, events page, and public header redesign
- Login and registration redesign
- Backend endpoints, database migrations, authentication, authorization, and business rules
- New notification center, real-time sockets, or unread-notification persistence
- Changes to quotation, payment, package, or booking calculations
- Hardcoded sample events, customers, balances, badge counts, or dates

## Approved Direction

The approved direction uses one shared visual language with different information density by audience.

- **Customer portal:** calm and guided. The main dashboard emphasizes the next event, planning progress, upcoming bookings, and billing status.
- **Admin portal:** dense and operational. The main dashboard emphasizes priority queues, records needing attention, payments, bookings, and verified financial information.
- **Navigation:** a near-black sidebar with white labels, muted secondary text, and antique-gold active indicators and badges.
- **Content:** a true white or very light neutral canvas with near-black text and fine gold or neutral dividers. Major page regions are separated by space and rules rather than stacked decorative cards.

## Visual Tokens

Portal-specific tokens will be layered on top of the existing global design tokens instead of replacing public-site tokens.

| Purpose | Value |
| --- | --- |
| Portal canvas | `#ffffff` |
| Subtle surface | `#fafafa` |
| Sidebar | `#171816` |
| Sidebar hover | `#242521` |
| Primary text | `#171814` |
| Secondary text | `#6f706b` |
| Neutral divider | `#e7e4dd` |
| Gold accent | `#a67c2e` |
| Gold divider | `rgba(166, 124, 46, 0.42)` |
| Error | Existing semantic danger token |
| Success/warning | Existing semantic tokens, desaturated where needed |

Gold is an accent, not a background theme. It is reserved for active navigation, fine rules, notification badges, key amounts, and primary emphasis. Large gold panels, gradients, glow effects, and heavy shadows are prohibited.

Headings continue to use the established LA Chef serif. Body text, controls, tables, and navigation continue to use the established sans serif. Letter spacing remains zero except for small uppercase metadata labels.

## Shared Sidebar

The existing `DashboardSidebarComponent` remains the navigation owner. It will be extended rather than replaced.

### Navigation model

`DashboardNavItem` gains an optional badge value. A badge is rendered only for a positive, actionable count. The badge has an accessible label so the count is not conveyed through color alone. Counts must come from existing services:

- Admin booking review, payment verification, and failed-email counts come from the existing admin dashboard response.
- Customer booking attention count is derived from the customer's loaded bookings and only represents actionable/current records.
- If data is unavailable or an API request fails, the navigation remains usable and the badge is omitted. No fake fallback count is shown.

### Expanded desktop state

- Width: approximately `272px`
- Full LA Chef wordmark, user identity, labels, badges, and logout actions are visible.
- Active items use a slim gold edge and a quiet dark hover/active surface.
- The collapse control is a proper icon button with an accessible label and tooltip.

### Collapsed desktop state

- Width: approximately `80px`
- Only icons, avatar initials, badges, and the expand control remain visible.
- Every icon-only control exposes an accessible name and native/CSS tooltip.
- Content columns reclaim the released width without a blank track.
- The preference is persisted locally for that browser. It does not affect authentication or server state.

### Mobile state

- At widths below `768px`, desktop collapse is replaced by the existing off-canvas drawer pattern.
- A sticky `64px` portal header contains the LA Chef brand, a notification indicator when applicable, and a menu button.
- Opening the drawer traps keyboard focus; Escape and backdrop click close it; closing restores focus to the trigger.
- The drawer respects safe-area insets, uses `100dvh`, and scrolls independently when content is taller than the viewport.

### Motion

Sidebar width and drawer movement use short `180-220ms` transitions. Reduced-motion users receive an immediate state change. Only transform, opacity, and the grid track transition are animated.

## Customer Dashboard

The customer dashboard is reorganized around one question: "What do I need to know or do for my next event?"

### Header

- Personalized greeting from the authenticated user
- Short, factual supporting text
- Notification shortcut linking to the most relevant customer records, only when an actionable count exists
- A clear `Plan another event` or equivalent primary action, without duplicate competing CTAs

### Next event

The nearest current/upcoming booking becomes the primary region. It shows only data already present in the booking model: event date/time, name/type, venue, guest count, package, status, and a route to the booking or payment action.

If there is no booking, this region becomes an intentional empty state with a single event-planning action. Loading and service errors retain the existing retry behavior.

### Planning progress

A three-stage progress indicator summarizes:

1. Event details/request
2. Quotation or booking approval
3. Payment/confirmation

The current step is derived from existing booking and payment statuses. It does not introduce or mutate workflow state. On mobile it becomes a vertical or compact stacked sequence with no horizontal overflow.

### Upcoming bookings and billing

- Upcoming bookings use a compact table at wide viewports and labeled stacked rows on small screens.
- Billing summary uses existing calculated totals, amount paid, balance, invoice ID, and payment eligibility.
- Currency is always formatted as Philippine pesos.
- Existing booking and payment routes remain the action targets.

## Admin Dashboard

The admin dashboard keeps the existing operational data contract and rearranges it into the approved white, black, and gold composition.

### Header and navigation alerts

- Page title and reporting period remain.
- A notification shortcut summarizes actionable queue counts from the existing dashboard response.
- Sidebar badges identify pending booking reviews, payment proofs awaiting review, and failed email notifications.
- Search shown in the concept image is excluded because there is no existing cross-entity search contract.

### Operational summary

Existing priority queues remain the primary metrics. They are displayed as a flat, divided strip rather than individual floating cards. Each metric remains a link to its existing filtered admin route.

### Work areas

- `Needs attention` remains a ranked operational list.
- Financial values remain explicitly separated into verified revenue, submitted proof value, overdue balance, and average confirmed booking.
- Existing reporting month behavior, loading state, error state, and retry action remain unchanged.
- No decorative chart is introduced; the current data is better served by queues, timelines/lists, and ledger-style values.

## Portal-Wide Layout Behavior

Existing customer portal layouts and `AdminShellComponent` will use an automatic sidebar grid track so the shared sidebar can control its expanded/collapsed width. Page content remains `min-width: 0` to prevent horizontal overflow.

Responsive thresholds:

- **1280px and wider:** full operational layout and expanded sidebar by default
- **768px to 1279px:** collapsible sidebar, reduced content padding, simplified grids
- **Below 768px:** drawer navigation, single-column content, table-to-row transformations, full-width primary actions where appropriate
- **Minimum supported width:** `320px`

No text may overlap, truncate essential values, or force the document wider than the viewport. Long names, venues, email addresses, references, and currency values must wrap safely or use intentional ellipsis with a readable title where appropriate.

## Accessibility

- WCAG AA contrast for labels, body text, buttons, badges, focus rings, and error messages
- Visible `:focus-visible` treatment on every interactive control
- Minimum `44px` touch targets on mobile
- Semantic landmarks, headings, lists, tables, and buttons retained
- Sidebar collapse state exposed with `aria-expanded`
- Badge values announced with contextual accessible text
- Status never communicated by color alone
- Reduced-motion support
- Existing focus trap and focus restoration behavior preserved and expanded to the collapse control

## Error, Loading, and Empty States

No page may show sample business data while an API request is pending or failed.

- Loading states use stable, layout-matched placeholders or concise status text without shifting the whole page.
- Errors stay contextual and preserve retry actions.
- Empty states explain what is absent and offer one relevant next action.
- Sidebar badge failures are non-blocking; navigation stays functional with badges omitted.

## Implementation Boundaries

Primary files expected to change:

- `frontend/src/styles.scss`
- `frontend/src/app/shared/components/dashboard-sidebar/*`
- `frontend/src/app/shared/components/admin-shell/*`
- `frontend/src/app/shared/navigation/customer-navigation.ts`
- `frontend/src/app/features/customer-dashboard/*`
- `frontend/src/app/features/admin-dashboard/*`
- Customer portal page layout styles that currently reserve a fixed `252px` sidebar track
- Existing component and end-to-end tests for sidebar, customer dashboard, and admin dashboard

The implementation may add a small focused portal-navigation state service if needed to centralize collapse preference and badge derivation. It must not add a new UI framework, icon package, charting package, state library, or backend endpoint.

## Verification

The work is complete only when all of the following pass:

1. Shared sidebar unit tests for expanded, collapsed, mobile drawer, keyboard, action, and badge behavior
2. Customer dashboard tests for real-data next event, progress state, billing, loading, empty, and error paths
3. Admin dashboard tests for queue badges, filtered links, loading, empty, and error paths
4. Full Angular test suite
5. Angular production build
6. Playwright checks at representative desktop, tablet, and mobile widths
7. Browser screenshots confirming no overlap, horizontal scrolling, clipped text, blank content, or inaccessible icon-only controls

## Acceptance Criteria

- Customer and admin portals visibly share the approved black, white, and restrained-gold LA Chef system.
- The sidebar collapses on desktop and behaves as an accessible drawer on mobile.
- Admin attention counts are immediately visible without hardcoded values.
- Customer content prioritizes the next event and clearly communicates booking, quotation, and payment progress.
- Existing functionality, routes, authentication, and API behavior remain intact.
- The portal remains usable at `320px` width and across desktop viewports.
- No sample preview data is introduced into production source.
