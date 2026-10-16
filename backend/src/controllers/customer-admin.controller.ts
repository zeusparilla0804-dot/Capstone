import type { NextFunction, Request, Response } from 'express';

import { customerAdminService } from '../services/customer-admin.service.js';

export const customerAdminController = {
  async updateProfile(request: Request, response: Response, next: NextFunction) {
    try {
      response.json({
        success: true,
        data: await customerAdminService.updateProfile(request.admin!.id, request.params['id'], request.body),
      });
    } catch (error) { next(error); }
  },

  async updateStatus(request: Request, response: Response, next: NextFunction) {
    try {
      const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? request.body as Record<string, unknown>
        : {};
      response.json({
        success: true,
        data: await customerAdminService.setStatus(request.admin!.id, request.params['id'], body['status']),
      });
    } catch (error) { next(error); }
  },
};
