import type { NextFunction, Request, Response } from 'express';

import { adminReportService } from '../services/admin-report.service.js';

function attachment(response: Response, kind: 'reservations' | 'payments', csv: string): void {
  const date = new Date().toISOString().slice(0, 10);
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="la-chef-${kind}-${date}.csv"`);
  response.send(csv);
}

export const adminReportController = {
  async reservations(request: Request, response: Response, next: NextFunction) {
    try { response.json({ success: true, data: await adminReportService.reservationReport(request.query) }); }
    catch (error) { next(error); }
  },
  async payments(request: Request, response: Response, next: NextFunction) {
    try { response.json({ success: true, data: await adminReportService.paymentReport(request.query) }); }
    catch (error) { next(error); }
  },
  async reservationExport(request: Request, response: Response, next: NextFunction) {
    try { attachment(response, 'reservations', await adminReportService.reservationCsv(request.query)); }
    catch (error) { next(error); }
  },
  async paymentExport(request: Request, response: Response, next: NextFunction) {
    try { attachment(response, 'payments', await adminReportService.paymentCsv(request.query)); }
    catch (error) { next(error); }
  },
};
