import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/layout/Layout';
import ConfirmModal from '../components/ConfirmModal';
import html2canvas from 'html2canvas';
import { renderToStaticMarkup } from 'react-dom/server';
import { FiSearch, FiPlus, FiMinus, FiTrash2, FiX, FiPackage, FiClock, FiPrinter, FiUser, FiPhone, FiMapPin, FiCheck, FiXCircle, FiDownload, FiFileText, FiArrowRight, FiAlertCircle } from 'react-icons/fi';
import { FaBarcode } from 'react-icons/fa';

const STATUS = {
  'รออนุมัติ': { color: '#b45309', bg: '#fef3c7' },
  'อนุมัติ': { color: '#1d4ed8', bg: '#dbeafe' },
  'รอรับสินค้า': { color: '#0369a1', bg: '#e0f2fe' },
  'เสร็จสิ้น': { color: '#15803d', bg: '#dcfce7' },
  'ยกเลิก': { color: '#b91c1c', bg: '#fee2e2' },
};

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const parseDateStr = (d) => {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
};

export const formatDate = (d) => {
  const dt = parseDateStr(d);
  if (!dt) return '';
  const hasTime = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(d);
  const datePart = `${dt.getDate()} ${TH_MONTHS[dt.getMonth()]} ${dt.getFullYear() + 543}`;
  if (!hasTime) return datePart;
  return `${datePart} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} น.`;
};

export const formatNumber = (num) => Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TH_DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const TH_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

// อ่านเลขไม่เกิน 6 หลัก (หลักล้านขึ้นไปจัดการใน readThaiInt)
const readThaiGroup = (str, isTail) => {
  const digits = str.replace(/^0+/, '');
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    const d = Number(digits[i]);
    const place = digits.length - 1 - i;
    if (d === 0) continue;
    if (place === 0) {
      out += d === 1 && (digits.length > 1 || isTail) ? 'เอ็ด' : TH_DIGITS[d];
    } else if (place === 1) {
      out += d === 1 ? 'สิบ' : d === 2 ? 'ยี่สิบ' : `${TH_DIGITS[d]}สิบ`;
    } else {
      out += TH_DIGITS[d] + TH_PLACES[place];
    }
  }
  return out;
};

const readThaiInt = (str, isTail = false) => {
  const s = str.replace(/^0+/, '');
  if (s.length > 6) {
    const head = s.slice(0, s.length - 6);
    const tail = s.slice(-6);
    return `${readThaiInt(head)}ล้าน${readThaiInt(tail, true)}`;
  }
  return readThaiGroup(s, isTail);
};

// แปลงจำนวนเงินเป็นตัวอักษรภาษาไทย เช่น 3000 -> "สามพันบาทถ้วน"
export const thaiBahtText = (amount) => {
  const satangTotal = Math.round(Math.abs(Number(amount) || 0) * 100);
  const baht = String(Math.floor(satangTotal / 100));
  const satang = satangTotal % 100;
  const bahtText = Number(baht) === 0 ? TH_DIGITS[0] : readThaiInt(baht);
  if (satang === 0) return `${bahtText}บาทถ้วน`;
  return `${Number(baht) === 0 ? '' : `${bahtText}บาท`}${readThaiInt(String(satang))}สตางค์`;
};

const PO_LOGO_URL = `${window.location.origin}${process.env.PUBLIC_URL || ''}/images/logo2.png`;

export const supplierAddress = (s) => {
  if (!s) return '';
  return [s.house_no, s.sub_district, s.district, s.province, s.postal_code].filter(Boolean).join(' ');
};

// ส่วนลดเป็นแบบทั้งใบ จึงกระจายตามสัดส่วนมูลค่าต่อรายการเพื่อแสดงในตาราง (รายการสุดท้ายรับเศษ)
const poLines = (po) => {
  const list = po.items || [];
  const gross = list.reduce((s, i) => s + Number(i.unit_price || 0) * Number(i.quantity || 0), 0);
  const discount = Math.min(Math.max(0, parseFloat(po.discount_amount) || 0), gross);
  let used = 0;
  return list.map((item, idx) => {
    const lineGross = Number(item.unit_price || 0) * Number(item.quantity || 0);
    let lineDiscount = 0;
    if (gross > 0) {
      lineDiscount = idx === list.length - 1 ? discount - used : Math.round((discount * lineGross / gross) * 100) / 100;
    }
    used += lineDiscount;
    return { ...item, lineGross, lineDiscount, lineNet: lineGross - lineDiscount };
  });
};

const DOC = {
  navy: '#135dd1',
  line: '#94a3b8',
  th: { border: '1px solid #135dd1', background: '#135dd1', color: '#fff', padding: '6px 6px', fontSize: 12, fontWeight: 700 },
  td: { border: '1px solid #cbd5e1', padding: '6px 6px', fontSize: 12.5, verticalAlign: 'top' },
};

export const PoDocPaper = ({ po, docRef }) => {
  const lines = poLines(po);
  const discount = parseFloat(po.discount_amount) || 0;
  const taxable = (parseFloat(po.total_amount) || 0) - discount;
  const buyerPhone = po.company_phone;
  const supplierAddr = supplierAddress(po);
  const supplierContact = po.first_name ? `${po.prefix || ''}${po.first_name} ${po.last_name || ''}`.trim() : '';
  return (
    <div
      className="po-doc-sheet"
      ref={docRef}
      style={{ width: 794, margin: '0 auto', background: '#fff', padding: '36px 40px', boxSizing: 'border-box', fontFamily: "'Sarabun', Tahoma, sans-serif", fontSize: 13, color: '#1e293b', boxShadow: '0 8px 24px rgba(2, 8, 23, 0.12)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2px solid ${DOC.navy}`, paddingBottom: 12 }}>
        <img src={PO_LOGO_URL} alt="logo" style={{ height: 64, width: 'auto', objectFit: 'contain', display: 'block' }} />
        <div style={{ textAlign: 'right', lineHeight: 1.6 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: DOC.navy }}>ใบสั่งซื้อ</div>
          <div>เลขที่เอกสาร: <b>{po.purchase_number}</b></div>
          <div>วันที่ออก: {formatDate(po.purchase_date)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
        <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 12px', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: DOC.navy, marginBottom: 2 }}>ผู้ซื้อ</div>
          <div style={{ fontWeight: 600 }}>{po.company_name || '-'}</div>
          {po.company_address && <div>{po.company_address}</div>}
          {po.company_tax_id && <div>เลขประจำตัวผู้เสียภาษี: {po.company_tax_id}</div>}
          {buyerPhone && <div>โทร: {buyerPhone}</div>}
        </div>
        <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 12px', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: DOC.navy, marginBottom: 2 }}>ผู้ขาย</div>
          <div style={{ fontWeight: 600 }}>{po.supp_name || '-'}</div>
          {supplierAddr && <div>{supplierAddr}</div>}
          {po.tax_id && <div>เลขประจำตัวผู้เสียภาษี: {po.tax_id}</div>}
          {supplierContact && <div>ติดต่อ: {supplierContact}</div>}
          {po.phone_number && <div>โทร: {po.phone_number}</div>}
          {po.email && <div>อีเมล: {po.email}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, marginTop: 10, fontSize: 12.5, color: '#475569' }}>
        <span>เงื่อนไขการชำระเงิน: <b style={{ color: '#1e293b' }}>{po.payment_term || '-'}</b></span>
        <span>วิธีจัดส่ง: <b style={{ color: '#1e293b' }}>{po.shipping_method || '-'}</b></span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
        <thead>
          <tr>
            <th style={{ ...DOC.th, width: 40, textAlign: 'center' }}>ลำดับ</th>
            <th style={{ ...DOC.th, textAlign: 'left' }}>รายการสินค้า</th>
            <th style={{ ...DOC.th, width: 100, textAlign: 'center' }}>รหัส/บาร์โค้ด</th>
            <th style={{ ...DOC.th, width: 50, textAlign: 'center' }}>จำนวน</th>
            <th style={{ ...DOC.th, width: 80, textAlign: 'right' }}>ราคา/หน่วย</th>
            <th style={{ ...DOC.th, width: 70, textAlign: 'right' }}>ส่วนลด</th>
            <th style={{ ...DOC.th, width: 40, textAlign: 'center' }}>VAT</th>
            <th style={{ ...DOC.th, width: 90, textAlign: 'right' }}>มูลค่า</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((item, idx) => (
            <tr key={idx} style={{ pageBreakInside: 'avoid' }}>
              <td style={{ ...DOC.td, textAlign: 'center' }}>{idx + 1}</td>
              <td style={DOC.td}>{item.product_name}{item.model ? <><br /><small style={{ color: '#64748b' }}>รุ่น: {item.model}</small></> : null}</td>
              <td style={{ ...DOC.td, textAlign: 'center' }}>{item.barcode || '-'}</td>
              <td style={{ ...DOC.td, textAlign: 'center' }}>{item.quantity}</td>
              <td style={{ ...DOC.td, textAlign: 'right' }}>{formatNumber(item.unit_price)}</td>
              <td style={{ ...DOC.td, textAlign: 'right' }}>{formatNumber(item.lineDiscount)}</td>
              <td style={{ ...DOC.td, textAlign: 'center' }}>7%</td>
              <td style={{ ...DOC.td, textAlign: 'right' }}>{formatNumber(item.lineNet)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, pageBreakInside: 'avoid' }}>
        <div style={{ width: 330, lineHeight: 1.9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>มูลค่าก่อนส่วนลด</span><span>{formatNumber(po.total_amount)} บาท</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ส่วนลด</span><span>{formatNumber(discount)} บาท</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>มูลค่าที่คำนวณภาษี</span><span>{formatNumber(taxable)} บาท</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ภาษีมูลค่าเพิ่ม 7%</span><span>{formatNumber(po.vat_amount)} บาท</span></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'stretch', pageBreakInside: 'avoid' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: 6, padding: '8px 12px', fontWeight: 700, textAlign: 'center' }}>
          ({thaiBahtText(po.net_amount)})
        </div>
        <div style={{ width: 330, background: DOC.navy, color: '#fff', borderRadius: 6, padding: '8px 12px' }}>
          <div style={{ fontSize: 12 }}>จำนวนเงินทั้งสิ้น</div>
          <div style={{ fontSize: 22, fontWeight: 800, textAlign: 'right' }}>{formatNumber(po.net_amount)} บาท</div>
        </div>
      </div>

      <div style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', minHeight: 44, pageBreakInside: 'avoid' }}>
        <b style={{ color: DOC.navy }}>หมายเหตุ:</b> {po.notes || ''}
      </div>

      <div style={{ display: 'flex', gap: 24, marginTop: 36, textAlign: 'center', pageBreakInside: 'avoid' }}>
        {[
          ['ผู้จัดทำ', `${po.user_first_name || ''} ${po.user_last_name || ''}`.trim()],
          ['ผู้อนุมัติ', approverName(po)],
          ['ผู้ขาย', po.supp_name || ''],
        ].map(([label, name]) => (
          <div key={label} style={{ flex: 1 }}>
            <div style={{ borderBottom: `1px solid ${DOC.line}`, height: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 2 }}>{name}</div>
            <div style={{ marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const APPROVED_STATUSES = ['อนุมัติ', 'รอรับสินค้า', 'เสร็จสิ้น'];
export const approverName = (po) => {
  if (!APPROVED_STATUSES.includes(po.purchase_status)) return '';
  const name = [po.approver_first_name, po.approver_last_name].filter(Boolean).join(' ');
  return name || 'อนุมัติแล้ว';
};

// ใช้ร่วมกับหน้าประวัติการสั่งซื้อ เพื่อให้ใบ PO พิมพ์ออกมาเหมือนกัน
export const printPoDocument = (p) => {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  const body = renderToStaticMarkup(<PoDocPaper po={p} />);
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ใบสั่งซื้อ ${p.purchase_number}</title>
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

const PurchaseOrdersPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.user_role === 'admin';
  const [pendingList, setPendingList] = useState([]);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [suppId, setSuppId] = useState('');
  const [paymentTerm, setPaymentTerm] = useState('เงินสด');
  const [shippingMethod, setShippingMethod] = useState('ร้านค้าจัดส่ง');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('');
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(null);
  const [previewPO, setPreviewPO] = useState(null);
  const [savingImage, setSavingImage] = useState(false);
  const [history, setHistory] = useState([]);
  const [details, setDetails] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [viewDoc, setViewDoc] = useState(null);
  const searchInputRef = useRef(null);
  const docRef = useRef(null);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await api.get('/products/all');
      setAllProducts(res.data.data || []);
      setProducts(res.data.data || []);
    } catch {
      setAllProducts([]);
    }
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await api.get('/suppliers/all');
      setSuppliers(res.data.data || []);
    } catch {
      setSuppliers([]);
    }
  }, []);

  const fetchPending = useCallback(async () => {
    try {
      const res = await api.get('/purchase-orders', { params: { status: 'รออนุมัติ', page: 1, limit: 100 } });
      setPendingList(res.data.data || []);
    } catch {
      setPendingList([]);
    }
  }, []);

  const fetchHistory = useCallback(async (page = 1) => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/purchase-orders', { params: { page, limit: 5 } });
      setHistory(res.data.data || []);
      if (res.data.pagination) setPagination(res.data.pagination);
      fetchPending();
      // รายการสินค้าของแต่ละใบสั่งซื้อมาจาก /purchase-orders/:id
      const fetched = await Promise.all((res.data.data || []).map(p => api.get(`/purchase-orders/${p.po_id}`).then(r => r.data.data).catch(() => null)));
      const map = {};
      fetched.forEach(d => { if (d) map[d.po_id] = d; });
      setDetails(map);
    } catch {
      setHistory([]);
      setDetails({});
    } finally {
      setHistoryLoading(false);
    }
  }, [fetchPending]);

  const brandMap = useMemo(() => {
    const map = {};
    allProducts.forEach(p => { map[p.product_id] = p.brand_name || ''; });
    return map;
  }, [allProducts]);

  // รายการรออนุมัติขึ้นก่อนเสมอ
  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => (b.purchase_status === 'รออนุมัติ') - (a.purchase_status === 'รออนุมัติ')),
    [history]
  );

  const rejectPO = async () => {
    if (!rejectTarget) return;
    try {
      await api.patch(`/purchase-orders/${rejectTarget.po_id}`, { purchase_status: 'ยกเลิก' });
      fetchHistory(pagination.page);
    } catch (err) {
      alert(err.response?.data?.message || 'ไม่สามารถอัปเดตสถานะได้');
    } finally {
      setRejectTarget(null);
    }
  };

  const approvePO = async () => {
    if (!approveTarget) return;
    try {
      await api.patch(`/purchase-orders/${approveTarget.po_id}`, { purchase_status: 'อนุมัติ' });
      fetchHistory(pagination.page);
    } catch (err) {
      alert(err.response?.data?.message || 'ไม่สามารถอัปเดตสถานะได้');
    } finally {
      setApproveTarget(null);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
    fetchHistory();
  }, [fetchProducts, fetchSuppliers, fetchHistory]);

  useEffect(() => {
    const base = suppId
      ? allProducts.filter(p => p.supp_id === suppId)
      : allProducts;
    if (!productSearch.trim()) { setProducts(base); return; }
    const s = productSearch.toLowerCase();
    setProducts(base.filter(p =>
      p.product_name?.toLowerCase().includes(s) ||
      p.barcode?.toLowerCase().includes(s) ||
      p.model?.toLowerCase().includes(s)
    ));
  }, [productSearch, allProducts, suppId]);

  const handleSupplierChange = (e) => {
    const val = e.target.value;
    if (val !== suppId && items.length > 0) {
      setConfirmSwitch({
        title: 'เปลี่ยนผู้จำหน่าย',
        message: `เปลี่ยนผู้จำหน่ายจะล้างรายการสินค้าทั้งหมด ${items.length} รายการที่เลือกไว้ ดำเนินการต่อ?`,
        action: () => {
          setItems([]);
          setSuppId(val);
        }
      });
      return;
    }
    setSuppId(val);
  };

  const pushItem = (product) => {
    setItems(prev => {
      const existing = prev.find(i => i.product_id === product.product_id);
      if (existing) {
        return prev.map(i =>
          i.product_id === product.product_id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, {
        product_id: product.product_id,
        product_name: product.product_name,
        model: product.model,
        barcode: product.barcode,
        quantity: 1,
        unit_price: parseFloat(product.purchase_price) || 0
      }];
    });
  };

  const addItem = (product) => {
    if (product.supp_id && product.supp_id !== suppId) {
      if (items.length > 0) {
        setConfirmSwitch({
          title: 'สลับผู้จำหน่าย',
          message: `สินค้า "${product.product_name}" เป็นของผู้จำหน่าย ${product.supp_name || 'อื่น'} ต่างจากที่เลือกอยู่ — เปลี่ยนผู้จำหน่ายและล้างรายการ ${items.length} รายการก่อน?`,
          action: () => {
            setItems([]);
            setSuppId(product.supp_id);
            pushItem(product);
          }
        });
        return;
      }
      setSuppId(product.supp_id);
    }
    pushItem(product);
  };

  const updateQty = (productId, delta) => {
    setItems(prev => prev.map(i => {
      if (i.product_id !== productId) return i;
      const newQty = i.quantity + delta;
      if (newQty < 1) return i;
      return { ...i, quantity: newQty };
    }));
  };

  const setQty = (productId, val) => {
    const n = parseInt(val) || 0;
    if (n < 1) return;
    setItems(prev => prev.map(i =>
      i.product_id === productId ? { ...i, quantity: Math.max(1, n) } : i
    ));
  };

  const setUnitPrice = (productId, val) => {
    const clean = val.replace(/[^0-9.]/g, '');
    setItems(prev => prev.map(i => {
      if (i.product_id !== productId) return i;
      const num = parseFloat(clean);
      return { ...i, unit_price: isNaN(num) ? 0 : num };
    }));
  };

  const removeItem = (productId) => {
    setItems(prev => prev.filter(i => i.product_id !== productId));
  };

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const discountNum = Math.min(Math.max(0, parseFloat(discount) || 0), subtotal);
  const afterDiscount = Math.max(0, subtotal - discountNum);
  const vatAmount = afterDiscount * 0.07;
  const netAmount = afterDiscount + vatAmount;
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const cartCounts = {};
  items.forEach(i => { cartCounts[i.product_id] = (cartCounts[i.product_id] || 0) + i.quantity; });
  const selectedSupplier = suppliers.find(s => s.supp_id === suppId) || null;

  const handleSubmit = async () => {
    if (items.length === 0 || !suppId) { setShowConfirm(false); return; }
    setSaving(true);
    try {
      const res = await api.post('/purchase-orders', {
        supp_id: suppId,
        items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price })),
        payment_term: paymentTerm,
        shipping_method: shippingMethod,
        discount_amount: discountNum,
        notes
      });
      const detailRes = await api.get(`/purchase-orders/${res.data.data.po_id}`);
      setPreviewPO({ ...detailRes.data.data });
      setItems([]);
      setSuppId('');
      setDiscount('');
      setNotes('');
      fetchProducts();
      fetchHistory();
    } catch (err) {
      alert(err.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  };

  const openDoc = async (poId) => {
    try {
      const res = await api.get(`/purchase-orders/${poId}`);
      setViewDoc(res.data.data);
    } catch {
      alert('ไม่สามารถโหลดข้อมูลได้');
    }
  };

  const updateStatus = async (status) => {
    if (!viewDoc) return;
    try {
      await api.patch(`/purchase-orders/${viewDoc.po_id}`, { purchase_status: status });
      openDoc(viewDoc.po_id);
      fetchHistory();
    } catch (err) {
      alert(err.response?.data?.message || 'ไม่สามารถอัปเดตสถานะได้');
    }
  };

  const handlePrint = (poArg) => {
    const p = poArg || previewPO;
    if (p) printPoDocument(p);
  };

  const handleSaveImage = async (poArg) => {
    const p = poArg || previewPO;
    if (!p || !docRef.current) return;
    setSavingImage(true);
    try {
      const canvas = await html2canvas(docRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const link = document.createElement('a');
      link.download = `${p.purchase_number}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      alert('เกิดข้อผิดพลาดในการบันทึกรูป');
    } finally {
      setSavingImage(false);
    }
  };

  const statusBadge = (status) => {
    const s = STATUS[status] || { color: '#475569', bg: '#f1f5f9' };
    return (
      <span className="po-status" style={{ color: s.color, background: s.bg }}>{status}</span>
    );
  };

  if (previewPO) {
    return (
      <Layout title="สั่งซื้อสินค้า" className="po-page">
        <div className="po-preview-overlay" onClick={() => setPreviewPO(null)}>
          <div className="po-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="po-preview-toolbar">
              <div className="po-preview-status">
                <span className="po-preview-ok"><FiCheck size={15} /> สั่งซื้อสำเร็จ</span>
                <div className="po-preview-id">{previewPO.purchase_number}</div>
              </div>
              <div className="po-preview-actions">
                <button className="pfm-btn pfm-btn-outline po-preview-btn" onClick={() => handleSaveImage(previewPO)} disabled={savingImage}>
                  <FiDownload size={16} /> {savingImage ? 'กำลังบันทึกรูป...' : 'บันทึกรูปภาพ'}
                </button>
                <button className="pfm-btn pfm-btn-primary po-preview-btn" onClick={() => handlePrint(previewPO)}>
                  <FiPrinter size={16} /> พิมพ์
                </button>
                <button className="pfm-btn pfm-btn-outline po-preview-btn" onClick={() => setPreviewPO(null)}>
                  <FiX size={16} /> ปิด
                </button>
              </div>
            </div>
            <div className="po-preview-scroll">
              <PoDocPaper po={previewPO} docRef={docRef} />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="สั่งซื้อสินค้า" className="po-page">
      {isAdmin && pendingList.length > 0 && (
        <div
          style={{
            border: '2px solid #f59e0b', background: 'linear-gradient(180deg,#fffbeb 0%,#fff7ed 100%)',
            borderRadius: 14, padding: 16, marginBottom: 18, boxShadow: '0 8px 24px -12px rgba(245,158,11,0.55)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: '#f59e0b', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <FiAlertCircle size={20} />
            </span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#92400e' }}>มีใบสั่งซื้อรออนุมัติ</div>
              <div style={{ fontSize: 12.5, color: '#b45309' }}>กรุณาตรวจสอบและอนุมัติรายการด้านล่าง</div>
            </div>
            <span style={{ background: '#dc2626', color: '#fff', fontWeight: 800, fontSize: 15, padding: '4px 14px', borderRadius: 999 }}>
              {pendingList.length} รายการ
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingList.map((p) => (
              <div
                key={p.po_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#fff',
                  border: '1px solid #fde68a', borderLeft: '5px solid #f59e0b', borderRadius: 10, padding: '10px 14px',
                }}
              >
                <div style={{ flex: 1, minWidth: 180, cursor: 'pointer' }} onClick={() => openDoc(p.po_id)}>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{p.purchase_number}</div>
                  <div style={{ fontSize: 12.5, color: '#64748b' }}>
                    {p.supp_name || '-'} • {Number(p.total_items || 0).toLocaleString()} ชิ้น • {formatDate(p.purchase_date)}
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 16 }}>{formatNumber(p.net_amount)} บาท</div>
                <button className="pfm-btn pfm-btn-outline" onClick={() => openDoc(p.po_id)} title="ดูใบ PO"><FiFileText size={15} /> ดูใบ PO</button>
                <button
                  className="pfm-btn pfm-btn-success"
                  onClick={() => setApproveTarget(p)}
                  style={{ fontWeight: 800, padding: '10px 22px', fontSize: 14.5, boxShadow: '0 6px 16px -6px rgba(5,150,105,0.7)' }}
                >
                  <FiCheck size={17} /> อนุมัติ
                </button>
                <button
                  className="tbl-action delete"
                  onClick={() => setRejectTarget(p)}
                  title="ไม่อนุมัติ (ยกเลิกใบสั่งซื้อ)"
                  style={{ width: 40, height: 40 }}
                >
                  <FiX size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="rcv-wrapper pos-wrapper-po">
        <div className="pos-left">
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, margin: '12px 14px 4px' }}>
            <div className="pos-search-bar" style={{ flex: 1, minWidth: 0, margin: 0 }}>
              <FiSearch className="pos-search-icon" />
              <input
                ref={searchInputRef}
                className="pos-search-input"
                placeholder="ค้นหาสินค้า (ชื่อ, บาร์โค้ด, รุ่น)..."
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
              />
              {productSearch && (
                <FiX className="pos-search-clear" onClick={() => { setProductSearch(''); searchInputRef.current?.focus(); }} />
              )}
            </div>
            <button
              type="button"
              title="สแกนบาร์โค้ด"
              aria-label="สแกนบาร์โค้ด"
              onClick={() => searchInputRef.current?.focus()}
              style={{ flexShrink: 0, width: 44, padding: 0, border: '1.5px solid transparent', borderRadius: 999, background: '#f1f5f9', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <FaBarcode size={18} />
            </button>
          </div>
          <div className="pos-product-scroll">
            <div className="pos-product-table">
              <div className="pos-product-thead">
                <span className="pos-th" style={{ width: 50 }}>#</span>
                <span className="pos-th" style={{ flex: 1 }}>ชื่อสินค้า</span>
                <span className="pos-th" style={{ width: 90 }}>รุ่น</span>
                <span className="pos-th" style={{ width: 110 }}>ผู้จำหน่าย</span>
                <span className="pos-th" style={{ width: 100 }}>ราคาต้นทุน</span>
                <span className="pos-th" style={{ width: 80 }}>สต๊อก</span>
                <span className="pos-th" style={{ width: 60 }}></span>
              </div>
              {products.filter(p => p.product_status === 'active').length === 0 ? (
                <div className="pos-empty">
                  <p>ไม่พบสินค้า</p>
                </div>
              ) : (
                products.filter(p => p.product_status === 'active').map((product, idx) => (
                  <div
                    key={product.product_id}
                    className="pos-product-tr rcv-product-tr"
                    onClick={() => addItem(product)}
                  >
                    <span className="pos-td" style={{ width: 50 }}>{idx + 1}</span>
                    <span className="pos-td" style={{ flex: 1 }}>{product.product_name}</span>
                    <span className="pos-td" style={{ width: 90 }}>{product.model}</span>
                    <span className="pos-td po-prod-supp" style={{ width: 110 }}>{product.supp_name}</span>
                    <span className="pos-td" style={{ width: 100, fontFamily: 'monospace', color: '#475569' }}>{formatNumber(product.purchase_price)}</span>
                    <span className="pos-td" style={{ width: 80 }}>{product.stock_quantity}</span>
                    <span className="pos-td" style={{ width: 60 }}>
                      <span className={`rcv-add-badge ${cartCounts[product.product_id] > 0 ? 'po-badge-active' : ''}`}>
                        {cartCounts[product.product_id] > 0 ? cartCounts[product.product_id] : <FiPlus size={13} />}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="pos-right rcv-right">
          <div className="pos-cart-header" style={{ padding: '10px 20px' }}>
            <FiPackage size={18} />
            <span>รายการที่สั่งซื้อ</span>
            {items.length > 0 && <span className="pos-cart-badge">{totalQty}</span>}
          </div>

          <div className="rcv-form-section" style={{ maxHeight: 290, padding: '8px 16px' }}>
            <div className="pos-section-label" style={{ marginBottom: 6 }}>ข้อมูลใบสั่งซื้อ</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px' }}>
              <div className="rcv-form-field" style={{ gridColumn: '1 / -1', gap: 2 }}>
                <label>ผู้จำหน่าย / ร้านค้า <span className="pfm-req" /></label>
                <select
                  className="rcv-input"
                  style={{ padding: '6px 10px', fontSize: 13 }}
                  value={suppId}
                  onChange={handleSupplierChange}
                >
                  <option value="">-- เลือกผู้จำหน่าย --</option>
                  {suppliers.map(s => (
                    <option key={s.supp_id} value={s.supp_id}>{s.supp_name}</option>
                  ))}
                </select>
              </div>
              {selectedSupplier && (
                <div
                  className="po-supplier-card"
                  style={{ gridColumn: '1 / -1', margin: 0, padding: '6px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px', fontSize: 12 }}
                >
                  <div className="po-supplier-row" style={{ minWidth: 0 }}><FiUser size={12} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedSupplier.first_name ? `${selectedSupplier.first_name} ${selectedSupplier.last_name}` : 'ผู้จำหน่าย'}</span></div>
                  {selectedSupplier.phone_number && <div className="po-supplier-row" style={{ minWidth: 0 }}><FiPhone size={12} /><span>{selectedSupplier.phone_number}</span></div>}
                  {selectedSupplier.email && <div className="po-supplier-row" style={{ minWidth: 0 }}><FiMapPin size={12} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedSupplier.email}>{selectedSupplier.email}</span></div>}
                  {selectedSupplier.house_no && <div className="po-supplier-row" style={{ minWidth: 0, gridColumn: '1 / -1' }}><FiMapPin size={12} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={supplierAddress(selectedSupplier)}>{supplierAddress(selectedSupplier)}</span></div>}
                </div>
              )}
              <div className="rcv-form-field" style={{ gap: 2 }}>
                <label>วันที่สั่งซื้อ</label>
                <div className="rcv-date-display" style={{ padding: '6px 10px', fontSize: 13 }}><FiClock size={13} /> {formatDate(new Date())}</div>
              </div>
              <div className="rcv-form-field" style={{ gap: 2 }}>
                <label>เงื่อนไขการชำระเงิน</label>
                <select className="rcv-input" style={{ padding: '6px 10px', fontSize: 13 }} value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)}>
                  <option value="เงินสด">เงินสด</option>
                  <option value="โอนเงินล่วงหน้า">โอนเงิน</option>
                  <option value="เครดิต 30 วัน">เครดิต 30 วัน</option>
                </select>
              </div>
              <div className="rcv-form-field" style={{ gap: 2 }}>
                <label>วิธีจัดส่ง</label>
                <select className="rcv-input" style={{ padding: '6px 10px', fontSize: 13 }} value={shippingMethod} onChange={e => setShippingMethod(e.target.value)}>
                  <option value="ร้านค้าจัดส่ง">ร้านค้าจัดส่ง</option>
                  <option value="ขนส่งเอกชน">ขนส่งเอกชน</option>
                  <option value="ไปรษณีย์ไทย">ไปรษณีย์ไทย</option>
                  <option value="รับเองที่ร้าน">รับเองที่ร้าน</option>
                  <option value="อื่นๆ">อื่นๆ</option>
                </select>
              </div>
              <div className="rcv-form-field" style={{ gap: 2 }}>
                <label>ส่วนลด (บาท)</label>
                <input
                  className="rcv-input"
                  style={{ padding: '6px 10px', fontSize: 13 }}
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={discount}
                  onChange={e => setDiscount(e.target.value.replace(/[^0-9.]/g, ''))}
                />
              </div>
              <div className="rcv-form-field" style={{ gap: 2 }}>
                <label>หมายเหตุ / เงื่อนไขอื่นๆ</label>
                <textarea
                  className="rcv-input po-notes-input"
                  style={{ padding: '6px 10px', fontSize: 13, minHeight: 0, height: 32, resize: 'none' }}
                  rows={1}
                  placeholder="เช่น การรับประกัน การคืนสินค้า..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {items.length > 0 && (
            <div className="po-cart-colhead" style={{ padding: '6px 20px 4px' }}>
              <span>ราคา/หน่วย (บาท)</span>
              <span></span>
              <span>จำนวน</span>
              <span className="po-col-total">รวม</span>
              <span></span>
            </div>
          )}

          <div className="pos-cart-items" style={{ padding: '6px 12px' }}>
            {items.length === 0 ? (
              <div className="pos-cart-empty">
                <FiPackage size={48} />
                <div>ยังไม่มีรายการสั่งซื้อ</div>
              </div>
            ) : (
              items.map(item => (
                <div key={item.product_id} className="pos-cart-item po-cart-item" style={{ padding: '6px 8px', marginBottom: 4, borderRadius: 8 }}>
                  <div className="po-cart-item-top">
                    <div className="po-cart-item-name" title={item.product_name}>{item.product_name}</div>
                    <span className="po-cart-item-barcode" style={{ maxWidth: '48%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.model ? `รุ่น ${item.model} · ` : ''}{item.barcode || 'ไม่มีบาร์โค้ด'}
                    </span>
                  </div>
                  <div className="po-cart-item-controls" style={{ marginTop: 4 }}>
                    <input className="po-price-input" type="text" inputMode="decimal" value={item.unit_price} onChange={e => setUnitPrice(item.product_id, e.target.value)} />
                    <span className="po-cart-mult">×</span>
                    <span className="po-qty-group">
                      <button className="pos-qty-btn" onClick={() => updateQty(item.product_id, -1)} disabled={item.quantity <= 1}><FiMinus size={14} /></button>
                      <input className="pos-qty-input" type="text" inputMode="numeric" value={item.quantity} onChange={e => setQty(item.product_id, e.target.value)} />
                      <button className="pos-qty-btn" onClick={() => updateQty(item.product_id, 1)}><FiPlus size={14} /></button>
                    </span>
                    <span className="po-cart-item-total" style={{ fontWeight: 700 }}>{formatNumber(item.quantity * item.unit_price)}</span>
                    <button className="pos-cart-remove" onClick={() => removeItem(item.product_id)}><FiTrash2 size={14} /></button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pos-summary" style={{ padding: '8px 20px' }}>
            <div className="pos-summary-row" style={{ marginBottom: 2, fontSize: 13 }}>
              <span>รวม</span>
              <span>{formatNumber(subtotal)}</span>
            </div>
            {discountNum > 0 && (
              <div className="pos-summary-row" style={{ marginBottom: 2, fontSize: 13 }}>
                <span>ส่วนลด</span>
                <span style={{ color: '#dc2626' }}>-{formatNumber(discountNum)}</span>
              </div>
            )}
            <div className="pos-summary-row" style={{ marginBottom: 2, fontSize: 13 }}>
              <span>ภาษีมูลค่าเพิ่ม 7%</span>
              <span>{formatNumber(vatAmount)}</span>
            </div>
            <div className="pos-summary-row pos-summary-total" style={{ fontSize: 16, paddingTop: 4, marginBottom: 0 }}>
              <span>ยอดสุทธิ</span>
              <span>{formatNumber(netAmount)}</span>
            </div>
          </div>

          <button
            className="pfm-btn pfm-btn-success pos-checkout-btn"
            disabled={items.length === 0 || !suppId || saving}
            onClick={() => setShowConfirm(true)}
          >
            {saving ? 'กำลังบันทึก...' : `สั่งซื้อสินค้า (${totalQty} ชิ้น)`}
          </button>
        </div>
      </div>

      <div className="rcv-history">
        <div className="rcv-history-header">
          <h3>ประวัติการสั่งซื้อ</h3>
          <div className="rcv-history-tools">
            <span>{pagination.total} รายการ</span>
            <button className="rcv-view-all-btn" onClick={() => navigate('/purchase-orders/history')}>
              ดูรายการทั้งหมด <FiArrowRight size={13} />
            </button>
          </div>
        </div>
        <div className="table-container">
          <div className="table-scroll">
            <table className="pro-table">
              <thead>
                <tr>
                  <th className="col-code">เลขที่ใบสั่งซื้อ</th>
                  <th className="col-name">ผู้จำหน่าย</th>
                  <th className="col-name">ชื่อสินค้า</th>
                  <th className="col-brand">แบรนด์</th>
                  <th className="col-stock">จำนวน</th>
                  <th className="col-price">ราคา/หน่วย</th>
                  <th className="col-brand">ผู้บันทึก</th>
                  <th className="col-price">ยอดสุทธิ</th>
                  <th className="col-status">สถานะ</th>
                  <th className="col-date">วันที่สั่งซื้อ</th>
                  <th className="col-actions">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr><td colSpan={11}><div className="table-empty"><div className="spinner" /><p>กำลังโหลดข้อมูล...</p></div></td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan={11}><div className="table-empty"><FiPackage size={40} /><p>ยังไม่มีประวัติการสั่งซื้อ</p></div></td></tr>
                ) : (
                  sortedHistory.map(p => {
                    const pItems = details[p.po_id]?.items || [];
                    const cellLines = (render) => (pItems.length === 0 ? '-' : pItems.map((it, i) => (
                      <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{render(it)}</div>
                    )));
                    return (
                    <tr
                      key={p.po_id}
                      style={{
                        cursor: 'pointer',
                        ...(p.purchase_status === 'รออนุมัติ' ? { background: '#fffbeb', boxShadow: 'inset 4px 0 0 #f59e0b' } : {}),
                      }}
                      onClick={() => openDoc(p.po_id)}
                    >
                      <td className="col-code">{p.purchase_number}</td>
                      <td className="col-name">{p.supp_name}</td>
                      <td className="col-name">{cellLines(it => it.product_name)}</td>
                      <td className="col-brand">{cellLines(it => brandMap[it.product_id] || '-')}</td>
                      <td className="col-stock">{cellLines(it => `${Number(it.quantity || 0).toLocaleString()} ชิ้น`)}</td>
                      <td className="col-price">{cellLines(it => formatNumber(it.unit_price))}</td>
                      <td className="col-brand">{p.user_first_name ? `${p.user_first_name} ${p.user_last_name}` : '-'}</td>
                      <td className="col-price">{formatNumber(p.net_amount)}</td>
                      <td className="col-status">{statusBadge(p.purchase_status)}</td>
                      <td className="col-date">{formatDate(p.purchase_date)}</td>
                      <td className="col-actions">
                        <button className="pfm-btn pfm-btn-outline" onClick={(e) => { e.stopPropagation(); openDoc(p.po_id); }} title="ดูใบ PO">
                          <FiFileText size={15} /> ดูใบ PO
                        </button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmModal
        show={showConfirm}
        title="ยืนยันการสั่งซื้อ"
        message={`ยืนยันการสั่งซื้อ ${items.length} รายการ รวม ${totalQty} ชิ้น กับผู้จำหน่าย ${selectedSupplier?.supp_name || '-'}${discountNum > 0 ? ` ส่วนลด ${formatNumber(discountNum)} บาท` : ''} ยอดสุทธิ ${formatNumber(netAmount)} บาท`}
        onConfirm={handleSubmit}
        onClose={() => setShowConfirm(false)}
        confirmText="บันทึก"
        cancelText="ยกเลิก"
        danger={false}
      />

      <ConfirmModal
        show={!!approveTarget}
        title="อนุมัติใบสั่งซื้อ"
        message={`อนุมัติใบสั่งซื้อ ${approveTarget?.purchase_number || ''} ยอดสุทธิ ${formatNumber(approveTarget?.net_amount)} บาท?`}
        onConfirm={approvePO}
        onClose={() => setApproveTarget(null)}
        confirmText="อนุมัติ"
        cancelText="ยกเลิก"
        danger={false}
      />

      <ConfirmModal
        show={!!rejectTarget}
        title="ไม่อนุมัติใบสั่งซื้อ"
        message={`ไม่อนุมัติและยกเลิกใบสั่งซื้อ ${rejectTarget?.purchase_number || ''}?`}
        onConfirm={rejectPO}
        onClose={() => setRejectTarget(null)}
        confirmText="ไม่อนุมัติ"
        cancelText="กลับ"
      />

      <ConfirmModal
        show={!!confirmSwitch}
        title={confirmSwitch?.title || 'เปลี่ยนผู้จำหน่าย'}
        message={confirmSwitch?.message}
        onConfirm={() => { confirmSwitch?.action(); setConfirmSwitch(null); }}
        onClose={() => setConfirmSwitch(null)}
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
        danger={false}
      />

      {viewDoc && (
        <div className="po-preview-overlay" onClick={() => setViewDoc(null)}>
          <div className="po-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="po-preview-toolbar">
              <div className="po-preview-status">
                <span className="po-preview-ok" style={{ background: '#eef2ff', color: '#4f46e5' }}>
                  <FiFileText size={15} /> ใบสั่งซื้อสินค้า
                </span>
                <div className="po-preview-id">{viewDoc.purchase_number}</div>
              </div>
              <div className="po-preview-actions">
                {isAdmin && viewDoc.purchase_status === 'รออนุมัติ' && (
                  <button className="pfm-btn pfm-btn-success po-preview-btn" onClick={() => updateStatus('อนุมัติ')}>
                    <FiCheck size={16} /> อนุมัติ
                  </button>
                )}
                {isAdmin && ['รออนุมัติ', 'อนุมัติ'].includes(viewDoc.purchase_status) && (
                  <button className="pfm-btn pfm-btn-danger po-preview-btn" onClick={() => updateStatus('ยกเลิก')}>
                    <FiXCircle size={16} /> ยกเลิกใบสั่งซื้อ
                  </button>
                )}
                <button className="pfm-btn pfm-btn-outline po-preview-btn" onClick={() => handleSaveImage(viewDoc)} disabled={savingImage}>
                  <FiDownload size={16} /> {savingImage ? 'กำลังบันทึกรูป...' : 'บันทึก'}
                </button>
                <button className="pfm-btn pfm-btn-primary po-preview-btn" onClick={() => handlePrint(viewDoc)}>
                  <FiPrinter size={16} /> พิมพ์
                </button>
                <button className="pfm-btn pfm-btn-outline po-preview-btn" onClick={() => setViewDoc(null)}>
                  <FiX size={16} /> ปิด
                </button>
              </div>
            </div>
            <div className="po-preview-scroll">
              <PoDocPaper po={viewDoc} docRef={docRef} />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default PurchaseOrdersPage;