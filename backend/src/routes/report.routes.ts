import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const router = Router();

// Generate SoA Report (PDF)
router.get(
  '/soa',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, format = 'pdf' } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    // Check membership
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId as string },
    });

    const entries = await prisma.soAEntry.findMany({
      where: { organizationId: organizationId as string },
      include: {
        control: true,
      },
      orderBy: { control: { controlId: 'asc' } },
    });

    if (format === 'pdf') {
      const pdfDoc = await PDFDocument.create();
      const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const timesBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

      // Title page
      let page = pdfDoc.addPage([595.28, 841.89]); // A4
      const { height } = page.getSize();

      page.drawText('Statement of Applicability', {
        x: 50,
        y: height - 100,
        size: 24,
        font: timesBoldFont,
        color: rgb(0, 0.2, 0.4),
      });

      page.drawText(`Organization: ${organization?.name}`, {
        x: 50,
        y: height - 140,
        size: 14,
        font: timesRomanFont,
      });

      page.drawText(`Generated: ${new Date().toLocaleDateString()}`, {
        x: 50,
        y: height - 160,
        size: 12,
        font: timesRomanFont,
      });

      page.drawText(`ISO 27001:2022 Annex A Controls`, {
        x: 50,
        y: height - 200,
        size: 14,
        font: timesBoldFont,
      });

      // Statistics
      const applicable = entries.filter(e => e.isApplicable).length;
      const notApplicable = entries.filter(e => !e.isApplicable).length;

      page.drawText(`Total Controls: ${entries.length}`, {
        x: 50,
        y: height - 240,
        size: 12,
        font: timesRomanFont,
      });

      page.drawText(`Applicable: ${applicable}`, {
        x: 50,
        y: height - 260,
        size: 12,
        font: timesRomanFont,
      });

      page.drawText(`Not Applicable: ${notApplicable}`, {
        x: 50,
        y: height - 280,
        size: 12,
        font: timesRomanFont,
      });

      // Controls list
      let yPosition = height - 340;
      const lineHeight = 14;
      let currentCategory = '';

      for (const entry of entries) {
        // Add new page if needed
        if (yPosition < 80) {
          page = pdfDoc.addPage([595.28, 841.89]);
          yPosition = height - 50;
        }

        // Category header
        if (entry.control.category !== currentCategory) {
          currentCategory = entry.control.category;
          yPosition -= 20;

          if (yPosition < 100) {
            page = pdfDoc.addPage([595.28, 841.89]);
            yPosition = height - 50;
          }

          page.drawText(currentCategory, {
            x: 50,
            y: yPosition,
            size: 12,
            font: timesBoldFont,
            color: rgb(0.2, 0.4, 0.6),
          });
          yPosition -= lineHeight;
        }

        // Control entry
        const status = entry.isApplicable ? '✓' : '✗';
        const controlText = `${status} ${entry.control.controlId}: ${entry.control.name.substring(0, 60)}`;

        page.drawText(controlText, {
          x: 60,
          y: yPosition,
          size: 10,
          font: timesRomanFont,
          color: entry.isApplicable ? rgb(0, 0.5, 0) : rgb(0.5, 0, 0),
        });

        yPosition -= lineHeight;

        // Justification if not applicable
        if (!entry.isApplicable && entry.justification) {
          const justification = `   Justification: ${entry.justification.substring(0, 70)}`;
          page.drawText(justification, {
            x: 60,
            y: yPosition,
            size: 9,
            font: timesRomanFont,
            color: rgb(0.4, 0.4, 0.4),
          });
          yPosition -= lineHeight;
        }
      }

      const pdfBytes = await pdfDoc.save();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="soa-${organization?.slug}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } else {
      // JSON format
      res.json({
        success: true,
        data: {
          organization: organization?.name,
          generatedAt: new Date().toISOString(),
          entries,
        },
      });
    }
  })
);

// Generate Risk Register Report
router.get(
  '/risks',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, format = 'pdf' } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    // Check membership
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId as string },
    });

    const risks = await prisma.risk.findMany({
      where: { organizationId: organizationId as string },
      include: {
        owner: {
          select: { firstName: true, lastName: true },
        },
        controls: {
          include: {
            control: {
              select: { controlId: true, name: true },
            },
          },
        },
      },
      orderBy: { inherentRisk: 'desc' },
    });

    if (format === 'pdf') {
      const pdfDoc = await PDFDocument.create();
      const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const timesBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

      let page = pdfDoc.addPage([841.89, 595.28]); // A4 Landscape
      const { width, height } = page.getSize();

      // Title
      page.drawText('Risk Register Report', {
        x: 50,
        y: height - 50,
        size: 20,
        font: timesBoldFont,
        color: rgb(0, 0.2, 0.4),
      });

      page.drawText(`Organization: ${organization?.name} | Generated: ${new Date().toLocaleDateString()}`, {
        x: 50,
        y: height - 75,
        size: 10,
        font: timesRomanFont,
      });

      // Table header
      let yPosition = height - 110;
      const columns = [
        { label: 'Risk ID', x: 50, width: 60 },
        { label: 'Title', x: 110, width: 180 },
        { label: 'L', x: 290, width: 25 },
        { label: 'I', x: 315, width: 25 },
        { label: 'Score', x: 340, width: 40 },
        { label: 'Treatment', x: 380, width: 80 },
        { label: 'Status', x: 460, width: 70 },
        { label: 'Owner', x: 530, width: 100 },
      ];

      // Draw header
      columns.forEach(col => {
        page.drawText(col.label, {
          x: col.x,
          y: yPosition,
          size: 9,
          font: timesBoldFont,
        });
      });

      yPosition -= 15;

      // Draw line
      page.drawLine({
        start: { x: 50, y: yPosition + 5 },
        end: { x: width - 50, y: yPosition + 5 },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      });

      // Draw risks
      for (const risk of risks) {
        if (yPosition < 50) {
          page = pdfDoc.addPage([841.89, 595.28]);
          yPosition = height - 50;
        }

        // Risk score color
        const score = risk.inherentRisk || 0;
        const scoreColor = score >= 20 ? rgb(0.8, 0, 0) :
          score >= 12 ? rgb(0.9, 0.5, 0) :
            score >= 6 ? rgb(0.8, 0.8, 0) : rgb(0, 0.6, 0);

        page.drawText(risk.riskId, { x: 50, y: yPosition, size: 8, font: timesRomanFont });
        page.drawText(risk.title.substring(0, 35), { x: 110, y: yPosition, size: 8, font: timesRomanFont });
        page.drawText(String(risk.likelihood), { x: 290, y: yPosition, size: 8, font: timesRomanFont });
        page.drawText(String(risk.impact), { x: 315, y: yPosition, size: 8, font: timesRomanFont });
        page.drawText(String(score), { x: 340, y: yPosition, size: 8, font: timesBoldFont, color: scoreColor });
        page.drawText(risk.treatment, { x: 380, y: yPosition, size: 8, font: timesRomanFont });
        page.drawText(risk.status, { x: 460, y: yPosition, size: 8, font: timesRomanFont });
        page.drawText(`${risk.owner?.firstName || ''} ${risk.owner?.lastName || ''}`.substring(0, 15), {
          x: 530, y: yPosition, size: 8, font: timesRomanFont,
        });

        yPosition -= 14;
      }

      const pdfBytes = await pdfDoc.save();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="risk-register-${organization?.slug}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } else if (format === 'csv') {
      const headers = ['Risk ID', 'Title', 'Category', 'Likelihood', 'Impact', 'Score', 'Treatment', 'Status', 'Owner'].join(',');
      const rows = risks.map(r => [
        r.riskId,
        `"${r.title.replace(/"/g, '""')}"`,
        r.category || '',
        r.likelihood,
        r.impact,
        r.inherentRisk,
        r.treatment,
        r.status,
        `"${r.owner?.firstName || ''} ${r.owner?.lastName || ''}"`,
      ].join(','));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="risk-register-${organization?.slug}.csv"`);
      res.send([headers, ...rows].join('\n'));
    } else {
      res.json({
        success: true,
        data: { organization: organization?.name, risks },
      });
    }
  })
);

// Generate Compliance Summary Report
router.get(
  '/compliance',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, format = 'json' } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    // Check membership
    const membership = authReq.user.organizationMemberships.find(
      m => m.organizationId === organizationId
    );
    if (!membership && authReq.user.role !== 'ADMIN') {
      throw new AppError('You are not a member of this organization', 403);
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId as string },
    });

    // Get control statistics by category
    const controlStats = await prisma.control.groupBy({
      by: ['category', 'implementationStatus'],
      where: { organizationId: organizationId as string },
      _count: true,
      _avg: { implementationPercent: true },
    });

    // Calculate overall compliance
    const totalControls = await prisma.control.count({
      where: { organizationId: organizationId as string },
    });

    const implementedControls = await prisma.control.count({
      where: {
        organizationId: organizationId as string,
        implementationStatus: 'FULLY_IMPLEMENTED',
      },
    });

    const overallCompliance = totalControls > 0
      ? Math.round((implementedControls / totalControls) * 100)
      : 0;

    // Get SoA stats
    const soaStats = await prisma.soAEntry.groupBy({
      by: ['isApplicable'],
      where: { organizationId: organizationId as string },
      _count: true,
    });

    // Get risk summary
    const riskSummary = await prisma.risk.aggregate({
      where: { organizationId: organizationId as string },
      _count: true,
      _avg: { inherentRisk: true, residualRisk: true },
    });

    const report = {
      organization: organization?.name,
      generatedAt: new Date().toISOString(),
      overallCompliance,
      summary: {
        totalControls,
        implementedControls,
        compliancePercentage: overallCompliance,
      },
      controlsByCategory: controlStats.reduce((acc: any, stat) => {
        if (!acc[stat.category]) {
          acc[stat.category] = { total: 0, byStatus: {} };
        }
        acc[stat.category].total += stat._count;
        acc[stat.category].byStatus[stat.implementationStatus] = stat._count;
        return acc;
      }, {}),
      soaOverview: {
        isApplicable: soaStats.find(s => s.isApplicable)?._count || 0,
        notApplicable: soaStats.find(s => !s.isApplicable)?._count || 0,
      },
      riskOverview: {
        totalRisks: riskSummary._count,
        avgInherentRisk: Math.round(riskSummary._avg.inherentRisk || 0),
        avgResidualRisk: Math.round(riskSummary._avg.residualRisk || 0),
      },
    };

    if (format === 'pdf') {
      const pdfDoc = await PDFDocument.create();
      const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const timesBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

      const page = pdfDoc.addPage([595.28, 841.89]);
      const { height } = page.getSize();

      page.drawText('Compliance Summary Report', {
        x: 50,
        y: height - 60,
        size: 22,
        font: timesBoldFont,
        color: rgb(0, 0.2, 0.4),
      });

      page.drawText(`Organization: ${organization?.name}`, {
        x: 50,
        y: height - 90,
        size: 12,
        font: timesRomanFont,
      });

      page.drawText(`Generated: ${new Date().toLocaleDateString()}`, {
        x: 50,
        y: height - 110,
        size: 10,
        font: timesRomanFont,
      });

      // Overall compliance
      page.drawText(`Overall Compliance: ${overallCompliance}%`, {
        x: 50,
        y: height - 160,
        size: 18,
        font: timesBoldFont,
        color: overallCompliance >= 80 ? rgb(0, 0.5, 0) :
          overallCompliance >= 50 ? rgb(0.8, 0.6, 0) : rgb(0.8, 0, 0),
      });

      page.drawText(`${implementedControls} of ${totalControls} controls fully implemented`, {
        x: 50,
        y: height - 185,
        size: 12,
        font: timesRomanFont,
      });

      const pdfBytes = await pdfDoc.save();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="compliance-${organization?.slug}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } else {
      res.json({
        success: true,
        data: report,
      });
    }
  })
);

export default router;
