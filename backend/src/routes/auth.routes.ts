import { Router } from 'express';
import {
  adminForgotPassword,
  adminLogin,
  adminLogout,
  adminMe,
  adminResetPassword,
  customerForgotPassword,
  customerResetPassword,
  login,
  logout,
  me,
  register,
} from '../controllers/auth.controller.js';
import { requireAdmin,requireCustomer } from '../middleware/auth.middleware.js';

export default Router()
  .post('/register', register)
  .post('/login', login)
  .post('/password/forgot', customerForgotPassword)
  .post('/password/reset', customerResetPassword)
  .get('/me', requireCustomer, me)
  .post('/logout', requireCustomer, logout)
  .post('/admin/login', adminLogin)
  .post('/admin/password/forgot', adminForgotPassword)
  .post('/admin/password/reset', adminResetPassword)
  .get('/admin/me', requireAdmin, adminMe)
  .post('/admin/logout', requireAdmin, adminLogout);
