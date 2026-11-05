import { AppError } from './app-error.js';
import { text } from './validation.js';

// Deliberately bounded starter blocklist. Maintain/expand with reviewed offline breach lists;
// never send the customer's plaintext password to an external service.
const commonPasswords = new Set([
  '123456789012345', '1234567890123456', '12345678901234567890',
  'password123456789', 'password12345678', 'passwordpassword',
  'qwertyuiopasdfgh', 'qwertyuiop123456', 'letmeinletmein123',
  'adminadminadmin', 'lachefpassword123!', 'lachef1234567890',
]);

export function newPassword(value: unknown): string {
  const password = text(value, 'Password', { min: 15, max: 128 });
  if (commonPasswords.has(password.toLowerCase())) {
    throw new AppError(400, 'This password is commonly used. Choose a longer, unique passphrase.', 'PASSWORD_TOO_COMMON');
  }
  return password;
}
