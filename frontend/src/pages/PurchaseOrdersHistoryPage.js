import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Layout from '../components/layout/Layout';
import ThaiDatePicker from '../components/ThaiDatePicker';
import html2canvas from 'html2canvas';
import { FiPackage, FiPrinter, FiArrowLeft, FiX, FiDownload, FiFileText } from 'react-icons/fi';
import { PoDocPaper, printPoDocument, formatDate, formatNumber } from './PurchaseOrdersPage';
import { fetchBrandMap } from './ReceivePage';

const STATUS = {
  'รออนุมัติ': { color: '#b45309', bg: '#fef3c7' },
  'อนุมัติ': { color: '#1d4ed8', bg: '#dbeafe' },
  'รอรับสินค้า': { color: '#0369a1', bg: '#e0f2fe' },
  'เสร็จสิ้น': { color: '#15803d', bg: '#dcfce7' },
  'ยกเลิก': { color: '#b91c1c', bg: '#fee2e2' },
};

export const MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export const RANGE_OPTIONS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'today', label: 'วันนี้' },
  { value: 'month', label: 'เดือนนี้' },
  { value: 'custom', label: 'เลือกวันที่' },
  { value: 'pickMonth', label: 'เลือกเดือน' },
];

// ช่วงเดือน/ปี (พ.ศ.) เริ่มต้นของตัวเลือก "เลือกเดือน": fm/fy = เดือน/ปีเริ่มต้น, tm/ty = เดือน/ปีสิ้นสุด
export const currentMonthPick = () => {
  const now = new Date();
  const y = now.getFullYear() + 543;
  return { fm: now.getMonth(), fy: y, tm: now.getMonth(), ty: y };
};

const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ช่วงวันที่ (YYYY-MM-DD) ส่งให้ API เดิม ซึ่งเทียบเป็นรายวัน จึงไม่ตกหล่นเพราะเวลาในฐานข้อมูล
export const getDateRange = (range, customDate = '', monthPick = null) => {
  const now = new Date();
  if (range === 'today') {
    const d = ymdLocal(now);
    return { date_from: d, date_to: d };
  }
  if (range === 'month') {
    return {
      date_from: ymdLocal(new Date(now.getFullYear(), now.getMonth(), 1)),
      date_to: ymdLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  if (range === 'custom') {
    return { date_from: customDate || undefined, date_to: customDate || undefined };
  }
  if (range === 'pickMonth' && monthPick) {
    const { fm, fy, tm, ty } = monthPick;
    if (fy * 12 + fm > ty * 12 + tm) return { date_from: '9999-12-31', date_to: '9999-12-31' };
    return {
      date_from: ymdLocal(new Date(fy - 543, fm, 1)),
      date_to: ymdLocal(new Date(ty - 543, tm + 1, 0)),
    };
  }
  return {};
};

// ข้อความ "ช่วงรายงาน" ให้ตรงกับตัวกรองที่เลือกอยู่
export const rangeText = (range, customDate = '', monthPick = null) => {
  const now = new Date();
  if (range === 'today') return 'วันนี้';
  if (range === 'month') return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear() + 543}`;
  if (range === 'custom' && customDate) {
    const [y, m, d] = customDate.split('-').map(Number);
    return `${d} ${MONTH_NAMES[m - 1]} ${y + 543}`;
  }
  if (range === 'pickMonth' && monthPick) {
    const from = `${MONTH_NAMES[monthPick.fm]} ${monthPick.fy}`;
    const to = `${MONTH_NAMES[monthPick.tm]} ${monthPick.ty}`;
    return from === to ? from : `${from} - ${to}`;
  }
  return 'ทั้งหมด';
};

export const MonthPickerInline = ({ value, onChange, onClear }) => {
  const thisYear = new Date().getFullYear() + 543;
  const years = [...new Set([...Array.from({ length: 8 }, (_, i) => thisYear - i), value.fy, value.ty])].sort((a, b) => b - a);
  const selectStyle = { padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, background: '#fff' };
  const labelStyle = { fontSize: 13, color: '#475569', fontWeight: 600 };
  // ถ้าเดือนเริ่มต้นเลยเดือนสิ้นสุด ให้ปรับอีกฝั่งตามอัตโนมัติ เพื่อไม่ให้เกิดช่วงผิด
  const update = (patch) => {
    const next = { ...value, ...patch };
    if (next.fy * 12 + next.fm > next.ty * 12 + next.tm) {
      if ('fm' in patch || 'fy' in patch) { next.tm = next.fm; next.ty = next.fy; } else { next.fm = next.tm; next.fy = next.ty; }
    }
    onChange(next);
  };
  const renderMonth = (mKey, yKey) => (
    <>
      <select style={selectStyle} value={value[mKey]} onChange={(e) => update({ [mKey]: Number(e.target.value) })}>
        {MONTH_NAMES.map((name, i) => <option key={name} value={i}>{name}</option>)}
      </select>
      <select style={selectStyle} value={value[yKey]} onChange={(e) => update({ [yKey]: Number(e.target.value) })}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </>
  );
  return (
    <div className="hist-date-pick">
      {renderMonth('fm', 'fy')}
      <span style={labelStyle}>ถึง</span>
      {renderMonth('tm', 'ty')}
      <button className="hist-clear-btn" onClick={onClear}>ล้าง</button>
    </div>
  );
};

// เปิดรายงาน (ชื่อรายงาน, ช่วงรายงาน, ตารางข้อมูลที่ผ่านตัวกรอง, สรุปรายงาน, รวมทั้งสิ้น) พร้อมพิมพ์/บันทึกเป็น PDF
export const openReportWindow = ({ title, rangeLabel, extraInfo = [], headers, aligns = [], rows, summary, grandLabel = 'รวมทั้งสิ้น', grandValue }) => {
  const win = window.open('', '_blank', 'width=1000,height=800');
  if (!win) {
    alert('ไม่สามารถเปิดหน้ารายงานได้ กรุณาอนุญาตป๊อปอัป');
    return;
  }
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cell = (v, i, tag = 'td') => `<${tag} style="text-align:${aligns[i] || 'left'}">${esc(v)}</${tag}>`;
  const printedAt = new Date().toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' });
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title>
<style>
@page{size:A4 landscape;margin:12mm}
body{font-family:'Sarabun',Tahoma,sans-serif;color:#1e293b;font-size:12.5px;margin:0;padding:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:22px;margin:0 0 4px;color:#135dd1}
.meta{color:#475569;line-height:1.7;margin-bottom:12px}
table{width:100%;border-collapse:collapse}
th{background:#135dd1;color:#fff;border:1px solid #135dd1;padding:6px;font-size:12px}
td{border:1px solid #cbd5e1;padding:5px 6px;vertical-align:top}
thead{display:table-header-group}
tr{page-break-inside:avoid}
.summary{margin-top:18px;page-break-inside:avoid;border:1px solid #cbd5e1;border-radius:8px;padding:12px 16px;max-width:460px;margin-left:auto}
.summary h3{margin:0 0 8px;font-size:15px;color:#135dd1}
.summary .row{display:flex;justify-content:space-between;padding:2px 0}
.grand{margin-top:10px;padding:10px 14px;border-radius:8px;background:#135dd1;color:#fff;display:flex;justify-content:space-between;font-size:18px;font-weight:800}
.empty{text-align:center;color:#64748b;padding:14px}
</style></head><body>
<h1>${esc(title)}</h1>
<div class="meta"><div>ช่วงรายงาน: <b>${esc(rangeLabel)}</b></div>${extraInfo.map(([k, v]) => `<div>${esc(k)}: <b>${esc(v)}</b></div>`).join('')}<div>จัดทำเมื่อ: ${esc(printedAt)}</div></div>
<table><thead><tr>${headers.map((h, i) => cell(h, i, 'th')).join('')}</tr></thead><tbody>
${rows.length === 0 ? `<tr><td class="empty" colspan="${headers.length}">ไม่มีรายการในช่วงที่เลือก</td></tr>` : rows.map((r) => `<tr>${r.map((v, i) => cell(v, i)).join('')}</tr>`).join('')}
</tbody></table>
<div class="summary"><h3>สรุปรายงาน</h3>
${summary.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}
<div class="grand"><span>${esc(grandLabel)}</span><span>${esc(grandValue)}</span></div></div>
<script>window.onload=function(){window.print();};</script></body></html>`);
  win.document.close();
};

// value คือชื่อสถานะจริงที่เก็บในระบบ (purchase_status)
const STATUS_FILTERS = [
  { key: 'all', label: 'ทั้งหมด', value: '' },
  { key: 'approved', label: 'อนุมัติ', value: 'อนุมัติ' },
  { key: 'pending', label: 'รออนุมัติ', value: 'รออนุมัติ' },
  { key: 'cancelled', label: 'ยกเลิก', value: 'ยกเลิก' },
  { key: 'completed', label: 'เสร็จสิ้น', value: 'เสร็จสิ้น' },
];

const PurchaseOrdersHistoryPage = () => {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [details, setDetails] = useState({});
  const [brandMap, setBrandMap] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [rangeKey, setRangeKey] = useState('all');
  const [customDate, setCustomDate] = useState('');
  const [monthPick, setMonthPick] = useState(currentMonthPick);
  const [summary, setSummary] = useState({ count: 0, total: 0 });
  const [statusKey, setStatusKey] = useState('all');
  const [viewDoc, setViewDoc] = useState(null);
  const [savingImage, setSavingImage] = useState(false);
  const [exporting, setExporting] = useState(false);
  const docRef = useRef(null);

  const statusBadge = (status) => {
    const s = STATUS[status] || { color: '#475569', bg: '#f1f5f9' };
    return (
      <span className="po-status" style={{ color: s.color, background: s.bg }}>{status}</span>
    );
  };

  const fetchHistory = useCallback(async (page = 1) => {
    try {
      setHistoryLoading(true);
      const range = getDateRange(rangeKey, customDate, monthPick);
      const selected = STATUS_FILTERS.find(f => f.key === statusKey);
      const statusParams = selected?.value ? { status: selected.value } : {};
      const [listRes, sumRes] = await Promise.all([
        api.get('/purchase-orders', { params: { page, limit: 10, ...range, ...statusParams } }),
        api.get('/purchase-orders/summary', { params: { ...range, ...statusParams } }),
      ]);
      setHistory(listRes.data.data || []);
      if (listRes.data.pagination) setPagination(listRes.data.pagination);
      setSummary(sumRes.data.data || { count: 0, total: 0 });
      // รายการสินค้าของแต่ละใบสั่งซื้อมาจาก /purchase-orders/:id
      const fetched = await Promise.all((listRes.data.data || []).map(p => api.get(`/purchase-orders/${p.po_id}`).then(res => res.data.data).catch(() => null)));
      const map = {};
      fetched.forEach(d => { if (d) map[d.po_id] = d; });
      setDetails(map);
    } catch {
      setHistory([]);
      setDetails({});
      setSummary({ count: 0, total: 0 });
    } finally {
      setHistoryLoading(false);
    }
  }, [rangeKey, customDate, monthPick, statusKey]);

  useEffect(() => {
    fetchHistory(1);
  }, [fetchHistory]);

  useEffect(() => {
    fetchBrandMap().then(setBrandMap);
  }, []);

  const openDoc = async (poId) => {
    try {
      const res = await api.get(`/purchase-orders/${poId}`);
      setViewDoc(res.data.data);
    } catch {
      alert('ไม่สามารถโหลดข้อมูลได้');
    }
  };

  const handleSaveImage = async (poArg) => {
    const p = poArg || viewDoc;
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

  const exportReport = async () => {
    try {
      setExporting(true);
      const allRows = [];
      const range = getDateRange(rangeKey, customDate, monthPick);
      const statusFilter = STATUS_FILTERS.find(f => f.key === statusKey);
      let page = 1;
      while (true) {
        const res = await api.get('/purchase-orders', { params: { page, limit: 100, ...range, ...(statusFilter?.value ? { status: statusFilter.value } : {}) } });
        const data = res.data.data || [];
        allRows.push(...data);
        const pag = res.data.pagination || {};
        if (data.length === 0 || allRows.length >= pag.total || page >= (pag.totalPages || 1)) break;
        page += 1;
      }
      // รายการสินค้าของแต่ละใบสั่งซื้อมาจาก /purchase-orders/:id (ดึงทีละกลุ่มเพื่อไม่ให้ยิงพร้อมกันมากเกินไป)
      const detailRows = [];
      for (let i = 0; i < allRows.length; i += 10) {
        const batch = await Promise.all(allRows.slice(i, i + 10).map(p => api.get(`/purchase-orders/${p.po_id}`).then(res => res.data.data)));
        detailRows.push(...batch);
      }
      const brandMap = await fetchBrandMap();
      const totalQty = allRows.reduce((s, p) => s + (Number(p.total_items) || 0), 0);
      const totalValue = allRows.reduce((s, p) => s + (parseFloat(p.net_amount) || 0), 0);
      // 1 ใบสั่งซื้อ 1 สินค้า = 1 แถว ส่วนยอดสุทธิระดับใบสั่งซื้อแสดงที่แถวแรกของใบนั้นเท่านั้น
      const reportRows = [];
      allRows.forEach((p, i) => {
        const items = detailRows[i]?.items || [];
        const list = items.length > 0 ? items : [null];
        list.forEach((it, idx) => {
          reportRows.push([
            p.purchase_number,
            p.supp_name || '-',
            `${p.user_first_name || ''} ${p.user_last_name || ''}`.trim() || '-',
            it ? it.product_name || '-' : '-',
            it ? brandMap[it.product_id] || '-' : '-',
            it ? Number(it.quantity || 0).toLocaleString() : '-',
            it ? formatNumber(it.unit_price) : '-',
            idx === 0 ? formatNumber(p.net_amount) : '',
            p.purchase_status || '-',
            formatDate(p.purchase_date),
          ]);
        });
      });
      openReportWindow({
        title: 'รายงานประวัติการสั่งซื้อ',
        rangeLabel: rangeText(rangeKey, customDate, monthPick),
        extraInfo: [['สถานะ', statusFilter?.label || 'ทั้งหมด']],
        headers: ['เลขที่ใบสั่งซื้อ', 'ผู้จำหน่าย', 'ผู้บันทึก', 'ชื่อสินค้า', 'แบรนด์', 'จำนวน', 'ราคา/หน่วย', 'ยอดสุทธิ (บาท)', 'สถานะ', 'วันที่สั่งซื้อ'],
        aligns: ['left', 'left', 'left', 'left', 'left', 'right', 'right', 'right', 'left', 'left'],
        rows: reportRows,
        summary: [
          ['จำนวนใบสั่งซื้อ', `${allRows.length.toLocaleString()} รายการ`],
          ['จำนวนสินค้ารวม', `${totalQty.toLocaleString()} ชิ้น`],
          ['มูลค่าการสั่งซื้อรวม', `${formatNumber(totalValue)} บาท`],
        ],
        grandValue: `${formatNumber(totalValue)} บาท`,
      });
    } catch {
      alert('ไม่สามารถส่งออกรายงานได้');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = (p) => printPoDocument(p);

  return (
    <Layout title="ประวัติการสั่งซื้อทั้งหมด">
      <div className="hist-toolbar">
        <button className="pfm-btn pfm-btn-outline" onClick={() => navigate('/purchase-orders')}>
          <FiArrowLeft size={15} /> กลับหน้าสั่งซื้อสินค้า
        </button>
      </div>
      <div className="rcv-history">
        <div className="rcv-history-header">
          <h3>ประวัติการสั่งซื้อทั้งหมด</h3>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 12px' }}>
          <div className="hist-seg">
            {STATUS_FILTERS.map(f => (
              <button key={f.key} className={`hist-seg-btn ${statusKey === f.key ? 'active' : ''}`} onClick={() => setStatusKey(f.key)}>
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
                  history.map(p => {
                    const pItems = details[p.po_id]?.items || [];
                    const cellLines = (render) => (pItems.length === 0 ? '-' : pItems.map((it, i) => (
                      <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{render(it)}</div>
                    )));
                    return (
                    <tr key={p.po_id} style={{ cursor: 'pointer' }} onClick={() => openDoc(p.po_id)}>
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
          {pagination.totalPages > 1 && !historyLoading && (
            <div className="pagination">
              <div className="pagination-info">
                หน้า {pagination.page} จาก {pagination.totalPages}
              </div>
              <div className="pagination-buttons">
                <button className="pagination-btn" disabled={pagination.page === 1} onClick={() => fetchHistory(pagination.page - 1)}>‹</button>
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).filter(pg => Math.abs(pg - pagination.page) <= 2 || pg === 1 || pg === pagination.totalPages).map(pg => (
                  <button key={pg} className={`pagination-btn ${pg === pagination.page ? 'active' : ''}`} onClick={() => fetchHistory(pg)}>{pg}</button>
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
                  <FiFileText size={15} /> ใบสั่งซื้อสินค้า
                </span>
                <div className="po-preview-id">{viewDoc.purchase_number}</div>
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
              <PoDocPaper po={viewDoc} docRef={docRef} />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default PurchaseOrdersHistoryPage;