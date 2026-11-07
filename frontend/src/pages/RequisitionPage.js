import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FiX, FiCheckCircle, FiDollarSign, FiPlus, FiTrash2, FiCheck, FiSearch, FiClock, FiSend, FiAlertCircle, FiArrowRight, FiArrowLeft, FiFileText, FiPrinter, FiDownload } from 'react-icons/fi';
import api from '../services/api';
import Layout from '../components/layout/Layout';
import ConfirmModal from '../components/ConfirmModal';
import ThaiDatePicker from '../components/ThaiDatePicker';
import { useAuth } from '../context/AuthContext';
import { thaiBahtText } from './PurchaseOrdersPage';
import { RANGE_OPTIONS, getDateRange, rangeText, currentMonthPick, MonthPickerInline, openReportWindow } from './PurchaseOrdersHistoryPage';

const METHOD_LABELS = { cash: 'เงินสด', transfer: 'โอนเงิน' };

const REQ_LOGO_URL = `${window.location.origin}${process.env.PUBLIC_URL || ''}/images/logo2.png`;

const HIST_PAGE_SIZE = 10;

// สถานะที่แสดงผล: pending=รออนุมัติ, awaiting=รอชำระเงิน, paid=ชำระเงินแล้ว, cancelled=ยกเลิก
const STATUS_META = {
  pending: { label: 'รออนุมัติ', bg: '#fff7ed', color: '#c2410c' },
  awaiting: { label: 'รอชำระเงิน', bg: '#dbeafe', color: '#1d4ed8' },
  paid: { label: 'ชำระเงินแล้ว', bg: '#dcfce7', color: '#15803d' },
  cancelled: { label: 'ยกเลิก', bg: '#fee2e2', color: '#b91c1c' },
};

const getStatusKey = (r) => {
  if (r.requisition_status === 'ปฏิเสธ') return 'cancelled';
  if (r.requisition_status === 'อนุมัติ') return r.payment_status === 'ชำระแล้ว' ? 'paid' : 'awaiting';
  return 'pending';
};

const FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'pending', label: 'รออนุมัติ' },
  { key: 'awaiting', label: 'รอชำระเงิน' },
  { key: 'paid', label: 'ชำระเงินแล้ว' },
  { key: 'cancelled', label: 'ยกเลิก' },
];

const DOC = {
  navy: '#135dd1',
  line: '#94a3b8',
  th: { border: '1px solid #135dd1', background: '#135dd1', color: '#fff', padding: '6px 6px', fontSize: 12, fontWeight: 700 },
  td: { border: '1px solid #cbd5e1', padding: '6px 6px', fontSize: 12.5, verticalAlign: 'top' },
};

const docMoney = (v) => (parseFloat(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const docDateTime = (v) => (v ? new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const docLotDate = (v) => {
  const d = new Date(v);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
};
const docName = (first, last) => `${first || ''} ${last || ''}`.trim();

// ราคารวมทั้งหมด = สินค้า + ค่าแรง - ส่วนลด, VAT 7% คิดจากราคารวมทั้งหมด, ยอดสุทธิ = ราคารวมทั้งหมด + VAT (ตรงกับ backend)
const calcRequisitionTotals = (subtotal, labor, discount) => {
  const sub = parseFloat(subtotal) || 0;
  const totalBeforeVat = Math.max(0, sub + Math.max(0, parseFloat(labor) || 0) - Math.max(0, parseFloat(discount) || 0));
  const vat = Math.round(totalBeforeVat * 0.07 * 100) / 100;
  return { subtotal: sub, totalBeforeVat, vat, net: totalBeforeVat + vat };
};

// ใบเบิกสินค้า: แสดงยอดตามที่ backend บันทึกไว้จริง (ราคาต่อรายการมีเมื่อชำระเงินแล้ว)
const CompanyHeaderInfo = ({ company }) => {
  if (!company) return null;
  const { company_name: name, tax_id: taxId, address, phone_number: phone } = company;
  if (!name && !taxId && !address && !phone) return null;
  return (
    <div style={{ lineHeight: 1.5, minWidth: 0 }}>
      {name && <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{name}</div>}
      {taxId && <div style={{ fontSize: 12, color: '#475569' }}>เลขประจำตัวผู้เสียภาษี: {taxId}</div>}
      {address && <div style={{ fontSize: 12, color: '#475569' }}>ที่อยู่: {address}</div>}
      {phone && <div style={{ fontSize: 12, color: '#475569' }}>โทร: {phone}</div>}
    </div>
  );
};

const RequisitionDocPaper = ({ req, docRef }) => {
  const key = getStatusKey(req);
  const hasAmount = key === 'awaiting' || key === 'paid';
  const isPaid = key === 'paid';
  const status = STATUS_META[key];
  const requester = docName(req.user_first_name, req.user_last_name);
  const approver = req.approved_at ? docName(req.approver_first_name, req.approver_last_name) : '';
  const labor = parseFloat(req.labor_cost) || 0;
  const discount = parseFloat(req.discount_amount) || 0;
  const totals = calcRequisitionTotals(req.subtotal_amount, labor, discount);
  return (
    <div
      className="po-doc-sheet"
      ref={docRef}
      style={{ width: 794, margin: '0 auto', background: '#fff', padding: '36px 40px', boxSizing: 'border-box', fontFamily: "'Sarabun', Tahoma, sans-serif", fontSize: 13, color: '#1e293b', boxShadow: '0 8px 24px rgba(2, 8, 23, 0.12)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, borderBottom: `2px solid ${DOC.navy}`, paddingBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1, minWidth: 0 }}>
          <img src={REQ_LOGO_URL} alt="logo" style={{ height: 64, width: 'auto', objectFit: 'contain', display: 'block', flexShrink: 0 }} />
          <CompanyHeaderInfo company={isPaid ? req.company : null} />
        </div>
        <div style={{ textAlign: 'right', lineHeight: 1.6, flexShrink: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: DOC.navy }}>{isPaid ? 'ใบเสร็จรับเงิน' : 'ใบเบิกสินค้า'}</div>
          <div>เลขที่ใบเบิก: <b>{req.requisition_id}</b></div>
          <div>วันที่: {docDateTime(req.requisition_date)}</div>
          <div>สถานะ: <b style={{ color: status.color }}>{status.label}</b></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
        <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 12px', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: DOC.navy, marginBottom: 2 }}>ผู้เบิก</div>
          <div style={{ fontWeight: 600 }}>{requester || '-'}</div>
          {approver && <div>ผู้อนุมัติ: {approver}</div>}
          {req.approved_at && <div>วันที่อนุมัติ: {docDateTime(req.approved_at)}</div>}
        </div>
        <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 12px', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: DOC.navy, marginBottom: 2 }}>ลูกค้า</div>
          <div style={{ fontWeight: 600 }}>{req.customer_name || '-'}</div>
          {req.job_detail && <div>งาน / ทะเบียนรถ: {req.job_detail}</div>}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14 }}>
        <thead>
          <tr>
            <th style={{ ...DOC.th, width: 40, textAlign: 'center' }}>ลำดับ</th>
            <th style={{ ...DOC.th, textAlign: 'left' }}>รายการสินค้า</th>
            <th style={{ ...DOC.th, width: 60, textAlign: 'center' }}>จำนวน</th>
            {isPaid && <th style={{ ...DOC.th, width: 100, textAlign: 'right' }}>ราคา/หน่วย</th>}
            {isPaid && <th style={{ ...DOC.th, width: 110, textAlign: 'right' }}>จำนวนเงิน</th>}
          </tr>
        </thead>
        <tbody>
          {(req.items || []).map((it, idx) => (
            <tr key={`${it.product_id}-${idx}`} style={{ pageBreakInside: 'avoid' }}>
              <td style={{ ...DOC.td, textAlign: 'center' }}>{idx + 1}</td>
              <td style={DOC.td}>
                {it.product_name}
                {it.model ? <><br /><small style={{ color: '#64748b' }}>รุ่น: {it.model}</small></> : null}
                {it.lot_received_at ? <><br /><small style={{ color: '#64748b' }}>ล็อต: {docLotDate(it.lot_received_at)}</small></> : null}
              </td>
              <td style={{ ...DOC.td, textAlign: 'center' }}>{it.quantity}</td>
              {isPaid && <td style={{ ...DOC.td, textAlign: 'right' }}>{docMoney(it.unit_price)}</td>}
              {isPaid && <td style={{ ...DOC.td, textAlign: 'right' }}>{docMoney((Number(it.unit_price) || 0) * (Number(it.quantity) || 0))}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {hasAmount && (
        <>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, alignItems: 'flex-start', pageBreakInside: 'avoid' }}>
            <div style={{ flex: 1, lineHeight: 1.9 }}>
              {isPaid && (
                <>
                  <div style={{ fontWeight: 700, color: DOC.navy }}>การชำระเงิน</div>
                  <div>วิธีชำระ: {METHOD_LABELS[req.payment_method] || req.payment_method || '-'}</div>
                  {req.paid_at && <div>ชำระเมื่อ: {docDateTime(req.paid_at)}</div>}
                </>
              )}
            </div>
            <div style={{ width: 330, lineHeight: 1.9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ราคาสินค้ารวม</span><span>{docMoney(req.subtotal_amount)} บาท</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ค่าแรง/ค่าบริการ</span><span>{docMoney(labor)} บาท</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ส่วนลด</span><span>{docMoney(discount)} บาท</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid #cbd5e1' }}><span>ราคารวมทั้งหมด</span><span>{docMoney(totals.totalBeforeVat)} บาท</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>VAT 7%</span><span>{docMoney(req.vat_amount)} บาท</span></div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'stretch', pageBreakInside: 'avoid' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isPaid ? '#f1f5f9' : 'transparent', borderRadius: 6, padding: '8px 12px', fontWeight: 700, textAlign: 'center' }}>
              {isPaid ? `(${thaiBahtText(req.net_amount)})` : ''}
            </div>
            <div style={{ width: 330, background: DOC.navy, color: '#fff', borderRadius: 6, padding: '8px 12px' }}>
              <div style={{ fontSize: 12 }}>ยอดสุทธิ</div>
              <div style={{ fontSize: 22, fontWeight: 800, textAlign: 'right' }}>{docMoney(req.net_amount)} บาท</div>
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 24, marginTop: 36, textAlign: 'center', pageBreakInside: 'avoid' }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderBottom: `1px solid ${DOC.line}`, height: 44 }} />
          <div style={{ marginTop: 4 }}>ลายเซ็นผู้เบิก</div>
          <div style={{ color: '#475569' }}>({requester || '-'})</div>
        </div>
        {approver && (
          <div style={{ flex: 1 }}>
            <div style={{ borderBottom: `1px solid ${DOC.line}`, height: 44 }} />
            <div style={{ marginTop: 4 }}>ผู้อนุมัติ</div>
            <div style={{ color: '#475569' }}>({approver})</div>
          </div>
        )}
      </div>
    </div>
  );
};

const printRequisitionDoc = (req) => {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const body = renderToStaticMarkup(<RequisitionDocPaper req={req} />);
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${getStatusKey(req) === 'paid' ? 'ใบเสร็จรับเงิน' : 'ใบเบิกสินค้า'} ${esc(req.requisition_id)}</title>
<style>
@page{size:A4;margin:12mm}
html,body{margin:0;padding:0;background:#fff}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.po-doc-sheet{width:auto!important;padding:0!important;box-shadow:none!important;margin:0!important}
table{page-break-inside:auto}
tr{page-break-inside:avoid}
thead{display:table-header-group}
</style></head><body>${body}
<script>window.onload=function(){window.print();window.close();};</script></body></html>`);
  win.document.close();
};

const PRODUCT_PICKER_CSS = `
.rpp-wrap{position:relative}
.rpp-input-wrap{position:relative}
.rpp-input-wrap svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94a3b8;pointer-events:none}
.rpp-input{padding-left:36px !important}
.rpp-menu{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:50;background:#fff;border:1px solid #dbe4f0;border-radius:12px;box-shadow:0 10px 28px rgba(15,23,42,0.16);max-height:300px;overflow-y:auto;padding:4px}
.rpp-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;font-size:13px;color:#0f172a}
.rpp-item:hover{background:#eff6ff}
.rpp-item.rpp-disabled{opacity:.5;cursor:not-allowed}
.rpp-item.rpp-disabled:hover{background:transparent}
.rpp-code{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:#64748b;white-space:nowrap}
.rpp-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rpp-qty{font-size:12px;font-weight:600;color:#16a34a;background:#dcfce7;border-radius:999px;padding:2px 9px;white-space:nowrap}
.rpp-price{font-size:13px;font-weight:700;color:#15803d;white-space:nowrap;text-align:right}
.rpp-empty{padding:14px 10px;text-align:center;color:#94a3b8;font-size:13px}
@media (max-width:480px){.rpp-item{grid-template-columns:minmax(0,1fr) auto;row-gap:2px}.rpp-code{grid-column:1 / -1}}
`;

const ProductPicker = ({ products, value, onChange, getAvailable, disabled }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const selected = products.find((p) => String(p.product_id) === String(value));

  const typingRef = useRef(false);
  useEffect(() => {
    if (value) setQuery(selected ? selected.product_name : '');
    else if (typingRef.current) typingRef.current = false;
    else setQuery('');
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const inStock = products.filter((p) => (Number(p.stock_quantity) || 0) > 0);
  const list = selected || !q
    ? inStock
    : inStock.filter((p) => [p.product_name, p.product_id, p.barcode].some((v) => String(v || '').toLowerCase().includes(q)));

  const pick = (p) => {
    if (getAvailable(p) < 1) return;
    onChange(p.product_id);
    setQuery(p.product_name);
    setOpen(false);
  };

  return (
    <div className="rpp-wrap" ref={wrapRef}>
      <style>{PRODUCT_PICKER_CSS}</style>
      <div className="rpp-input-wrap">
        <FiSearch size={15} />
        <input
          className="req-select rpp-input"
          value={query}
          placeholder="ค้นหาชื่อสินค้า / รหัสสินค้า"
          disabled={disabled}
          onFocus={(e) => { setOpen(true); e.target.select(); }}
          onChange={(e) => { setQuery(e.target.value); if (value) { typingRef.current = true; onChange(''); } setOpen(true); }}
        />
      </div>
      {open && !disabled && (
        <div className="rpp-menu">
          {list.length === 0 ? (
            <div className="rpp-empty">ไม่พบสินค้า</div>
          ) : list.map((p) => {
            const available = getAvailable(p);
            return (
              <div key={p.product_id} className={`rpp-item${available < 1 ? ' rpp-disabled' : ''}`} onClick={() => pick(p)}>
                <span className="rpp-code">{p.product_id}</span>
                <span className="rpp-name" title={p.product_name}>{p.product_name}</span>
                <span className="rpp-qty">เหลือ {available.toLocaleString()}</span>
                <span className="rpp-price">{p.selling_price !== null && p.selling_price !== undefined && p.selling_price !== '' ? `฿${Number(p.selling_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : ''}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const RequisitionPage = () => {
  const { user } = useAuth();
  const role = user?.user_role;
  const isTechnician = role === 'supplier';
  const isStaff = role === 'admin' || role === 'employee';

  // ==========================================
  // 1. ข้อมูลใบเบิก / สินค้า / ยอดจอง
  // ==========================================
  const [requisitions, setRequisitions] = useState([]);
  const [reservedMap, setReservedMap] = useState({});
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState(null);

  // ฟอร์มเบิกสินค้า (ช่าง)
  const [customerName, setCustomerName] = useState('');
  const [jobDetail, setJobDetail] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [pickProduct, setPickProduct] = useState('');
  const [pickQty, setPickQty] = useState(1);
  const [cart, setCart] = useState([]);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // อนุมัติ / ยกเลิก / ดูรายละเอียด
  const [approveTarget, setApproveTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  // หน้ารายการเบิกสินค้าทั้งหมด
  const [showAll, setShowAll] = useState(false);
  const [histRows, setHistRows] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histRange, setHistRange] = useState('all');
  const [histCustomDate, setHistCustomDate] = useState('');
  const [histMonth, setHistMonth] = useState(currentMonthPick);
  const [histStatus, setHistStatus] = useState('all');
  const [histSearch, setHistSearch] = useState('');
  const [histPage, setHistPage] = useState(1);
  const [histExporting, setHistExporting] = useState(false);

  // ==========================================
  // 2. State สำหรับระบบ Modal บันทึกการชำระเงิน
  // ==========================================
  const [paymentRecord, setPaymentRecord] = useState(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [useLaborCost, setUseLaborCost] = useState(false);
  const [laborCost, setLaborCost] = useState(0);
  const [laborText, setLaborText] = useState('');
  const [useDiscount, setUseDiscount] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountText, setDiscountText] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const fetchData = useCallback(async () => {
    try {
      const [res, reservedRes] = await Promise.all([
        api.get('/requisitions', { params: { page: 1, limit: 100 } }),
        api.get('/requisitions/reserved'),
      ]);
      setRequisitions(res.data.data || []);

      // ยอดจอง = จำนวนในใบเบิกที่ยังรออนุมัติ/รอชำระเงิน (ยังไม่ตัดสต๊อกจริง)
      const reserved = {};
      (reservedRes.data.data || []).forEach((r) => {
        reserved[r.product_id] = Number(r.reserved) || 0;
      });
      setReservedMap(reserved);
    } catch (err) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'โหลดรายการเบิกไม่สำเร็จ' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await api.get('/products/all');
      setProducts(res.data.data || []);
    } catch {
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchData();
    if (isTechnician) fetchProducts();
  }, [user, isTechnician, fetchData, fetchProducts]);

  const showError = (err, fallback) => setNotice({ type: 'error', text: err.response?.data?.message || fallback });

  // จำนวนที่ใช้ได้จริง = สต๊อก - ยอดที่ถูกจอง
  const getAvailable = (p) => Math.max(0, (Number(p.stock_quantity) || 0) - (reservedMap[p.product_id] || 0));

  const formatDate = (v) => (v ? new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
  const fullName = (first, last) => `${first || ''} ${last || ''}`.trim() || '-';

  // ==========================================
  // 2. สร้างรายการเบิก (ช่าง)
  // ==========================================
  const pickedProduct = products.find((p) => String(p.product_id) === String(pickProduct));
  const pickedRemaining = pickedProduct
    ? Math.max(0, getAvailable(pickedProduct) - (cart.find((c) => c.product_id === pickedProduct.product_id)?.quantity || 0))
    : 0;

  const handlePickProduct = (id) => {
    setPickProduct(id);
    if (id) setPickQty('1');
  };

  const handleQtyInput = (raw) => {
    const digits = raw.replace(/[^0-9]/g, '').replace(/^0+/, '');
    if (digits === '') { setPickQty(''); return; }
    const n = parseInt(digits, 10);
    if (pickedProduct && n > pickedRemaining) {
      setPickQty(String(Math.max(1, pickedRemaining)));
      setNotice({ type: 'error', text: `"${pickedProduct.product_name}" เบิกได้สูงสุด ${pickedRemaining} ชิ้น` });
      return;
    }
    setPickQty(String(n));
  };

  const stepQty = (delta) => {
    const cur = parseInt(pickQty, 10) || 1;
    const next = cur + delta;
    if (next < 1) return;
    if (next > pickedRemaining) {
      setNotice({ type: 'error', text: `"${pickedProduct.product_name}" เบิกได้สูงสุด ${pickedRemaining} ชิ้น` });
      return;
    }
    setPickQty(String(next));
  };

  const addToCart = () => {
    const product = products.find((p) => String(p.product_id) === String(pickProduct));
    if (!product) return;
    if (!/^[0-9]+$/.test(String(pickQty).trim()) || parseInt(pickQty, 10) < 1) {
      setNotice({ type: 'error', text: 'จำนวนต้องเป็นตัวเลขจำนวนเต็มมากกว่า 0' });
      return;
    }
    const qty = parseInt(pickQty, 10);
    const inCart = cart.find((c) => c.product_id === product.product_id);
    const remaining = getAvailable(product) - (inCart?.quantity || 0);
    if (qty > remaining) {
      setNotice({
        type: 'error',
        text: remaining > 0
          ? `"${product.product_name}" เบิกได้อีกสูงสุด ${remaining} ชิ้น (คงเหลือที่เบิกได้ ${getAvailable(product)} ชิ้น, อยู่ในรายการแล้ว ${inCart?.quantity || 0} ชิ้น)`
          : `"${product.product_name}" เพิ่มครบตามจำนวนคงเหลือที่เบิกได้แล้ว (${getAvailable(product)} ชิ้น)`,
      });
      return;
    }
    setCart((prev) => inCart
      ? prev.map((c) => (c.product_id === product.product_id ? { ...c, quantity: c.quantity + qty } : c))
      : [...prev, { product_id: product.product_id, product_name: product.product_name, quantity: qty }]);
    setPickProduct('');
    setPickQty(1);
    setNotice(null);
    setFieldErrors((p) => ({ ...p, items: '' }));
  };

  const openConfirmCreate = () => {
    const errors = {};
    if (!customerName.trim()) errors.customer = 'กรุณากรอกชื่อลูกค้า';
    if (!jobDetail.trim()) errors.job = 'กรุณากรอกรายละเอียดงาน / ทะเบียนรถ';
    if (cart.length === 0) errors.items = 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setNotice(null);
    setConfirmCreate(true);
  };

  const submitRequisition = async () => {
    setSubmitting(true);
    try {
      await api.post('/requisitions', {
        customer_name: customerName.trim(),
        job_detail: jobDetail.trim(),
        items: cart.map((c) => ({ product_id: c.product_id, quantity: c.quantity })),
      });
      setCustomerName('');
      setJobDetail('');
      setFieldErrors({});
      setCart([]);
      setNotice({ type: 'success', text: 'ส่งรายการเบิกสำเร็จ รอการอนุมัติ' });
      await Promise.all([fetchData(), fetchProducts()]);
    } catch (err) {
      showError(err, 'ส่งรายการเบิกไม่สำเร็จ');
    } finally {
      setSubmitting(false);
      setConfirmCreate(false);
    }
  };

  // ==========================================
  // 3. อนุมัติ / ยกเลิก (Admin, Employee)
  // ==========================================
  const approveRequisition = async () => {
    setActionLoading(true);
    try {
      await api.patch(`/requisitions/${approveTarget.requisition_id}/approve`);
      setNotice({ type: 'success', text: `อนุมัติ ${approveTarget.requisition_id} แล้ว สถานะ: รอชำระเงิน` });
      await fetchData();
    } catch (err) {
      showError(err, 'อนุมัติไม่สำเร็จ');
    } finally {
      setActionLoading(false);
      setApproveTarget(null);
    }
  };

  const cancelRequisition = async () => {
    setActionLoading(true);
    try {
      await api.patch(`/requisitions/${cancelTarget.requisition_id}/cancel`, {});
      setNotice({ type: 'success', text: `ยกเลิก ${cancelTarget.requisition_id} แล้ว คืนจำนวนที่จองให้สต๊อก` });
      await fetchData();
    } catch (err) {
      showError(err, 'ยกเลิกไม่สำเร็จ');
    } finally {
      setActionLoading(false);
      setCancelTarget(null);
    }
  };

  // ดึงวันที่รับเข้าจริงของล็อตจากข้อมูลล็อตสินค้า (inventory_lots) ผ่าน API เดิม
  const attachLotDates = async (data) => {
    const items = data.items || [];
    const productIds = [...new Set(items.filter((it) => it.lot_id).map((it) => it.product_id))];
    const results = await Promise.allSettled(productIds.map((pid) => api.get(`/products/${pid}/lots`)));
    const receivedByLot = {};
    results.forEach((r) => {
      if (r.status === 'fulfilled') (r.value.data.data || []).forEach((l) => { receivedByLot[l.lot_id] = l.received_at; });
    });
    const company = getStatusKey(data) === 'paid'
      ? await api.get('/company').then((r) => r.data.data).catch(() => null)
      : null;
    return {
      ...data,
      company,
      items: items.map((it) => ({ ...it, lot_received_at: it.lot_received_at || receivedByLot[it.lot_id] || null })),
    };
  };

  const openDetail = async (req) => {
    try {
      const res = await api.get(`/requisitions/${req.requisition_id}`);
      setDetail(await attachLotDates(res.data.data));
    } catch (err) {
      showError(err, 'โหลดรายละเอียดไม่สำเร็จ');
    }
  };

  // ==========================================
  // 4. ยืนยันชำระเงิน (Admin, Employee)
  // ==========================================
  const formatNumber = (value) => {
    const num = parseFloat(value) || 0;
    return num.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleOpenModal = async (record) => {
    try {
      const res = await api.get(`/requisitions/${record.requisition_id}`);
      setUseLaborCost(false);
      setLaborCost(0);
      setLaborText('');
      setUseDiscount(false);
      setDiscountAmount(0);
      setDiscountText('');
      setPaymentMethod('cash');
      setPaymentRecord(res.data.data);
    } catch (err) {
      showError(err, 'โหลดรายละเอียดไม่สำเร็จ');
    }
  };

  const payRequisition = async (method) => {
    if (!paymentRecord || paymentInvalid) return;
    const labor = useLaborCost ? laborCost : 0;
    const discount = useDiscount ? discountAmount : 0;
    setPaymentSaving(true);
    try {
      await api.patch(`/requisitions/${paymentRecord.requisition_id}/payment`, {
        payment_method: method,
        labor_cost: labor,
        discount_amount: discount,
      });
      setNotice({ type: 'success', text: `ยืนยันชำระเงิน ${paymentRecord.requisition_id} สำเร็จ ตัดสต๊อกและบันทึกประวัติแล้ว` });
      const paidId = paymentRecord.requisition_id;
      setPaymentRecord(null);
      await fetchData();
      await openReceipt(paidId);
    } catch (err) {
      showError(err, 'บันทึกการชำระเงินไม่สำเร็จ');
    } finally {
      setPaymentSaving(false);
    }
  };

  // ใบเบิกสินค้า: เปิดอัตโนมัติหลังชำระเงิน และเปิดดูได้จากรายการทุกสถานะ
  const openReceipt = async (id) => {
    try {
      const res = await api.get(`/requisitions/${id}`);
      setDetail(await attachLotDates(res.data.data));
    } catch (err) {
      showError(err, 'โหลดใบเบิกไม่สำเร็จ');
    }
  };

  // ==========================================
  // 4.1 หน้ารายการเบิกสินค้าทั้งหมด (ดูทั้งหมด)
  // ==========================================
  const fetchHistoryAll = useCallback(async () => {
    setHistLoading(true);
    try {
      const params = { page: 1, limit: 100, ...getDateRange(histRange, histCustomDate, histMonth) };
      if (histSearch.trim()) params.search = histSearch.trim();
      const first = await api.get('/requisitions', { params });
      const rows = [...(first.data.data || [])];
      const totalPages = first.data.pagination?.totalPages || 1;
      if (totalPages > 1) {
        const rest = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) => api.get('/requisitions', { params: { ...params, page: i + 2 } }))
        );
        rest.forEach((r) => rows.push(...(r.data.data || [])));
      }
      setHistRows(rows);
    } catch {
      setHistRows([]);
    } finally {
      setHistLoading(false);
    }
  }, [histRange, histCustomDate, histMonth, histSearch]);

  useEffect(() => {
    if (!showAll || !user) return undefined;
    const t = setTimeout(fetchHistoryAll, 300);
    return () => clearTimeout(t);
  }, [showAll, user, fetchHistoryAll]);

  useEffect(() => { setHistPage(1); }, [histRange, histCustomDate, histMonth, histStatus, histSearch]);

  const histFiltered = useMemo(() => histRows.filter((r) => {
    const key = getStatusKey(r);
    if (role === 'employee' && key !== 'pending' && r.approved_by !== user?.user_id) return false;
    return histStatus === 'all' || key === histStatus;
  }), [histRows, histStatus, role, user]);

  const histTotalPages = Math.max(1, Math.ceil(histFiltered.length / HIST_PAGE_SIZE));
  const histPageRows = histFiltered.slice((histPage - 1) * HIST_PAGE_SIZE, histPage * HIST_PAGE_SIZE);
  const histPaidTotal = histFiltered.filter((r) => getStatusKey(r) === 'paid').reduce((s, r) => s + (parseFloat(r.net_amount) || 0), 0);

  // รายงานตามตัวกรองที่เลือกอยู่ (ช่วงเวลา + สถานะ + ค้นหา) ใช้ข้อมูลชุดเดียวกับตาราง
  const exportHistoryReport = async () => {
    setHistExporting(true);
    try {
      // รายการสินค้ามาจาก /requisitions/:id (ใช้ค่าที่โหลดไว้แล้ว ส่วนที่ยังไม่มีดึงทีละกลุ่ม)
      const itemsById = { ...itemsMap };
      const missing = histFiltered.map((r) => r.requisition_id).filter((id) => !itemsById[id]);
      for (let i = 0; i < missing.length; i += 10) {
        const batch = await Promise.all(missing.slice(i, i + 10).map((id) => api.get(`/requisitions/${id}`).then((res) => res.data.data.items || [])));
        batch.forEach((items, j) => { itemsById[missing[i + j]] = items; });
      }
      const paidRows = histFiltered.filter((r) => getStatusKey(r) === 'paid');
      const awaitingRows = histFiltered.filter((r) => getStatusKey(r) === 'awaiting');
      const sum = (rows, field) => rows.reduce((s, r) => s + (parseFloat(r[field]) || 0), 0);
      const totalQty = histFiltered.reduce((s, r) => s + (Number(r.total_items) || 0), 0);
      // 1 ใบเบิก 1 สินค้า = 1 แถว ส่วนค่าแรง/ส่วนลด/VAT/ยอดสุทธิระดับใบเบิกแสดงที่แถวแรกของใบเบิกเท่านั้น
      const reportRows = [];
      histFiltered.forEach((r) => {
        const key = getStatusKey(r);
        const items = itemsById[r.requisition_id] || [];
        const list = items.length > 0 ? items : [null];
        list.forEach((it, idx) => {
          const first = idx === 0;
          reportRows.push([
            r.requisition_id,
            formatDate(r.requisition_date),
            fullName(r.user_first_name, r.user_last_name),
            [r.customer_name, r.job_detail].filter(Boolean).join(' / ') || '-',
            it ? it.product_name || '-' : '-',
            it ? Number(it.quantity || 0).toLocaleString() : '-',
            it && key === 'paid' ? formatNumber(it.unit_price) : '-',
            first && key === 'paid' ? formatNumber(r.labor_cost) : '',
            first && key === 'paid' ? formatNumber(r.discount_amount) : '',
            first && key === 'paid' ? formatNumber(r.vat_amount) : '',
            first ? (r.net_amount != null && key !== 'pending' ? formatNumber(r.net_amount) : '-') : '',
            STATUS_META[key].label,
            key === 'paid' ? (METHOD_LABELS[r.payment_method] || r.payment_method || '-') : '-',
          ]);
        });
      });
      openReportWindow({
        title: 'รายงานรายการเบิกสินค้า',
        rangeLabel: rangeText(histRange, histCustomDate, histMonth),
        extraInfo: [
          ['สถานะ', FILTERS.find((f) => f.key === histStatus)?.label || 'ทั้งหมด'],
          ...(histSearch.trim() ? [['ค้นหา', histSearch.trim()]] : []),
        ],
        headers: ['รหัสใบเบิก', 'วันที่', 'ผู้เบิก', 'ลูกค้า / งาน', 'ชื่อสินค้า', 'จำนวน', 'ราคา/หน่วย', 'ค่าแรง', 'ส่วนลด', 'VAT', 'ยอดสุทธิ (บาท)', 'สถานะ', 'วิธีชำระเงิน'],
        aligns: ['left', 'left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'left', 'left'],
        rows: reportRows,
        summary: [
          ['จำนวนใบเบิก', `${histFiltered.length.toLocaleString()} รายการ`],
          ['จำนวนสินค้าที่เบิกรวม', `${totalQty.toLocaleString()} ชิ้น`],
          ['ยอดรอชำระเงิน', `${formatNumber(sum(awaitingRows, 'net_amount'))} บาท`],
          [`ใบเบิกที่ชำระเงินแล้ว (${paidRows.length.toLocaleString()} รายการ)`, ''],
          ['ค่าแรง/ค่าบริการรวม', `${formatNumber(sum(paidRows, 'labor_cost'))} บาท`],
          ['ส่วนลดรวม', `${formatNumber(sum(paidRows, 'discount_amount'))} บาท`],
          ['VAT รวม', `${formatNumber(sum(paidRows, 'vat_amount'))} บาท`],
          ['ยอดสุทธิรวม', `${formatNumber(sum(paidRows, 'net_amount'))} บาท`],
        ],
        grandValue: `${formatNumber(sum(paidRows, 'net_amount'))} บาท`,
      });
    } catch {
      setNotice({ type: 'error', text: 'ไม่สามารถส่งออกรายงานได้' });
    } finally {
      setHistExporting(false);
    }
  };


  // ==========================================
  // 5. รายการที่แสดงตามสิทธิ์ + ตัวกรอง
  // ==========================================
  const visible = useMemo(() => {
    const kw = search.trim().toLowerCase();
    const priority = { pending: 0, awaiting: 1 };
    return requisitions.filter((r) => {
      const key = getStatusKey(r);
      // พนักงานเห็นรออนุมัติทั้งหมด ส่วนประวัติเห็นเฉพาะที่ตนเองดำเนินการ
      if (role === 'employee' && key !== 'pending' && r.approved_by !== user.user_id) return false;
      if (filter !== 'all' && key !== filter) return false;
      if (!kw) return true;
      return [r.requisition_id, r.customer_name, r.job_detail].some((v) => (v || '').toLowerCase().includes(kw));
    }).sort((a, b) => (priority[getStatusKey(a)] ?? 2) - (priority[getStatusKey(b)] ?? 2));
  }, [requisitions, filter, search, role, user]);

  const counts = useMemo(() => {
    const c = { pending: 0, awaiting: 0, paid: 0, cancelled: 0 };
    requisitions.forEach((r) => {
      if (role === 'employee' && getStatusKey(r) !== 'pending' && r.approved_by !== user?.user_id) return;
      c[getStatusKey(r)] += 1;
    });
    return c;
  }, [requisitions, role, user]);

  // ชื่อสินค้า/รุ่นของแต่ละใบเบิก (รายการจาก /requisitions ไม่มีรายการสินค้า จึงดึงจาก /requisitions/:id ที่แถวแสดงอยู่)
  const [itemsMap, setItemsMap] = useState({});
  const rowsToLoad = showAll ? histPageRows : visible;
  useEffect(() => {
    const missing = rowsToLoad.map((r) => r.requisition_id).filter((id) => !itemsMap[id]);
    if (missing.length === 0) return undefined;
    let cancelled = false;
    Promise.allSettled(missing.map((id) => api.get(`/requisitions/${id}`))).then((results) => {
      if (cancelled) return;
      const next = {};
      results.forEach((res, i) => {
        next[missing[i]] = res.status === 'fulfilled' ? (res.value.data.data.items || []) : [];
      });
      setItemsMap((prev) => ({ ...prev, ...next }));
    });
    return () => { cancelled = true; };
  }, [rowsToLoad, itemsMap]);

  const renderProducts = (id) => {
    const items = itemsMap[id];
    if (!items) return '-';
    const grouped = [];
    items.forEach((it) => {
      if (!grouped.some((g) => g.product_id === it.product_id)) grouped.push(it);
    });
    if (grouped.length === 0) return '-';
    return grouped.map((it) => (
      <div key={it.product_id}>
        <div>{it.product_name}</div>
        {it.model ? <small style={{ color: '#64748b', fontSize: 11 }}>{it.model}</small> : null}
      </div>
    ));
  };

  const renderBadge = (r) => {
    const m = STATUS_META[getStatusKey(r)];
    return <span className="req-status-badge" style={{ background: m.bg, color: m.color }}>{m.label}</span>;
  };

  const paymentInvalid = !!paymentRecord && (
    (parseFloat(paymentRecord.subtotal_amount) || 0) + (useLaborCost ? laborCost : 0) - (useDiscount ? discountAmount : 0) < 0
  );

  const statCards = [
    { key: 'pending', cls: 'amber', icon: <FiClock size={20} /> },
    { key: 'awaiting', cls: 'blue', icon: <FiDollarSign size={20} /> },
    { key: 'paid', cls: 'green', icon: <FiCheckCircle size={20} /> },
    { key: 'cancelled', cls: 'slate', icon: <FiX size={20} /> },
  ];

  const historyRef = useRef(null);
  const focusStatus = (key) => {
    setFilter(key);
    setSearch('');
    setTimeout(() => historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  // กล่องแจ้งเตือนงานที่ต้องดำเนินการ เรียงตามความสำคัญ: รออนุมัติ → รอชำระเงิน
  const taskAlerts = isStaff ? [
    { key: 'pending', title: 'มีรายการเบิกสินค้ารออนุมัติ', hint: 'กดเพื่อดูและอนุมัติรายการ', border: '#f59e0b', bg: 'linear-gradient(180deg,#fffbeb 0%,#fff7ed 100%)', color: '#92400e', sub: '#b45309', icon: '#f59e0b', shadow: 'rgba(245,158,11,0.55)' },
    { key: 'awaiting', title: 'มีรายการเบิกรอชำระเงิน', hint: 'กดเพื่อดูและยืนยันชำระเงิน', border: '#fb923c', bg: 'linear-gradient(180deg,#fff7ed 0%,#ffedd5 100%)', color: '#9a3412', sub: '#c2410c', icon: '#ea580c', shadow: 'rgba(234,88,12,0.5)' },
  ].filter((a) => counts[a.key] > 0) : [];

  return (
    <Layout title={showAll ? 'รายการเบิกสินค้าทั้งหมด' : 'เบิกสินค้า'}>
      {showAll ? (
        <>
          <div className="hist-toolbar">
            <button className="pfm-btn pfm-btn-outline" onClick={() => setShowAll(false)}>
              <FiArrowLeft size={15} /> กลับหน้าเบิกสินค้า
            </button>
          </div>
          <div className="rcv-history">
            <div className="rcv-history-header">
              <h3>รายการเบิกสินค้าทั้งหมด</h3>
              <span className="hist-summary">{histFiltered.length} รายการ · ชำระแล้ว {formatNumber(histPaidTotal)} บาท</span>
              <div className="hist-range-bar">
                <div className="hist-seg">
                  {RANGE_OPTIONS.map((o) => (
                    <button key={o.value} className={`hist-seg-btn ${histRange === o.value ? 'active' : ''}`} onClick={() => setHistRange(o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {histRange === 'custom' && (
                  <div className="hist-date-pick">
                    <ThaiDatePicker value={histCustomDate} onChange={setHistCustomDate} />
                    <button className="hist-clear-btn" onClick={() => { setHistCustomDate(''); setHistRange('all'); }}>ล้าง</button>
                  </div>
                )}
                {histRange === 'pickMonth' && (
                  <MonthPickerInline value={histMonth} onChange={setHistMonth} onClear={() => { setHistMonth(currentMonthPick()); setHistRange('all'); }} />
                )}
                <button className="hist-export-btn" onClick={exportHistoryReport} disabled={histLoading || histExporting || histFiltered.length === 0}>
                  <FiDownload size={14} /> {histExporting ? 'กำลังสร้างรายงาน...' : 'ส่งออกรายงาน'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 12px' }}>
              <div className="hist-seg">
                {FILTERS.map((f) => (
                  <button key={f.key} className={`hist-seg-btn ${histStatus === f.key ? 'active' : ''}`} onClick={() => setHistStatus(f.key)}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="req-history-search">
                <FiSearch size={14} />
                <input value={histSearch} onChange={(e) => setHistSearch(e.target.value)} placeholder="ค้นหารหัส / ลูกค้า / งาน" />
              </div>
            </div>
            <div className="table-container">
              <div className="table-scroll">
                <table className="pro-table">
                  <thead>
                    <tr>
                      <th>รหัสใบเบิก</th>
                      <th>วันที่</th>
                      <th>ผู้เบิก</th>
                      <th>ลูกค้า / งาน</th>
                      <th>ชื่อสินค้า</th>
                      <th>ยอดสุทธิ</th>
                      <th>สถานะ</th>
                      <th className="col-actions">การดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histLoading ? (
                      <tr><td colSpan={8}><div className="table-empty"><div className="spinner" /><p>กำลังโหลดข้อมูล...</p></div></td></tr>
                    ) : histPageRows.length === 0 ? (
                      <tr><td colSpan={8}><div className="table-empty"><FiFileText size={40} /><p>ไม่พบรายการเบิกสินค้า</p></div></td></tr>
                    ) : histPageRows.map((r) => {
                      const key = getStatusKey(r);
                      return (
                        <tr key={r.requisition_id} style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>
                          <td style={{ fontWeight: 600 }}>{r.requisition_id}</td>
                          <td>{formatDate(r.requisition_date)}</td>
                          <td>{fullName(r.user_first_name, r.user_last_name)}</td>
                          <td>
                            <div>{r.customer_name}</div>
                            <small style={{ color: '#64748b' }}>{r.job_detail}</small>
                          </td>
                          <td>{renderProducts(r.requisition_id)}</td>
                          <td>{r.net_amount != null && key !== 'pending' ? `${formatNumber(r.net_amount)} บาท` : '-'}</td>
                          <td>{renderBadge(r)}</td>
                          <td className="col-actions">
                            <button className="pfm-btn pfm-btn-outline" onClick={(e) => { e.stopPropagation(); openDetail(r); }} title="ดูใบเบิก">
                              <FiFileText size={15} /> ดูใบเบิก
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {histTotalPages > 1 && !histLoading && (
                <div className="pagination">
                  <div className="pagination-info">หน้า {histPage} จาก {histTotalPages}</div>
                  <div className="pagination-buttons">
                    <button className="pagination-btn" disabled={histPage === 1} onClick={() => setHistPage(histPage - 1)}>‹</button>
                    {Array.from({ length: histTotalPages }, (_, i) => i + 1)
                      .filter((p) => Math.abs(p - histPage) <= 2 || p === 1 || p === histTotalPages)
                      .map((p) => (
                        <button key={p} className={`pagination-btn ${p === histPage ? 'active' : ''}`} onClick={() => setHistPage(p)}>{p}</button>
                      ))}
                    <button className="pagination-btn" disabled={histPage === histTotalPages} onClick={() => setHistPage(histPage + 1)}>›</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
      <div className="req-page">
        {taskAlerts.map((a) => (
          <div
            key={a.key}
            style={{
              border: `2px solid ${a.border}`, background: a.bg, borderRadius: 14, overflow: 'hidden',
              boxShadow: `0 8px 24px -12px ${a.shadow}`, outline: filter === a.key ? `3px solid ${a.border}55` : 'none',
            }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => focusStatus(a.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusStatus(a.key); } }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', cursor: 'pointer', padding: '14px 18px' }}
            >
              <span style={{ width: 40, height: 40, borderRadius: 12, background: a.icon, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FiAlertCircle size={22} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 17, fontWeight: 800, color: a.color }}>{a.title}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: a.sub }}>{a.hint}</span>
              </span>
              <span style={{ background: '#dc2626', color: '#fff', fontWeight: 800, fontSize: 15, padding: '4px 14px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                {counts[a.key]} รายการ
              </span>
              <FiArrowRight size={18} color={a.color} />
            </div>

            {(a.key === 'pending' || a.key === 'awaiting') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 18px 14px', maxHeight: 240, overflowY: 'auto' }}>
                {requisitions
                  .filter((r) => getStatusKey(r) === a.key && (role !== 'employee' || a.key === 'pending' || r.approved_by === user.user_id))
                  .map((r) => (
                  <div
                    key={r.requisition_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#fff',
                      border: `1px solid ${a.key === 'pending' ? '#fde68a' : '#fed7aa'}`, borderLeft: `5px solid ${a.icon}`, borderRadius: 10, padding: '8px 12px',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 180, cursor: 'pointer' }} onClick={() => openDetail(r)}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.requisition_id}</div>
                      <div style={{ fontSize: 12.5, color: '#64748b' }}>
                        {fullName(r.user_first_name, r.user_last_name)} • {r.customer_name} • {r.job_detail}
                      </div>
                    </div>
                    {a.key === 'awaiting' && (
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>{formatNumber(r.net_amount)} บาท</div>
                    )}
                    <button
                      className="btn btn-success btn-sm fw-bold d-inline-flex align-items-center gap-1 px-3 shadow-sm"
                      onClick={() => (a.key === 'pending' ? setApproveTarget(r) : handleOpenModal(r))}
                      title={a.key === 'pending' ? 'อนุมัติ' : 'ยืนยันชำระเงิน'}
                    >
                      {a.key === 'pending' ? <><FiCheck size={15} /> อนุมัติ</> : <><FiDollarSign size={15} /> ชำระเงิน</>}
                    </button>
                    <button
                      className="tbl-action req-reject-btn"
                      onClick={() => setCancelTarget(r)}
                      title="ยกเลิก"
                      style={{ width: 34, height: 34 }}
                    >
                      <FiX size={17} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {notice && (
          <div
            className="req-alert-strip"
            style={{
              margin: 0,
              ...(notice.type === 'success'
                ? { background: '#dcfce7', borderColor: '#bbf7d0', color: '#166534' }
                : {}),
              justifyContent: 'space-between',
            }}
          >
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}><FiX /></button>
          </div>
        )}

        <div className="req-stats-grid">
          {statCards.map((s) => {
            const active = filter === s.key;
            return (
              <div
                key={s.key}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                className={`req-stat-card ${s.cls}`}
                onClick={() => setFilter(active ? 'all' : s.key)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilter(active ? 'all' : s.key); } }}
                style={{
                  cursor: 'pointer',
                  ...(active ? {
                    borderColor: STATUS_META[s.key].color, borderWidth: 2,
                    boxShadow: `0 0 0 3px ${STATUS_META[s.key].color}26, 0 8px 20px -10px ${STATUS_META[s.key].color}`,
                    background: STATUS_META[s.key].bg,
                  } : {}),
                }}
              >
                <div className="req-stat-icon">{s.icon}</div>
                <div>
                  <div className="req-stat-label">{STATUS_META[s.key].label}</div>
                  <div className="req-stat-value">{counts[s.key]}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ฟอร์มเบิกสินค้า: เฉพาะช่าง */}
        {isTechnician && (
          <div className="req-left-panel">
            <div className="req-section-head">
              <div>
                <h3>สร้างรายการเบิกสินค้า</h3>
                <p>สินค้าที่เบิกจะถูกจองไว้ ยังไม่ตัดสต๊อกจริงจนกว่าจะชำระเงิน</p>
              </div>
            </div>
            <div className="req-form-grid" style={{ padding: 0 }}>
              <div className="req-field">
                <label>ชื่อลูกค้า</label>
                <input className="req-select" value={customerName} onChange={(e) => { setCustomerName(e.target.value); setFieldErrors((p) => ({ ...p, customer: '' })); }} placeholder="ชื่อลูกค้า" disabled={submitting}
                  style={fieldErrors.customer ? { borderColor: '#dc2626' } : undefined} />
                {fieldErrors.customer && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{fieldErrors.customer}</div>}
              </div>
              <div className="req-field">
                <label>รายละเอียดงาน / ทะเบียนรถ</label>
                <input className="req-select" value={jobDetail} onChange={(e) => { setJobDetail(e.target.value); setFieldErrors((p) => ({ ...p, job: '' })); }} placeholder="เช่น เปลี่ยนแบตเตอรี่ กข 1234" disabled={submitting}
                  style={fieldErrors.job ? { borderColor: '#dc2626' } : undefined} />
                {fieldErrors.job && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{fieldErrors.job}</div>}
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <div className="req-field" style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <label>สินค้า</label>
                  <ProductPicker products={products} value={pickProduct} onChange={handlePickProduct} getAvailable={getAvailable} disabled={submitting} />
                </div>
                <div className="req-field" style={{ flex: '0 0 auto' }}>
                  <label>จำนวน</label>
                  <div style={{ display: 'flex', alignItems: 'stretch', height: 43, border: '1px solid #dbe4f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                    <button type="button" onClick={() => stepQty(-1)} disabled={!pickedProduct || submitting || (parseInt(pickQty, 10) || 1) <= 1} aria-label="ลดจำนวน"
                      style={{ width: 36, border: 'none', background: '#f1f5f9', color: '#334155', fontSize: 18, fontWeight: 700, cursor: 'pointer', lineHeight: 1, opacity: (!pickedProduct || submitting || (parseInt(pickQty, 10) || 1) <= 1) ? 0.45 : 1 }}>−</button>
                    <input type="text" inputMode="numeric" maxLength={6} value={pickQty}
                      onChange={(e) => handleQtyInput(e.target.value)}
                      onBlur={() => { if (!pickQty) setPickQty('1'); }}
                      disabled={submitting}
                      style={{ width: 52, border: 'none', borderLeft: '1px solid #dbe4f0', borderRight: '1px solid #dbe4f0', outline: 'none', textAlign: 'center', fontSize: 14, fontFamily: 'inherit', color: '#0f172a', minWidth: 0 }} />
                    <button type="button" onClick={() => stepQty(1)} disabled={!pickedProduct || submitting || (parseInt(pickQty, 10) || 1) >= pickedRemaining} aria-label="เพิ่มจำนวน"
                      style={{ width: 36, border: 'none', background: '#f1f5f9', color: '#334155', fontSize: 18, fontWeight: 700, cursor: 'pointer', lineHeight: 1, opacity: (!pickedProduct || submitting || (parseInt(pickQty, 10) || 1) >= pickedRemaining) ? 0.45 : 1 }}>+</button>
                  </div>
                </div>
                <button className="btn-add-sm" onClick={addToCart} disabled={!pickProduct || submitting} style={{ whiteSpace: 'nowrap', height: 43, marginTop: 0 }}>
                  <FiPlus /> เพิ่ม
                </button>
                {fieldErrors.items && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 0, flexBasis: '100%' }}>{fieldErrors.items}</div>}
              </div>
            </div>

            {cart.length > 0 && (
              <div className="req-detail-items" style={{ marginTop: 14 }}>
                {cart.map((c) => (
                  <div key={c.product_id} className="req-detail-item">
                    <div className="req-detail-name">{c.product_name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="req-detail-qty">x {c.quantity}</span>
                      <button className="tbl-action delete" onClick={() => setCart((prev) => prev.filter((i) => i.product_id !== c.product_id))} title="ลบ" disabled={submitting}>
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="req-action-row" style={{ padding: '16px 0 0' }}>
              <button className="btn-add-sm req-submit-btn" onClick={openConfirmCreate} disabled={submitting}>
                <FiSend /> ยืนยันรายการเบิก
              </button>
            </div>
          </div>
        )}

        <div className="req-history-card" ref={historyRef}>
          <div className="req-section-head req-history-head">
            <div>
              <h3>{isTechnician ? 'รายการเบิกของฉัน' : 'รายการเบิกสินค้า'}</h3>
              <p>{isTechnician ? 'ติดตามสถานะรายการเบิกของคุณ' : 'อนุมัติ ยืนยันชำระเงิน และดูประวัติรายการ'}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginLeft: 'auto' }}>
              <button
                type="button"
                className="rcv-view-all-btn"
                onClick={() => { setShowAll(true); window.scrollTo({ top: 0 }); }}
              >
                ดูทั้งหมด <FiArrowRight size={13} />
              </button>
              <div className="req-history-search" style={{ marginLeft: 0 }}>
                <FiSearch size={14} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหารหัส / ลูกค้า / งาน" />
              </div>
            </div>
          </div>

          <div className="req-filter-row">
            <div className="hist-seg">
              {FILTERS.map((f) => (
                <button key={f.key} className={`hist-seg-btn ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="table-container">
            <div className="table-scroll">
              <table className="pro-table">
                <thead>
                  <tr>
                    <th>รหัสใบเบิก</th>
                    <th>วันที่</th>
                    <th>ผู้เบิก</th>
                    <th>ลูกค้า / งาน</th>
                    <th>ชื่อสินค้า</th>
                    <th>ยอดสุทธิ</th>
                    <th>สถานะ</th>
                    <th className="col-actions">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8}><div className="table-empty"><div className="spinner" /></div></td></tr>
                  ) : visible.length === 0 ? (
                    <tr><td colSpan={8}><div className="table-empty">ไม่พบรายการเบิก</div></td></tr>
                  ) : visible.map((req) => {
                    const key = getStatusKey(req);
                    return (
                      <tr key={req.requisition_id} onClick={() => openDetail(req)} style={{ cursor: 'pointer' }} title="คลิกเพื่อดูใบเบิก">
                        <td style={{ fontWeight: 600 }}>{req.requisition_id}</td>
                        <td>{formatDate(req.requisition_date)}</td>
                        <td>{fullName(req.user_first_name, req.user_last_name)}</td>
                        <td>
                          <div>{req.customer_name}</div>
                          <small style={{ color: '#64748b' }}>{req.job_detail}</small>
                        </td>
                        <td>{renderProducts(req.requisition_id)}</td>
                        <td>{req.net_amount != null && key !== 'pending' ? `${formatNumber(req.net_amount)} บาท` : '-'}</td>
                        <td>{renderBadge(req)}</td>
                        <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="action-group" style={{ alignItems: 'center' }}>
                            {isStaff && key === 'awaiting' && (
                              <button
                                className="btn btn-success btn-sm fw-bold d-inline-flex align-items-center gap-1 px-3 shadow-sm"
                                onClick={() => handleOpenModal(req)}
                                title="ยืนยันชำระเงิน"
                              >
                                <FiDollarSign size={15} /> ชำระเงิน
                              </button>
                            )}
                            <button className="pfm-btn pfm-btn-outline" onClick={() => openDetail(req)} title="ดูใบเบิก">
                              <FiFileText size={15} /> ดูใบเบิก
                            </button>
                            {isStaff && key === 'pending' && (
                              <>
                                <button className="tbl-action req-approve-btn" onClick={() => setApproveTarget(req)} title="อนุมัติ"><FiCheck size={15} /></button>
                                <button className="tbl-action req-reject-btn" onClick={() => setCancelTarget(req)} title="ยกเลิก"><FiX size={15} /></button>
                              </>
                            )}
                            {isStaff && key === 'awaiting' && (
                              <button className="tbl-action req-reject-btn" onClick={() => setCancelTarget(req)} title="ยกเลิก"><FiX size={15} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      )}

      <ConfirmModal
        show={confirmCreate}
        onClose={() => !submitting && setConfirmCreate(false)}
        onConfirm={submitRequisition}
        title="ยืนยันรายการเบิก"
        message={`ส่งรายการเบิก ${cart.length} รายการ ให้ลูกค้า "${customerName}" เพื่อรออนุมัติ?`}
        confirmText="ยืนยัน"
        danger={false}
        loading={submitting}
      />
      <ConfirmModal
        show={!!approveTarget}
        onClose={() => !actionLoading && setApproveTarget(null)}
        onConfirm={approveRequisition}
        title="อนุมัติรายการเบิก"
        message={`อนุมัติ ${approveTarget?.requisition_id} และเปลี่ยนสถานะเป็น "รอชำระเงิน" (ยังไม่ตัดสต๊อก)?`}
        confirmText="อนุมัติ"
        danger={false}
        loading={actionLoading}
      />
      <ConfirmModal
        show={!!cancelTarget}
        onClose={() => !actionLoading && setCancelTarget(null)}
        onConfirm={cancelRequisition}
        title="ยกเลิกรายการเบิก"
        message={`ยกเลิก ${cancelTarget?.requisition_id}? จำนวนที่จองไว้จะถูกคืนให้สต๊อก`}
        confirmText="ยกเลิกรายการ"
        loading={actionLoading}
      />

      {/* ใบเบิกสินค้า */}
      {detail && (
        <div className="po-preview-overlay" onClick={() => setDetail(null)}>
          <div className="po-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="po-preview-toolbar">
              <div className="po-preview-status">
                <span className="po-preview-ok" style={{ background: STATUS_META[getStatusKey(detail)].bg, color: STATUS_META[getStatusKey(detail)].color }}>
                  <FiFileText size={15} /> {STATUS_META[getStatusKey(detail)].label}
                </span>
                <div className="po-preview-id">{detail.requisition_id}</div>
              </div>
              <div className="po-preview-actions">
                <button className="pfm-btn pfm-btn-primary po-preview-btn" onClick={() => printRequisitionDoc(detail)}>
                  <FiPrinter size={16} /> พิมพ์
                </button>
                <button className="pfm-btn pfm-btn-outline po-preview-btn" onClick={() => setDetail(null)}>
                  <FiX size={16} /> ปิด
                </button>
              </div>
            </div>
            <div className="po-preview-scroll">
              <RequisitionDocPaper req={detail} />
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          ส่วนที่ 2: Modal ป๊อปอัปชำระเงิน
          ========================================== */}
      {paymentRecord && (
        <div 
          className="modal-overlay" 
          onClick={() => !paymentSaving && setPaymentRecord(null)} 
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 999
          }}
        >
          <div 
            className="cfm-modal" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              background: '#fff', borderRadius: '12px', padding: '24px', 
              width: '100%', maxWidth: '460px', position: 'relative', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
          >
            <button 
              className="cfm-close" 
              onClick={() => setPaymentRecord(null)} 
              disabled={paymentSaving}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
            >
              <FiX size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ color: '#3b82f6' }}><FiCheckCircle size={24} /></div>
              <h4 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>ยืนยันชำระเงินใบเบิก</h4>
            </div>
            
            <div style={{ borderBottom: '1px solid #e2e8f0', margin: '0 -24px 16px -24px' }} />
            
            <p style={{ color: '#475569', marginBottom: '16px' }}>
              ใบเบิก <strong>{paymentRecord.requisition_id}</strong> ลูกค้า <strong>{paymentRecord.customer_name}</strong>
            </p>

            {(() => {
              const labor = useLaborCost ? laborCost : 0;
              const discount = useDiscount ? discountAmount : 0;
              const { subtotal, totalBeforeVat, vat, net: netAmount } = calcRequisitionTotals(paymentRecord.subtotal_amount, labor, discount);
              
              return (
                <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', marginBottom: '18px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                      <input type="checkbox" checked={useLaborCost} onChange={e => { setUseLaborCost(e.target.checked); if (!e.target.checked) { setLaborCost(0); setLaborText(''); } }} disabled={paymentSaving} />
                      <span>ค่าแรง/ค่าบริการ</span>
                    </label>
                    {useLaborCost && (
                      <input type="number" min="0" step="0.01" value={laborText} onChange={e => { setLaborText(e.target.value); setLaborCost(Math.max(0, parseFloat(e.target.value) || 0)); }} placeholder="0.00" disabled={paymentSaving} style={{ marginTop: '8px', width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                    )}
                  </div>

                  <div style={{ marginTop: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                      <input type="checkbox" checked={useDiscount} onChange={e => { setUseDiscount(e.target.checked); if (!e.target.checked) { setDiscountAmount(0); setDiscountText(''); } }} disabled={paymentSaving} />
                      <span>ส่วนลด</span>
                    </label>
                    {useDiscount && (
                      <input type="number" min="0" step="0.01" value={discountText} onChange={e => { setDiscountText(e.target.value); setDiscountAmount(Math.max(0, parseFloat(e.target.value) || 0)); }} placeholder="0.00" disabled={paymentSaving} style={{ marginTop: '8px', width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                    )}
                  </div>

                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                    {[
                      ['ราคาสินค้ารวม', subtotal],
                      ['ค่าแรง/ค่าบริการ', labor],
                      ['ส่วนลด', discount],
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ color: '#64748b', fontSize: '13px' }}>{label}</span>
                        <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{formatNumber(value)} บาท</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                      <span style={{ color: '#334155', fontSize: '13px', fontWeight: 700 }}>ราคารวมทั้งหมด</span>
                      <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{formatNumber(totalBeforeVat)} บาท</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: '#64748b', fontSize: '13px' }}>VAT 7%</span>
                      <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{formatNumber(vat)} บาท</span>
                    </div>
                    <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '8px', background: '#135dd1', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '16px', fontWeight: 800 }}>ยอดสุทธิ</span>
                      <span style={{ fontWeight: 900, fontSize: '22px' }}>{formatNumber(netAmount)} บาท</span>
                    </div>
                    {paymentInvalid && (
                      <div style={{ marginTop: '8px', color: '#dc2626', fontSize: '12.5px', fontWeight: 600 }}>ส่วนลดต้องไม่มากกว่าราคาสินค้า + ค่าแรง/ค่าบริการ</div>
                    )}
                  </div>
                </div>
              );
            })()}
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#334155' }}>วิธีการชำระ</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[
                  { value: 'cash', label: 'เงินสด' },
                  { value: 'transfer', label: 'โอนเงิน' }
                ].map((method) => (
                  <button
                    key={method.value}
                    style={{ 
                      flex: 1, padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600,
                      background: paymentMethod === method.value ? '#3b82f6' : '#fff',
                      color: paymentMethod === method.value ? '#fff' : '#64748b',
                      border: paymentMethod === method.value ? '1px solid #3b82f6' : '1px solid #cbd5e1'
                    }}
                    onClick={() => setPaymentMethod(method.value)}
                    disabled={paymentSaving}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button 
                onClick={() => setPaymentRecord(null)} 
                disabled={paymentSaving}
                style={{ padding: '10px 16px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer' }}
              >
                ยกเลิก
              </button>
              <button 
                onClick={() => payRequisition(paymentMethod)} 
                disabled={paymentSaving || paymentInvalid}
                style={{ padding: '10px 16px', border: 'none', background: paymentSaving || paymentInvalid ? '#94a3b8' : '#10b981', color: '#fff', borderRadius: '6px', cursor: paymentSaving || paymentInvalid ? 'not-allowed' : 'pointer', fontWeight: 600 }}
              >
                {paymentSaving ? 'กำลังบันทึก...' : 'ยืนยันชำระเงิน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default RequisitionPage;