import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { renderToStaticMarkup } from 'react-dom/server';
import api from '../services/api';
import Layout from '../components/layout/Layout';
import ConfirmModal from '../components/ConfirmModal';
import { thaiBahtText } from './PurchaseOrdersPage';
import { FiSearch, FiPlus, FiMinus, FiTrash2, FiX, FiPackage, FiDownload, FiClock, FiFileText, FiPrinter, FiTruck, FiArrowRight } from 'react-icons/fi';
import { FaBarcode } from 'react-icons/fa';

const RECEIPT_LOGO_URL = `${window.location.origin}${process.env.PUBLIC_URL || ''}/images/logo2.png`;
const DOC_TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const VAT_RATE = 0.07;

const docMoney = (v) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const docDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getDate()} ${DOC_TH_MONTHS[dt.getMonth()]} ${dt.getFullYear() + 543} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} น.`;
};

const docAddress = (s) => (s ? [s.house_no, s.sub_district, s.district, s.province, s.postal_code].filter(Boolean).join(' ') : '');

export const receiptItemCost = (item) => Number(item.unit_cost) || Number(item.lot_unit_cost) || 0;

// วันหมดอายุเป็นวันที่ล้วน (DATE) แสดงเป็น dd/mm/พ.ศ. ถ้าไม่มีค่าหรือแปลงไม่ได้ให้แสดง "ไม่ระบุ"
export const formatExpiry = (v) => {
  if (!v) return 'ไม่ระบุ';
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  const dt = plain ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])) : new Date(v);
  if (isNaN(dt.getTime())) return 'ไม่ระบุ';
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear() + 543}`;
};

export const receiptTotals = (items) => {
  const subtotal = (items || []).reduce((s, i) => s + receiptItemCost(i) * Number(i.quantity || 0), 0);
  const vat = Math.round(subtotal * VAT_RATE * 100) / 100;
  return { subtotal, vat, total: subtotal + vat };
};

// แบรนด์ไม่ได้มากับ /receipts จึงอ้างอิงจากข้อมูลสินค้าจริงที่ /products/all
export const fetchBrandMap = async () => {
  try {
    const res = await api.get('/products/all');
    const map = {};
    (res.data.data || []).forEach(p => { map[p.product_id] = p.brand_name || ''; });
    return map;
  } catch {
    return {};
  }
};

// รวมข้อมูลใบรับจริง + ผู้จำหน่ายจากใบสั่งซื้อที่อ้างอิง + ข้อมูลร้านจาก company profile
export const loadReceiptDoc = async (receiptId, brandMap) => {
  const res = await api.get(`/receipts/${receiptId}`);
  const receipt = res.data.data;
  const [po, company, brands] = await Promise.all([
    receipt.po_id ? api.get(`/purchase-orders/${receipt.po_id}`).then(r => r.data.data).catch(() => null) : null,
    api.get('/company').then(r => r.data.data).catch(() => null),
    brandMap || fetchBrandMap(),
  ]);
  return {
    ...receipt,
    po,
    company,
    items: (receipt.items || []).map(i => ({ ...i, brand_name: brands[i.product_id] || '' })),
  };
};

const DOC = {
  navy: '#135dd1',
  line: '#94a3b8',
  th: { border: '1px solid #135dd1', background: '#135dd1', color: '#fff', padding: '6px 6px', fontSize: 12, fontWeight: 700 },
  td: { border: '1px solid #cbd5e1', padding: '6px 6px', fontSize: 12.5, verticalAlign: 'top' },
};

export const ReceiptDocPaper = ({ doc, docRef }) => {
  const { subtotal, vat, total } = receiptTotals(doc.items);
  const company = doc.company || {};
  const supplier = doc.po || {};
  const supplierName = supplier.supp_name || doc.supp_name;
  const supplierContact = supplier.first_name ? `${supplier.prefix || ''}${supplier.first_name} ${supplier.last_name || ''}`.trim() : '';
  const supplierAddr = docAddress(supplier);
  const recorder = `${doc.user_first_name || ''} ${doc.user_last_name || ''}`.trim();
  return (
    <div
      className="po-doc-sheet"
      ref={docRef}
      style={{ width: 794, margin: '0 auto', background: '#fff', padding: '36px 40px', boxSizing: 'border-box', fontFamily: "'Sarabun', Tahoma, sans-serif", fontSize: 13, color: '#1e293b', boxShadow: '0 8px 24px rgba(2, 8, 23, 0.12)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2px solid ${DOC.navy}`, paddingBottom: 12 }}>
        <img src={RECEIPT_LOGO_URL} alt="logo" style={{ height: 64, width: 'auto', objectFit: 'contain', display: 'block' }} />
        <div style={{ textAlign: 'right', lineHeight: 1.6 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: DOC.navy }}>ใบรับสินค้า</div>
          <div>เลขที่เอกสาร: <b>{doc.receipt_id}</b></div>
          <div>วันที่ออก: {docDate(doc.receipt_date)}</div>
          {doc.purchase_number && <div>อ้างอิงใบสั่งซื้อ: {doc.purchase_number}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
        <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 12px', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: DOC.navy, marginBottom: 2 }}>ผู้ซื้อ</div>
          <div style={{ fontWeight: 600 }}>{company.company_name || '-'}</div>
          {company.address && <div>{company.address}</div>}
          {company.tax_id && <div>เลขประจำตัวผู้เสียภาษี: {company.tax_id}</div>}
          {company.phone_number && <div>โทร: {company.phone_number}</div>}
        </div>
        <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 12px', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: DOC.navy, marginBottom: 2 }}>ผู้ขาย</div>
          <div style={{ fontWeight: 600 }}>{supplierName || '-'}</div>
          {supplierAddr && <div>{supplierAddr}</div>}
          {supplier.tax_id && <div>เลขประจำตัวผู้เสียภาษี: {supplier.tax_id}</div>}
          {supplierContact && <div>ติดต่อ: {supplierContact}</div>}
          {supplier.phone_number && <div>โทร: {supplier.phone_number}</div>}
          {supplier.email && <div>อีเมล: {supplier.email}</div>}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14 }}>
        <thead>
          <tr>
            <th style={{ ...DOC.th, width: 40, textAlign: 'center' }}>ลำดับ</th>
            <th style={{ ...DOC.th, textAlign: 'left' }}>รายการสินค้า</th>
            <th style={{ ...DOC.th, width: 110, textAlign: 'left' }}>แบรนด์</th>
            <th style={{ ...DOC.th, width: 55, textAlign: 'center' }}>จำนวน</th>
            <th style={{ ...DOC.th, width: 85, textAlign: 'center' }}>วันหมดอายุ</th>
            <th style={{ ...DOC.th, width: 95, textAlign: 'right' }}>ราคาต่อหน่วย</th>
            <th style={{ ...DOC.th, width: 100, textAlign: 'right' }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {(doc.items || []).map((item, idx) => (
            <tr key={idx} style={{ pageBreakInside: 'avoid' }}>
              <td style={{ ...DOC.td, textAlign: 'center' }}>{idx + 1}</td>
              <td style={DOC.td}>{item.product_name}{item.model ? <><br /><small style={{ color: '#64748b' }}>รุ่น: {item.model}</small></> : null}</td>
              <td style={DOC.td}>{item.brand_name || '-'}</td>
              <td style={{ ...DOC.td, textAlign: 'center' }}>{item.quantity}</td>
              <td style={{ ...DOC.td, textAlign: 'center', whiteSpace: 'nowrap' }}>{formatExpiry(item.expiry_date)}</td>
              <td style={{ ...DOC.td, textAlign: 'right' }}>{docMoney(receiptItemCost(item))}</td>
              <td style={{ ...DOC.td, textAlign: 'right' }}>{docMoney(receiptItemCost(item) * Number(item.quantity || 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, pageBreakInside: 'avoid' }}>
        <div style={{ width: 330, lineHeight: 1.9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>รวมเป็นเงิน</span><span>{docMoney(subtotal)} บาท</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ภาษีมูลค่าเพิ่ม 7%</span><span>{docMoney(vat)} บาท</span></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'stretch', pageBreakInside: 'avoid' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: 6, padding: '8px 12px', fontWeight: 700, textAlign: 'center' }}>
          ({thaiBahtText(total)})
        </div>
        <div style={{ width: 330, background: DOC.navy, color: '#fff', borderRadius: 6, padding: '8px 12px' }}>
          <div style={{ fontSize: 12 }}>รวมทั้งหมด</div>
          <div style={{ fontSize: 22, fontWeight: 800, textAlign: 'right' }}>{docMoney(total)} บาท</div>
        </div>
      </div>

      <div style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', minHeight: 44, pageBreakInside: 'avoid' }}>
        <b style={{ color: DOC.navy }}>หมายเหตุ:</b> {doc.notes || ''}
      </div>

      <div style={{ display: 'flex', gap: 24, marginTop: 36, textAlign: 'center', pageBreakInside: 'avoid' }}>
        {[['ผู้บันทึก', recorder], ['ผู้ตรวจรับ / ผู้รับสินค้า', '']].map(([label, name]) => (
          <div key={label} style={{ flex: 1 }}>
            <div style={{ borderBottom: `1px solid ${DOC.line}`, height: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 2 }}>{name}</div>
            <div style={{ marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const printReceiptDocument = (doc) => {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  const body = renderToStaticMarkup(<ReceiptDocPaper doc={doc} />);
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ใบรับสินค้า ${doc.receipt_id}</title>
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

const ReceivePage = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [items, setItems] = useState([]);
  const [poList, setPoList] = useState([]);
  const [poId, setPoId] = useState('');
  const [poDetail, setPoDetail] = useState(null);
  const [poLoading, setPoLoading] = useState(false);
  const [receiptDate, setReceiptDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [details, setDetails] = useState({});
  const [brandMap, setBrandMap] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [viewDoc, setViewDoc] = useState(null);
  const [savingImage, setSavingImage] = useState(false);
  const docRef = useRef(null);
  const [activeTab, setActiveTab] = useState('po');
  const [poSearch, setPoSearch] = useState('');
  const searchInputRef = useRef(null);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await api.get('/products/all');
      setAllProducts(res.data.data || []);
      setProducts(res.data.data || []);
    } catch {
      setAllProducts([]);
    }
  }, []);

  const fetchHistory = useCallback(async (page = 1) => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/receipts', { params: { page, limit: 5 } });
      const rows = res.data.data || [];
      setHistory(rows);
      if (res.data.pagination) setPagination(res.data.pagination);
      // รายการสินค้า/ต้นทุนของแต่ละใบรับมาจาก /receipts/:id (ข้อมูลที่บันทึกจริง)
      const fetched = await Promise.all(rows.map(r => api.get(`/receipts/${r.receipt_id}`).then(d => d.data.data).catch(() => null)));
      const map = {};
      fetched.forEach(d => { if (d) map[d.receipt_id] = d; });
      setDetails(map);
    } catch {
      setHistory([]);
      setDetails({});
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchPOs = useCallback(async () => {
    try {
      const res = await api.get('/purchase-orders/receivable');
      setPoList(res.data.data || []);
    } catch {
      setPoList([]);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchHistory();
    fetchPOs();
    fetchBrandMap().then(setBrandMap);
    const d = new Date();
    setReceiptDate(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.`);
  }, [fetchProducts, fetchHistory, fetchPOs]);

  useEffect(() => {
    if (!productSearch.trim()) { setProducts(allProducts); return; }
    const s = productSearch.toLowerCase();
    setProducts(allProducts.filter(p =>
      p.product_name?.toLowerCase().includes(s) ||
      p.barcode?.toLowerCase().includes(s) ||
      p.model?.toLowerCase().includes(s)
    ));
  }, [productSearch, allProducts]);

  const parseMoney = (value) => {
    const n = parseFloat(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  const selectPo = async (id) => {
    if (id === poId) {
      clearPo();
      return;
    }
    try {
      setPoLoading(true);
      const res = await api.get(`/purchase-orders/${id}`);
      const po = res.data.data;
      setPoId(po.po_id);
      setPoDetail(po);
      setItems((po.items || []).map(it => {
        const prod = allProducts.find(p => p.product_id === it.product_id);
        return {
          product_id: it.product_id,
          product_name: it.product_name,
          model: it.model,
          barcode: it.barcode,
          quantity: Number(it.quantity) || 1,
          unit_cost: parseMoney(it.unit_price),
          selling_price: parseMoney(prod?.selling_price),
          expiry_date: ''
        };
      }));
    } catch {
      alert('ไม่สามารถโหลดรายละเอียดใบสั่งซื้อได้');
    } finally {
      setPoLoading(false);
    }
  };

  const clearPo = () => {
    setPoId('');
    setPoDetail(null);
    setItems([]);
  };

  const filteredPOs = poSearch.trim()
    ? poList.filter(po =>
        po.purchase_number?.toLowerCase().includes(poSearch.toLowerCase()) ||
        po.supp_name?.toLowerCase().includes(poSearch.toLowerCase())
      )
    : poList;

  const addItem = (product) => {
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
        unit_cost: parseMoney(product.purchase_price),
        selling_price: parseMoney(product.selling_price),
        expiry_date: ''
      }];
    });
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
      i.product_id === productId ? { ...i, quantity: n } : i
    ));
  };

  const setUnitCost = (productId, val) => {
    const cleanValue = val.replace(/[^\d.]/g, '');
    const n = parseFloat(cleanValue);
    setItems(prev => prev.map(i =>
      i.product_id === productId ? { ...i, unit_cost: Number.isNaN(n) ? 0 : n } : i
    ));
  };

  const setSellingPrice = (productId, val) => {
    const cleanValue = val.replace(/[^\d.]/g, '');
    const n = parseFloat(cleanValue);
    setItems(prev => prev.map(i =>
      i.product_id === productId ? { ...i, selling_price: Number.isNaN(n) ? 0 : n } : i
    ));
  };

  const setExpiryDate = (productId, val) => {
    setItems(prev => prev.map(i =>
      i.product_id === productId ? { ...i, expiry_date: val || '' } : i
    ));
  };

  const removeItem = (productId) => {
    setItems(prev => prev.filter(i => i.product_id !== productId));
  };

  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalCost = items.reduce((sum, i) => sum + (Number(i.unit_cost) || 0) * i.quantity, 0);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await api.post('/receipts', {
        po_id: poId || undefined,
        items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_cost: i.unit_cost, selling_price: i.selling_price, expiry_date: i.expiry_date || null }))
      });
      const doc = await loadReceiptDoc(res.data.data.receipt_id);
      setResult(doc);
      setItems([]);
      setPoId('');
      setPoDetail(null);
      fetchProducts();
      fetchHistory();
      fetchPOs();
    } catch (err) {
      alert(err.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  };

  const openDoc = async (receiptId) => {
    try {
      setViewDoc(await loadReceiptDoc(receiptId));
    } catch {
      alert('ไม่สามารถโหลดข้อมูลได้');
    }
  };

  const handleSaveImage = async (doc) => {
    if (!doc || !docRef.current) return;
    setSavingImage(true);
    try {
      const canvas = await html2canvas(docRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const link = document.createElement('a');
      link.download = `${doc.receipt_id}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      alert('เกิดข้อผิดพลาดในการบันทึกรูป');
    } finally {
      setSavingImage(false);
    }
  };

  const formatNumber = (value) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear() + 543} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} น.`;
  };

  const docOverlay = (doc, onClose) => (
    <div className="po-preview-overlay" onClick={onClose}>
      <div className="po-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="po-preview-toolbar">
          <div className="po-preview-status">
            <span className="po-preview-ok" style={{ background: '#eef2ff', color: '#4f46e5' }}>
              <FiFileText size={15} /> ใบรับสินค้า
            </span>
            <div className="po-preview-id">{doc.receipt_id}</div>
          </div>
          <div className="po-preview-actions">
            <button className="pfm-btn pfm-btn-outline po-preview-btn" onClick={() => handleSaveImage(doc)} disabled={savingImage}>
              <FiDownload size={16} /> {savingImage ? 'กำลังบันทึกรูป...' : 'บันทึกรูปภาพ'}
            </button>
            <button className="pfm-btn pfm-btn-primary po-preview-btn" onClick={() => printReceiptDocument(doc)}>
              <FiPrinter size={16} /> พิมพ์
            </button>
            <button className="pfm-btn pfm-btn-outline po-preview-btn" onClick={onClose}>
              <FiX size={16} /> ปิด
            </button>
          </div>
        </div>
        <div className="po-preview-scroll">
          <ReceiptDocPaper doc={doc} docRef={docRef} />
        </div>
      </div>
    </div>
  );

  if (result) {
    return (
      <Layout title="รับสินค้าเข้า">
        {docOverlay(result, () => setResult(null))}
      </Layout>
    );
  }

  return (
    <Layout title="รับสินค้าเข้า">
      <div className="rcv-wrapper" style={{ height: "clamp(680px, 88vh, 920px)" }}>
        <div className="pos-left" style={{ flex: 1.1 }}>
          <div className="rcv-tabs">
            <button
              className={`rcv-tab ${activeTab === 'po' ? 'active' : ''}`}
              onClick={() => setActiveTab('po')}
            >
              ใบสั่งซื้อ
              {poList.length > 0 && <span className="rcv-tab-count">{poList.length}</span>}
            </button>
            <button
              className={`rcv-tab ${activeTab === 'products' ? 'active' : ''}`}
              onClick={() => setActiveTab('products')}
            >
              สินค้าเพิ่มเติม
            </button>
          </div>

          {activeTab === 'po' && (
            <>
              <div className="pos-search-bar">
                <FiSearch className="pos-search-icon" />
                <input
                  className="pos-search-input"
                  placeholder="ค้นหาใบสั่งซื้อ (เลขที่, ผู้จำหน่าย)..."
                  value={poSearch}
                  onChange={e => setPoSearch(e.target.value)}
                />
                {poSearch && (
                  <FiX className="pos-search-clear" onClick={() => setPoSearch('')} />
                )}
              </div>
              <div className="pos-product-scroll">
                {poLoading ? (
                  <div className="pos-empty"><div className="spinner" /><p>กำลังโหลดใบสั่งซื้อ...</p></div>
                ) : filteredPOs.length === 0 ? (
                  <div className="pos-empty">
                    <p>ไม่มีใบสั่งซื้อที่รอรับสินค้า</p>
                    <div className="rcv-empty-hint">รับของที่ไม่ได้สั่งได้จากแท็บ "สินค้าเพิ่มเติม"</div>
                  </div>
                ) : (
                  filteredPOs.map(po => (
                    <div
                      key={po.po_id}
                      className={`rcv-po-card ${poId === po.po_id ? 'active' : ''}`}
                      onClick={() => selectPo(po.po_id)}
                    >
                      <div className="rcv-po-card-avatar"><FiTruck size={16} /></div>
                      <div className="rcv-po-card-body">
                        <div className="rcv-po-card-top">
                          <strong className="rcv-po-card-num">{po.purchase_number}</strong>
                          <span className={`rcv-po-card-status ${po.purchase_status === 'อนุมัติ' ? 'ok' : ''}`}>
                            <span className="rcv-po-status-dot" />
                            {po.purchase_status}
                          </span>
                        </div>
                        <div className="rcv-po-card-supp">{po.supp_name}</div>
                        <div className="rcv-po-card-meta">
                          <span>{po.total_items || 0} รายการ</span>
                          <span>{formatDate(po.purchase_date)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {activeTab === 'products' && (
            <>
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
                    <span className="pos-th" style={{ width: 80 }}>สต๊อก</span>
                    <span className="pos-th" style={{ width: 60 }}></span>
                  </div>
                  {products.filter(p => p.product_status === 'active').map((product, idx) => (
                    <div
                      key={product.product_id}
                      className="pos-product-tr rcv-product-tr"
                      onClick={() => addItem(product)}
                    >
                      <span className="pos-td" style={{ width: 50 }}>{idx + 1}</span>
                      <span className="pos-td" style={{ flex: 1 }}>{product.product_name}</span>
                      <span className="pos-td" style={{ width: 90 }}>{product.model}</span>
                      <span className="pos-td" style={{ width: 80 }}>
                        <span className={`rcv-stock ${Number(product.stock_quantity) === 0 ? 'empty' : Number(product.stock_quantity) <= 5 ? 'low' : ''}`}>
                          {product.stock_quantity}
                        </span>
                      </span>
                      <span className="pos-td" style={{ width: 60 }}>
                        <span className="rcv-add-badge"><FiPlus size={13} /></span>
                      </span>
                    </div>
                  ))}
                  {products.filter(p => p.product_status === 'active').length === 0 && (
                    <div className="pos-empty">ไม่พบสินค้า</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="pos-right rcv-right" style={{ flex: 1, minWidth: 0 }}>
          <div className="pos-cart-header">
            <FiDownload size={18} />
            <span>รายการสินค้าที่รับ</span>
            {items.length > 0 && <span className="pos-cart-badge">{totalQty}</span>}
          </div>

          <div className="rcv-form-section">
            <div className="pos-section-label">ข้อมูลใบรับ</div>
            {poDetail && (
              <div className="rcv-po-info">
                <div className="rcv-po-chip"><span>เลขที่ใบสั่งซื้อ</span><strong>{poDetail.purchase_number}</strong></div>
                <div className="rcv-po-chip"><span>ผู้จำหน่าย</span><strong>{poDetail.supp_name}</strong></div>
                <div className="rcv-po-chip"><span>วันที่สั่งซื้อ</span><strong>{formatDate(poDetail.purchase_date)}</strong></div>
                <div className="rcv-po-chip"><span>รวมสุทธิ</span><strong>{Number(poDetail.net_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท</strong></div>
              </div>
            )}
            <div className="rcv-form-row">
              <div className="rcv-form-field">
                <label>วันที่รับสินค้า</label>
                <div className="rcv-date-display"><FiClock size={14} /> {receiptDate}</div>
              </div>
            </div>
          </div>

          {!poId && (
            <div className="rcv-cart-note">
              <div className="rcv-cart-note-text">รับสินค้าปกติ — เพิ่มสินค้าจากแท็บ "สินค้าเพิ่มเติม"</div>
            </div>
          )}

          <div className="pos-cart-items">
            {items.length === 0 ? (
              <div className="pos-cart-empty">
                <FiPackage size={48} />
                <div>ยังไม่มีรายการสินค้า</div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>เลือกใบสั่งซื้อ หรือเพิ่มสินค้าจากแท็บ "สินค้าเพิ่มเติม"</div>
              </div>
            ) : (
              items.map(item => (
                <div key={item.product_id} className="pos-cart-item" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                  <div className="pos-cart-item-info" style={{ flex: '1 1 150px', marginBottom: 0 }}>
                    <div className="pos-cart-item-name">{item.product_name}</div>
                    <div className="pos-cart-item-model">{item.model}</div>
                  </div>
                  <div className="pos-cart-item-controls" style={{ flexShrink: 0 }}>
                    <button className="pos-qty-btn" onClick={() => updateQty(item.product_id, -1)} disabled={item.quantity <= 1}><FiMinus size={14} /></button>
                    <input className="pos-qty-input" type="text" inputMode="numeric" value={item.quantity} onChange={e => setQty(item.product_id, e.target.value)} />
                    <button className="pos-qty-btn" onClick={() => updateQty(item.product_id, 1)}><FiPlus size={14} /></button>
                    <button className="pos-cart-remove" onClick={() => removeItem(item.product_id)}><FiTrash2 size={14} /></button>
                  </div>
                  <div className="rcv-cost-control" style={{ margin: 0, flexBasis: '100%', flexWrap: 'wrap', gap: '8px 12px' }}>
                    <label>ต้นทุนต่อหน่วย</label>
                    <div className="rcv-cost-input-wrap">
                      <span>฿</span>
                      <input
                        className="rcv-cost-input"
                        type="text"
                        inputMode="decimal"
                        value={item.unit_cost}
                        onChange={e => setUnitCost(item.product_id, e.target.value)}
                        onBlur={() => setUnitCost(item.product_id, Number(item.unit_cost || 0).toFixed(2))}
                      />
                    </div>
                    <label>ราคาขายต่อหน่วย</label>
                    <div className="rcv-cost-input-wrap">
                      <span>฿</span>
                      <input
                        className="rcv-cost-input"
                        type="text"
                        inputMode="decimal"
                        value={item.selling_price}
                        onChange={e => setSellingPrice(item.product_id, e.target.value)}
                        onBlur={() => setSellingPrice(item.product_id, Number(item.selling_price || 0).toFixed(2))}
                      />
                    </div>
                  </div>
                  <div style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <label style={{ color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>วันหมดอายุ</label>
                    <input
                      type="date"
                      value={item.expiry_date || ''}
                      onChange={e => setExpiryDate(item.product_id, e.target.value)}
                      style={{ height: 28, maxWidth: '100%', border: '1px solid #e2e8f0', borderRadius: 4, padding: '0 8px', fontSize: 13, color: '#1e293b', background: '#fff' }}
                    />
                    {item.expiry_date ? (
                      <>
                        <span style={{ fontSize: 12, color: '#475569' }}>{formatExpiry(item.expiry_date)}</span>
                        <button type="button" className="hist-clear-btn" onClick={() => setExpiryDate(item.product_id, '')}>ล้าง</button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>ไม่ระบุ</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pos-summary rcv-summary">
            <div className="pos-summary-row"><span>จำนวนรายการ</span><span>{items.length} รายการ</span></div>
            <div className="pos-summary-row"><span>จำนวนสินค้า</span><span>{totalQty} ชิ้น</span></div>
            <div className="pos-summary-row"><span>ต้นทุนรวม</span><span>{formatNumber(totalCost)} บาท</span></div>
          </div>

          <button
            className="pfm-btn pfm-btn-success pos-checkout-btn"
            disabled={items.length === 0 || saving}
            onClick={() => setShowConfirm(true)}
          >
            {saving ? 'กำลังบันทึก...' : `รับเข้าสินค้า (${totalQty} ชิ้น)`}
          </button>
        </div>
      </div>

      <div className="rcv-history">
        <div className="rcv-history-header">
          <h3>ประวัติการรับสินค้า</h3>
          <div className="rcv-history-tools">
            <span>{pagination.total} รายการ</span>
            <button className="rcv-view-all-btn" onClick={() => navigate('/receive/history')}>
              ดูรายการทั้งหมด <FiArrowRight size={13} />
            </button>
          </div>
        </div>
        <div className="table-container">
          <div className="table-scroll">
            <table className="pro-table">
              <thead>
                <tr>
                  <th className="col-code">เลขที่ใบรับ</th>
                  <th className="col-name">ใบสั่งซื้อ</th>
                  <th className="col-name">ผู้จำหน่าย</th>
                  <th className="col-name">ชื่อสินค้า</th>
                  <th className="col-brand">แบรนด์</th>
                  <th className="col-stock">จำนวน</th>
                  <th className="col-brand">วันหมดอายุ</th>
                  <th className="col-price">ต้นทุน/หน่วย</th>
                  <th className="col-price">ยอดรวม (รวม VAT)</th>
                  <th className="col-brand">ผู้บันทึก</th>
                  <th className="col-price">วันที่</th>
                  <th className="col-actions">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr><td colSpan={12}><div className="table-empty"><div className="spinner" /><p>กำลังโหลดข้อมูล...</p></div></td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan={12}><div className="table-empty"><FiPackage size={40} /><p>ยังไม่มีประวัติการรับสินค้า</p></div></td></tr>
                ) : (
                  history.map((r) => {
                    const rItems = details[r.receipt_id]?.items || [];
                    const cellLines = (render) => (rItems.length === 0 ? '-' : rItems.map((it, i) => (
                      <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{render(it)}</div>
                    )));
                    return (
                      <tr key={r.receipt_id} style={{ cursor: 'pointer' }} onClick={() => openDoc(r.receipt_id)}>
                        <td className="col-code">{r.receipt_id}</td>
                        <td className="col-name">{r.purchase_number || '-'}</td>
                        <td className="col-name">{details[r.receipt_id]?.supp_name || '-'}</td>
                        <td className="col-name">{cellLines(it => it.product_name)}</td>
                        <td className="col-brand">{cellLines(it => brandMap[it.product_id] || '-')}</td>
                        <td className="col-stock">{cellLines(it => `${it.quantity} ชิ้น`)}</td>
                        <td className="col-brand">{cellLines(it => formatExpiry(it.expiry_date))}</td>
                        <td className="col-price">{cellLines(it => formatNumber(receiptItemCost(it)))}</td>
                        <td className="col-price">{rItems.length === 0 ? '-' : formatNumber(receiptTotals(rItems).total)}</td>
                        <td className="col-brand" style={{ whiteSpace: 'nowrap' }}>{r.user_first_name ? `${r.user_first_name} ${r.user_last_name}` : '-'}</td>
                        <td className="col-price" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.receipt_date)}</td>
                        <td className="col-actions">
                          <button className="pfm-btn pfm-btn-outline" onClick={(e) => { e.stopPropagation(); openDoc(r.receipt_id); }} title="ดูใบรับสินค้า">
                            <FiFileText size={15} /> ดูใบรับสินค้า
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
        title="ยืนยันการรับสินค้า"
          message={`ยืนยันการบันทึกใบรับสินค้า ${items.length} รายการ รวม ${totalQty} ชิ้น โดยระบบจะสร้างล็อตสินค้าและเก็บต้นทุนต่อหน่วย`}
        onConfirm={handleSubmit}
        onClose={() => setShowConfirm(false)}
        confirmText="บันทึก"
        cancelText="ยกเลิก"
        danger={false}
      />

      {viewDoc && docOverlay(viewDoc, () => setViewDoc(null))}
    </Layout>
  );
};

export default ReceivePage;
