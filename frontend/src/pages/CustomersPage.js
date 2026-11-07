import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Layout from '../components/layout/Layout';
import ConfirmModal from '../components/ConfirmModal';
import {
  FiUsers, FiShoppingCart, FiSearch, FiPlus,
  FiEdit2, FiTrash2, FiX, FiUser, FiPhone, FiPhoneCall, FiHome, FiMapPin,
  FiClock, FiFileText, FiCalendar, FiCheck, FiAlertTriangle,
  FiGrid, FiList, FiChevronDown, FiStar
} from 'react-icons/fi';

const PREFIXES = ['นาย', 'นาง', 'นางสาว'];

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const PAY_LABELS = { cash: 'เงินสด', transfer: 'โอนเงิน' };

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#3b82f6,#2563eb)',
  'linear-gradient(135deg,#8b5cf6,#7c3aed)',
  'linear-gradient(135deg,#f97316,#ea580c)',
  'linear-gradient(135deg,#22c55e,#16a34a)',
  'linear-gradient(135deg,#ec4899,#db2777)',
  'linear-gradient(135deg,#06b6d4,#0891b2)'
];

const FILTERS = [
  { value: 'regular', label: 'ลูกค้าประจำ' }
];

const SORTS = [
  { value: 'recent', label: 'ลงทะเบียนล่าสุด' },
  { value: 'name', label: 'ชื่อ (ก-ฮ)' },
  { value: 'spent', label: 'ยอดซื้อรวมสูงสุด' },
  { value: 'last_sale', label: 'ซื้อล่าสุดก่อน' }
];

const fmtThaiDate = (d) => d ? `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}` : '-';
const fmtThaiDateTime = (d) => d ? `${fmtThaiDate(d)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '-';
const formatNumber = (n) => (parseFloat(n) || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const formatPhone = (p) => p && p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : (p || '-');
const initialsOf = (c) => `${(c.first_name?.charAt(0) || '')}${(c.last_name?.charAt(0) || '')}`.toUpperCase() || '?';
const gradientOf = (c) => {
  const s = `${c.customer_id || ''}${c.first_name || ''}${c.last_name || ''}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
};
const buildAddress = (c) => [
  c.house_no ? `บ้านเลขที่ ${c.house_no}` : '',
  c.village_no ? `หมู่ ${c.village_no}` : '',
  c.alley ? `ซอย ${c.alley}` : '',
  c.road ? `ถนน ${c.road}` : '',
  c.sub_district, c.district, c.province
].filter(Boolean).join(' ');

const visitsOf = (c) => parseInt(c.visits) || 0;

const customerBadge = (c) => {
  const v = visitsOf(c);
  return <span className="cus-badge regular"><FiStar size={11} /> ลูกค้าประจำ · {v} ครั้ง</span>;
};

const EMPTY_FORM = {
  prefix: 'นาย', first_name: '', last_name: '', phone_number: '',
  house_no: '', village_no: '', alley: '', road: '',
  sub_district: '', district: '', province: '', post_code: ''
};

const CustomersPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.user_role === 'admin';
  const canManage = isAdmin || user?.user_role === 'employee';

  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('regular');
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState('table');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('info');

  const fetchData = async (p = pagination.page) => {
    try {
      setLoading(true);
      const res = await api.get('/customers', {
        params: { page: p, limit: pagination.limit, search, filter, sort }
      });
      setCustomers(res.data.data || []);
      setPagination(prev => ({
        ...prev, page: p,
        total: res.data.pagination?.total || 0,
        totalPages: res.data.pagination?.totalPages || 1
      }));
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(1); }, [search, filter, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.get('/customers/stats').then(res => setStats(res.data.data)).catch(() => {});
  }, []);

  const refreshStats = () => {
    api.get('/customers/stats').then(res => setStats(res.data.data)).catch(() => {});
  };

  const handlePageChange = (p) => {
    if (p < 1 || p > pagination.totalPages) return;
    fetchData(p);
  };

  const getDisplayPageNumbers = () => {
    const total = pagination.totalPages;
    const cur = pagination.page;
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    if (cur <= 3) return [1, 2, 3, 4, 5];
    if (cur >= total - 2) return [total - 4, total - 3, total - 2, total - 1, total].filter(n => n >= 1);
    return [cur - 2, cur - 1, cur, cur + 1, cur + 2];
  };

  const openDetail = async (c) => {
    setDetailTab('info');
    try {
      setDetail(null);
      const res = await api.get(`/customers/${c.customer_id}/history`);
      setDetail(res.data.data);
    } catch {
      setDetail({ customer: c, purchases: [], items: [], stats: null });
    }
  };

  const openAdd = () => {
    if (!canManage) return;
    setEditItem(null);
    setForm({ ...EMPTY_FORM });
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (item) => {
    if (!canManage) return;
    setEditItem(item);
    setForm({
      prefix: item.prefix || 'นาย',
      first_name: item.first_name || '',
      last_name: item.last_name || '',
      phone_number: item.phone_number || '',
      house_no: item.house_no || '',
      village_no: item.village_no || '',
      alley: item.alley || '',
      road: item.road || '',
      sub_district: item.sub_district || '',
      district: item.district || '',
      province: item.province || '',
      post_code: item.post_code || ''
    });
    setFormError('');
    setShowModal(true);
  };

  const setF = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleFormSubmit = async () => {
    if (!canManage) return;
    if (!form.first_name.trim() || !form.last_name.trim() || !form.phone_number.trim()) {
      setFormError('กรุณากรอกชื่อ นามสกุล และเบอร์โทรศัพท์');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editItem) {
        await api.put(`/customers/${editItem.customer_id}`, form);
      } else {
        await api.post('/customers', form);
      }
      setShowModal(false);
      fetchData(pagination.page);
      refreshStats();
    } catch (err) {
      setFormError(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin) {
      setDeleteTarget(null);
      return;
    }
    if (!deleteTarget) return;
    try {
      await api.delete(`/customers/${deleteTarget.customer_id}`);
      setDeleteTarget(null);
      fetchData(1);
      refreshStats();
    } catch {
      alert('ไม่สามารถลบลูกค้าได้');
    }
  };

  const itemOfSale = (saleId) => (detail?.items || []).filter(i => i.sale_id === saleId);

  const renderTable = () => (
    <div className="table-container">
      <div className="table-scroll">
        <table className="pro-table">
          <thead>
            <tr>
              <th className="col-num">#</th>
              <th>ลูกค้า</th>
              <th className="col-addr">ที่อยู่</th>
              <th className="col-num" style={{ width: 70 }}>รหัสไปรษณีย์</th>
              <th className="col-spent">ยอดซื้อรวม</th>
              <th className="col-last">ซื้อล่าสุด</th>
              <th className="col-actions">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>
                  <div className="table-empty">
                    <div className="spinner" />
                    <p>กำลังโหลดข้อมูล...</p>
                  </div>
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="table-empty">
                    <FiUsers size={40} />
                    <p>{search ? 'ไม่พบลูกค้าที่ค้นหา' : 'ยังไม่มีลูกค้าประจำในระบบ'}</p>
                    {!search && canManage && <button className="btn-add-sm" onClick={openAdd}>เพิ่มลูกค้าประจำคนแรก</button>}
                  </div>
                </td>
              </tr>
            ) : (
              customers.map((c, index) => (
                <tr key={c.customer_id} style={{ cursor: 'pointer' }} onClick={() => openDetail(c)}>
                  <td className="col-num">{(pagination.page - 1) * pagination.limit + index + 1}</td>
                  <td className="col-cust">
                    <div className="cus-cell-user">
                      <div className="cus-avatar" style={{ background: gradientOf(c) }}>
                        {initialsOf(c)}
                      </div>
                      <div className="cus-cell-meta">
                        <div className="cus-cell-name-line">
                          <strong className="cus-cell-name">{c.prefix}{c.first_name} {c.last_name}</strong>
                          {customerBadge(c)}
                        </div>
                        <span className="cus-cell-phone"><FiPhone size={11} /> {formatPhone(c.phone_number)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="col-addr">
                    <div className="cus-addr">{buildAddress(c) || '-'}</div>
                  </td>
                  <td className="col-num mono">{c.post_code || <span className="null-val">-</span>}</td>
                  <td className="col-spent">
                    {visitsOf(c) > 0 ? (
                      <div className="cus-spent">
                        <span className="cus-spent-amount">฿{formatNumber(c.total_spent)}</span>
                        <span className="cus-spent-count">{c.visits} ครั้ง</span>
                      </div>
                    ) : (
                      <span className="cus-spent-none">ยังไม่เคยซื้อ</span>
                    )}
                  </td>
                  <td className="col-last">
                    {c.last_visit ? (
                      <span className="cus-last-date">{fmtThaiDate(new Date(c.last_visit))}</span>
                    ) : (
                      <span className="cus-spent-none">-</span>
                    )}
                  </td>
                  <td className="col-actions" onClick={e => e.stopPropagation()}>
                    <div className="action-group">
                      {c.phone_number && (
                        <a className="tbl-action call" href={`tel:${c.phone_number}`} title="โทรหา">
                          <FiPhoneCall size={15} />
                        </a>
                      )}
                      {canManage && (
                        <>
                          <button className="tbl-action edit" onClick={() => openEdit(c)} title="แก้ไขลูกค้า">
                            <FiEdit2 size={15} />
                          </button>
                          {isAdmin && (
                            <button className="tbl-action delete" onClick={() => setDeleteTarget(c)} title="ลบลูกค้า">
                              <FiTrash2 size={15} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderCards = () => (
    <div className="cus-grid">
      {loading ? (
        <div className="table-empty" style={{ gridColumn: '1 / -1', border: '1px solid var(--gray-200)', borderRadius: 5 }}>
          <div className="spinner" />
          <p>กำลังโหลดข้อมูล...</p>
        </div>
      ) : customers.length === 0 ? (
        <div className="table-empty" style={{ gridColumn: '1 / -1', border: '1px solid var(--gray-200)', borderRadius: 5 }}>
          <FiUsers size={40} />
          <p>{search ? 'ไม่พบลูกค้าที่ค้นหา' : 'ยังไม่มีลูกค้าประจำในระบบ'}</p>
          {!search && canManage && <button className="btn-add-sm" onClick={openAdd}>เพิ่มลูกค้าประจำคนแรก</button>}
        </div>
      ) : (
        customers.map(c => (
          <div className="cus-card" key={c.customer_id} onClick={() => openDetail(c)}>
            <div className="cus-card-top">
              <div className="cus-avatar cus-avatar-lg" style={{ background: gradientOf(c) }}>
                {initialsOf(c)}
              </div>
              <div className="cus-card-info">
                <strong className="cus-cell-name">{c.prefix}{c.first_name} {c.last_name}</strong>
                <span className="cus-cell-phone"><FiPhone size={11} /> {formatPhone(c.phone_number)}</span>
              </div>
              {customerBadge(c)}
            </div>
            <div className="cus-card-addr"><FiMapPin size={12} /> {buildAddress(c) || 'ยังไม่ระบุที่อยู่'}</div>
            <div className="cus-card-stats">
              <div className="cus-card-stat">
                <span className="v">฿{formatNumber(c.total_spent)}</span>
                <span className="l">ยอดซื้อรวม</span>
              </div>
              <div className="cus-card-stat">
                <span className="v">{visitsOf(c)}</span>
                <span className="l">ครั้งที่ซื้อ</span>
              </div>
              <div className="cus-card-stat">
                <span className="v lv">{c.last_visit ? fmtThaiDate(new Date(c.last_visit)) : '-'}</span>
                <span className="l">ซื้อล่าสุด</span>
              </div>
            </div>
            <div className="cus-card-foot" onClick={e => e.stopPropagation()}>
              {c.phone_number && (
                <a className="cus-card-btn call" href={`tel:${c.phone_number}`} title="โทรหา"><FiPhoneCall size={14} /> โทร</a>
              )}
              {canManage && (
                <>
                  <button className="cus-card-btn" onClick={() => openEdit(c)}><FiEdit2 size={14} /> แก้ไข</button>
                  {isAdmin && <button className="cus-card-btn danger" onClick={() => setDeleteTarget(c)}><FiTrash2 size={14} /> ลบ</button>}
                </>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  const renderDetailTab = () => {
    if (detailTab === 'info') {
      return (
        <>
          <div className="ud-section">
            <div className="ud-section-title"><FiUser size={14} /> ข้อมูลส่วนตัว</div>
            <div className="ud-grid">
              <div className="ud-field">
                <span className="ud-label"><FiPhone size={12} /> เบอร์โทรศัพท์</span>
                <span className="ud-value ud-mono">{formatPhone(detail.customer.phone_number)}</span>
              </div>
              <div className="ud-field">
                <span className="ud-label"><FiCalendar size={12} /> ลงทะเบียนเมื่อ</span>
                <span className="ud-value">{detail.customer.created_at ? fmtThaiDate(new Date(detail.customer.created_at)) : '-'}</span>
              </div>
            </div>
          </div>
          <div className="ud-section">
            <div className="ud-section-title"><FiHome size={14} /> ที่อยู่</div>
            <div className="ud-grid">
              <div className="ud-field ud-field-full">
                <span className="ud-label">ที่อยู่ทั้งชุด</span>
                <span className="ud-value">{buildAddress(detail.customer) || '-'}</span>
              </div>
              <div className="ud-field">
                <span className="ud-label">ตำบล/แขวง</span>
                <span className="ud-value">{detail.customer.sub_district || '-'}</span>
              </div>
              <div className="ud-field">
                <span className="ud-label">อำเภอ/เขต</span>
                <span className="ud-value">{detail.customer.district || '-'}</span>
              </div>
              <div className="ud-field">
                <span className="ud-label">จังหวัด</span>
                <span className="ud-value">{detail.customer.province || '-'}</span>
              </div>
              <div className="ud-field">
                <span className="ud-label"><FiMapPin size={12} /> รหัสไปรษณีย์</span>
                <span className="ud-value ud-mono">{detail.customer.post_code || '-'}</span>
              </div>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="cus-summary-cards">
          <div className="cus-summary-card">
            <span className="cus-summary-value">{detail.stats?.visits || 0} ครั้ง</span>
            <span className="cus-summary-label">ซื้อทั้งหมด</span>
          </div>
          <div className="cus-summary-card">
            <span className="cus-summary-value">฿{formatNumber(detail.stats?.total_spent || 0)}</span>
            <span className="cus-summary-label">ยอดซื้อรวม</span>
          </div>
          <div className="cus-summary-card">
            <span className="cus-summary-value lv">{detail.stats?.last_visit ? fmtThaiDate(new Date(detail.stats.last_visit)) : '-'}</span>
            <span className="cus-summary-label">ซื้อล่าสุด</span>
          </div>
        </div>
        {detail.purchases.length === 0 ? (
          <div className="cus-no-purchase">ยังไม่มีประวัติการซื้อ</div>
        ) : (
          <div className="cus-purchases">
            {detail.purchases.slice(0, 6).map(p => {
              const items = itemOfSale(p.sale_id);
              return (
                <div className="cus-purchase-block" key={p.sale_id}>
                  <div className="cus-purchase-row">
                    <div className="cus-purchase-info">
                      <span className="cus-purchase-receipt"><FiFileText size={12} /> {p.receipt_number}</span>
                      <span className="cus-purchase-date">
                        {fmtThaiDateTime(new Date(p.sale_date))} · {PAY_LABELS[p.payment_method] || p.payment_method}
                      </span>
                    </div>
                    <div className="cus-purchase-right">
                      <span className="cus-purchase-amount">฿{formatNumber(p.net_amount)}</span>
                      <span className="cus-purchase-items">{items.length} รายการ</span>
                    </div>
                  </div>
                  {items.length > 0 && (
                    <div className="cus-item-list">
                      {items.slice(0, 3).map((it, i) => (
                        <div className="cus-item-row" key={i}>
                          <span className="cus-item-name">{it.product_name}{it.model ? ` (${it.model})` : ''}</span>
                          <span className="cus-item-qty">×{it.quantity}</span>
                          <span className="cus-item-price">฿{formatNumber(it.unit_price * it.quantity)}</span>
                        </div>
                      ))}
                      {items.length > 3 && <div className="cus-item-more">+{items.length - 3} รายการสินค้า</div>}
                    </div>
                  )}
                </div>
              );
            })}
            {detail.purchases.length > 6 && (
              <div className="cus-purchase-more">+{detail.purchases.length - 6} ใบเสร็จก่อนหน้า</div>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <Layout title="ลูกค้า">
      <div className="products-header">
        <div className="ph-left">
          <h2>ลูกค้าประจำ</h2>
          <p>จัดการลูกค้าที่มีชื่อในระบบ ส่วนลูกค้าทั่วไปจะใช้รหัสลูกค้าทั่วไปโดยไม่เก็บชื่อ</p>
        </div>
        <div className="ph-right">
          <div className="ph-stat">
            <FiUsers size={16} />
            <span>{pagination.total} รายการ</span>
          </div>
          {stats && parseInt(stats.buyers) > 0 && (
            <div className="ph-stat ph-stat-warning">
              <FiShoppingCart size={16} />
              <span>ซื้อแล้ว {stats.buyers}</span>
            </div>
          )}
        </div>
      </div>

      <div className="products-toolbar cus-toolbar">
        <div className="search-box">
          <FiSearch size={16} className="search-icon" />
          <input type="text" placeholder="ค้นหาลูกค้า (ชื่อ, เบอร์โทร, จังหวัด)..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="cus-filter-pills">
          {FILTERS.map(f => (
            <button
              key={f.value}
              className={`cus-filter-pill ${filter === f.value ? 'active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="cus-sort-wrap">
          <FiChevronDown size={13} className="cus-sort-arrow" />
          <select className="cus-sort-select" value={sort} onChange={e => setSort(e.target.value)}>
            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div className="cus-view-toggle">
          <button className={`cus-view-btn ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')} title="มุมมองตาราง">
            <FiList size={15} />
          </button>
          <button className={`cus-view-btn ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')} title="มุมมองการ์ด">
            <FiGrid size={15} />
          </button>
        </div>

        {canManage && (
          <button className="btn-add" onClick={openAdd}>
            <FiPlus size={18} />
            <span>เพิ่มลูกค้าประจำ</span>
          </button>
        )}
      </div>

      {view === 'table' ? renderTable() : renderCards()}

      {pagination.totalPages > 1 && !loading && (
        <div className="pagination">
          <div className="pagination-info">
            หน้า {pagination.page} จาก {pagination.totalPages} ({pagination.total} รายการ)
          </div>
          <div className="pagination-buttons">
            <button className="pagination-btn" disabled={pagination.page === 1} onClick={() => handlePageChange(1)} title="หน้าแรก">«</button>
            <button className="pagination-btn" disabled={pagination.page === 1} onClick={() => handlePageChange(pagination.page - 1)} title="ก่อนหน้า">‹</button>
            {getDisplayPageNumbers().map(p => (
              <button key={p} className={`pagination-btn ${p === pagination.page ? 'active' : ''}`} onClick={() => handlePageChange(p)}>{p}</button>
            ))}
            <button className="pagination-btn" disabled={pagination.page === pagination.totalPages} onClick={() => handlePageChange(pagination.page + 1)} title="ถัดไป">›</button>
            <button className="pagination-btn" disabled={pagination.page === pagination.totalPages} onClick={() => handlePageChange(pagination.totalPages)} title="หน้าสุดท้าย">»</button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowModal(false)}>
          <div className="pfm-modal" style={{ width: 720 }} onClick={e => e.stopPropagation()}>
            <div className="pfm-header">
              <div className="pfm-header-left">
                <div className="pfm-header-icon"><FiUser size={18} /></div>
                <div>
                  <h5>{editItem ? 'แก้ไขลูกค้าประจำ' : 'เพิ่มลูกค้าประจำ'}</h5>
                  <p>{editItem ? `แก้ไขข้อมูลลูกค้า ${editItem.customer_id}` : 'บันทึกชื่อลูกค้าที่มีการใช้บริการซ้ำ'}</p>
                </div>
              </div>
              <button className="pfm-close" onClick={() => setShowModal(false)} disabled={saving}><FiX size={18} /></button>
            </div>

            <div className="pfm-body">
              {formError && <div className="pfm-alert"><FiAlertTriangle size={14} />{formError}</div>}
              <div className="pfm-section">
                <div className="pfm-section-title">ข้อมูลส่วนตัว</div>
                <div className="pfm-grid-3" style={{ gridTemplateColumns: '110px 1fr 1fr' }}>
                  <div className="pfm-field">
                    <label>คำนำหน้า</label>
                    <select className="pfm-input" value={form.prefix} onChange={e => setF('prefix', e.target.value)}>
                      {PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="pfm-field">
                    <label>ชื่อ <span className="pfm-req" /></label>
                    <input className="pfm-input" value={form.first_name} onChange={e => setF('first_name', e.target.value)} placeholder="ชื่อจริง" />
                  </div>
                  <div className="pfm-field">
                    <label>นามสกุล <span className="pfm-req" /></label>
                    <input className="pfm-input" value={form.last_name} onChange={e => setF('last_name', e.target.value)} placeholder="นามสกุล" />
                  </div>
                </div>
                <div className="pfm-grid-2" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
                  <div className="pfm-field">
                    <label>เบอร์โทรศัพท์ <span className="pfm-req" /></label>
                    <input className="pfm-input" value={form.phone_number} onChange={e => setF('phone_number', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0987654321" inputMode="numeric" />
                  </div>
                  <div className="pfm-field">
                    <label>รหัสไปรษณีย์</label>
                    <input className="pfm-input" value={form.post_code} onChange={e => setF('post_code', e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="10110" inputMode="numeric" />
                  </div>
                </div>
              </div>

              <div className="pfm-section">
                <div className="pfm-section-title">ที่อยู่</div>
                <div className="pfm-grid-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <div className="pfm-field">
                    <label>บ้านเลขที่</label>
                    <input className="pfm-input" value={form.house_no} onChange={e => setF('house_no', e.target.value.replace(/\D/g, ''))} placeholder="123" />
                  </div>
                  <div className="pfm-field">
                    <label>หมู่ที่</label>
                    <input className="pfm-input" value={form.village_no} onChange={e => setF('village_no', e.target.value.replace(/\D/g, ''))} placeholder="5" />
                  </div>
                  <div className="pfm-field">
                    <label>ตรอก/ซอย</label>
                    <input className="pfm-input" value={form.alley} onChange={e => setF('alley', e.target.value)} placeholder="ซอย ..." />
                  </div>
                </div>
                <div className="pfm-grid-3" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 12 }}>
                  <div className="pfm-field">
                    <label>ถนน</label>
                    <input className="pfm-input" value={form.road} onChange={e => setF('road', e.target.value)} placeholder="ถนน ..." />
                  </div>
                  <div className="pfm-field">
                    <label>ตำบล/แขวง</label>
                    <input className="pfm-input" value={form.sub_district} onChange={e => setF('sub_district', e.target.value)} />
                  </div>
                  <div className="pfm-field">
                    <label>อำเภอ/เขต</label>
                    <input className="pfm-input" value={form.district} onChange={e => setF('district', e.target.value)} />
                  </div>
                </div>
                <div className="pfm-grid-2" style={{ marginTop: 12 }}>
                  <div className="pfm-field">
                    <label>จังหวัด</label>
                    <input className="pfm-input" value={form.province} onChange={e => setF('province', e.target.value)} placeholder="จังหวัด" />
                  </div>
                </div>
              </div>
            </div>

            <div className="pfm-footer">
              <button className="pfm-btn pfm-btn-cancel" onClick={() => setShowModal(false)} disabled={saving}>ยกเลิก</button>
              <button className="pfm-btn pfm-btn-save" onClick={handleFormSubmit} disabled={saving}>
                {saving ? <span className="pfm-spinner" /> : <FiCheck size={16} />}
                {editItem ? 'บันทึกการแก้ไข' : 'เพิ่มลูกค้าประจำ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)} style={{ animation: 'fadeIn 0.15s ease' }}>
          <div className="ud-modal" onClick={e => e.stopPropagation()}>
            <button className="cfm-close" onClick={() => setDetail(null)}><FiX size={18} /></button>

            <div className="ud-hero" style={{ background: gradientOf(detail.customer) }}>
              <div className="ud-avatar">
                {initialsOf(detail.customer)}
              </div>
              <h2 className="ud-name">{detail.customer.prefix}{detail.customer.first_name} {detail.customer.last_name}</h2>
              <div className="ud-badge">
                <FiStar size={12} />
                ลูกค้าประจำ
              </div>
              <div className="ud-id">{detail.customer.customer_id}</div>
            </div>

            <div className="cus-tabs">
              <button className={`cus-tab ${detailTab === 'info' ? 'active' : ''}`} onClick={() => setDetailTab('info')}>
                <FiHome size={13} /> ข้อมูลลูกค้า
              </button>
              <button className={`cus-tab ${detailTab === 'history' ? 'active' : ''}`} onClick={() => setDetailTab('history')}>
                <FiShoppingCart size={13} /> ประวัติการซื้อ ({detail.purchases.length})
              </button>
            </div>

            <div className="ud-body">
              {renderDetailTab()}
            </div>

            <div className="ud-actions">
              {detail.customer.phone_number && (
                <a className="pfm-btn pfm-btn-save" href={`tel:${detail.customer.phone_number}`} style={{ textDecoration: 'none' }}>
                  <FiPhoneCall size={15} /> โทรหา
                </a>
              )}
              {canManage && (
                <>
                  <button className="pfm-btn pfm-btn-cancel" onClick={() => { setDetail(null); openEdit(detail.customer); }}>
                    <FiEdit2 size={15} /> แก้ไขข้อมูล
                  </button>
                  {isAdmin && (
                    <button className="pfm-btn pfm-btn-cancel" style={{ color: '#dc2626', borderColor: '#fecaca' }} onClick={() => { setDetail(null); setDeleteTarget(detail.customer); }}>
                      <FiTrash2 size={15} /> ลบ
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="ud-footer">
              <FiClock size={13} />
              <span>สมัครสมาชิกเมื่อ {detail.customer.created_at ? fmtThaiDateTime(new Date(detail.customer.created_at)) : '-'}</span>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="ยืนยันการลบ"
          message={`ต้องการลบลูกค้า "${deleteTarget.prefix || ''}${deleteTarget.first_name} ${deleteTarget.last_name}" ใช่หรือไม่?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          confirmText="ลบ"
          cancelText="ยกเลิก"
          danger
        />
      )}
    </Layout>
  );
};

export default CustomersPage;