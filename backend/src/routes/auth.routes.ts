import { Router } from 'express';
import {
  adminForgotPassword,
  adminLogin,
  adminMfaComplete,
  adminLogout,
  adminLogoutAll,
  adminMe,
  adminResetPassword,
  customerForgotPassword,
  customerResetPassword,
  login,
  logout,
  logoutAll,
  me,
  register,
  updateCustomerPhone,
} from '../controllers/auth.controller.js';
import { requireAdmin,requireCustomer } from '../middleware/auth.middleware.js';
import { verifyCustomerEmail, resendCustomerEmailCode } from '../controllers/email-verification.controller.js';

export default Router()
  .post('/register', register)
  .post('/login', login)
  .post('/email/verify', verifyCustomerEmail)
  .post('/email/resend', resendCustomerEmailCode)
  .post('/password/forgot', customerForgotPassword)
  .post('/password/reset', customerResetPassword)
  .get('/me', requireCustomer, me)
  .patch('/me/phone', requireCustomer, updateCustomerPhone)
  .post('/logout', requireCustomer, logout)
  .post('/logout-all', requireCustomer, logoutAll)
  .post('/admin/login', adminLogin)
  .post('/admin/mfa/complete', adminMfaComplete)
  .post('/admin/password/forgot', adminForgotPassword)
  .post('/admin/password/reset', adminResetPassword)
  .get('/admin/me', requireAdmin, adminMe)
  .post('/admin/logout', requireAdmin, adminLogout)
  .post('/admin/logout-all', requireAdmin, adminLogoutAll);
