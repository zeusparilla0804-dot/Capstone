import type { NextFunction, Request, Response } from 'express';
import { environment } from '../config/environment.js';
import { authService } from '../services/auth.service.js';
import { passwordRecoveryService } from '../services/password-recovery.service.js';
import type { PasswordResetPrincipal } from '../utils/password-reset-token.js';
import { AppError } from '../utils/app-error.js';
import { ADMIN_SESSION_COOKIE, readCookie, SESSION_COOKIE } from '../utils/session.js';
import { emailAddress, philippineMobileNumber, registrationEmailAddress, text } from '../utils/validation.js';
import { newPassword } from '../utils/password-policy.js';

const cookieOptions = (expires?: Date) => ({
  httpOnly: true,
  secure: environment.isProduction,
  sameSite: 'lax' as const,
  expires,
  path: '/'
});

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as Record<string, unknown>;
    const result = await authService.register({
      firstName: text(body['firstName'], 'First name', { max: 100 }),
      lastName: text(body['lastName'], 'Last name', { max: 100 }),
      email: registrationEmailAddress(body['email']),
      phone: philippineMobileNumber(body['phone']),
      password: newPassword(body['password'])
    });
    res.status(201).json({ success: true, data: result.user });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(registrationEmailAddress(req.body?.email), text(req.body?.password, 'Password', { max: 128 }), req.ip);
    res.cookie(SESSION_COOKIE, result.session.token, cookieOptions(result.session.expiresAt)).json({ success: true, data: result.user });
  } catch (error) {
    next(error);
  }
}
export async function updateCustomerPhone(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.customer) throw new AppError(401, 'Authentication required.');
    const phone = philippineMobileNumber(req.body?.phone);
    const user = await authService.updatePhone(req.customer.id, phone);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}
export function me(req:Request,res:Response){res.json({success:true,data:req.customer});}
export async function logout(req:Request,res:Response,next:NextFunction){try{const token=readCookie(req.headers.cookie,SESSION_COOKIE);if(token)await authService.logout(token);res.clearCookie(SESSION_COOKIE,cookieOptions()).status(204).send();}catch(e){next(e);}}
export async function logoutAll(req:Request,res:Response,next:NextFunction){try{await authService.logoutAllCustomerSessions(req.customer!.id);res.clearCookie(SESSION_COOKIE,cookieOptions()).status(204).send();}catch(e){next(e);}}
export async function adminLogin(req:Request,res:Response,next:NextFunction){try{const result=await authService.adminLogin(text(req.body?.identity,'Email or username',{max:255}),text(req.body?.password,'Password',{max:128}),req.ip);if('requiresMfa' in result){res.setHeader('Cache-Control','no-store');res.json({success:true,data:result});return;}res.cookie(ADMIN_SESSION_COOKIE,result.session.token,cookieOptions(result.session.expiresAt)).json({success:true,data:result.user});}catch(e){next(e);}}
export async function adminMfaComplete(req:Request,res:Response,next:NextFunction){try{const challenge=text(req.body?.challenge,'Challenge',{min:40,max:50});const code=text(req.body?.code,'Verification code',{min:6,max:20});const result=await authService.completeAdminMfa(challenge,code);res.setHeader('Cache-Control','no-store');res.cookie(ADMIN_SESSION_COOKIE,result.session.token,cookieOptions(result.session.expiresAt)).json({success:true,data:{...result.user,recoveryCodes:result.recoveryCodes}});}catch(e){next(e);}}
export function adminMe(req:Request,res:Response){res.json({success:true,data:req.admin});}
export async function adminLogout(req:Request,res:Response,next:NextFunction){try{const token=readCookie(req.headers.cookie,ADMIN_SESSION_COOKIE);if(token)await authService.adminLogout(token);res.clearCookie(ADMIN_SESSION_COOKIE,cookieOptions()).status(204).send();}catch(e){next(e);}}
export async function adminLogoutAll(req:Request,res:Response,next:NextFunction){try{await authService.logoutAllAdminSessions(req.admin!.id);res.clearCookie(ADMIN_SESSION_COOKIE,cookieOptions()).status(204).send();}catch(e){next(e);}}

const genericRecoveryMessage = 'If an account uses that email, password reset instructions will arrive shortly.';

function forgotPassword(principalType: PasswordResetPrincipal) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await passwordRecoveryService.request(principalType, emailAddress(req.body?.email));
      res.status(202).json({ success: true, message: genericRecoveryMessage });
    } catch (error) {
      next(error);
    }
  };
}

function resetPassword(principalType: PasswordResetPrincipal) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = text(req.body?.token, 'Reset token', { max: 100 });
      const password = newPassword(req.body?.password);
      const confirmation = text(req.body?.confirmPassword, 'Password confirmation', { min: 8, max: 128 });
      if (password !== confirmation) throw new AppError(400, 'Passwords do not match.');
      await passwordRecoveryService.reset(principalType, token, password, confirmation);
      res.status(200).json({ success: true, message: 'Your password has been changed. Please sign in again.' });
    } catch (error) {
      next(error);
    }
  };
}

export const customerForgotPassword = forgotPassword('CUSTOMER');
export const customerResetPassword = resetPassword('CUSTOMER');
export const adminForgotPassword = forgotPassword('ADMIN');
export const adminResetPassword = resetPassword('ADMIN');
