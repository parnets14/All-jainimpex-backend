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
