import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ActionFeedbackService, ActionNotice } from '../services/action-feedback.service';

/** Use errors-only when a surface supplies its own result dialog. */
export const ACTION_FEEDBACK = new HttpContextToken<'automatic' | 'errors-only' | 'silent'>(() => 'automatic');

export const actionFeedbackInterceptor: HttpInterceptorFn = (request, next) => {
  const base = environment.apiBaseUrl.replace(/\/$/, '');
  if (request.url !== base && !request.url.startsWith(`${base}/`)) return next(request);
  const path = request.url.slice(base.length).split('?')[0];
  const mode = request.context.get(ACTION_FEEDBACK);
  const exportRequest = request.method === 'GET' && /^\/admin\/reports\/[^/]+\/export$/.test(path);
  // These writes are background bookkeeping, not a user submitting a decision.
  if (mode === 'silent' || path === '/notifications/read'
    || /\/(?:refresh|heartbeat)$/.test(path)
    || (['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !exportRequest)) return next(request);
  const feedback = inject(ActionFeedbackService);
  const body = request.body as Record<string, unknown> | null;
  const existingDialog = mode === 'errors-only'
    || /^\/bookings(?:$|\/[^/]+\/(?:details|payment-method|payment-proofs)$)/.test(path)
    || (/^\/admin\/bookings\/[^/]+\/status$/.test(path) && body?.['status'] === 'APPROVED');
  return next(request).pipe(tap({
    next: event => {
      if (!(event instanceof HttpResponse)) return;
      const response = event.body as { success?: boolean; message?: string; data?: { reference?: string; requiresMfa?: boolean } } | null;
      if (response?.success === false) {
        feedback.show({ tone: 'error', title: 'Action not completed', message: response.message || 'Please review the details and try again.' });
      } else if (!existingDialog) {
        // Successful sign-out returns directly to the destination without another dialog.
        if (/^\/auth\/(?:admin\/)?logout(?:-all)?$/.test(path)) return;
        // An MFA challenge is an intermediate step, not a successful sign-in.
        if (/\/auth\/admin\/login$/.test(path) && response?.data?.requiresMfa) return;
        const result = resultNotice(path, body, request.method);
        if (/^\/auth\/(?:admin\/)?(?:login|mfa\/complete)$/.test(path)) result.centered = true;
        if (path === '/admin/payments' && response?.data?.reference) {
          result.message = `The payment was saved. Receipt reference: ${response.data.reference}`;
        }
        if (/^\/admin\/bookings\/[^/]+\/complete$/.test(path) && response?.data?.reference) {
          result.message = `The final payment was recorded and the event is Completed. Receipt reference: ${response.data.reference}. Open View receipt for the updated payment record.`;
        }
        feedback.show(result);
      }
    },
    error: (error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && /\/auth\/(?:admin\/)?logout(?:-all)?$/.test(path)) return;
      const message = error instanceof HttpErrorResponse && typeof error.error?.message === 'string' ? error.error.message : '';
      const uncertain = !(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500;
      feedback.show({ tone: 'error', title: uncertain ? 'Could not confirm action' : 'Action not completed', message: message ||
        'We could not confirm this action. Please check the latest record before trying again.' });
    },
  }));
};

function resultNotice(path: string, body: Record<string, unknown> | null, method: string): { tone: ActionNotice['tone']; title: string; message: string; centered?: boolean } {
  let title = 'Changes saved';
  let message = 'Your changes were saved successfully.';
  if (path === '/admin/payments') title = body?.['method'] === 'CASH' ? 'Cash payment recorded' : 'Payment recorded';
  else if (/^\/admin\/bookings\/[^/]+\/complete$/.test(path)) { title = 'Event completed'; message = 'The event is Completed and fully paid. The receipt reflects all recorded payments.'; }
  else if (/\/payment-proofs\/[^/]+\/verify$/.test(path)) title = 'Payment verified and recorded';
  else if (/\/payment-proofs\/[^/]+\/reject$/.test(path)) { title = 'Payment proof rejected'; message = 'The rejection was saved. The customer can submit a replacement proof.'; }
  else if (/^\/admin\/bookings\/[^/]+\/status$/.test(path)) {
    const labels: Record<string, string> = { REJECTED: 'Reservation rejected', CANCELLED: 'Reservation cancelled', CONFIRMED: 'Reservation confirmed', COMPLETED: 'Reservation marked completed', AWAITING_PAYMENT: 'Payment requested' };
    title = labels[String(body?.['status'])] ?? 'Reservation status updated';
    message = 'The new reservation status was saved.';
  }
  else if (/\/bookings\/[^/]+\/cancel$/.test(path)) { title = 'Reservation cancelled'; message = 'Your cancellation was saved.'; }
  else if (/\/bookings\/[^/]+\/invoice$/.test(path)) title = 'Invoice issued';
  else if (/\/packages\/[^/]+\/images$/.test(path)) title = 'Package images updated';
  else if (/^\/admin\/packages(?:\/|$)/.test(path)) title = method === 'POST' ? 'Package created' : 'Package saved';
  else if (/^\/admin\/add-ons(?:\/|$)/.test(path)) title = method === 'POST' ? 'Add-on created' : 'Add-on saved';
  else if (/\/payment-destinations\/bookings\/[^/]+\/assignment$/.test(path)) { title = 'Payment QR assigned'; message = 'The customer can now open their assigned payment instructions.'; }
  else if (/\/payment-destinations\/[^/]+\/availability$/.test(path)) title = body?.['isAvailable'] ? 'Payment QR made available' : 'Payment QR made unavailable';
  else if (/\/payment-destinations(?:\/[^/]+)?$/.test(path)) title = 'Payment QR saved';
  else if (/\/customers\/[^/]+\/status$/.test(path)) title = 'Customer status updated';
  else if (/\/customers\/[^/]+$/.test(path)) title = 'Customer profile saved';
  else if (/\/email-outbox\/[^/]+\/retry$/.test(path)) { title = 'Email queued for retry'; message = 'The email was queued. Delivery status will update after it is processed.'; }
  else if (/\/reports\/[^/]+\/export$/.test(path)) { title = 'Report ready to download'; message = 'Your report was prepared. Your browser will handle the download.'; }
  else if (/\/auth\/me\/phone$/.test(path)) title = 'Contact number updated';
  else if (/\/auth\/admin\/(?:login|mfa\/complete)$/.test(path)) { title = 'Signed in successfully'; message = ''; }
  else if (/\/auth\/(?:login|mfa\/complete)$/.test(path)) { title = 'Signed in successfully'; message = ''; }
  else if (/\/auth\/register$/.test(path)) { title = 'Account created'; message = 'Check your email for the verification code to continue.'; }
  else if (/\/auth\/email\/verify$/.test(path)) { title = 'Email verified'; message = 'Your email verification was accepted.'; }
  else if (/\/auth\/email\/resend$/.test(path)) { title = 'Verification code requested'; message = 'Check your inbox and spam folder for the latest code.'; }
  else if (/\/auth\/(?:admin\/)?password\/forgot$/.test(path)) { title = 'Reset request submitted'; message = 'If the email matches an account, password reset instructions will be sent.'; }
  else if (/\/auth\/(?:admin\/)?password\/reset$/.test(path)) { title = 'Password updated'; message = 'You can now sign in using your new password.'; }
  return { tone: 'success', title, message };
}
