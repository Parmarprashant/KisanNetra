/**
 * Report controller (thin).
 *
 * Parses validated input, delegates to report.service, shapes the response.
 *
 * Regional scoping for officers: report filters live in the body `params`
 * (not the query), so `requireRegionalScope` on the query can't reach them.
 * This controller enforces it directly — an extension officer's `params.region`
 * is overwritten with their own district before the service runs, so they can
 * only ever export their own region's data.
 */
import { Request, Response } from 'express';
import * as reportService from '../services/report.service';
import * as auditService from '../services/audit.service';
import { apiResponse } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { auditContext } from '../utils/auditContext';
import type { CreateReportInput } from '../validators/report.validators';

// POST /api/v1/reports
export const createReport = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateReportInput;

  // Pin an extension officer to their own region regardless of what they sent.
  const params = { ...body.params };
  if (req.user!.role === 'extension_officer' && req.user!.region) {
    params.region = req.user!.region;
  }

  const job = await reportService.createReport({
    requestedByUserId: req.user!.id,
    type: body.type,
    format: body.format,
    params,
  });

  void auditService.log({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'report.generate',
    resource: `ReportJob:${job.job_id}`,
    metadata: { type: job.type, format: job.format, status: job.status },
    ...auditContext(req),
  });

  res.status(201).json(
    apiResponse.success({
      job_id: job.job_id,
      type: job.type,
      format: job.format,
      status: job.status,
      completed_at: job.completed_at,
    }),
  );
});

// GET /api/v1/reports
export const listReports = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = req.query as unknown as {
    page: number;
    limit: number;
  };
  const result = await reportService.listReports({
    userId: req.user!.id,
    page,
    limit,
  });
  res.json(
    apiResponse.success(
      { reports: result.reports },
      { total: result.total, page: result.page, limit: result.limit },
    ),
  );
});

// GET /api/v1/reports/:id
export const getReport = asyncHandler(async (req: Request, res: Response) => {
  const job = await reportService.getReport(req.user!.id, req.params.id);
  res.json(apiResponse.success({ report: job }));
});

// GET /api/v1/reports/:id/download
export const downloadReport = asyncHandler(
  async (req: Request, res: Response) => {
    const { url, filename } = await reportService.getDownloadUrl(
      req.user!.id,
      req.params.id,
    );
    res.json(apiResponse.success({ download_url: url, filename }));
  },
);
