import type { NextFunction, Request, Response } from 'express';
import { environment } from '../config/environment.js';
import { authService } from '../services/auth.service.js';
import { ADMIN_SESSION_COOKIE, readCookie, SESSION_COOKIE } from '../utils/session.js';
import { emailAddress, text } from '../utils/validation.js';

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
      email: emailAddress(body['email']),
      phone: text(body['phone'], 'Phone', { min: 7, max: 30 }),
      password: text(body['password'], 'Password', { min: 12, max: 128 })
    });
    res.cookie(SESSION_COOKIE, result.session.token, cookieOptions(result.session.expiresAt)).status(201).json({ success: true, data: result.user });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(emailAddress(req.body?.email), text(req.body?.password, 'Password', { max: 128 }));
    res.cookie(SESSION_COOKIE, result.session.token, cookieOptions(result.session.expiresAt)).json({ success: true, data: result.user });
  } catch (error) {
    next(error);
  }
}
export function me(req:Request,res:Response){res.json({success:true,data:req.customer});}
export async function logout(req:Request,res:Response,next:NextFunction){try{const token=readCookie(req.headers.cookie,SESSION_COOKIE);if(token)await authService.logout(token);res.clearCookie(SESSION_COOKIE,cookieOptions()).status(204).send();}catch(e){next(e);}}
export async function adminLogin(req:Request,res:Response,next:NextFunction){try{const result=await authService.adminLogin(text(req.body?.identity,'Email or username',{max:255}),text(req.body?.password,'Password',{max:128}));res.cookie(ADMIN_SESSION_COOKIE,result.session.token,cookieOptions(result.session.expiresAt)).json({success:true,data:result.user});}catch(e){next(e);}}
export function adminMe(req:Request,res:Response){res.json({success:true,data:req.admin});}
export async function adminLogout(req:Request,res:Response,next:NextFunction){try{const token=readCookie(req.headers.cookie,ADMIN_SESSION_COOKIE);if(token)await authService.adminLogout(token);res.clearCookie(ADMIN_SESSION_COOKIE,cookieOptions()).status(204).send();}catch(e){next(e);}}
