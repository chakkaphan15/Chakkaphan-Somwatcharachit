import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import api from '../services/api';
import Layout from '../components/layout/Layout';
import ThaiDatePicker from '../components/ThaiDatePicker';
import { FiPackage, FiFileText, FiPrinter, FiDownload, FiArrowLeft, FiX } from 'react-icons/fi';
import { ReceiptDocPaper, printReceiptDocument, loadReceiptDoc, fetchBrandMap, receiptTotals, receiptItemCost } from './ReceivePage';
import { RANGE_OPTIONS, getDateRange, rangeText, currentMonthPick, MonthPickerInline, openReportWindow } from './PurchaseOrdersHistoryPage';

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  const hasTime = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(d);
  const datePart = `${dt.getDate()} ${TH_MONTHS[dt.getMonth()]} ${dt.getFullYear() + 543}`;
  if (!hasTime) return datePart;
  return `${datePart} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')} น.`;
};

const formatNumber = (num) => Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ReceiveHistoryPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [viewDoc, setViewDoc] = useState(null);
  const [savingImage, setSavingImage] = useState(false);
  const [details, setDetails] = useState({});
  const [brandMap, setBrandMap] = useState({});
  const docRef = useRef(null);
  const [rangeKey, setRangeKey] = useState(() => {
    const r = searchParams.get('range');
    return ['all', 'today', 'month', 'custom', 'pickMonth'].includes(r) ? r : 'all';
  });
  const [customDate, setCustomDate] = useState('');
  const [monthPick, setMonthPick] = useState(currentMonthPick);
  const [summary, setSummary] = useState({ count: 0, total_items: 0 });
  const [exporting, setExporting] = useState(false);

  const fetchHistory = useCallback(async (page = 1) => {
    try {
      setHistoryLoading(true);
      const range = getDateRange(rangeKey, customDate, monthPick);
      const [listRes, sumRes] = await Promise.all([
        api.get('/receipts', { params: { page, limit: 10, ...range } }),
        api.get('/receipts/summary', { params: range }),
      ]);
      const rows = listRes.data.data || [];
      setHistory(rows);
      if (listRes.data.pagination) setPagination(listRes.data.pagination);
      setSummary(sumRes.data.data || { count: 0, total_items: 0 });
      // รายการสินค้า/ต้นทุนของแต่ละใบรับมาจาก /receipts/:id (ข้อมูลที่บันทึกจริง)
      const fetched = await Promise.all(rows.map(r => api.get(`/receipts/${r.receipt_id}`).then(res => res.data.data).catch(() => null)));
      const map = {};
      fetched.forEach(d => { if (d) map[d.receipt_id] = d; });
      setDetails(map);
    } catch {
      setHistory([]);
      setDetails({});
      setSummary({ count: 0, total_items: 0 });
    } finally {
      setHistoryLoading(false);
    }
  }, [rangeKey, customDate, monthPick]);

  useEffect(() => {
    fetchHistory(1);
  }, [fetchHistory]);

  useEffect(() => {
    setSearchParams(rangeKey === 'all' ? {} : { range: rangeKey }, { replace: true });
  }, [rangeKey, setSearchParams]);

  useEffect(() => {
    fetchBrandMap().then(setBrandMap);
  }, []);

  const openDoc = async (receiptId) => {
    try {
      setViewDoc(await loadReceiptDoc(receiptId, brandMap));
    } catch {
      alert('ไม่สามารถโหลดข้อมูลได้');
    }
  };

  const handleSaveImage = async () => {
    if (!viewDoc || !docRef.current) return;
    setSavingImage(true);
    try {
      const canvas = await html2canvas(docRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const link = document.createElement('a');
      link.download = `${viewDoc.receipt_id}.png`;
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
      const allRows = [];
      const range = getDateRange(rangeKey, customDate, monthPick);
      let page = 1;
      while (true) {
        const res = await api.get('/receipts', { params: { page, limit: 100, ...range } });
        const data = res.data.data || [];
        allRows.push(...data);
        const pag = res.data.pagination || {};
        if (data.length === 0 || allRows.length >= pag.total || page >= (pag.totalPages || 1)) break;
        page += 1;
      }
      // รายการสินค้า/ต้นทุนของแต่ละใบรับมาจาก /receipts/:id (ดึงทีละกลุ่มเพื่อไม่ให้ยิงพร้อมกันมากเกินไป)
      const detailRows = [];
      for (let i = 0; i < allRows.length; i += 10) {
        const batch = await Promise.all(allRows.slice(i, i + 10).map(r => api.get(`/receipts/${r.receipt_id}`).then(res => res.data.data)));
        detailRows.push(...batch);
      }
      const totals = detailRows.map(d => receiptTotals(d.items));
      const sum = (key) => totals.reduce((s, t) => s + t[key], 0);
      const totalQty = detailRows.reduce((s, d) => s + (d.items || []).reduce((q, it) => q + (Number(it.quantity) || 0), 0), 0);
      // 1 ใบรับ 1 สินค้า = 1 แถว ส่วนยอดรวมระดับใบรับแสดงที่แถวแรกของใบรับเท่านั้น
      const reportRows = [];
      detailRows.forEach((d, i) => {
        const items = d.items || [];
        const list = items.length > 0 ? items : [null];
        list.forEach((it, idx) => {
          reportRows.push([
            d.receipt_id,
            d.purchase_number || '-',
            d.supp_name || '-',
            it ? it.product_name || '-' : '-',
            it ? brandMap[it.product_id] || '-' : '-',
            it ? Number(it.quantity || 0).toLocaleString() : '-',
            it ? formatNumber(receiptItemCost(it)) : '-',
            idx === 0 ? formatNumber(totals[i].total) : '',
            `${d.user_first_name || ''} ${d.user_last_name || ''}`.trim() || '-',
            formatDate(d.receipt_date),
          ]);
        });
      });
      openReportWindow({
        title: 'รายงานประวัติการรับสินค้า',
        rangeLabel: rangeText(rangeKey, customDate, monthPick),
        headers: ['เลขที่ใบรับ', 'ใบสั่งซื้อ', 'ผู้จำหน่าย', 'ชื่อสินค้า', 'แบรนด์', 'จำนวน', 'ราคา/หน่วย', 'ยอดรวม (รวม VAT)', 'ผู้บันทึก', 'วันที่'],
        aligns: ['left', 'left', 'left', 'left', 'left', 'right', 'right', 'right', 'left', 'left'],
        rows: reportRows,
        summary: [
          ['จำนวนรายการรับสินค้า', `${detailRows.length.toLocaleString()} รายการ`],
          ['จำนวนสินค้าที่รับเข้ารวม', `${totalQty.toLocaleString()} ชิ้น`],
          ['มูลค่ารับสินค้า (ก่อน VAT)', `${formatNumber(sum('subtotal'))} บาท`],
          ['VAT 7%', `${formatNumber(sum('vat'))} บาท`],
          ['มูลค่ารับสินค้ารวม (รวม VAT)', `${formatNumber(sum('total'))} บาท`],
        ],
        grandValue: `${formatNumber(sum('total'))} บาท`,
      });
    } catch {
      alert('ไม่สามารถส่งออกรายงานได้');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Layout title="ประวัติการรับสินค้าทั้งหมด">
      <div className="hist-toolbar">
        <button className="pfm-btn pfm-btn-outline" onClick={() => navigate('/receive')}>
          <FiArrowLeft size={15} /> กลับหน้ารับสินค้า
        </button>
      </div>
      <div className="rcv-history">
        <div className="rcv-history-header">
          <h3>ประวัติการรับสินค้าทั้งหมด</h3>
          <span className="hist-summary">{summary.count} รายการ · {summary.total_items} ชิ้น</span>
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
                  <th className="col-code">เลขที่ใบรับ</th>
                  <th className="col-name">ใบสั่งซื้อ</th>
                  <th className="col-name">ผู้จำหน่าย</th>
                  <th className="col-name">ชื่อสินค้า</th>
                  <th className="col-brand">แบรนด์</th>
                  <th className="col-stock">จำนวน</th>
                  <th className="col-price">ต้นทุน/หน่วย</th>
                  <th className="col-price">ยอดรวม (รวม VAT)</th>
                  <th className="col-brand">ผู้บันทึก</th>
                  <th className="col-price">วันที่</th>
                  <th className="col-actions">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr><td colSpan={11}><div className="table-empty"><div className="spinner" /><p>กำลังโหลดข้อมูล...</p></div></td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan={11}><div className="table-empty"><FiPackage size={40} /><p>ยังไม่มีประวัติการรับสินค้า</p></div></td></tr>
                ) : (
                  history.map(r => {
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
                  <FiFileText size={15} /> ใบรับสินค้า
                </span>
                <div className="po-preview-id">{viewDoc.receipt_id}</div>
              </div>
              <div className="po-preview-actions">
                <button className="pfm-btn pfm-btn-outline po-preview-btn" onClick={handleSaveImage} disabled={savingImage}>
                  <FiDownload size={16} /> {savingImage ? 'กำลังบันทึกรูป...' : 'บันทึกรูปภาพ'}
                </button>
                <button className="pfm-btn pfm-btn-primary po-preview-btn" onClick={() => printReceiptDocument(viewDoc)}>
                  <FiPrinter size={16} /> พิมพ์
                </button>
                <button className="pfm-btn pfm-btn-outline po-preview-btn" onClick={() => setViewDoc(null)}>
                  <FiX size={16} /> ปิด
                </button>
              </div>
            </div>
            <div className="po-preview-scroll">
              <ReceiptDocPaper doc={viewDoc} docRef={docRef} />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default ReceiveHistoryPage;