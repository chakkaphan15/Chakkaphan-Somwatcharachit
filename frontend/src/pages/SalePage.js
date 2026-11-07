import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import api from '../services/api';
import Layout from '../components/layout/Layout';
import ConfirmModal from '../components/ConfirmModal';
import { thaiBahtText } from './PurchaseOrdersPage';
import html2canvas from 'html2canvas';
import { FiSearch, FiShoppingCart, FiPlus, FiMinus, FiTrash2, FiUser, FiX, FiPackage, FiPrinter, FiDownload, FiFileText, FiArrowRight } from 'react-icons/fi';
import { FaBarcode } from 'react-icons/fa';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'เงินสด' },
  { value: 'transfer', label: 'โอนเงิน' }
];

const METHOD_LABELS = { cash: 'เงินสด', transfer: 'โอนเงิน' };

const formatNumber = (num) => Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getDate()} ${TH_MONTHS[dt.getMonth()]} ${dt.getFullYear() + 543} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} น.`;
};

const formatLotDate = (d) => {
  if (!d) return '-';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear() + 543}`;
};

const SALE_LOGO_URL = `${window.location.origin}${process.env.PUBLIC_URL || ''}/images/logo2.png`;
const SALE_VAT_RATE = 0.07;

// ยอดหลังหักส่วนลด = รวม - ส่วนลด, VAT 7% คิดจากยอดหลังหักส่วนลด, ยอดสุทธิ = ยอดหลังหักส่วนลด + VAT
export const calcSaleTotals = (subtotal, discount) => {
  const sub = Number(subtotal) || 0;
  const disc = Math.min(Math.max(0, Number(discount) || 0), sub);
  const afterDiscount = sub - disc;
  const vat = Math.round(afterDiscount * SALE_VAT_RATE * 100) / 100;
  return { subtotal: sub, discount: disc, afterDiscount, vat, net: afterDiscount + vat };
};

// ใช้ราคา/หน่วยที่บันทึกไว้ใน sale_details ไม่ใช้ราคาสินค้าปัจจุบัน
export const saleSubtotal = (items) =>
  (items || []).reduce((s, i) => s + (Number(i.unit_price) || 0) * (Number(i.quantity) || 0), 0);

const saleLines = (sale) => {
  const list = sale.items || [];
  const gross = saleSubtotal(list);
  const discount = calcSaleTotals(gross, sale.discount_amount).discount;
  let used = 0;
  return list.map((item, idx) => {
    const lineGross = (Number(item.unit_price) || 0) * (Number(item.quantity) || 0);
    let lineDiscount = 0;
    if (gross > 0) {
      lineDiscount = idx === list.length - 1 ? discount - used : Math.round((discount * lineGross / gross) * 100) / 100;
    }
    used += lineDiscount;
    return { ...item, lineGross, lineDiscount, lineNet: lineGross - lineDiscount };
  });
};

const customerAddress = (c) => {
  if (!c) return '';
  return [c.house_no, c.village_no ? `หมู่ ${c.village_no}` : '', c.alley, c.road, c.sub_district, c.district, c.province, c.post_code]
    .filter(Boolean).join(' ');
};

// รวมข้อมูลการขายจริง + ข้อมูลลูกค้า (เบอร์โทร/ที่อยู่) จาก API เดิม
export const loadSaleReceipt = async (saleId) => {
  const res = await api.get(`/sales/${saleId}`);
  const sale = res.data.data;
  const customer = sale.customer_id
    ? await api.get(`/customers/${sale.customer_id}`).then(r => r.data.data).catch(() => null)
    : null;
  const company = await api.get('/company').then(r => r.data.data).catch(() => null);
  return { ...sale, customer, company, payment_label: METHOD_LABELS[sale.payment_method] || sale.payment_method };
};

const DOC = {
  navy: '#135dd1',
  line: '#94a3b8',
  th: { border: '1px solid #135dd1', background: '#135dd1', color: '#fff', padding: '6px 6px', fontSize: 12, fontWeight: 700 },
  td: { border: '1px solid #cbd5e1', padding: '6px 6px', fontSize: 12.5, verticalAlign: 'top' },
};

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

export const SaleReceiptPaper = ({ sale, docRef }) => {
  const lines = saleLines(sale);
  // รายการขายที่มาจากการชำระใบเบิก ยอดรวมที่บันทึกมีค่าแรง/ค่าบริการรวมอยู่ด้วย (ไม่อยู่ใน sale_details)
  const itemsSubtotal = saleSubtotal(sale.items);
  const recordedSubtotal = parseFloat(sale.total_amount);
  const labor = Number.isFinite(recordedSubtotal) && recordedSubtotal - itemsSubtotal > 0.005 ? recordedSubtotal - itemsSubtotal : 0;
  const totals = calcSaleTotals(itemsSubtotal + labor, sale.discount_amount);
  const customer = sale.customer || {};
  const customerName = sale.customer_first_name ? `${sale.customer_first_name} ${sale.customer_last_name || ''}`.trim() : 'ลูกค้าทั่วไป';
  const customerAddr = customerAddress(customer);
  const sellerName = `${sale.user_first_name || ''} ${sale.user_last_name || ''}`.trim();
  const knownMethod = PAYMENT_METHODS.some(m => m.value === sale.payment_method);
  return (
    <div
      className="po-doc-sheet"
      ref={docRef}
      style={{ width: 794, margin: '0 auto', background: '#fff', padding: '36px 40px', boxSizing: 'border-box', fontFamily: "'Sarabun', Tahoma, sans-serif", fontSize: 13, color: '#1e293b', boxShadow: '0 8px 24px rgba(2, 8, 23, 0.12)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, borderBottom: `2px solid ${DOC.navy}`, paddingBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1, minWidth: 0 }}>
          <img src={SALE_LOGO_URL} alt="logo" style={{ height: 64, width: 'auto', objectFit: 'contain', display: 'block', flexShrink: 0 }} />
          <CompanyHeaderInfo company={sale.company} />
        </div>
        <div style={{ textAlign: 'right', lineHeight: 1.6, flexShrink: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: DOC.navy }}>ใบเสร็จรับเงิน</div>
          <div>เลขที่ใบเสร็จ: <b>{sale.receipt_number}</b></div>
          <div>วันที่ขาย: {formatDate(sale.sale_date)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
        <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 12px', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: DOC.navy, marginBottom: 2 }}>ลูกค้า</div>
          <div style={{ fontWeight: 600 }}>{customerName}</div>
          {customer.phone_number && <div>โทร: {customer.phone_number}</div>}
          {customerAddr && <div>ที่อยู่: {customerAddr}</div>}
        </div>
        <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 12px', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: DOC.navy, marginBottom: 2 }}>ผู้ขาย / ผู้ทำรายการ</div>
          <div style={{ fontWeight: 600 }}>{sellerName || '-'}</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14 }}>
        <thead>
          <tr>
            <th style={{ ...DOC.th, width: 40, textAlign: 'center' }}>ลำดับ</th>
            <th style={{ ...DOC.th, textAlign: 'left' }}>รายการสินค้า</th>
            <th style={{ ...DOC.th, width: 55, textAlign: 'center' }}>จำนวน</th>
            <th style={{ ...DOC.th, width: 95, textAlign: 'right' }}>ราคา/หน่วย</th>
            <th style={{ ...DOC.th, width: 85, textAlign: 'right' }}>ส่วนลด</th>
            <th style={{ ...DOC.th, width: 105, textAlign: 'right' }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((item, idx) => (
            <tr key={idx} style={{ pageBreakInside: 'avoid' }}>
              <td style={{ ...DOC.td, textAlign: 'center' }}>{idx + 1}</td>
              <td style={DOC.td}>
                {item.product_name}
                {item.model ? <><br /><small style={{ color: '#64748b' }}>รุ่น: {item.model}</small></> : null}
                {item.lot_received_at ? <><br /><small style={{ color: '#64748b' }}>ล็อต: {formatLotDate(item.lot_received_at)}</small></> : null}
              </td>
              <td style={{ ...DOC.td, textAlign: 'center' }}>{item.quantity}</td>
              <td style={{ ...DOC.td, textAlign: 'right' }}>{formatNumber(item.unit_price)}</td>
              <td style={{ ...DOC.td, textAlign: 'right' }}>{formatNumber(item.lineDiscount)}</td>
              <td style={{ ...DOC.td, textAlign: 'right' }}>{formatNumber(item.lineNet)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, alignItems: 'flex-start', pageBreakInside: 'avoid' }}>
        <div style={{ flex: 1, lineHeight: 1.9 }}>
          <div style={{ fontWeight: 700, color: DOC.navy }}>วิธีการชำระเงิน</div>
          {knownMethod ? (
            <div>
              {PAYMENT_METHODS.map(m => (
                <span key={m.value} style={{ marginRight: 18 }}>{sale.payment_method === m.value ? '☑' : '☐'} {m.label}</span>
              ))}
            </div>
          ) : (
            <div>{sale.payment_label || sale.payment_method || '-'}</div>
          )}
        </div>
        <div style={{ width: 330, lineHeight: 1.9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>รวมเป็นเงิน</span><span>{formatNumber(itemsSubtotal)} บาท</span></div>
          {labor > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ค่าแรง/ค่าบริการ</span><span>{formatNumber(labor)} บาท</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ส่วนลด</span><span>{formatNumber(totals.discount)} บาท</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ยอดหลังหักส่วนลด</span><span>{formatNumber(totals.afterDiscount)} บาท</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ภาษีมูลค่าเพิ่ม 7%</span><span>{formatNumber(totals.vat)} บาท</span></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'stretch', pageBreakInside: 'avoid' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: 6, padding: '8px 12px', fontWeight: 700, textAlign: 'center' }}>
          ({thaiBahtText(totals.net)})
        </div>
        <div style={{ width: 330, background: DOC.navy, color: '#fff', borderRadius: 6, padding: '8px 12px' }}>
          <div style={{ fontSize: 12 }}>ยอดสุทธิ</div>
          <div style={{ fontSize: 22, fontWeight: 800, textAlign: 'right' }}>{formatNumber(totals.net)} บาท</div>
        </div>
      </div>

      {sale.notes && (
        <div style={{ marginTop: 14, border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', pageBreakInside: 'avoid' }}>
          <b style={{ color: DOC.navy }}>หมายเหตุ:</b> {sale.notes}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 28, pageBreakInside: 'avoid' }}>
        <div style={{ width: 300, textAlign: 'center', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, color: DOC.navy }}>ผู้รับเงิน / พนักงานขาย</div>
          <div style={{ borderBottom: `1px solid ${DOC.line}`, height: 44 }} />
          <div style={{ marginTop: 4 }}>ลายเซ็นพนักงานขาย</div>
          <div style={{ textAlign: 'left', marginTop: 4 }}>ชื่อ: {sellerName || '-'}</div>
          <div style={{ textAlign: 'left' }}>วันที่: {formatDate(sale.sale_date)}</div>
        </div>
      </div>
    </div>
  );
};

export const printSaleReceipt = (sale) => {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  const body = renderToStaticMarkup(<SaleReceiptPaper sale={sale} />);
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ใบเสร็จ ${sale.receipt_number}</title>
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

const SalePage = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [useDiscount, setUseDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [viewDoc, setViewDoc] = useState(null);
  const [savingImage, setSavingImage] = useState(false);

  const customerRef = useRef(null);
  const searchInputRef = useRef(null);
  const saleDocRef = useRef(null);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await api.get('/products/all');
      const loadedProducts = res.data.data || [];
      const productsWithLots = await Promise.all(loadedProducts.map(async (product) => {
        try {
          const lotRes = await api.get(`/products/${product.product_id}/lots`);
          return { ...product, lots: (lotRes.data.data || []) };
        } catch {
          return { ...product, lots: [] };
        }
      }));
      setAllProducts(productsWithLots);
      setProducts(productsWithLots);
    } catch {
      setAllProducts([]);
      setProducts([]);
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await api.get('/customers/all');
      setCustomers(res.data.data || []);
    } catch {
      setCustomers([]);
    }
  }, []);

  const fetchHistory = useCallback(async (page = 1) => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/sales', { params: { page, limit: 5 } });
      setHistory(res.data.data || []);
      if (res.data.pagination) setPagination(res.data.pagination);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchCustomers();
    fetchHistory();
  }, [fetchProducts, fetchCustomers, fetchHistory]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (customerRef.current && !customerRef.current.contains(e.target)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!productSearch.trim()) { setProducts(allProducts); return; }
    const s = productSearch.toLowerCase();
    setProducts(allProducts.filter(p =>
      p.product_name?.toLowerCase().includes(s) ||
      p.barcode?.toLowerCase().includes(s) ||
      p.model?.toLowerCase().includes(s)
    ));
  }, [productSearch, allProducts]);

  const filteredCustomers = customers.filter(c =>
    `${c.first_name} ${c.last_name}`.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone_number?.includes(customerSearch)
  );

  const getAvailableLots = (product) =>
    (product.lots || []).filter(lot => Number(lot.quantity_remaining) > 0);

  const addToCart = (product, preferredLot) => {
    const lots = getAvailableLots(product).sort((a, b) =>
      new Date(a.received_at) - new Date(b.received_at) || String(a.lot_number).localeCompare(String(b.lot_number))
    );
    if (lots.length === 0) {
      alert('สินค้านี้ไม่มีล็อตที่พร้อมขาย');
      return;
    }

    setCart(prev => {
      const cartLotNumbers = new Set(prev.filter(item => item.product_id === product.product_id).map(item => item.lot_number));
      const lot = (preferredLot && lots.some(item => item.lot_number === preferredLot.lot_number))
        ? preferredLot
        : (lots.find(item => !cartLotNumbers.has(item.lot_number)) || lots[0]);
      const key = `${product.product_id}:${lot.lot_number}`;
      const existing = prev.find(item => item.key === key);
      if (existing) {
        return prev.map(item =>
          item.key === key ? { ...item, quantity: Math.min(item.quantity + 1, item.lot_quantity) } : item
        );
      }
      return [...prev, {
        key,
        product_id: product.product_id,
        product_name: product.product_name,
        model: product.model,
        selling_price: parseFloat(lot.selling_price || product.selling_price || 0),
        lot_id: lot.lot_id,
        lot_number: lot.lot_number,
        lot_cost: parseFloat(lot.unit_cost || 0),
        lot_quantity: Number(lot.quantity_remaining),
        lots,
        quantity: 1,
        max_qty: Number(lot.quantity_remaining)
      }];
    });
  };

  const updateQty = (key, delta) => {
    setCart(prev => prev.map(item => {
      if (item.key !== key) return item;
      const newQty = item.quantity + delta;
      if (newQty < 1 || newQty > item.max_qty) return item;
      return { ...item, quantity: newQty };
    }));
  };

  const setQty = (key, val) => {
    const n = parseInt(val) || 0;
    if (n < 1) return;
    setCart(prev => prev.map(item =>
      item.key === key ? { ...item, quantity: Math.min(n, item.max_qty) } : item
    ));
  };

  const removeFromCart = (key) => {
    setCart(prev => prev.filter(item => item.key !== key));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.selling_price * item.quantity, 0);
  const totals = calcSaleTotals(subtotal, useDiscount ? parseFloat(discountInput) || 0 : 0);
  const { vat: vatAmount, afterDiscount, net: netAmount, discount: discountAmount } = totals;

  const handleSubmit = async () => {
    if (cart.length === 0) { setShowConfirm(false); return; }
    setSaving(true);
    try {
      const res = await api.post('/sales', {
        customer_id: selectedCustomer?.customer_id || '',
        items: cart.map(item => ({ product_id: item.product_id, lot_id: item.lot_id, quantity: item.quantity })),
        payment_method: paymentMethod,
        discount_amount: discountAmount
      });
      setReceipt(await loadSaleReceipt(res.data.data.sale_id));
      setCart([]);
      setSelectedCustomer(null);
      setCustomerSearch('');
      fetchProducts();
      fetchHistory();
    } catch (err) {
      alert(err.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  };

  const selectCustomer = (c) => {
    setSelectedCustomer(c);
    setCustomerSearch(`${c.first_name} ${c.last_name}`);
    setShowCustomerDropdown(false);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerSearch('');
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const productRows = products
    .filter(product => product.product_status === 'active')
    .flatMap(product => {
      const lots = product.lots || [];
      if (lots.length === 0) return [{ product, lot: null, available: 0 }];
      return lots.map(lot => ({ product, lot, available: Number(lot.quantity_remaining) }));
    })
     .filter(row => row.available > 0)
     .sort((a, b) => {
       const aProduct = a.product.product_name || '';
       const bProduct = b.product.product_name || '';
       if (aProduct !== bProduct) return aProduct.localeCompare(bProduct);
       if (a.lot && b.lot) {
         return new Date(a.lot.received_at) - new Date(b.lot.received_at)
           || String(a.lot.lot_number).localeCompare(String(b.lot.lot_number));
       }
       if (a.lot) return -1;
       if (b.lot) return 1;
       return 0;
     });

  const openDoc = async (saleId) => {
    try {
      setViewDoc(await loadSaleReceipt(saleId));
    } catch {
      alert('ไม่สามารถโหลดข้อมูลได้');
    }
  };

  const handleSaveImage = async (saleArg) => {
    const s = saleArg || receipt;
    if (!s || !saleDocRef.current) return;
    setSavingImage(true);
    try {
      const canvas = await html2canvas(saleDocRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const link = document.createElement('a');
      link.download = `${s.receipt_number}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      alert('เกิดข้อผิดพลาดในการบันทึกรูป');
    } finally {
      setSavingImage(false);
    }
  };

  const handlePrint = (saleArg) => {
    const r = saleArg || receipt;
    if (r) printSaleReceipt(r);
  };

  if (receipt) {
    const r = receipt;
    return (
      <Layout title="ใบเสร็จรับเงิน" className="po-page">
        <div className="po-preview-overlay" onClick={() => setReceipt(null)}>
          <div className="po-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="po-preview-toolbar">
              <div className="po-preview-status">
                <span className="po-preview-ok" style={{ background: '#dcfce7', color: '#15803d' }}>
                  <FiFileText size={15} /> บันทึกการขายสำเร็จ
                </span>
                <div className="po-preview-id">{r.receipt_number}</div>
              </div>
              <div className="po-preview-actions">
                <button className="pfm-btn pfm-btn-outline po-preview-btn" onClick={() => handleSaveImage(r)} disabled={savingImage}>
                  <FiDownload size={16} /> {savingImage ? 'กำลังบันทึกรูป...' : 'บันทึกรูปภาพ'}
                </button>
                <button className="pfm-btn pfm-btn-primary po-preview-btn" onClick={() => handlePrint(r)}>
                  <FiPrinter size={16} /> พิมพ์
                </button>
                <button className="pfm-btn pfm-btn-outline po-preview-btn" onClick={() => setReceipt(null)}>
                  <FiX size={16} /> ปิด
                </button>
              </div>
            </div>
            <div className="po-preview-scroll">
              <SaleReceiptPaper sale={r} docRef={saleDocRef} />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="ขายสินค้า">
      <div className="pos-wrapper">
        <div className="pos-left">
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginBottom: 16 }}>
            <div className="pos-search-bar" style={{ flex: 1, minWidth: 0, marginBottom: 0 }}>
              <FiSearch className="pos-search-icon" />
              <input
                ref={searchInputRef}
                className="pos-search-input"
                placeholder="ค้นหาสินค้า (ชื่อ, บาร์โค้ด, รุ่น)..."
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                autoFocus
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
              style={{ flexShrink: 0, width: 46, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}
            >
              <FaBarcode size={20} />
            </button>
          </div>
          <div className="pos-product-scroll">
            <div className="pos-product-table">
               <div className="pos-product-thead">
                 <span className="pos-th" style={{ width: 50 }}>#</span>
                 <span className="pos-th" style={{ width: 50 }}></span>
                 <span className="pos-th" style={{ flex: 1 }}>ชื่อสินค้า</span>
                 <span className="pos-th" style={{ width: 90 }}>รุ่น</span>
                 <span className="pos-th" style={{ width: 110 }}>บาร์โค้ด</span>
                 <span className="pos-th" style={{ width: 100 }}>วันที่รับเข้า</span>
                 <span className="pos-th" style={{ width: 90 }}>ราคาขาย</span>
                 <span className="pos-th" style={{ width: 90 }}>ราคาต้นทุน</span>
                 <span className="pos-th" style={{ width: 70 }}>คงเหลือ</span>
               </div>
              {productRows.map(({ product, lot, available }, idx) => {
                const inLotQty = lot ? cart.filter(c => c.product_id === product.product_id && c.lot_number === lot.lot_number).reduce((s, c) => s + c.quantity, 0) : 0;
                const availableForLot = Math.max(0, available - inLotQty);
                return (
                  <div
                    key={`${product.product_id}:${lot?.lot_number || 'none'}`}
                    className={`pos-product-tr ${inLotQty > 0 ? 'in-cart' : ''} ${availableForLot <= 0 ? 'out-of-stock' : ''}`}
                    onClick={() => lot && availableForLot > 0 && addToCart(product, lot)}
                  >
                    <span className="pos-td" style={{ width: 50 }}>{idx + 1}</span>
                    <span className="pos-td" style={{ width: 50 }}>
                      {product.product_image ? (
                        <img className="pos-td-img" src={`http://localhost:5000${product.product_image}`} alt="" />
                      ) : (
                        <FiPackage size={18} />
                      )}
                    </span>
                    <span className="pos-td" style={{ flex: 1 }}>{product.product_name}</span>
                    <span className="pos-td" style={{ width: 90 }}>{product.model}</span>
                     <span className="pos-td" style={{ width: 110, fontFamily: 'monospace' }}>{product.barcode}</span>
                     <span className="pos-td" style={{ width: 100 }}>
                       {lot?.received_at ? new Date(lot.received_at).toLocaleDateString('th-TH') : '-'}
                     </span>
                     <span className="pos-td" style={{ width: 90, fontWeight: 700, color: '#1d6fd6' }}>{formatNumber(lot ? (lot.selling_price || product.selling_price) : product.selling_price)}</span>
                     <span className="pos-td" style={{ width: 90, fontFamily: 'monospace', color: '#475569' }}>{formatNumber(lot ? lot.unit_cost : product.purchase_price)}</span>
                    <span className="pos-td" style={{ width: 70 }}>
                      <span className={`pos-stock-chip ${availableForLot <= 0 ? 'empty' : availableForLot <= (product.reorder_level || 0) ? 'low' : ''}`}>{availableForLot}</span>
                      <small style={{ display: 'block', color: '#64748b', fontSize: 10, marginTop: 2 }}>
                         {lot ? `${lot.lot_number} • ราคาขาย ${formatNumber(lot.selling_price || product.selling_price)} บาท` : 'ไม่มีรหัส'}
                      </small>
                    </span>
                    {inLotQty > 0 && <span className="pos-td-cart-badge">{inLotQty}</span>}
                  </div>
                );
              })}
              {productRows.length === 0 && (
                <div className="pos-empty">ไม่พบสินค้า</div>
              )}
            </div>
          </div>
        </div>
        <div className="pos-right">
          <div className="pos-cart-header">
            <FiShoppingCart size={18} />
            <span>ตะกร้าสินค้า</span>
            {totalItems > 0 && <span className="pos-cart-badge">{totalItems}</span>}
          </div>
          <div className="pos-customer-section" ref={customerRef}>
            <div className="pos-section-label">ลูกค้า</div>
            {!selectedCustomer ? (
              <div className="pos-customer-row">
                <div className="pos-customer-input-wrap">
                  <FiUser size={16} />
                  <input
                    className="pos-customer-input"
                    placeholder="ค้นหาลูกค้าประจำ (เว้นว่างไว้สำหรับลูกค้าทั่วไป)"
                    value={customerSearch}
                    onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                    onFocus={() => setShowCustomerDropdown(true)}
                  />
                </div>
                {showCustomerDropdown && (
                  <div className="pos-customer-dropdown">
                    {filteredCustomers.length === 0 ? (
                      <div className="pos-dropdown-empty">ไม่พบลูกค้า</div>
                    ) : (
                      filteredCustomers.slice(0, 8).map(c => (
                        <div key={c.customer_id} className="pos-customer-option" onClick={() => selectCustomer(c)}>
                          <span>{c.prefix}{c.first_name} {c.last_name}</span>
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>{c.phone_number}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="pos-selected-customer">
                <FiUser size={16} />
                <span style={{ fontWeight: 500 }}>{selectedCustomer.prefix}{selectedCustomer.first_name} {selectedCustomer.last_name}</span>
                <span className="pos-selected-phone">{selectedCustomer.phone_number}</span>
                <FiX className="pos-selected-clear" onClick={clearCustomer} />
              </div>
            )}
            {selectedCustomer && <div className="pos-walkin-hint">กด ✕ เพื่อเปลี่ยนเป็นลูกค้าทั่วไป</div>}
          </div>
          <div className="pos-cart-items">
            {cart.length === 0 ? (
              <div className="pos-cart-empty">
                <FiShoppingCart size={48} />
                <div>ยังไม่มีสินค้าในตะกร้า</div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>คลิกสินค้าด้านซ้ายเพื่อเพิ่ม</div>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.key} className="pos-cart-item">
                  <div className="pos-cart-item-info">
                    <div className="pos-cart-item-name">{item.product_name}</div>
                    <div className="pos-cart-item-model">{item.model}</div>
                    <div className="pos-cart-item-price">{formatNumber(item.selling_price)}</div>
                  </div>
                  <div className="pos-cart-item-controls">
                    <button className="pos-qty-btn" onClick={() => updateQty(item.key, -1)} disabled={item.quantity <= 1}><FiMinus size={14} /></button>
                    <input className="pos-qty-input" type="text" inputMode="numeric" value={item.quantity} onChange={e => setQty(item.key, e.target.value)} />
                    <button className="pos-qty-btn" onClick={() => updateQty(item.key, 1)} disabled={item.quantity >= item.max_qty}><FiPlus size={14} /></button>
                    <div className="pos-cart-item-total">{formatNumber(item.selling_price * item.quantity)}</div>
                    <button className="pos-cart-remove" onClick={() => removeFromCart(item.key)}><FiTrash2 size={14} /></button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="pos-summary">
            <div className="pos-summary-row">
              <span>รวมเป็นเงิน</span>
              <span>{formatNumber(subtotal)}</span>
            </div>
            <div className="pos-discount-row">
              <label className="pos-discount-toggle">
                <input
                  type="checkbox"
                  checked={useDiscount}
                  onChange={e => { setUseDiscount(e.target.checked); if (!e.target.checked) setDiscountInput(''); }}
                />
                <span>ส่วนลด</span>
              </label>
              {useDiscount && (
                <div className="pos-discount-input-wrap">
                  <input
                    className="pos-discount-input"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={discountInput}
                    onChange={e => setDiscountInput(e.target.value.replace(/[^0-9.]/g, ''))}
                  />
                  <span className="pos-discount-unit">บาท</span>
                </div>
              )}
            </div>
            {useDiscount && discountAmount > 0 && (
              <div className="pos-summary-row pos-summary-discount">
                <span>ส่วนลด</span>
                <span>-{formatNumber(discountAmount)}</span>
              </div>
            )}
            <div className="pos-summary-row pos-summary-subtotal">
              <span>ยอดหลังหักส่วนลด</span>
              <span>{formatNumber(afterDiscount)}</span>
            </div>
            <div className="pos-summary-row">
              <span>ภาษีมูลค่าเพิ่ม 7%</span>
              <span>{formatNumber(vatAmount)}</span>
            </div>
            <div className="pos-summary-row pos-summary-total">
              <span>ราคาสุทธิ</span>
              <span>{formatNumber(netAmount)}</span>
            </div>
          </div>
          <div className="pos-payment-section">
            <div className="pos-section-label">วิธีการชำระเงิน</div>
            <div className="pos-payment-options">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m.value}
                  className={`pos-payment-btn ${paymentMethod === m.value ? 'active' : ''}`}
                  onClick={() => setPaymentMethod(m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <button
            className="pfm-btn pfm-btn-success pos-checkout-btn"
            disabled={cart.length === 0 || saving}
            onClick={() => setShowConfirm(true)}
          >
            {saving ? 'กำลังบันทึก...' : `ชำระเงิน  ${formatNumber(netAmount)} บาท`}
          </button>
        </div>
      </div>

      <div className="rcv-history">
        <div className="rcv-history-header">
          <h3>ประวัติการขาย</h3>
          <div className="rcv-history-tools">
            <span>{pagination.total} รายการ</span>
            <button className="rcv-view-all-btn" onClick={() => navigate('/sale/history')}>
              ดูรายการทั้งหมด <FiArrowRight size={13} />
            </button>
          </div>
        </div>
        <div className="table-container">
          <div className="table-scroll">
            <table className="pro-table">
              <thead>
                <tr>
                  <th className="col-code">เลขที่ใบเสร็จ</th>
                  <th className="col-name">ลูกค้า</th>
                  <th className="col-brand">ผู้บันทึก</th>
                  <th className="col-stock">จำนวนชิ้น</th>
                  <th className="col-price">ยอดสุทธิ</th>
                  <th className="col-date">วันที่</th>
                  <th className="col-actions">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr><td colSpan={7}><div className="table-empty"><div className="spinner" /><p>กำลังโหลดข้อมูล...</p></div></td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan={7}><div className="table-empty"><FiShoppingCart size={40} /><p>ยังไม่มีประวัติการขาย</p></div></td></tr>
                ) : (
                  history.map(s => (
                    <tr key={s.sale_id} style={{ cursor: 'pointer' }} onClick={() => openDoc(s.sale_id)}>
                      <td className="col-code">{s.receipt_number}</td>
                      <td className="col-name">{s.customer_first_name ? `${s.customer_first_name} ${s.customer_last_name}` : 'ลูกค้าทั่วไป'}</td>
                      <td className="col-brand">{s.user_first_name ? `${s.user_first_name} ${s.user_last_name}` : '-'}</td>
                      <td className="col-stock">{Number(s.total_items || 0).toLocaleString()} ชิ้น</td>
                      <td className="col-price">{formatNumber(calcSaleTotals(s.total_amount, s.discount_amount).net)}</td>
                      <td className="col-date">{formatDate(s.sale_date)}</td>
                      <td className="col-actions">
                        <button className="pfm-btn pfm-btn-outline" onClick={(e) => { e.stopPropagation(); openDoc(s.sale_id); }} title="ดูใบเสร็จ">
                          <FiFileText size={15} /> ดูใบเสร็จ
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmModal
        show={showConfirm}
        title="ยืนยันการขาย"
        message={`ยืนยันการขาย ${totalItems} รายการ รวมเป็นเงิน ${formatNumber(netAmount)} บาท${discountAmount > 0 ? ` (ส่วนลด ${formatNumber(discountAmount)} บาท)` : ''}`}
        onConfirm={handleSubmit}
        onClose={() => setShowConfirm(false)}
        confirmText="ชำระเงิน"
        cancelText="ยกเลิก"
        danger={false}
      />

      {viewDoc && (
        <div className="po-preview-overlay" onClick={() => setViewDoc(null)}>
          <div className="po-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="po-preview-toolbar">
              <div className="po-preview-status">
                <span className="po-preview-ok" style={{ background: '#eef2ff', color: '#4f46e5' }}>
                  <FiFileText size={15} /> ใบเสร็จรับเงิน
                </span>
                <div className="po-preview-id">{viewDoc.receipt_number}</div>
              </div>
              <div className="po-preview-actions">
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
              <SaleReceiptPaper sale={viewDoc} docRef={saleDocRef} />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default SalePage;
