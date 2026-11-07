import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Layout from '../components/layout/Layout';
import ThaiDatePicker from '../components/ThaiDatePicker';
import html2canvas from 'html2canvas';
import { FiShoppingCart, FiPrinter, FiArrowLeft, FiX, FiDownload, FiFileText } from 'react-icons/fi';
import { SaleReceiptPaper, printSaleReceipt, loadSaleReceipt, calcSaleTotals } from './SalePage';
import { RANGE_OPTIONS, getDateRange, rangeText, currentMonthPick, MonthPickerInline, openReportWindow } from './PurchaseOrdersHistoryPage';

const METHOD_LABELS = { cash: 'เงินสด', transfer: 'โอนเงิน' };

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const formatNumber = (num) => Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  const hasTime = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(d);
  const datePart = `${dt.getDate()} ${TH_MONTHS[dt.getMonth()]} ${dt.getFullYear() + 543}`;
  if (!hasTime) return datePart;
  return `${datePart} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} น.`;
};

// ดึงรายการขายทุกหน้าตามช่วงวันที่ที่เลือก (ใช้ทั้งยอดรวมหัวตารางและรายงาน ให้ตัวเลขตรงกัน)
const fetchAllSales = async (range) => {
  const all = [];
  let page = 1;
  while (true) {
    const res = await api.get('/sales', { params: { page, limit: 100, ...range, _t: Date.now() } });
    const data = res.data.data || [];
    all.push(...data);
    const pag = res.data.pagination || {};
    if (data.length === 0 || all.length >= pag.total || page >= (pag.totalPages || 1)) break;
    page += 1;
  }
  return all;
};

const SalesHistoryPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [rangeKey, setRangeKey] = useState(() => {
    const r = searchParams.get('range');
    return ['all', 'today', 'month', 'custom', 'pickMonth'].includes(r) ? r : 'all';
  });
  const [customDate, setCustomDate] = useState('');
  const [monthPick, setMonthPick] = useState(currentMonthPick);
  const [summary, setSummary] = useState({ count: 0, total: 0 });
  const [viewDoc, setViewDoc] = useState(null);
  const [details, setDetails] = useState({});
  const [savingImage, setSavingImage] = useState(false);
  const [exporting, setExporting] = useState(false);
  const saleDocRef = useRef(null);

  const fetchSeq = useRef(0);

  const fetchHistory = useCallback(async (page = 1) => {
    const seq = ++fetchSeq.current;
    const range = getDateRange(rangeKey, customDate, monthPick);
    setHistoryLoading(true);
    // ดึงรายการและยอดรวมแยกกัน เพื่อไม่ให้ยอดรวมล้มเหลวแล้วทำให้รายการว่าง
    const [listResult, sumResult] = await Promise.allSettled([
      api.get('/sales', { params: { page, limit: 10, ...range, _t: Date.now() } }),
      fetchAllSales(range),
    ]);
    if (seq !== fetchSeq.current) return;
    if (listResult.status === 'fulfilled') {
      const listRes = listResult.value;
      const rows = listRes.data.data || [];
      setHistory(rows);
      if (listRes.data.pagination) setPagination(listRes.data.pagination);
      // รายการสินค้าของแต่ละใบเสร็จมาจาก /sales/:id (ข้อมูลที่บันทึกจริง)
      const fetched = await Promise.all(rows.map(r => api.get(`/sales/${r.sale_id}`).then(res => res.data.data).catch(() => null)));
      if (seq !== fetchSeq.current) return;
      const map = {};
      fetched.forEach(d => { if (d) map[d.sale_id] = d; });
      setDetails(map);
    } else {
      setHistory([]);
      setDetails({});
    }
    setSummary(sumResult.status === 'fulfilled'
      ? { count: sumResult.value.length, total: sumResult.value.reduce((s, r) => s + calcSaleTotals(r.total_amount, r.discount_amount).net, 0) }
      : { count: 0, total: 0 });
    setHistoryLoading(false);
  }, [rangeKey, customDate, monthPick]);

  const currentPage = useRef(1);
  currentPage.current = pagination.page;

  useEffect(() => {
    fetchHistory(1);
  }, [fetchHistory]);

  // โหลดข้อมูลล่าสุดใหม่เมื่อกลับมาที่หน้านี้ (เช่น สลับแท็บหลังทำรายการขาย)
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') fetchHistory(currentPage.current || 1);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fetchHistory]);

  useEffect(() => {
    setSearchParams(rangeKey === 'all' ? {} : { range: rangeKey }, { replace: true });
  }, [rangeKey, setSearchParams]);

  const openDoc = async (saleId) => {
    try {
      setViewDoc(await loadSaleReceipt(saleId));
    } catch {
      alert('ไม่สามารถโหลดข้อมูลได้');
    }
  };

  const handleSaveImage = async (saleArg) => {
    const s = saleArg || viewDoc;
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

  const exportReport = async () => {
    try {
      setExporting(true);
      const allRows = await fetchAllSales(getDateRange(rangeKey, customDate, monthPick));
      const calc = allRows.map(r => calcSaleTotals(r.total_amount, r.discount_amount));
      const sum = (key) => calc.reduce((s, c) => s + c[key], 0);
      const totalQty = allRows.reduce((s, r) => s + (Number(r.total_items) || 0), 0);
      // รายการสินค้าของแต่ละใบเสร็จมาจาก /sales/:id (ดึงทีละกลุ่มเพื่อไม่ให้ยิงพร้อมกันมากเกินไป)
      const detailRows = [];
      for (let i = 0; i < allRows.length; i += 10) {
        const batch = await Promise.all(allRows.slice(i, i + 10).map(r => api.get(`/sales/${r.sale_id}`).then(res => res.data.data)));
        detailRows.push(...batch);
      }
      // 1 ใบเสร็จ 1 สินค้า = 1 แถว ส่วนยอดระดับใบเสร็จ (ส่วนลด/VAT/ยอดสุทธิ) แสดงที่แถวแรกของใบเสร็จเท่านั้น
      const reportRows = [];
      allRows.forEach((r, i) => {
        const items = detailRows[i]?.items || [];
        const head = [
          r.receipt_number,
          formatDate(r.sale_date),
          r.customer_first_name ? `${r.customer_first_name} ${r.customer_last_name}` : 'ลูกค้าทั่วไป',
          `${r.user_first_name || ''} ${r.user_last_name || ''}`.trim() || '-',
        ];
        const tail = METHOD_LABELS[r.payment_method] || r.payment_method || '-';
        const list = items.length > 0 ? items : [null];
        list.forEach((it, idx) => {
          reportRows.push([
            ...head,
            it ? it.product_name || '-' : '-',
            it ? Number(it.quantity || 0).toLocaleString() : '-',
            it ? formatNumber(it.unit_price) : '-',
            idx === 0 ? formatNumber(calc[i].discount) : '',
            idx === 0 ? formatNumber(calc[i].vat) : '',
            idx === 0 ? formatNumber(calc[i].net) : '',
            tail,
          ]);
        });
      });
      openReportWindow({
        title: 'รายงานประวัติการขาย',
        rangeLabel: rangeText(rangeKey, customDate, monthPick),
        headers: ['เลขที่ใบเสร็จ', 'วันเวลาที่ขาย', 'ลูกค้า', 'ผู้ขาย', 'ชื่อสินค้า', 'จำนวน', 'ราคาขาย/หน่วย', 'ส่วนลด', 'VAT', 'ยอดสุทธิ (บาท)', 'วิธีชำระเงิน'],
        aligns: ['left', 'left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'left'],
        rows: reportRows,
        summary: [
          ['จำนวนรายการขาย', `${allRows.length.toLocaleString()} รายการ`],
          ['จำนวนสินค้ารวม', `${totalQty.toLocaleString()} ชิ้น`],
          ['ยอดขายรวม (ก่อนส่วนลด)', `${formatNumber(sum('subtotal'))} บาท`],
          ['ส่วนลดรวม', `${formatNumber(sum('discount'))} บาท`],
          ['ยอดหลังหักส่วนลด', `${formatNumber(sum('afterDiscount'))} บาท`],
          ['VAT รวม', `${formatNumber(sum('vat'))} บาท`],
          ['ยอดสุทธิรวม', `${formatNumber(sum('net'))} บาท`],
        ],
        grandValue: `${formatNumber(sum('net'))} บาท`,
      });
    } catch {
      alert('ไม่สามารถส่งออกรายงานได้');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = (s) => printSaleReceipt(s);

  return (
    <Layout title="ประวัติการขายทั้งหมด">
      <div className="hist-toolbar">
        <button className="pfm-btn pfm-btn-outline" onClick={() => navigate('/sale')}>
          <FiArrowLeft size={15} /> กลับหน้าขายสินค้า
        </button>
      </div>
      <div className="rcv-history">
        <div className="rcv-history-header">
          <h3>ประวัติการขายทั้งหมด</h3>
          <span className="hist-summary">{summary.count} รายการ · รวม {formatNumber(summary.total)} บาท</span>
          <div className="hist-range-bar">
            <div className="hist-seg">
              {RANGE_OPTIONS.map(o => (
                <button key={o.value} className={`hist-seg-btn ${rangeKey === o.value ? 'active' : ''}`} onClick={() => setRangeKey(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
            {rangeKey === 'custom' && (
              <div className="hist-date-pick">
                <ThaiDatePicker value={customDate} onChange={setCustomDate} />
                <button className="hist-clear-btn" onClick={() => { setCustomDate(''); setRangeKey('all'); }}>ล้าง</button>
              </div>
            )}
            {rangeKey === 'pickMonth' && (
              <MonthPickerInline value={monthPick} onChange={setMonthPick} onClear={() => { setMonthPick(currentMonthPick()); setRangeKey('all'); }} />
            )}
            <button className="hist-export-btn" onClick={exportReport} disabled={exporting}>
              <FiDownload size={14} /> {exporting ? 'กำลังสร้างรายงาน...' : 'ส่งออกรายงาน'}
            </button>
          </div>
        </div>
        <div className="table-container">
          <div className="table-scroll">
            <table className="pro-table">
              <thead>
                <tr>
                  <th className="col-code">เลขที่ใบเสร็จ</th>
                  <th className="col-date">วันเวลาที่ขาย</th>
                  <th className="col-name">ลูกค้า</th>
                  <th className="col-name">รายการสินค้า</th>
                  <th className="col-stock">จำนวน</th>
                  <th className="col-price">ยอดสุทธิ (รวม VAT)</th>
                  <th className="col-brand">ผู้ขาย</th>
                  <th className="col-brand">วิธีการชำระเงิน</th>
                  <th className="col-actions">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr><td colSpan={9}><div className="table-empty"><div className="spinner" /><p>กำลังโหลดข้อมูล...</p></div></td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan={9}><div className="table-empty"><FiShoppingCart size={40} /><p>ยังไม่มีประวัติการขาย</p></div></td></tr>
                ) : (
                  history.map(s => {
                    // รวมแถวล็อตของสินค้าเดียวกันให้เหลือบรรทัดเดียว
                    const grouped = [];
                    (details[s.sale_id]?.items || []).forEach(it => {
                      const found = grouped.find(g => g.product_id === it.product_id);
                      if (found) found.quantity += Number(it.quantity) || 0;
                      else grouped.push({ product_id: it.product_id, product_name: it.product_name, quantity: Number(it.quantity) || 0 });
                    });
                    const cellLines = (render) => (grouped.length === 0 ? '-' : grouped.map((g, i) => (
                      <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>{render(g)}</div>
                    )));
                    return (
                      <tr key={s.sale_id} style={{ cursor: 'pointer' }} onClick={() => openDoc(s.sale_id)}>
                        <td className="col-code">{s.receipt_number}</td>
                        <td className="col-date" style={{ whiteSpace: 'nowrap' }}>{formatDate(s.sale_date)}</td>
                        <td className="col-name">{s.customer_first_name ? `${s.customer_first_name} ${s.customer_last_name}` : 'ลูกค้าทั่วไป'}</td>
                        <td className="col-name">{cellLines(g => g.product_name)}</td>
                        <td className="col-stock">{cellLines(g => `${g.quantity} ชิ้น`)}</td>
                        <td className="col-price">{formatNumber(calcSaleTotals(s.total_amount, s.discount_amount).net)}</td>
                        <td className="col-brand" style={{ whiteSpace: 'nowrap' }}>{s.user_first_name ? `${s.user_first_name} ${s.user_last_name}` : '-'}</td>
                        <td className="col-brand">{METHOD_LABELS[s.payment_method] || s.payment_method || '-'}</td>
                        <td className="col-actions">
                          <button className="pfm-btn pfm-btn-outline" onClick={(e) => { e.stopPropagation(); openDoc(s.sale_id); }} title="ดูใบเสร็จ">
                            <FiFileText size={15} /> ดูใบเสร็จ
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {pagination.totalPages > 1 && !historyLoading && (
            <div className="pagination">
              <div className="pagination-info">
                หน้า {pagination.page} จาก {pagination.totalPages}
              </div>
              <div className="pagination-buttons">
                <button className="pagination-btn" disabled={pagination.page === 1} onClick={() => fetchHistory(pagination.page - 1)}>‹</button>
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).filter(p => Math.abs(p - pagination.page) <= 2 || p === 1 || p === pagination.totalPages).map(p => (
                  <button key={p} className={`pagination-btn ${p === pagination.page ? 'active' : ''}`} onClick={() => fetchHistory(p)}>{p}</button>
                ))}
                <button className="pagination-btn" disabled={pagination.page === pagination.totalPages} onClick={() => fetchHistory(pagination.page + 1)}>›</button>
              </div>
            </div>
          )}
        </div>
      </div>

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
                  <FiDownload size={16} /> {savingImage ? 'กำลังบันทึกรูป...' : 'บันทึกรูปภาพ'}
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

export default SalesHistoryPage;