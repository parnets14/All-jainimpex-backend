import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generateSalaryPDF = (salary) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: "A4",
        info: {
          Title: `Salary Slip - ${salary.employee.name}`,
          Author: "Jain Impex",
          Subject: `Salary Slip for ${salary.month}/${salary.year}`,
        },
      });

      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Add company header with background
      doc.fillColor("#1e3a8a").rect(0, 0, doc.page.width, 120).fill();

      // Add company logo
      try {
        const logoPath = path.join(__dirname, "../public/logo.jpeg");
        doc.image(logoPath, 50, 30, { width: 60, height: 45 });
      } catch (error) {
        console.log("Logo not found, continuing without it");
      }

      // Add company text
      doc
        .fillColor("#ffffff")
        .fontSize(24)
        .font("Helvetica-Bold")
        .text("JAIN IMPEX", 120, 40)
        .fontSize(12)
        .font("Helvetica")
        .text("Plumbing Solutions & Services", 120, 70)
        .text("123 Market Road, New Delhi - 110001", 120, 85)
        .text("GSTIN: 07ABCDE1234F125 | PAN: ABCDE1234F", 120, 100);

      // Salary slip title
      doc
        .fillColor("#1e3a8a")
        .fontSize(18)
        .font("Helvetica-Bold")
        .text("SALARY SLIP", 0, 140, { align: "center" })
        .fontSize(12)
        .font("Helvetica")
        .text(`For the month of ${salary.month}/${salary.year}`, 0, 160, {
          align: "center",
        });

      // Employee details box
      const employeeTop = 190;
      doc
        .fillColor("#f8fafc")
        .rect(50, employeeTop, doc.page.width - 100, 80)
        .fill()
        .strokeColor("#e2e8f0")
        .rect(50, employeeTop, doc.page.width - 100, 80)
        .stroke();

      doc
        .fillColor("#1e293b")
        .fontSize(10)
        .text("Employee Details", 60, employeeTop + 10)
        .fontSize(9);

      // Employee details columns
      const col1 = 60;
      const col2 = 250;

      doc
        .text(`Name: ${salary.employee.name}`, col1, employeeTop + 25)
        .text(`Employee ID: ${salary.employee.empId}`, col1, employeeTop + 40)
        .text(
          `Designation: ${salary.employee.designation}`,
          col1,
          employeeTop + 55
        )
        .text(
          `Department: ${salary.employee.department}`,
          col2,
          employeeTop + 25
        )
        .text(
          `Payment Date: ${new Date().toLocaleDateString()}`,
          col2,
          employeeTop + 40
        )
        .text(
          `Days Worked: ${salary.daysWorked}/${salary.workingDays}`,
          col2,
          employeeTop + 55
        );

      // Salary breakdown table
      const tableTop = employeeTop + 100;

      // Earnings section
      doc
        .fillColor("#1e3a8a")
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("EARNINGS", 50, tableTop)
        .fillColor("#64748b")
        .font("Helvetica")
        .text("Amount (₹)", 400, tableTop, { align: "right" });

      let currentY = tableTop + 20;

      const earnings = [
        ["Basic Salary", salary.basicSalary],
        ["House Rent Allowance (HRA)", salary.hra],
        ["Conveyance Allowance", salary.conveyance],
        ["Medical Allowance", salary.medicalAllowance],
        ["Special Allowance", salary.specialAllowance],
      ];

      earnings.forEach(([label, amount]) => {
        if (amount > 0) {
          doc
            .fillColor("#374151")
            .text(label, 50, currentY)
            .fillColor("#059669")
            .text(amount.toFixed(2), 400, currentY, { align: "right" });
          currentY += 15;
        }
      });

      // Gross salary
      doc
        .fillColor("#1e3a8a")
        .font("Helvetica-Bold")
        .text("Gross Salary", 50, currentY + 5)
        .text(salary.grossSalary.toFixed(2), 400, currentY + 5, {
          align: "right",
        });

      // Deductions section
      const deductionsTop = currentY + 30;

      doc
        .fillColor("#dc2626")
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("DEDUCTIONS", 50, deductionsTop)
        .fillColor("#64748b")
        .font("Helvetica")
        .text("Amount (₹)", 400, deductionsTop, { align: "right" });

      currentY = deductionsTop + 20;

      const deductions = [
        ["Provident Fund (PF)", salary.pf],
        ["Professional Tax", salary.professionalTax],
        ["Tax Deducted at Source (TDS)", salary.tds],
        ["Other Deductions", salary.otherDeductions],
      ];

      deductions.forEach(([label, amount]) => {
        if (amount > 0) {
          doc
            .fillColor("#374151")
            .text(label, 50, currentY)
            .fillColor("#dc2626")
            .text(amount.toFixed(2), 400, currentY, { align: "right" });
          currentY += 15;
        }
      });

      // Total deductions
      doc
        .fillColor("#dc2626")
        .font("Helvetica-Bold")
        .text("Total Deductions", 50, currentY + 5)
        .text(salary.totalDeductions.toFixed(2), 400, currentY + 5, {
          align: "right",
        });

      // Net salary section
      const netSalaryTop = currentY + 30;

      doc
        .fillColor("#1e3a8a")
        .rect(50, netSalaryTop, doc.page.width - 100, 40)
        .fill()
        .fillColor("#ffffff")
        .fontSize(12)
        .font("Helvetica-Bold")
        .text("NET SALARY PAYABLE", 60, netSalaryTop + 15)
        .fontSize(14)
        .text(`₹ ${salary.netSalary.toFixed(2)}`, 400, netSalaryTop + 13, {
          align: "right",
        });

      // Footer with signatures
      const footerTop = doc.page.height - 120;

      doc
        .strokeColor("#e2e8f0")
        .moveTo(50, footerTop)
        .lineTo(doc.page.width - 50, footerTop)
        .stroke();

      // Signature areas
      const sigWidth = (doc.page.width - 100) / 3;

      ["Employee Signature", "HR Manager", "Authorized Signatory"].forEach(
        (label, index) => {
          const x = 50 + index * sigWidth;

          doc
            .fillColor("#64748b")
            .fontSize(9)
            .text(label, x, footerTop + 20, {
              width: sigWidth - 20,
              align: "center",
            })
            .strokeColor("#cbd5e1")
            .moveTo(x, footerTop + 50)
            .lineTo(x + sigWidth - 20, footerTop + 50)
            .stroke()
            .fontSize(8)
            .text("Name & Signature", x, footerTop + 60, {
              width: sigWidth - 20,
              align: "center",
            });
        }
      );

      // Final footer note
      doc
        .fillColor("#94a3b8")
        .fontSize(8)
        .text(
          "This is a computer generated document and does not require a physical signature.",
          0,
          doc.page.height - 30,
          { align: "center" }
        )
        .text(
          `Generated on: ${new Date().toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}`,
          0,
          doc.page.height - 20,
          { align: "center" }
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// Generic PDF generator for reports
export const generatePDF = (data) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: "A4",
        info: {
          Title: data.title || "Report",
          Author: "Jain Impex",
          Subject: data.subtitle || "Generated Report",
        },
      });

      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Add company header with background
      doc.fillColor("#1e3a8a").rect(0, 0, doc.page.width, 120).fill();

      // Add company logo
      try {
        const logoPath = path.join(__dirname, "../public/logo.jpeg");
        doc.image(logoPath, 50, 30, { width: 60, height: 45 });
      } catch (error) {
        console.log("Logo not found, continuing without it");
      }

      // Add company text
      doc
        .fillColor("#ffffff")
        .fontSize(24)
        .font("Helvetica-Bold")
        .text("JAIN IMPEX", 120, 40)
        .fontSize(12)
        .font("Helvetica")
        .text("Plumbing Solutions & Services", 120, 70)
        .text("123 Market Road, New Delhi - 110001", 120, 85)
        .text("GSTIN: 07ABCDE1234F125 | PAN: ABCDE1234F", 120, 100);

      // Report title
      doc
        .fillColor("#1e3a8a")
        .fontSize(18)
        .font("Helvetica-Bold")
        .text(data.title || "REPORT", 0, 140, { align: "center" })
        .fontSize(12)
        .font("Helvetica")
        .text(data.subtitle || "", 0, 160, { align: "center" });

      // Report info section
      const infoTop = 190;
      doc
        .fillColor("#f8fafc")
        .rect(50, infoTop, doc.page.width - 100, 60)
        .fill()
        .strokeColor("#e2e8f0")
        .rect(50, infoTop, doc.page.width - 100, 60)
        .stroke();

      doc
        .fillColor("#1e293b")
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("Report Information", 60, infoTop + 10)
        .fontSize(9)
        .font("Helvetica")
        .text(`Generated At: ${data.generatedAt || new Date().toLocaleString()}`, 60, infoTop + 25)
        .text(`Total Records: ${data.data?.length || 0}`, 60, infoTop + 40);

      // Filters section
      if (data.filters) {
        const filtersTop = infoTop + 80;
        doc
          .fillColor("#f8fafc")
          .rect(50, filtersTop, doc.page.width - 100, 40)
          .fill()
          .strokeColor("#e2e8f0")
          .rect(50, filtersTop, doc.page.width - 100, 40)
          .stroke();

        doc
          .fillColor("#1e293b")
          .fontSize(10)
          .font("Helvetica-Bold")
          .text("Applied Filters", 60, filtersTop + 10)
          .fontSize(9)
          .font("Helvetica");

        let filterY = filtersTop + 25;
        Object.entries(data.filters).forEach(([key, value]) => {
          if (value && value !== 'All') {
            doc.text(`${key}: ${value}`, 60, filterY);
            filterY += 12;
          }
        });
      }

      // Data table
      if (data.data && data.data.length > 0) {
        const tableTop = (data.filters ? infoTop + 140 : infoTop + 80);
        
        // Define optimal column widths for better readability
        const columnWidths = {
          'Name': 90,
          'Username': 80,
          'Email': 120,
          'Phone': 80,
          'Role': 90,
          'Status': 60,
          'Location': 80,
          'Permissions': 60,
          'Regions': 60,
          'Created': 80,
          'Last Login': 100
        };
        
        const headers = Object.keys(data.data[0]);
        const totalWidth = Object.values(columnWidths).reduce((sum, width) => sum + width, 0);
        const startX = Math.max(30, (doc.page.width - totalWidth) / 2);
        
        // Draw table headers with proper styling
        doc
          .fillColor("#1e3a8a")
          .fontSize(9)
          .font("Helvetica-Bold");

        let currentX = startX;
        headers.forEach((header, index) => {
          const width = columnWidths[header] || 80;
          
          // Draw header background
          doc.fillColor("#e3f2fd")
            .rect(currentX, tableTop, width, 18)
            .fill();
          
          // Draw header border
          doc.strokeColor("#1e3a8a")
            .rect(currentX, tableTop, width, 18)
            .stroke();
          
          // Draw header text
          doc.fillColor("#1e3a8a")
            .text(header, currentX + 4, tableTop + 5, { 
              width: width - 8,
              align: 'left'
            });
          
          currentX += width;
        });

        // Table rows with better formatting
        let currentY = tableTop + 18;
        doc.fontSize(7).font("Helvetica");

        data.data.forEach((row, rowIndex) => {
          // Check if we need a new page
          if (currentY > doc.page.height - 80) {
            doc.addPage();
            currentY = 50;
          }

          // Alternate row colors for better readability
          const isEvenRow = rowIndex % 2 === 0;
          if (isEvenRow) {
            doc.fillColor("#f8f9fa")
              .rect(startX, currentY, totalWidth, 16)
              .fill();
          }

          currentX = startX;
          headers.forEach((header, colIndex) => {
            const width = columnWidths[header] || 80;
            let value = row[header] || '';
            
            // Truncate long values to prevent wrapping
            if (header === 'Email' && value.length > 20) {
              value = value.substring(0, 17) + '...';
            } else if (header === 'Last Login' && value.length > 15) {
              value = value.substring(0, 12) + '...';
            } else if (header === 'Phone' && value.length > 12) {
              value = value.substring(0, 9) + '...';
            }
            
            // Draw cell border
            doc.strokeColor("#dee2e6")
              .rect(currentX, currentY, width, 16)
              .stroke();
            
            // Draw cell text
            doc.fillColor("#495057")
              .text(String(value), currentX + 3, currentY + 4, { 
                width: width - 6,
                align: 'left'
              });
            
            currentX += width;
          });
          
          currentY += 16;
        });
      } else {
        // No data message
        const noDataTop = (data.filters ? infoTop + 140 : infoTop + 80);
        doc
          .fillColor("#64748b")
          .fontSize(12)
          .font("Helvetica")
          .text("No data available for the selected criteria", 0, noDataTop, { align: "center" });
      }

      // Footer
      const footerTop = doc.page.height - 60;
      doc
        .strokeColor("#e2e8f0")
        .moveTo(50, footerTop)
        .lineTo(doc.page.width - 50, footerTop)
        .stroke()
        .fillColor("#94a3b8")
        .fontSize(8)
        .text("This is a computer generated document and does not require a physical signature.", 0, footerTop + 10, { align: "center" })
        .text(`Generated on: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`, 0, footerTop + 25, { align: "center" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};