import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Layout from '../components/layout/Layout';
import ConfirmModal from '../components/ConfirmModal';
import { FiUsers, FiPlus, FiEdit2, FiTrash2, FiSearch, FiX, FiCheck, FiEye, FiEyeOff, FiAlertTriangle, FiUser, FiPhone, FiCalendar, FiHome, FiMapPin, FiClock } from 'react-icons/fi';

const ROLE_OPTIONS = [
  { value: 'employee', label: 'พนักงาน' },
  { value: 'admin', label: 'ผู้ดูแลระบบ' },
  { value: 'supplier', label: 'ช่าง' },
];

const PREFIX_OPTIONS = ['นาย', 'นาง', 'นางสาว'];

const NUM_FIELDS = { phone_number: 1, post_code: 1, village_no: 1 };

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const fmtThaiDate = (d) => d ? `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear()}` : '-';
const fmtThaiDateTime = (d) => d ? `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : '-';

const initialForm = {
  username: '',
  password: '',
  prefix: '',
  first_name: '',
  last_name: '',
  phone_number: '',
  user_role: 'employee',
  birth_date: '',
  house_no: '',
  village_no: '',
  alley: '',
  road: '',
  sub_district: '',
  district: '',
  province: '',
  post_code: '',
};

const FormField = ({ name, label, type = 'text', options, required, placeholder, mono, form, formErrors, onFormChange, onErrorClear, showPassword, onTogglePassword, inputRef }) => {
  const handleChange = (e) => {
    let value = e.target.value;
    if (NUM_FIELDS[name]) {
      value = value.replace(/[^0-9]/g, '');
      if (name === 'post_code' && value.length > 5) return;
      if (name === 'phone_number' && value.length > 10) return;
    }
    onFormChange(name, value);
    if (onErrorClear) onErrorClear(name);
  };

  return (
    <div className="pfm-field">
      <label className={required ? 'pfm-req' : ''}>{label}</label>
      {options ? (
        <select className="pfm-input" value={form[name]} onChange={(e) => { onFormChange(name, e.target.value); if (onErrorClear) onErrorClear(name); }}>
          <option value="">-- เลือก{label} --</option>
          {options.map(o => (
            <option key={o.value || o} value={o.value || o}>{o.label || o}</option>
          ))}
        </select>
      ) : type === 'password' ? (
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            className={`pfm-input ${mono ? 'pfm-input-mono' : ''}`}
            type={showPassword ? 'text' : 'password'}
            placeholder={placeholder || `กรอก${label}`}
            value={form[name]}
            onChange={handleChange}
            autoComplete="new-password"
          />
          <button type="button" onClick={onTogglePassword} style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer',
            padding: 4, display: 'flex',
          }}>
            {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
          </button>
        </div>
      ) : type === 'date' ? (
        <input
          className="pfm-input"
          type="date"
          value={form[name]}
          onChange={handleChange}
        />
      ) : (
        <input
          ref={inputRef}
          className={`pfm-input ${mono ? 'pfm-input-mono' : ''}`}
          type={type}
          placeholder={placeholder || `กรอก${label}`}
          value={form[name]}
          onChange={handleChange}
          inputMode={NUM_FIELDS[name] ? 'numeric' : undefined}
          autoComplete="off"
        />
      )}
      {formErrors[name] && <div className="pfm-error">{formErrors[name]}</div>}
    </div>
  );
};

const UsersPage = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailUser, setDetailUser] = useState(null);
  const [detailContacts, setDetailContacts] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactForm, setContactForm] = useState({ perfix: '', frist_name: '', last_name: '', relationship: '', phone_num: '' });
  const [editingContactId, setEditingContactId] = useState(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [showPwChange, setShowPwChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [pwChangeSaving, setPwChangeSaving] = useState(false);
  const searchTimer = useRef(null);
  const firstInputRef = useRef(null);

  const isEditing = !!editUser;

  const fetchUsers = useCallback(async (page = 1, searchTerm = '') => {
    try {
      setLoading(true);
      const params = { page, limit: 20 };
      if (searchTerm) params.search = searchTerm;
      const res = await api.get('/users', { params });
      const d = res.data;
      setUsers(d.data || []);
      if (d.pagination) setPagination(d.pagination);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchContacts = async (userId) => {
    try {
      const res = await api.get(`/emergency-contacts/user/${userId}`);
      setContacts(res.data.data || []);
    } catch {
      setContacts([]);
    }
  };

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSearch = (e) => {
    const v = e.target.value;
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchUsers(1, v), 400);
  };

  const handlePageChange = (page) => {
    if (page < 1 || page > pagination.totalPages) return;
    fetchUsers(page, search);
  };

  const openAdd = () => {
    setEditUser(null);
    setForm(initialForm);
    setFormErrors({});
    setShowPassword(false);
    setShowPwChange(false);
    setNewPassword('');
    setConfirmPassword('');
    setContacts([]);
    cancelContactForm();
    setShowModal(true);
    setTimeout(() => firstInputRef.current?.focus(), 150);
  };

  const openEdit = async (u) => {
    setEditUser(u);
    setFormErrors({});
    setShowPassword(false);
    setShowPwChange(false);
    setNewPassword('');
    setConfirmPassword('');
    setShowModal(true);
    cancelContactForm();
    try {
      const res = await api.get(`/users/${u.user_id}`);
      const d = res.data.data;
      setForm({
        username: d.username || '',
        password: '',
        prefix: d.prefix || '',
        first_name: d.first_name || '',
        last_name: d.last_name || '',
        phone_number: d.phone_number || '',
        user_role: d.user_role || 'employee',
        birth_date: d.birth_date ? d.birth_date.split('T')[0] : '',
        house_no: d.house_no || '',
        village_no: d.village_no || '',
        alley: d.alley || '',
        road: d.road || '',
        sub_district: d.sub_district || '',
        district: d.district || '',
        province: d.province || '',
        post_code: d.post_code || '',
      });
      fetchContacts(u.user_id);
      setTimeout(() => firstInputRef.current?.focus(), 150);
    } catch {
      setForm({
        username: u.username || '',
        password: '',
        prefix: u.prefix || '',
        first_name: u.first_name || '',
        last_name: u.last_name || '',
        phone_number: u.phone_number || '',
        user_role: u.user_role || 'employee',
        birth_date: '',
        house_no: '',
        village_no: '',
        alley: '',
        road: '',
        sub_district: '',
        district: '',
        province: '',
        post_code: '',
      });
    }
  };

  const validate = () => {
    const errs = {};
    if (!form.username.trim()) errs.username = 'กรุณากรอกชื่อผู้ใช้';
    else if (form.username.trim().length < 3) errs.username = 'ชื่อผู้ใช้ต้องมีความยาวอย่างน้อย 3 ตัวอักษร';
    else if (!/^[a-zA-Z0-9_]+$/.test(form.username.trim())) errs.username = 'ชื่อผู้ใช้สามารถมีได้เฉพาะตัวอักษร ตัวเลข และ _';
    if (!isEditing && !form.password) errs.password = 'กรุณากรอกรหัสผ่าน';
    else if (!isEditing && form.password.length < 4) errs.password = 'รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร';
    if (!form.prefix) errs.prefix = 'กรุณาเลือกคำนำหน้า';
    if (!form.first_name.trim()) errs.first_name = 'กรุณากรอกชื่อ';
    if (!form.last_name.trim()) errs.last_name = 'กรุณากรอกนามสกุล';
    if (!form.phone_number.trim()) errs.phone_number = 'กรุณากรอกเบอร์โทรศัพท์';
    else if (!/^[0-9]{9,10}$/.test(form.phone_number.trim())) errs.phone_number = 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (10 หลัก)';
    if (!form.user_role) errs.user_role = 'กรุณาเลือกบทบาท';
    if (!form.birth_date) errs.birth_date = 'กรุณากรอกวันเกิด';
    else if (new Date(form.birth_date) > new Date()) errs.birth_date = 'วันเกิดต้องไม่เกินวันที่ปัจจุบัน';
    if (!form.house_no.trim()) errs.house_no = 'กรุณากรอกบ้านเลขที่';
    if (form.village_no.trim() && !/^[0-9]+$/.test(form.village_no.trim())) errs.village_no = 'หมู่ที่ต้องเป็นตัวเลขเท่านั้น';
    if (!form.sub_district.trim()) errs.sub_district = 'กรุณากรอกตำบล/แขวง';
    if (!form.district.trim()) errs.district = 'กรุณากรอกอำเภอ/เขต';
    if (!form.province.trim()) errs.province = 'กรุณากรอกจังหวัด';
    if (!form.post_code.trim()) errs.post_code = 'กรุณากรอกรหัสไปรษณีย์';
    else if (!/^[0-9]{5}$/.test(form.post_code.trim())) errs.post_code = 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        username: form.username.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone_number: form.phone_number.trim(),
      };
      if (isEditing) {
        delete payload.password;
        await api.put(`/users/${editUser.user_id}`, payload);
      } else {
        const res = await api.post('/users', payload);
        const newUserId = res.data.data?.user_id;
        if (newUserId && contacts.length > 0) {
          for (const c of contacts) {
            await api.post('/emergency-contacts', { ...c, user_id: newUserId });
          }
        }
      }
      setShowModal(false);
      await fetchUsers(pagination.page, search);
    } catch (err) {
      const msg = err.response?.data?.message || 'เกิดข้อผิดพลาด';
      if (err.response?.data?.errors) {
        const serverErrors = {};
        err.response.data.errors.forEach(e => { serverErrors[e.field] = e.message; });
        setFormErrors(serverErrors);
      } else {
        setFormErrors({ _general: msg });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/users/${deleteTarget.user_id}`);
      setDeleteTarget(null);
      fetchUsers(pagination.page, search);
    } catch (err) {
      alert(err.response?.data?.message || 'ไม่สามารถลบผู้ใช้ได้');
      setDeleteTarget(null);
    }
  };

  const handlePwSubmit = () => {
    const p = newPassword.trim();
    if (!p) { setFormErrors(prev => ({ ...prev, newPassword: 'กรุณากรอกรหัสผ่านใหม่' })); return; }
    if (p.length < 4) { setFormErrors(prev => ({ ...prev, newPassword: 'รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร' })); return; }
    if (p !== confirmPassword.trim()) { setFormErrors(prev => ({ ...prev, confirmPassword: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' })); return; }
    setShowPwConfirm(true);
  };

  const handlePwConfirm = async () => {
    setPwChangeSaving(true);
    try {
      await api.put(`/users/${editUser.user_id}/change-password`, { new_password: newPassword.trim() });
      setShowPwConfirm(false);
      setShowPwChange(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      alert(err.response?.data?.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      setShowPwConfirm(false);
    } finally {
      setPwChangeSaving(false);
    }
  };

  const roleLabel = (role) => {
    const r = ROLE_OPTIONS.find(o => o.value === role);
    return r ? r.label : role;
  };

  const getDisplayPageNumbers = () => {
    const total = pagination.totalPages;
    const cur = pagination.page;
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    if (cur <= 3) return [1, 2, 3, 4, 5].filter(n => n <= total);
    if (cur >= total - 2) return [total - 4, total - 3, total - 2, total - 1, total].filter(n => n >= 1);
    return [cur - 2, cur - 1, cur, cur + 1, cur + 2];
  };

  const handleFormChange = (name, value) => {
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleErrorClear = (name) => {
    setFormErrors(prev => ({ ...prev, [name]: '' }));
  };

  const togglePassword = () => setShowPassword(prev => !prev);

  const openContactForm = (contact) => {
    if (contact) {
      setContactForm({
        perfix: contact.perfix || '',
        frist_name: contact.frist_name || '',
        last_name: contact.last_name || '',
        relationship: contact.relationship || '',
        phone_num: contact.phone_num || '',
      });
      setEditingContactId(contact.contact_id);
    } else {
      setContactForm({ perfix: '', frist_name: '', last_name: '', relationship: '', phone_num: '' });
      setEditingContactId('__new__');
    }
  };

  const cancelContactForm = () => {
    setContactForm({ perfix: '', frist_name: '', last_name: '', relationship: '', phone_num: '' });
    setEditingContactId(null);
  };

  const handleContactChange = (name, value) => {
    let v = value;
    if (name === 'phone_num') v = value.replace(/[^0-9]/g, '').slice(0, 10);
    setContactForm(prev => ({ ...prev, [name]: v }));
  };

  const saveContactApi = async () => {
    const contactData = { ...contactForm, user_id: editUser.user_id };
    if (editingContactId && editingContactId !== '__new__') {
      await api.put(`/emergency-contacts/${editingContactId}`, contactForm);
    } else {
      await api.post('/emergency-contacts', contactData);
    }
    await fetchContacts(editUser.user_id);
  };

  const handleContactSave = async () => {
    if (!contactForm.frist_name.trim() || !contactForm.last_name.trim() || !contactForm.relationship.trim() || !contactForm.phone_num.trim()) {
      return;
    }
    setContactSaving(true);
    try {
      if (isEditing) {
        await saveContactApi();
      } else {
        const newContact = { ...contactForm, contact_id: `_new_${Date.now()}` };
        if (editingContactId && editingContactId !== '__new__') {
          setContacts(prev => prev.map(c => c.contact_id === editingContactId ? { ...newContact, contact_id: editingContactId } : c));
        } else {
          setContacts(prev => [...prev, newContact]);
        }
      }
      cancelContactForm();
    } catch (err) {
      alert(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setContactSaving(false);
    }
  };

  const handleContactDelete = async (contactId) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะลบผู้ติดต่อฉุกเฉินนี้?')) return;
    try {
      if (isEditing) {
        await api.delete(`/emergency-contacts/${contactId}`);
        fetchContacts(editUser.user_id);
      } else {
        setContacts(prev => prev.filter(c => c.contact_id !== contactId));
      }
    } catch (err) {
      alert(err.response?.data?.message || 'ไม่สามารถลบได้');
    }
  };

  const renderField = (props) => (
    <FormField
      {...props}
      form={form}
      formErrors={formErrors}
      onFormChange={handleFormChange}
      onErrorClear={handleErrorClear}
      showPassword={showPassword}
      onTogglePassword={togglePassword}
      inputRef={props.name === 'first_name' ? firstInputRef : undefined}
    />
  );

  return (
    <Layout title="ผู้ใช้งาน">
      <div className="products-header">
        <div className="ph-left">
          <h2>จัดการผู้ใช้งาน</h2>
          <p>จัดการข้อมูลผู้ใช้งานทั้งหมดในระบบ</p>
        </div>
        <div className="ph-right">
          <div className="ph-stat">
            <FiUsers size={16} />
            <span>{pagination.total} คน</span>
          </div>
        </div>
      </div>

      <div className="products-toolbar">
        <div className="search-box">
          <FiSearch size={16} className="search-icon" />
          <input type="text" placeholder="ค้นหาชื่อ, ชื่อผู้ใช้ หรือเบอร์โทร..." value={search} onChange={handleSearch} />
        </div>
        <button className="btn-add" onClick={openAdd}>
          <FiPlus size={18} />
          <span>เพิ่มผู้ใช้งาน</span>
        </button>
      </div>

      <div className="table-container">
        <div className="table-scroll">
          <table className="pro-table">
            <thead>
              <tr>
                <th style={{ width: 48, textAlign: 'center' }}>#</th>
                <th style={{ minWidth: 180 }}>ชื่อ-นามสกุล</th>
                <th style={{ width: 130 }}>ชื่อผู้ใช้</th>
                <th style={{ width: 120 }}>เบอร์โทรศัพท์</th>
                <th style={{ width: 125 }}>บทบาท</th>
                <th className="col-actions" style={{ width: 90 }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <div className="table-empty"><div className="spinner" /><p>กำลังโหลดข้อมูล...</p></div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="table-empty">
                      <FiUsers size={40} />
                      <p>{search ? 'ไม่พบผู้ใช้งานที่ค้นหา' : 'ยังไม่มีผู้ใช้งานในระบบ'}</p>
                      {!search && <button className="btn-add-sm" onClick={openAdd}>เพิ่มผู้ใช้งานคนแรก</button>}
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((u, i) => (
                  <tr key={u.user_id} style={{ cursor: 'pointer' }} onClick={async () => {
                    try {
                      const res = await api.get(`/users/${u.user_id}`);
                      setDetailUser(res.data.data);
                    } catch {
                      setDetailUser(u);
                    }
                    try {
                      const res = await api.get(`/emergency-contacts/user/${u.user_id}`);
                      setDetailContacts(res.data.data || []);
                    } catch {
                      setDetailContacts([]);
                    }
                  }}>
                    <td style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: 12 }}>{(pagination.page - 1) * pagination.limit + i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 10,
                          background: u.user_role === 'admin' ? '#fef3c7' : u.user_role === 'supplier' ? '#dcfce7' : '#dbeafe',
                          color: u.user_role === 'admin' ? '#d97706' : u.user_role === 'supplier' ? '#16a34a' : '#2563eb',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: 14, flexShrink: 0,
                        }}>
                          {(u.first_name?.charAt(0) || '?').toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-700)' }}>
                            {u.prefix}{u.first_name} {u.last_name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: "'SF Mono','Consolas',monospace", fontSize: 13, color: 'var(--gray-500)' }}>{u.username}</td>
                    <td style={{ fontFamily: "'SF Mono','Consolas',monospace", fontSize: 13 }}>{u.phone_number}</td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                        background: u.user_role === 'admin' ? '#fef3c7' : u.user_role === 'supplier' ? '#f0fdf4' : '#eff6ff',
                        color: u.user_role === 'admin' ? '#d97706' : u.user_role === 'supplier' ? '#16a34a' : '#2563eb',
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: u.user_role === 'admin' ? '#d97706' : u.user_role === 'supplier' ? '#16a34a' : '#2563eb',
                        }} />
                        {roleLabel(u.user_role)}
                      </span>
                    </td>
                    <td className="col-actions">
                      <div className="action-group" onClick={e => e.stopPropagation()}>
                        <button className="tbl-action edit" onClick={() => openEdit(u)} title="แก้ไขผู้ใช้งาน">
                          <FiEdit2 size={15} />
                        </button>
                        {u.user_id !== user?.user_id && (
                          <button className="tbl-action delete" onClick={() => setDeleteTarget(u)} title="ลบผู้ใช้งาน">
                            <FiTrash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && !loading && (
          <div className="pagination">
            <div className="pagination-info">
              หน้า {pagination.page} จาก {pagination.totalPages} ({pagination.total} คน)
            </div>
            <div className="pagination-buttons">
              <button className="pagination-btn" disabled={pagination.page === 1} onClick={() => handlePageChange(1)}>«</button>
              <button className="pagination-btn" disabled={pagination.page === 1} onClick={() => handlePageChange(pagination.page - 1)}>‹</button>
              {getDisplayPageNumbers().map(p => (
                <button key={p} className={`pagination-btn ${p === pagination.page ? 'active' : ''}`} onClick={() => handlePageChange(p)}>{p}</button>
              ))}
              <button className="pagination-btn" disabled={pagination.page === pagination.totalPages} onClick={() => handlePageChange(pagination.page + 1)}>›</button>
              <button className="pagination-btn" disabled={pagination.page === pagination.totalPages} onClick={() => handlePageChange(pagination.totalPages)}>»</button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pfm-modal" onClick={e => e.stopPropagation()} style={{ width: 720 }}>
            <div className="pfm-header">
              <div className="pfm-header-left">
                <div className="pfm-header-icon"><FiUsers size={18} /></div>
                <div>
                  <h5>{isEditing ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}</h5>
                  <p>{isEditing ? 'แก้ไขข้อมูลผู้ใช้งานในระบบ' : 'กรอกข้อมูลผู้ใช้งานใหม่เพื่อเพิ่มในระบบ'}</p>
                </div>
              </div>
              <button className="pfm-close" onClick={() => setShowModal(false)}><FiX size={18} /></button>
            </div>

            {formErrors._general && (
              <div className="pfm-alert"><FiAlertTriangle size={14} />{formErrors._general}</div>
            )}

            <div className="pfm-body">
              <div className="pfm-section">
                <div className="pfm-section-title">ข้อมูลสำหรับเข้าใช้งาน</div>
                <div className="pfm-grid-2">
                  {renderField({ name: "username", label: "ชื่อผู้ใช้", required: true, mono: true, placeholder: "เช่น admin02" })}
                  <div className="pfm-field">
                    <label className="pfm-req">รหัสผ่าน</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input className="pfm-input" type="text" value={isEditing ? '********' : form.password} placeholder={isEditing ? '' : 'กรอกรหัสผ่าน'} onChange={(e) => { if (!isEditing) { handleFormChange('password', e.target.value); handleErrorClear('password'); } }} disabled={isEditing} style={isEditing ? { color: 'var(--gray-400)' } : {}} />
                      {isEditing && !showPwChange && (
                        <span onClick={() => setShowPwChange(true)} style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>เปลี่ยนรหัสผ่าน</span>
                      )}
                    </div>{formErrors.password && <div className="pfm-error">{formErrors.password}</div>}
                    {isEditing && showPwChange && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid var(--gray-200)' }}>
                        <input className="pfm-input" type="text" placeholder="รหัสผ่านใหม่" value={newPassword} onChange={e => { setNewPassword(e.target.value); setFormErrors(prev => ({ ...prev, newPassword: '', confirmPassword: '' })); }} />
                        {formErrors.newPassword && <span style={{ fontSize: 12, color: '#dc2626' }}>{formErrors.newPassword}</span>}
                        <input className="pfm-input" type="text" placeholder="ยืนยันรหัสผ่านใหม่" value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setFormErrors(prev => ({ ...prev, confirmPassword: '' })); }} />
                        {formErrors.confirmPassword && <span style={{ fontSize: 12, color: '#dc2626' }}>{formErrors.confirmPassword}</span>}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                          <button className="pfm-btn pfm-btn-cancel" style={{ padding: '6px 16px', fontSize: 12 }} onClick={() => { setShowPwChange(false); setNewPassword(''); setConfirmPassword(''); setFormErrors(prev => ({ ...prev, newPassword: '', confirmPassword: '' })); }}>ยกเลิก</button>
                          <button className="pfm-btn pfm-btn-save" style={{ padding: '6px 16px', fontSize: 12 }} onClick={handlePwSubmit}>ยืนยัน</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="pfm-section">
                <div className="pfm-section-title">ข้อมูลส่วนตัว</div>
                <div className="pfm-grid-3" style={{ gridTemplateColumns: '100px 1fr 1fr' }}>
                  {renderField({ name: "prefix", label: "คำนำหน้า", options: PREFIX_OPTIONS, required: true })}
                  {renderField({ name: "first_name", label: "ชื่อ", required: true })}
                  {renderField({ name: "last_name", label: "นามสกุล", required: true })}
                </div>
                <div className="pfm-grid-2" style={{ marginTop: 12 }}>
                  {renderField({ name: "phone_number", label: "เบอร์โทรศัพท์", required: true, mono: true, placeholder: "เช่น 0812345678" })}
                  {renderField({ name: "user_role", label: "บทบาท", options: ROLE_OPTIONS, required: true })}
                </div>
                <div className="pfm-grid-2" style={{ marginTop: 12 }}>
                  {renderField({ name: "birth_date", label: "วันเกิด", type: "date", required: true })}
                </div>
              </div>

              <div className="pfm-section">
                <div className="pfm-section-title">ที่อยู่</div>
                <div className="pfm-grid-2">
                  {renderField({ name: "house_no", label: "บ้านเลขที่", required: true, placeholder: "เช่น 123/45" })}
                  {renderField({ name: "village_no", label: "หมู่ที่", placeholder: "เช่น 3" })}
                </div>
                <div className="pfm-grid-2" style={{ marginTop: 12 }}>
                  {renderField({ name: "alley", label: "ซอย", placeholder: "เช่น สุขุมวิท 23" })}
                  {renderField({ name: "road", label: "ถนน", placeholder: "เช่น สุขุมวิท" })}
                </div>
                <div className="pfm-grid-3" style={{ marginTop: 12 }}>
                  {renderField({ name: "sub_district", label: "ตำบล/แขวง", required: true, placeholder: "เช่น คลองเตย" })}
                  {renderField({ name: "district", label: "อำเภอ/เขต", required: true, placeholder: "เช่น วัฒนา" })}
                  {renderField({ name: "province", label: "จังหวัด", required: true, placeholder: "เช่น กรุงเทพฯ" })}
                </div>
                <div className="pfm-grid-2" style={{ marginTop: 12 }}>
                  {renderField({ name: "post_code", label: "รหัสไปรษณีย์", required: true, mono: true, placeholder: "เช่น 10110" })}
                </div>
              </div>

              <div className="pfm-section">
                  <div className="pfm-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>ผู้ติดต่อฉุกเฉิน</span>
                    {editingContactId === null && (
                      <button className="pfm-btn-sm" onClick={() => openContactForm(null)}>+ เพิ่ม</button>
                    )}
                  </div>

                  {contacts.map(c => (
                    <div key={c.contact_id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', background: 'var(--gray-50)', borderRadius: 8,
                      marginBottom: 6,
                    }}>
                      {editingContactId === c.contact_id ? (
                        <div style={{ flex: 1 }}>
                          <div className="pfm-grid-3" style={{ gridTemplateColumns: '90px 1fr 1fr', gap: 8 }}>
                            <select className="pfm-input" value={contactForm.perfix} onChange={e => handleContactChange('perfix', e.target.value)}>
                              <option value="">คำนำหน้า</option>
                              {PREFIX_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <input className="pfm-input" placeholder="ชื่อ" value={contactForm.frist_name} onChange={e => handleContactChange('frist_name', e.target.value)} />
                            <input className="pfm-input" placeholder="นามสกุล" value={contactForm.last_name} onChange={e => handleContactChange('last_name', e.target.value)} />
                          </div>
                          <div className="pfm-grid-2" style={{ gap: 8, marginTop: 6 }}>
                            <input className="pfm-input" placeholder="ความสัมพันธ์" value={contactForm.relationship} onChange={e => handleContactChange('relationship', e.target.value)} />
                            <input className="pfm-input" placeholder="เบอร์โทรศัพท์" value={contactForm.phone_num} onChange={e => handleContactChange('phone_num', e.target.value)} inputMode="numeric" />
                          </div>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                            <button className="pfm-btn pfm-btn-cancel" style={{ padding: '4px 12px', fontSize: 12 }} onClick={cancelContactForm}>ยกเลิก</button>
                            <button className="pfm-btn pfm-btn-save" style={{ padding: '4px 12px', fontSize: 12 }} onClick={handleContactSave} disabled={contactSaving}>
                              {contactSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{
                            width: 34, height: 34, borderRadius: 10,
                            background: '#f0fdf4', color: '#16a34a',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: 14, flexShrink: 0,
                          }}>
                            {(c.frist_name?.charAt(0) || '?').toUpperCase()}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-700)' }}>
                              {c.perfix}{c.frist_name} {c.last_name}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--gray-400)', display: 'flex', gap: 12, marginTop: 1 }}>
                              <span>{c.relationship}</span>
                              <span>{c.phone_num}</span>
                            </div>
                          </div>
                          <div className="action-group" style={{ gap: 4 }}>
                            <button className="tbl-action edit" onClick={() => openContactForm(c)} title="แก้ไข"><FiEdit2 size={13} /></button>
                            <button className="tbl-action delete" onClick={() => handleContactDelete(c.contact_id)} title="ลบ"><FiTrash2 size={13} /></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {editingContactId === '__new__' && (
                    <div style={{
                      padding: '12px', background: 'var(--gray-50)', borderRadius: 8,
                      marginBottom: 6, border: '1px dashed var(--gray-300)',
                    }}>
                      <div className="pfm-grid-3" style={{ gridTemplateColumns: '90px 1fr 1fr', gap: 8 }}>
                        <select className="pfm-input" value={contactForm.perfix} onChange={e => handleContactChange('perfix', e.target.value)}>
                          <option value="">คำนำหน้า</option>
                          {PREFIX_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <input className="pfm-input" placeholder="ชื่อ" value={contactForm.frist_name} onChange={e => handleContactChange('frist_name', e.target.value)} />
                        <input className="pfm-input" placeholder="นามสกุล" value={contactForm.last_name} onChange={e => handleContactChange('last_name', e.target.value)} />
                      </div>
                      <div className="pfm-grid-2" style={{ gap: 8, marginTop: 6 }}>
                        <input className="pfm-input" placeholder="ความสัมพันธ์" value={contactForm.relationship} onChange={e => handleContactChange('relationship', e.target.value)} />
                        <input className="pfm-input" placeholder="เบอร์โทรศัพท์" value={contactForm.phone_num} onChange={e => handleContactChange('phone_num', e.target.value)} inputMode="numeric" />
                      </div>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                        <button className="pfm-btn pfm-btn-cancel" style={{ padding: '4px 12px', fontSize: 12 }} onClick={cancelContactForm}>ยกเลิก</button>
                        <button className="pfm-btn pfm-btn-save" style={{ padding: '4px 12px', fontSize: 12 }} onClick={handleContactSave} disabled={contactSaving}>
                          {contactSaving ? 'กำลังบันทึก...' : 'เพิ่ม'}
                        </button>
                      </div>
                    </div>
                  )}

                  {contacts.length === 0 && editingContactId === null && (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                      ยังไม่มีผู้ติดต่อฉุกเฉิน
                    </div>
                  )}
                </div>
            </div>

            <div style={{ padding: '0 24px 20px' }}>
              <div className="pfm-footer">
                <button className="pfm-btn pfm-btn-cancel" onClick={() => setShowModal(false)}>ยกเลิก</button>
                <button className="pfm-btn pfm-btn-save" onClick={handleSave} disabled={saving}>
                  {saving ? <span className="pfm-spinner" /> : <FiCheck size={16} />}
                  {isEditing ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ใช้งาน'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        show={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="ยืนยันการลบผู้ใช้งาน"
        message={`คุณแน่ใจหรือไม่ว่าจะลบ "${deleteTarget?.prefix}${deleteTarget?.first_name} ${deleteTarget?.last_name}"\n(${deleteTarget?.username})\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`}
        confirmText="ลบผู้ใช้งาน"
        cancelText="ยกเลิก"
        danger
      />

      <ConfirmModal
        show={showPwConfirm}
        onClose={() => setShowPwConfirm(false)}
        onConfirm={handlePwConfirm}
        title="ยืนยันการเปลี่ยนรหัสผ่าน"
        message={`คุณแน่ใจหรือไม่ที่จะเปลี่ยนรหัสผ่านของ "${editUser?.prefix}${editUser?.first_name} ${editUser?.last_name}"`}
        confirmText="เปลี่ยนรหัสผ่าน"
        cancelText="ยกเลิก"
        danger={false}
        loading={pwChangeSaving}
      />

      {detailUser && (
        <div className="modal-overlay" onClick={() => setDetailUser(null)} style={{ animation: 'fadeIn 0.15s ease' }}>
          <div className="ud-modal" onClick={e => e.stopPropagation()}>
            <button className="cfm-close" onClick={() => setDetailUser(null)}><FiX size={18} /></button>

            <div className="ud-hero" style={{
              background: detailUser.user_role === 'admin' ? 'linear-gradient(135deg,#f59e0b,#d97706)' : detailUser.user_role === 'supplier' ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'linear-gradient(135deg,#3b82f6,#2563eb)',
            }}>
              <div className="ud-avatar">
                {(detailUser.first_name?.charAt(0) || '?').toUpperCase()}
              </div>
              <h2 className="ud-name">{detailUser.prefix}{detailUser.first_name} {detailUser.last_name}</h2>
              <div className="ud-badge">{roleLabel(detailUser.user_role)}</div>
              <div className="ud-id">{detailUser.user_id}</div>
            </div>

            <div className="ud-body">
              <div className="ud-section">
                <div className="ud-section-title"><FiUser size={14} /> ข้อมูลส่วนตัว</div>
                <div className="ud-grid">
                  <div className="ud-field">
                    <span className="ud-label">คำนำหน้า</span>
                    <span className="ud-value">{detailUser.prefix || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">ชื่อ</span>
                    <span className="ud-value">{detailUser.first_name || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">นามสกุล</span>
                    <span className="ud-value">{detailUser.last_name || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">ชื่อผู้ใช้</span>
                    <span className="ud-value ud-mono">{detailUser.username || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label"><FiPhone size={12} /> เบอร์โทรศัพท์</span>
                    <span className="ud-value ud-mono">{detailUser.phone_number || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label"><FiCalendar size={12} /> วันเกิด</span>
                    <span className="ud-value">{detailUser.birth_date ? fmtThaiDate(new Date(detailUser.birth_date)) : '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">อายุ</span>
                    <span className="ud-value">{detailUser.birth_date ? (() => { const b = new Date(detailUser.birth_date); const n = new Date(); let age = n.getFullYear() - b.getFullYear(); const m = n.getMonth() - b.getMonth(); if (m < 0 || (m === 0 && n.getDate() < b.getDate())) age--; return `${age} ปี`; })() : '-'}</span>
                  </div>
                </div>
              </div>

              <div className="ud-section">
                <div className="ud-section-title"><FiHome size={14} /> ที่อยู่</div>
                <div className="ud-grid">
                  <div className="ud-field">
                    <span className="ud-label">บ้านเลขที่</span>
                    <span className="ud-value">{detailUser.house_no || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">หมู่ที่</span>
                    <span className="ud-value">{detailUser.village_no || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">ซอย</span>
                    <span className="ud-value">{detailUser.alley || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">ถนน</span>
                    <span className="ud-value">{detailUser.road || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">ตำบล/แขวง</span>
                    <span className="ud-value">{detailUser.sub_district || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">อำเภอ/เขต</span>
                    <span className="ud-value">{detailUser.district || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">จังหวัด</span>
                    <span className="ud-value">{detailUser.province || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label"><FiMapPin size={12} /> รหัสไปรษณีย์</span>
                    <span className="ud-value ud-mono">{detailUser.post_code || '-'}</span>
                  </div>
                </div>
              </div>
            <div className="ud-section">
                <div className="ud-section-title"><FiPhone size={14} /> ผู้ติดต่อฉุกเฉิน</div>
                {detailContacts.length === 0 ? (
                  <div className="ud-value" style={{ fontSize: 13, color: '#94a3b8' }}>ไม่มีผู้ติดต่อฉุกเฉิน</div>
                ) : (
                  detailContacts.map(c => (
                    <div key={c.contact_id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', background: 'var(--gray-50)', borderRadius: 8,
                      marginBottom: 6,
                    }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: 10,
                        background: '#f0fdf4', color: '#16a34a',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 14, flexShrink: 0,
                      }}>
                        {(c.frist_name?.charAt(0) || '?').toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-700)' }}>
                          {c.perfix}{c.frist_name} {c.last_name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--gray-400)', display: 'flex', gap: 12, marginTop: 1 }}>
                          <span>{c.relationship}</span>
                          <span>{c.phone_num}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="ud-footer">
              <FiClock size={13} />
              <span>เพิ่มเมื่อ {detailUser.created_at ? fmtThaiDateTime(new Date(detailUser.created_at)) : '-'}</span>
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
};

export default UsersPage;
