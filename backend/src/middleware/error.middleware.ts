import type { ErrorRequestHandler, RequestHandler } from 'express';
import { environment } from '../config/environment.js';
import { AppError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';
export const notFoundHandler:RequestHandler=(_req,res)=>{res.status(404).json({success:false,message:'Route not found.'});};
export const errorHandler:ErrorRequestHandler=(error,_req,res,_next)=>{ if(error instanceof AppError){res.status(error.statusCode).json({success:false,message:error.message,...(error.code?{code:error.code}:{})});return;}if(error instanceof SyntaxError&&'body' in error){res.status(400).json({success:false,message:'Request body contains invalid JSON.'});return;}logger.error('request.unexpected_error',environment.isProduction?'Unexpected server error.':String(error));res.status(500).json({success:false,message:'Internal server error.'}); };
