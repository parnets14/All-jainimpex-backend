import { dealerInvoiceSchema } from '../../models/DealerInvoice.js';
import { dealerSchema }        from '../../models/Dealer.js';
import { regionSchema }        from '../../models/Region.js';
import { salesOrderSchema }    from '../../models/SalesOrder.js';
import { productSchema }       from '../../models/Product.js';
import { generateInvoicePDF }  from '../../utils/pdfGenerator.js';

const getModels = (db) => ({
  DealerInvoice: db.models.DealerInvoice || db.model('DealerInvoice', dealerInvoiceSchema),
  Dealer:        db.models.Dealer        || db.model('Dealer',        dealerSchema),
  Region:        db.models.Region        || db.model('Region',        regionSchema),
  SalesOrder:    db.models.SalesOrder    || db.model('SalesOrder',    salesOrderSchema),
  Product:       db.models.Product       || db.model('Product',       productSchema),
});

// @desc    Get dealer's invoices
// @route   GET /api/app/invoices
export const getMyInvoices = async (req, res) => {
  try {
    const { DealerInvoice, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const { page = 1, limit = 20, status, paymentStatus, startDate, endDate } = req.query;
    const query = { dealer: dealer._id };
    if (status && status !== 'all')              query.status = status;
    if (paymentStatus && paymentStatus !== 'all') query.paymentStatus = paymentStatus;
    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate)   query.invoiceDate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [invoices, total] = await Promise.all([
      DealerInvoice.find(query)
        .populate('dealer', 'name code')
        .sort({ invoiceDate: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      DealerInvoice.countDocuments(query),
    ]);

    res.json({
      success: true,
      invoices,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalInvoices: total,
        hasNext: skip + invoices.length < total,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('getMyInvoices error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get invoice details
// @route   GET /api/app/invoices/:id
export const getInvoiceDetails = async (req, res) => {
  try {
    const { DealerInvoice, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const invoice = await DealerInvoice.findOne({ _id: req.params.id, dealer: dealer._id })
      .populate('dealer', 'name code phone email address gst')
      .populate('items.product', 'itemName productCode mrp HSNCode')
      .populate('salesOrder', 'orderNumber')
      .populate('region', 'name');

    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    res.json({ success: true, invoice });
  } catch (error) {
    console.error('getInvoiceDetails error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Download invoice PDF
// @route   GET /api/app/invoices/:id/download
export const downloadInvoice = async (req, res) => {
  try {
    const { DealerInvoice, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const invoice = await DealerInvoice.findOne({ _id: req.params.id, dealer: dealer._id })
      .populate('dealer', 'name code phone email address gst')
      .populate('items.product', 'itemName productCode mrp');

    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const pdfBuffer = await generateInvoicePDF(invoice);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('downloadInvoice error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    View invoice as HTML in browser (exact same design as web)
// @route   GET /api/app/invoices/:id/view
export const viewInvoiceHTML = async (req, res) => {
  try {
    const { DealerInvoice, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const invoice = await DealerInvoice.findOne({ _id: req.params.id, dealer: dealer._id })
      .populate('dealer', 'name code phone email address gst')
      .populate('items.product', 'itemName productCode HSNCode unit')
      .populate('salesOrder', 'orderNumber')
      .lean();

    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const fmt = (n) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    const subtotal = (invoice.items || []).reduce((s, i) => s + (i.quantity * i.unitPrice), 0);
    const totalDiscount = (invoice.items || []).reduce((s, i) => {
      const base = i.quantity * i.unitPrice;
      const discPct = (i.discountPercentage || 0) + (i.dealerExtraDiscount || 0);
      return s + (base * discPct / 100);
    }, 0);
    const totalGst = (invoice.items || []).reduce((s, i) => s + (i.gstAmount || 0), 0);
    const grandTotal = invoice.totalAmount || (subtotal - totalDiscount + totalGst);
    const paidAmt = invoice.paidAmount || 0;
    const balanceDue = Math.max(0, grandTotal - paidAmt);

    const itemRows = (invoice.items || []).map((item, idx) => {
      const base = item.quantity * item.unitPrice;
      const discPct = (item.discountPercentage || 0) + (item.dealerExtraDiscount || 0);
      const discAmt = base * discPct / 100;
      const afterDisc = base - discAmt;
      const gstAmt = item.gstAmount || (afterDisc * (item.gst || 0) / 100);
      const total = afterDisc + gstAmt;
      const name = item.productName || item.product?.itemName || 'Product';
      const code = item.productCode || item.product?.productCode || '';
      const hsn = item.HSNCode || item.product?.HSNCode || '';
      const unit = item.unit || item.product?.unit || 'PCS';
      const bg = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
      const discCell = discPct > 0
        ? `<span style="color:#16a34a;font-weight:600">${discPct.toFixed(2)}%</span>${item.dealerExtraDiscount > 0 ? `<div style="font-size:10px;color:#9333ea">(+${item.dealerExtraDiscount}% dealer)</div>` : ''}`
        : '—';
      return `<tr style="background:${bg};border-bottom:1px solid #e5e7eb">
        <td style="padding:8px;text-align:center;color:#6b7280">${idx + 1}</td>
        <td style="padding:8px;color:#6b7280;font-size:11px">${code}</td>
        <td style="padding:8px;font-weight:500">${name}</td>
        <td style="padding:8px;text-align:center;color:#6b7280">${hsn}</td>
        <td style="padding:8px;text-align:center;color:#6b7280">${unit}</td>
        <td style="padding:8px;text-align:right;font-weight:600">${item.quantity}</td>
        <td style="padding:8px;text-align:right">₹${fmt(item.unitPrice)}</td>
        <td style="padding:8px;text-align:right">${discCell}</td>
        <td style="padding:8px;text-align:right">${item.gst || 0}%</td>
        <td style="padding:8px;text-align:right">₹${fmt(base)}</td>
        <td style="padding:8px;text-align:right;font-weight:700;color:#3D2B8A">₹${fmt(total)}</td>
      </tr>`;
    }).join('');

    const discountSection = (() => {
      const itemsWithDiscount = (invoice.items || []).filter(i =>
        (i.discountPercentage || 0) > 0 || (i.dealerExtraDiscount || 0) > 0
      );
      if (!itemsWithDiscount.length) return '';
      const rows = itemsWithDiscount.map(i => {
        const name = i.productName || i.product?.itemName || 'Product';
        const applied = (i.appliedDiscounts || [])[0];
        const directPct = applied?.directDiscountPercentage || 0;
        const levels = i.selectedDiscountLevels || [];
        const manualLevels = i.manualDiscountLevels || {};
        const extra = i.dealerExtraDiscount || 0;
        const levelRows = levels.map(lvlName => {
          const manual = manualLevels[lvlName];
          const lvl = (applied?.levels || []).find(l => l.levelName === lvlName);
          const pct = manual !== undefined ? manual : (lvl?.discountPercentage || 0);
          return `<div style="color:#2563eb;font-size:12px">✓ ${lvlName}: ${pct}%</div>`;
        }).join('');
        return `<div style="border-bottom:1px solid #bbf7d0;padding:8px 0">
          <div style="font-weight:700;color:#166534;margin-bottom:4px">• ${name}</div>
          <div style="padding-left:16px">
            ${directPct > 0 ? `<div style="color:#16a34a;font-size:12px">✓ Direct: ${directPct}%</div>` : ''}
            ${levelRows}
            ${extra > 0 ? `<div style="color:#ea580c;font-size:12px">✓ Dealer Extra: ${extra}%</div>` : ''}
          </div>
        </div>`;
      }).join('');
      return `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-top:20px">
        <div style="font-weight:700;color:#166534;margin-bottom:10px;font-size:13px">Applied Discounts</div>
        ${rows}
      </div>`;
    })();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Invoice ${invoice.invoiceNumber}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#111827;background:#f3f4f6;-webkit-text-size-adjust:100%}
.page{max-width:860px;margin:16px auto;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.10);overflow:hidden}
.hdr{background:#3D2B8A;color:#fff;padding:24px 20px;text-align:center}
.hdr h1{font-size:26px;font-weight:800;letter-spacing:2px;margin-bottom:4px}
.hdr p{opacity:.8;font-size:12px}
.body{padding:20px}
.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
@media(max-width:520px){.meta-grid{grid-template-columns:1fr}}
.meta-box{background:#f8fafc;border-radius:10px;padding:14px;border:1px solid #e2e8f0}
.meta-box h3{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px}
.meta-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;gap:8px}
.meta-label{color:#64748b;font-size:12px;white-space:nowrap}
.meta-value{font-weight:600;font-size:12px;color:#0f172a;text-align:right}
.divider{height:1px;background:#e2e8f0;margin:16px 0}
.tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:8px;border:1px solid #e2e8f0}
table{width:100%;border-collapse:collapse;font-size:12px;min-width:600px}
thead tr{background:#3D2B8A;color:#fff}
thead th{padding:10px 8px;font-weight:600;font-size:11px;white-space:nowrap}
thead th.l{text-align:left}thead th.c{text-align:center}thead th.r{text-align:right}
.totals{display:flex;justify-content:flex-end;margin-top:16px}
.totals-box{width:100%;max-width:300px;background:#f8fafc;border-radius:10px;padding:14px;border:1px solid #e2e8f0}
.t-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13px}
.t-row:last-child{border-bottom:none}
.t-grand{font-size:16px;font-weight:800;color:#3D2B8A;padding-top:10px;border-top:2px solid #3D2B8A;margin-top:4px}
.footer-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}
@media(max-width:520px){.footer-grid{grid-template-columns:1fr}}
.footer-box{background:#f8fafc;border-radius:10px;padding:12px;border:1px solid #e2e8f0}
.footer-box h4{font-size:12px;font-weight:700;color:#475569;margin-bottom:6px}
.footer-box p{font-size:11px;color:#64748b;line-height:1.7}
.sig-row{display:flex;justify-content:space-between;margin-top:28px}
.sig-box{text-align:center;width:160px}
.sig-line{border-top:1px solid #94a3b8;padding-top:6px;font-size:11px;color:#64748b}
.footer-note{text-align:center;font-size:11px;color:#94a3b8;margin-top:16px;padding-top:14px;border-top:1px solid #e2e8f0}
.print-btn{display:block;text-align:center;margin:20px auto 0;background:#3D2B8A;color:#fff;border:none;padding:12px 32px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;width:fit-content}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;border-radius:0}.print-btn{display:none}}
</style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <h1>INVOICE</h1>
    <p>${invoice.invoiceNumber} &nbsp;·&nbsp; ${fmtDate(invoice.invoiceDate)}</p>
  </div>
  <div class="body">
    <div class="meta-grid">
      <div class="meta-box">
        <h3>Invoice Details</h3>
        <div class="meta-row"><span class="meta-label">Invoice No</span><span class="meta-value">${invoice.invoiceNumber}</span></div>
        <div class="meta-row"><span class="meta-label">Date</span><span class="meta-value">${fmtDate(invoice.invoiceDate)}</span></div>
        ${invoice.salesOrder?.orderNumber ? `<div class="meta-row"><span class="meta-label">Order No</span><span class="meta-value">${invoice.salesOrder.orderNumber}</span></div>` : ''}
        ${invoice.creditDays != null ? `<div class="meta-row"><span class="meta-label">Credit Days</span><span class="meta-value">${invoice.creditDays} days</span></div>` : ''}
        ${invoice.dueDate ? `<div class="meta-row"><span class="meta-label">Due Date</span><span class="meta-value">${fmtDate(invoice.dueDate)}</span></div>` : ''}
        <div class="meta-row"><span class="meta-label">Status</span><span class="meta-value" style="color:${invoice.paymentStatus === 'Paid' ? '#16a34a' : '#b45309'}">${invoice.paymentStatus || 'Pending'}</span></div>
      </div>
      <div class="meta-box">
        <h3>Bill To</h3>
        <div style="font-weight:700;font-size:14px;margin-bottom:6px">${invoice.dealer?.name || invoice.dealerName || '—'}</div>
        <div style="color:#64748b;font-size:12px;line-height:1.7">
          ${invoice.dealer?.address || ''}${invoice.dealer?.address ? '<br>' : ''}
          ${invoice.dealer?.phone ? `Phone: ${invoice.dealer.phone}<br>` : ''}
          ${invoice.dealer?.email ? `Email: ${invoice.dealer.email}<br>` : ''}
          ${invoice.dealer?.gst ? `GST: ${invoice.dealer.gst}` : ''}
        </div>
      </div>
    </div>
    <div class="divider"></div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th class="c">S.No</th><th class="l">Code</th><th class="l">Product</th>
            <th class="c">HSN</th><th class="c">Unit</th><th class="r">Qty</th>
            <th class="r">Rate</th><th class="r">Disc%</th><th class="r">GST%</th>
            <th class="r">Amount</th><th class="r">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
    <div class="totals">
      <div class="totals-box">
        <div class="t-row"><span>Subtotal</span><span>₹${fmt(subtotal)}</span></div>
        ${totalDiscount > 0 ? `<div class="t-row" style="color:#16a34a;font-weight:600"><span>Total Discount</span><span>− ₹${fmt(totalDiscount)}</span></div>` : ''}
        <div class="t-row"><span>GST</span><span>₹${fmt(totalGst)}</span></div>
        <div class="t-row t-grand"><span>Grand Total</span><span>₹${fmt(grandTotal)}</span></div>
        ${paidAmt > 0 ? `<div class="t-row" style="color:#16a34a"><span>Paid</span><span>₹${fmt(paidAmt)}</span></div>` : ''}
        ${balanceDue > 0 ? `<div class="t-row" style="color:#dc2626;font-weight:700"><span>Balance Due</span><span>₹${fmt(balanceDue)}</span></div>` : ''}
      </div>
    </div>
    ${discountSection}
    ${invoice.totalPoints > 0 ? `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:10px 16px;text-align:center;margin-top:16px;color:#854d0e;font-weight:600">🎁 Points Earned: ${invoice.totalPoints.toLocaleString()}</div>` : ''}
    <div class="footer-grid">
      <div class="footer-box">
        <h4>Bank Details</h4>
        <p>Bank Name: HDFC Bank<br>Account No: 1234567890<br>IFSC Code: HDFC0001234<br>Branch: Bangalore</p>
      </div>
      <div class="footer-box">
        <h4>Terms &amp; Conditions</h4>
        <p>1. Payment due within ${invoice.creditDays || 30} days<br>2. Goods once sold will not be taken back<br>3. Subject to Bangalore jurisdiction</p>
      </div>
    </div>
    <div class="sig-row">
      <div class="sig-box"><div class="sig-line">Customer Signature</div></div>
      <div class="sig-box"><div class="sig-line">Authorized Signatory</div></div>
    </div>
    <div class="footer-note">
      This is a computer-generated invoice and does not require a physical signature.<br>
      Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
    </div>
    <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>
</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('viewInvoiceHTML error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
