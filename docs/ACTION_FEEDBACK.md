# Action feedback

The Angular root mounts one `ActionFeedbackComponent` for explicit confirmations and server-action results:

- Completed server actions show an acknowledgement dialog after the final HTTP response. Errors show a separate error dialog and still reach the page's existing error handler.
- Local buttons (navigation, filters, expand/collapse, cancel, editing controls) operate without generic click popups. Existing form validation remains in place. Disabled controls stay inactive.

Generic button-selected and cancellation acknowledgement popups have been removed globally. No per-button opt-out attribute is needed. This does not suppress confirmation dialogs or server-action results.

Successful admin and customer logout (including logout from all devices) return directly to their destination without a Signed out result dialog. Logout failures retain error feedback. Admin and customer Signed in result dialogs share centered typography and an Ok button.

`actionFeedbackInterceptor` covers API POST, PUT, PATCH and DELETE requests throughout the admin and customer applications, plus report exports. Progress events, background GET requests, session refreshes and automatic notification read markers do not produce result dialogs.

Booking submission, booking edits, customer payment choice, proof submission and administrator booking approval retain their existing success dialogs. Their failures still use the shared error popup. New flows with their own result dialog can set `ACTION_FEEDBACK` to `errors-only`; background work can set it to `silent` with an `HttpContext`.

Financial decisions explicitly confirm their details before submission: cash recording, verifying/rejecting proof, assigning/changing QR availability and issuing an invoice. Existing booking/account-status/cancellation confirmation flows remain in place. Cancelling a shared confirmation does not send the request. Cash retries retain the existing idempotent receipt reference mechanism.

Native dialogs provide protected focus, Escape cancellation, scroll locking and focus restoration. Result dialogs survive the route change that follows a successful action. An unfinished shared confirmation is cancelled when navigating away. Results are queued so concurrent actions cannot silently overwrite each other.

Tests cover response timing, success/error/rejection, uncertain network outcomes, existing-dialog deduplication, silent cancellation, keyboard focus and silent local buttons. Browser checks use mocked API responses; they do not record real payments.
