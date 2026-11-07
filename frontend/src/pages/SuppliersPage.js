import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Layout from '../components/layout/Layout';
import { FiTruck, FiPlus, FiEdit2, FiTrash2, FiSearch, FiX, FiAlertTriangle, FiCheck, FiUser, FiPhone, FiHome, FiMapPin, FiClock } from 'react-icons/fi';
import ConfirmModal from '../components/ConfirmModal';

const PREFIXES = ['นาย', 'นาง', 'นางสาว'];

const SuppliersPage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailSupplier, setDetailSupplier] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const [form, setForm] = useState({
    supp_name: '', tax_id: '', prefix: '', first_name: '', last_name: '',
    phone_number: '', email: '', house_no: '', road: '',
    sub_district: '', district: '', province: '', postal_code: ''
  });

  const isAdmin = user?.user_role === 'admin';
  const canManage = isAdmin || user?.user_role === 'employee';

  const fetchData = async (p = page) => {
    try {
      setLoading(true);
      const res = await api.get('/suppliers', { params: { page: p, limit: 20, search } });
      setSuppliers(res.data.data || []);
      setTotalPages(res.data.totalPages || 1);
    } catch {
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(1); }, [search]);

  const resetForm = () => {
    setForm({ supp_name: '', tax_id: '', prefix: '', first_name: '', last_name: '', phone_number: '', email: '', house_no: '', road: '', sub_district: '', district: '', province: '', postal_code: '' });
    setFormError('');
    setFieldErrors({});
  };

  const openAdd = () => {
    setEditItem(null);
    resetForm();
    setShowModal(true);
  };

  useEffect(() => {
    if (location.state?.openAddSupplier) {
      openAdd();
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const openEdit = (item) => {
    if (!canManage) return;
    setEditItem(item);
    setForm({
      supp_name: item.supp_name || '',
      tax_id: item.tax_id || '',
      prefix: item.prefix || '',
      first_name: item.first_name || '',
      last_name: item.last_name || '',
      phone_number: item.phone_number || '',
      email: item.email || '',
      house_no: item.house_no || '',
      road: item.road || '',
      sub_district: item.sub_district || '',
      district: item.district || '',
      province: item.province || '',
      postal_code: item.postal_code || ''
    });
    setFormError('');
    setFieldErrors({});
    setShowModal(true);
  };

  const setF = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setFieldErrors(prev => (prev[field] ? { ...prev, [field]: '' } : prev));
  };

  const handleNumeric = (field, value) => {
    const clean = value.replace(/\D/g, '');
    setF(field, clean);
  };

  const handleSave = async () => {
    if (!canManage) return;
    const body = { ...form };
    const errs = {};
    if (!body.supp_name.trim()) errs.supp_name = 'กรุณากรอกชื่อผู้จำหน่าย';
    if (!body.tax_id.trim()) errs.tax_id = 'กรุณากรอกเลขผู้เสียภาษี';
    if (!body.phone_number.trim()) errs.phone_number = 'กรุณากรอกเบอร์โทรศัพท์';
    else if (body.phone_number.length < 9 || body.phone_number.length > 10) errs.phone_number = 'เบอร์โทรศัพท์ต้องมีความยาว 9-10 หลัก';
    if (!body.email.trim()) errs.email = 'กรุณากรอกอีเมล';
    if (!body.prefix) errs.prefix = 'กรุณาเลือกคำนำหน้า';
    if (!body.first_name.trim()) errs.first_name = 'กรุณากรอกชื่อ';
    if (!body.last_name.trim()) errs.last_name = 'กรุณากรอกนามสกุล';
    if (!body.house_no.trim()) errs.house_no = 'กรุณากรอกบ้านเลขที่';
    if (!body.sub_district.trim()) errs.sub_district = 'กรุณากรอกตำบล/แขวง';
    if (!body.district.trim()) errs.district = 'กรุณากรอกอำเภอ/เขต';
    if (!body.province.trim()) errs.province = 'กรุณากรอกจังหวัด';
    if (!body.postal_code.trim()) errs.postal_code = 'กรุณากรอกรหัสไปรษณีย์';
    else if (!/^[0-9]{5}$/.test(body.postal_code.trim())) errs.postal_code = 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก';

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setFormError('');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      if (editItem) {
        await api.put(`/suppliers/${editItem.supp_id}`, body);
      } else {
        await api.post('/suppliers', body);
      }
      setShowModal(false);
      await fetchData(1);
      setPage(1);
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
      await api.delete(`/suppliers/${deleteTarget.supp_id}`);
      setDeleteTarget(null);
      await fetchData(page);
    } catch (err) {
      alert(err.response?.data?.message || 'ไม่สามารถลบผู้จำหน่ายได้');
      setDeleteTarget(null);
    }
  };

  const goPage = (p) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
    fetchData(p);
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const pages = [];
    for (let i = 1; i <= totalPages; i++) pages.push(i);
    return (
      <div className="pagination-bar">
        <button className="page-btn" disabled={page === 1} onClick={() => goPage(page - 1)}>ก่อนหน้า</button>
        {pages.map(p => (
          <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => goPage(p)}>{p}</button>
        ))}
        <button className="page-btn" disabled={page === totalPages} onClick={() => goPage(page + 1)}>ถัดไป</button>
      </div>
    );
  };

  return (
    <Layout title="ผู้จำหน่าย">
      <div className="products-header">
        <div className="ph-left">
          <h2>จัดการผู้จำหน่าย</h2>
          <p>จัดการข้อมูลผู้จำหน่ายและคู่ค้าทั้งหมดในระบบ</p>
        </div>
        <div className="ph-right">
          <div className="ph-stat">
            <FiTruck size={16} />
            <span>{suppliers.length} รายการ</span>
          </div>
        </div>
      </div>

      <div className="products-toolbar">
        <div className="search-box">
          <FiSearch size={16} className="search-icon" />
          <input type="text" placeholder="ค้นหาชื่อ เบอร์โทร หรืออีเมล..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        {canManage && (
          <button className="btn-add" onClick={openAdd}>
            <FiPlus size={18} />
            <span>เพิ่มผู้จำหน่าย</span>
          </button>
        )}
      </div>

      <div className="table-container">
        <div className="table-scroll">
          <table className="pro-table">
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th className="col-code">รหัส</th>
                <th>ชื่อผู้จำหน่าย</th>
                <th>เลขผู้เสียภาษี</th>
                <th>เบอร์โทร</th>
                <th>อีเมล</th>
                {canManage && <th className="col-actions">จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6}>
                    <div className="table-empty">
                      <div className="spinner" />
                      <p>กำลังโหลดข้อมูล...</p>
                    </div>
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6}>
                    <div className="table-empty">
                      <FiTruck size={40} />
                      <p>{search ? 'ไม่พบผู้จำหน่ายที่ค้นหา' : 'ยังไม่มีผู้จำหน่ายในระบบ'}</p>
                      {!search && canManage && <button className="btn-add-sm" onClick={openAdd}>เพิ่มผู้จำหน่ายแรก</button>}
                    </div>
                  </td>
                </tr>
              ) : (
                suppliers.map((item, index) => (
                  <tr key={item.supp_id} style={{ cursor: 'pointer' }} onClick={() => setDetailSupplier(item)}>
                    <td className="col-num">{(page - 1) * 20 + index + 1}</td>
                    <td className="col-code">{item.supp_id}</td>
                    <td className="col-name">{item.supp_name}</td>
                    <td>{item.tax_id || '-'}</td>
                    <td>{item.phone_number}</td>
                    <td>{item.email || '-'}</td>
                    {canManage && (
                      <td className="col-actions">
                        <div className="action-group" onClick={(e) => e.stopPropagation()}>
                          <button className="tbl-action edit" onClick={() => openEdit(item)} title="แก้ไข">
                            <FiEdit2 size={15} />
                          </button>
                          {isAdmin && (
                            <button className="tbl-action delete" onClick={() => setDeleteTarget(item)} title="ลบ">
                              <FiTrash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {renderPagination()}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pfm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pfm-header">
              <h5>{editItem ? 'แก้ไขผู้จำหน่าย' : 'เพิ่มผู้จำหน่าย'}</h5>
              <button className="pfm-close" onClick={() => setShowModal(false)}>
                <FiX size={20} />
              </button>
            </div>
            <div className="pfm-body">
              {formError && (
                <div className="pfm-alert">
                  <FiAlertTriangle size={14} />
                  {formError}
                </div>
              )}

              <div className="pfm-section-title">ข้อมูลผู้จำหน่าย</div>
              <div className="pfm-grid-2">
                <div className="pfm-field">
                  <label className="pfm-req">ชื่อบริษัท / ผู้จำหน่าย</label>
                  <input className="pfm-input" placeholder="กรอกชื่อผู้จำหน่าย" value={form.supp_name} onChange={(e) => setF('supp_name', e.target.value)} />
                  {fieldErrors.supp_name && <div className="pfm-error">{fieldErrors.supp_name}</div>}
                </div>
                <div className="pfm-field">
                  <label className="pfm-req">เลขผู้เสียภาษี</label>
                  <input className="pfm-input" placeholder="กรอกเลขผู้เสียภาษี" value={form.tax_id} onChange={(e) => handleNumeric('tax_id', e.target.value)} maxLength={13} />
                  {fieldErrors.tax_id && <div className="pfm-error">{fieldErrors.tax_id}</div>}
                </div>
              </div>
              <div className="pfm-grid-2" style={{ marginTop: 12 }}>
                <div className="pfm-field">
                  <label className="pfm-req">เบอร์โทรศัพท์</label>
                  <input className="pfm-input" placeholder="กรอกเบอร์โทร" value={form.phone_number} onChange={(e) => handleNumeric('phone_number', e.target.value)} maxLength={10} />
                  {fieldErrors.phone_number && <div className="pfm-error">{fieldErrors.phone_number}</div>}
                </div>
                <div className="pfm-field">
                  <label className="pfm-req">อีเมล</label>
                  <input className="pfm-input" placeholder="กรอกอีเมล" value={form.email} onChange={(e) => setF('email', e.target.value)} />
                  {fieldErrors.email && <div className="pfm-error">{fieldErrors.email}</div>}
                </div>
              </div>

              <div className="pfm-section-title" style={{ marginTop: 20 }}>ผู้ติดต่อประจำบริษัท</div>
              <div className="pfm-grid-3">
                <div className="pfm-field">
                  <label className="pfm-req">คำนำหน้า</label>
                  <select className="pfm-input" value={form.prefix} onChange={(e) => setF('prefix', e.target.value)}>
                    <option value="">เลือกคำนำหน้า</option>
                    {PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {fieldErrors.prefix && <div className="pfm-error">{fieldErrors.prefix}</div>}
                </div>
                <div className="pfm-field">
                  <label className="pfm-req">ชื่อ</label>
                  <input className="pfm-input" placeholder="กรอกชื่อ" value={form.first_name} onChange={(e) => setF('first_name', e.target.value)} />
                  {fieldErrors.first_name && <div className="pfm-error">{fieldErrors.first_name}</div>}
                </div>
                <div className="pfm-field">
                  <label className="pfm-req">นามสกุล</label>
                  <input className="pfm-input" placeholder="กรอกนามสกุล" value={form.last_name} onChange={(e) => setF('last_name', e.target.value)} />
                  {fieldErrors.last_name && <div className="pfm-error">{fieldErrors.last_name}</div>}
                </div>
              </div>

              <div className="pfm-section-title" style={{ marginTop: 20 }}>ที่อยู่</div>
              <div className="pfm-grid-2">
                <div className="pfm-field">
                  <label className="pfm-req">บ้านเลขที่</label>
                  <input className="pfm-input" placeholder="กรอกที่อยู่ เช่น 123/45" value={form.house_no} onChange={(e) => setF('house_no', e.target.value)} />
                  {fieldErrors.house_no && <div className="pfm-error">{fieldErrors.house_no}</div>}
                </div>
                <div className="pfm-field">
                  <label>ถนน</label>
                  <input className="pfm-input" placeholder="กรอกถนน" value={form.road} onChange={(e) => setF('road', e.target.value)} />
                </div>
              </div>
              <div className="pfm-grid-2" style={{ marginTop: 12 }}>
                <div className="pfm-field">
                  <label className="pfm-req">ตำบล / แขวง</label>
                  <input className="pfm-input" placeholder="กรอกตำบล/แขวง เช่น คลองเตย" value={form.sub_district} onChange={(e) => setF('sub_district', e.target.value)} />
                  {fieldErrors.sub_district && <div className="pfm-error">{fieldErrors.sub_district}</div>}
                </div>
                <div className="pfm-field">
                  <label className="pfm-req">อำเภอ / เขต</label>
                  <input className="pfm-input" placeholder="กรอกอำเภอ/เขต เช่น วัฒนา" value={form.district} onChange={(e) => setF('district', e.target.value)} />
                  {fieldErrors.district && <div className="pfm-error">{fieldErrors.district}</div>}
                </div>
              </div>
              <div className="pfm-grid-2" style={{ marginTop: 12 }}>
                <div className="pfm-field">
                  <label className="pfm-req">จังหวัด</label>
                  <input className="pfm-input" placeholder="กรอกจังหวัด เช่น กรุงเทพฯ" value={form.province} onChange={(e) => setF('province', e.target.value)} />
                  {fieldErrors.province && <div className="pfm-error">{fieldErrors.province}</div>}
                </div>
                <div className="pfm-field">
                  <label className="pfm-req">รหัสไปรษณีย์</label>
                  <input className="pfm-input" placeholder="กรอกรหัสไปรษณีย์ เช่น 10110" value={form.postal_code} onChange={(e) => handleNumeric('postal_code', e.target.value)} maxLength={5} />
                  {fieldErrors.postal_code && <div className="pfm-error">{fieldErrors.postal_code}</div>}
                </div>
              </div>
            </div>
            <div className="pfm-footer">
              <button className="pfm-btn pfm-btn-cancel" onClick={() => setShowModal(false)}>ยกเลิก</button>
              <button className="pfm-btn pfm-btn-save" onClick={handleSave} disabled={saving}>
                {saving ? <span className="pfm-spinner" /> : <FiCheck size={16} />}
                {editItem ? 'บันทึกการแก้ไข' : 'เพิ่มผู้จำหน่าย'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        show={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="ยืนยันการลบผู้จำหน่าย"
        message={`คุณแน่ใจหรือไม่ว่าจะลบผู้จำหน่าย "${deleteTarget?.supp_name}"?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`}
        confirmText="ลบผู้จำหน่าย"
        cancelText="ยกเลิก"
        danger
      />

      {detailSupplier && (
        <div className="modal-overlay" onClick={() => setDetailSupplier(null)} style={{ animation: 'fadeIn 0.15s ease' }}>
          <div className="ud-modal" onClick={(e) => e.stopPropagation()}>
            <button className="cfm-close" onClick={() => setDetailSupplier(null)}><FiX size={18} /></button>

            <div className="ud-hero" style={{ background: 'linear-gradient(135deg,#0c2b5c,#1d6fd6)' }}>
              <div className="ud-avatar">
                {(detailSupplier.supp_name?.charAt(0) || '?').toUpperCase()}
              </div>
              <h2 className="ud-name">{detailSupplier.supp_name}</h2>
              <div className="ud-badge">รายละเอียดผู้จัดจำหน่าย</div>
              <div className="ud-id">{detailSupplier.supp_id}</div>
            </div>

            <div className="ud-body">
              <div className="ud-section">
                <div className="ud-section-title"><FiTruck size={14} /> ข้อมูลผู้จำหน่าย</div>
                <div className="ud-grid">
                  <div className="ud-field">
                    <span className="ud-label">เลขผู้จัดจำหน่าย</span>
                    <span className="ud-value ud-mono">{detailSupplier.supp_id || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">เลขประจำตัวผู้เสียภาษี</span>
                    <span className="ud-value ud-mono">{detailSupplier.tax_id || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label"><FiPhone size={12} /> เบอร์โทรศัพท์</span>
                    <span className="ud-value ud-mono">{detailSupplier.phone_number || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">อีเมล</span>
                    <span className="ud-value">{detailSupplier.email || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="ud-section">
                <div className="ud-section-title"><FiUser size={14} /> ผู้ติดต่อประจำบริษัท</div>
                <div className="ud-grid">
                  <div className="ud-field">
                    <span className="ud-label">คำนำหน้า</span>
                    <span className="ud-value">{detailSupplier.prefix || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">ชื่อ</span>
                    <span className="ud-value">{detailSupplier.first_name || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">นามสกุล</span>
                    <span className="ud-value">{detailSupplier.last_name || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="ud-section">
                <div className="ud-section-title"><FiHome size={14} /> ที่อยู่</div>
                <div className="ud-grid">
                  <div className="ud-field">
                    <span className="ud-label">บ้านเลขที่</span>
                    <span className="ud-value">{detailSupplier.house_no || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">ถนน</span>
                    <span className="ud-value">{detailSupplier.road || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">ตำบล/แขวง</span>
                    <span className="ud-value">{detailSupplier.sub_district || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">อำเภอ/เขต</span>
                    <span className="ud-value">{detailSupplier.district || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">จังหวัด</span>
                    <span className="ud-value">{detailSupplier.province || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label"><FiMapPin size={12} /> รหัสไปรษณีย์</span>
                    <span className="ud-value ud-mono">{detailSupplier.postal_code || '-'}</span>
                  </div>
                </div>
              </div>
            </div>

            {detailSupplier.created_at && (
              <div className="ud-footer">
                <FiClock size={13} />
                <span>เพิ่มเมื่อ {new Date(detailSupplier.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
};

export default SuppliersPage;
