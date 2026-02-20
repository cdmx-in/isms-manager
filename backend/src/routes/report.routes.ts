import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const router = Router();

// Generate SoA Report (PDF)
router.get(
  '/soa',
  authenticate,
  requirePermission('soa', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, format = 'pdf' } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
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
      // Get SoA document metadata
      const soaDoc = await prisma.soADocument.findUnique({
        where: { organizationId: organizationId as string },
        include: {
          reviewer: { select: { firstName: true, lastName: true } },
          approver: { select: { firstName: true, lastName: true } },
        },
      });

      const pdfDoc = await PDFDocument.create();
      const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const timesBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

      // Use landscape A4 to fit table columns
      const pageWidth = 841.89;
      const pageHeight = 595.28;

      // Title page
      let page = pdfDoc.addPage([pageWidth, pageHeight]);

      page.drawText('Statement of Applicability', {
        x: 50,
        y: pageHeight - 60,
        size: 22,
        font: timesBoldFont,
        color: rgb(0, 0.2, 0.4),
      });

      page.drawText(`Organization: ${organization?.name}`, {
        x: 50,
        y: pageHeight - 90,
        size: 12,
        font: timesRomanFont,
      });

      page.drawText(`Generated: ${new Date().toLocaleDateString()}  |  ISO 27001:2022 Annex A Controls`, {
        x: 50,
        y: pageHeight - 110,
        size: 10,
        font: timesRomanFont,
      });

      // Document metadata
      if (soaDoc) {
        const statusLabel = soaDoc.approvalStatus === 'APPROVED' ? 'Approved' :
          soaDoc.approvalStatus === 'DRAFT' ? 'Draft' :
          soaDoc.approvalStatus === 'REJECTED' ? 'Rejected' : 'Pending Approval';
        page.drawText(`Version: ${soaDoc.version.toFixed(1)}  |  Status: ${statusLabel}`, {
          x: 50, y: pageHeight - 130, size: 10, font: timesRomanFont,
        });
        const reviewerName = soaDoc.reviewer ? `${soaDoc.reviewer.firstName} ${soaDoc.reviewer.lastName}` : 'Not Assigned';
        const approverName = soaDoc.approver ? `${soaDoc.approver.firstName} ${soaDoc.approver.lastName}` : 'Not Assigned';
        page.drawText(`Reviewer: ${reviewerName}  |  Approver: ${approverName}`, {
          x: 50, y: pageHeight - 148, size: 10, font: timesRomanFont,
        });
      }

      // Statistics
      const applicable = entries.filter(e => e.isApplicable).length;
      const notApplicable = entries.filter(e => !e.isApplicable).length;
      const implemented = entries.filter(e => e.isApplicable && e.status === 'IMPLEMENTED').length;
      const inProgress = entries.filter(e => e.isApplicable && e.status === 'IN_PROGRESS').length;

      page.drawText(
        `Total: ${entries.length}  |  Applicable: ${applicable}  |  Not Applicable: ${notApplicable}  |  Implemented: ${implemented}  |  In Progress: ${inProgress}`,
        { x: 50, y: pageHeight - 175, size: 10, font: timesRomanFont }
      );

      // Draw line
      page.drawLine({
        start: { x: 50, y: pageHeight - 185 },
        end: { x: pageWidth - 50, y: pageHeight - 185 },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      });

      // Table columns matching the UI
      const margin = 30;
      const fontSize = 6;
      const lineHeight = 8;
      const columns = [
        { label: 'Control No',      x: margin,       width: 45 },
        { label: 'Control Name',    x: margin + 45,  width: 95 },
        { label: 'Control',         x: margin + 140, width: 110 },
        { label: 'Source',          x: margin + 250, width: 80 },
        { label: 'Applicable',      x: margin + 330, width: 40 },
        { label: 'Status',          x: margin + 370, width: 50 },
        { label: 'Owner',           x: margin + 420, width: 55 },
        { label: 'Justification',   x: margin + 475, width: 100 },
        { label: 'Doc Ref',         x: margin + 575, width: 100 },
        { label: 'Comments',        x: margin + 675, width: 107 },
      ];

      let yPosition = pageHeight - 205;
      let currentCategory = '';

      // Word-wrap text into lines that fit within colWidth
      const wrapText = (text: string, colWidth: number, font: any, size: number): string[] => {
        if (!text || text === '-') return [text || '-'];
        const words = text.replace(/\n/g, ' ').split(' ');
        const lines: string[] = [];
        let currentLine = '';

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const testWidth = font.widthOfTextAtSize(testLine, size);
          if (testWidth > colWidth - 4 && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) lines.push(currentLine);
        return lines.length > 0 ? lines : ['-'];
      };

      // Helper to draw table header
      const drawTableHeader = () => {
        page.drawRectangle({
          x: margin - 2,
          y: yPosition - 3,
          width: pageWidth - (margin * 2) + 4,
          height: lineHeight + 4,
          color: rgb(0.15, 0.3, 0.55),
        });
        columns.forEach(col => {
          page.drawText(col.label, {
            x: col.x + 2,
            y: yPosition,
            size: 6,
            font: timesBoldFont,
            color: rgb(1, 1, 1),
          });
        });
        yPosition -= lineHeight + 6;
      };

      drawTableHeader();

      const statusLabels: Record<string, string> = {
        NOT_STARTED: 'Not Started',
        IN_PROGRESS: 'In Progress',
        IMPLEMENTED: 'Implemented',
        NOT_APPLICABLE: 'N/A',
      };

      for (const entry of entries) {
        // Category header
        if (entry.control.category !== currentCategory) {
          currentCategory = entry.control.category;
          yPosition -= 4;

          if (yPosition < 50) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            yPosition = pageHeight - 40;
            drawTableHeader();
          }

          page.drawRectangle({
            x: margin - 2,
            y: yPosition - 3,
            width: pageWidth - (margin * 2) + 4,
            height: lineHeight + 4,
            color: rgb(0.93, 0.95, 0.98),
          });
          page.drawText(currentCategory.replace('_', ' - '), {
            x: margin,
            y: yPosition,
            size: 7,
            font: timesBoldFont,
            color: rgb(0.2, 0.4, 0.6),
          });
          yPosition -= lineHeight + 6;
        }

        // Pre-calculate all wrapped text for this row to determine row height
        const cellTexts = [
          [entry.control.controlId],
          wrapText(entry.control.name, columns[1].width, timesRomanFont, fontSize),
          wrapText(entry.control.description || '-', columns[2].width, timesRomanFont, fontSize),
          wrapText(entry.controlSource || 'Annex A', columns[3].width, timesRomanFont, fontSize),
          [entry.isApplicable ? 'Yes' : 'No'],
          [statusLabels[entry.status] || entry.status],
          wrapText(entry.controlOwner || '-', columns[6].width, timesRomanFont, fontSize),
          wrapText(entry.justification || '-', columns[7].width, timesRomanFont, fontSize),
          wrapText(entry.documentationReferences || '-', columns[8].width, timesRomanFont, fontSize),
          wrapText(entry.comments || '-', columns[9].width, timesRomanFont, fontSize),
        ];

        const maxLines = Math.max(...cellTexts.map(lines => lines.length));
        const rowHeight = maxLines * lineHeight + 4;

        // New page if needed
        if (yPosition - rowHeight < 40) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          yPosition = pageHeight - 40;
          drawTableHeader();
        }

        // Draw light row border
        page.drawLine({
          start: { x: margin - 2, y: yPosition - rowHeight + lineHeight - 1 },
          end: { x: pageWidth - margin + 2, y: yPosition - rowHeight + lineHeight - 1 },
          thickness: 0.3,
          color: rgb(0.85, 0.85, 0.85),
        });

        // Draw each cell's wrapped lines
        const cellColors = [
          undefined, undefined, rgb(0.3, 0.3, 0.3), undefined,
          entry.isApplicable ? rgb(0, 0.5, 0) : rgb(0.5, 0, 0),
          undefined, undefined,
          rgb(0.3, 0.3, 0.3), rgb(0.3, 0.3, 0.3), rgb(0.3, 0.3, 0.3),
        ];

        for (let colIdx = 0; colIdx < columns.length; colIdx++) {
          const lines = cellTexts[colIdx];
          const color = cellColors[colIdx];
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const opts: any = {
              x: columns[colIdx].x + 2,
              y: yPosition - (lineIdx * lineHeight),
              size: fontSize,
              font: colIdx === 0 ? timesBoldFont : timesRomanFont,
            };
            if (color) opts.color = color;
            page.drawText(lines[lineIdx], opts);
          }
        }

        yPosition -= rowHeight;
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
  requirePermission('risks', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, format = 'pdf' } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
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
  requirePermission('dashboard', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId, format = 'json' } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
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
