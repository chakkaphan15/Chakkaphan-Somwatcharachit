import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Layout from '../components/layout/Layout';
import { FiHome, FiEdit2, FiX, FiAlertTriangle, FiCheck, FiMapPin, FiPhone, FiFileText } from 'react-icons/fi';

const CompanyProfilePage = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({ company_name: '', tax_id: '', address: '', phone_number: '' });

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get('/company');
      setProfile(res.data.data || null);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfile(); }, []);

  const openEdit = () => {
    setForm({
      company_name: profile?.company_name || '',
      tax_id: profile?.tax_id || '',
      address: profile?.address || '',
      phone_number: profile?.phone_number || ''
    });
    setFormError('');
    setFieldErrors({});
    setShowModal(true);
  };

  const setF = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setFieldErrors(prev => (prev[field] ? { ...prev, [field]: '' } : prev));
  };

  const handleSave = async () => {
    const errs = {};
    if (!form.company_name.trim()) errs.company_name = 'กรุณากรอกชื่อร้าน/บริษัท';
    if (!form.tax_id.trim()) errs.tax_id = 'กรุณากรอกเลขประจำตัวผู้เสียภาษี';
    if (!form.address.trim()) errs.address = 'กรุณากรอกที่อยู่';
    if (!form.phone_number.trim()) errs.phone_number = 'กรุณากรอกเบอร์โทรศัพท์';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) { setFormError(''); return; }

    setSaving(true);
    setFormError('');
    try {
      await api.put('/company', form);
      setShowModal(false);
      await fetchProfile();
    } catch (err) {
      setFormError(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout title="ข้อมูลร้าน/บริษัท">
      <div className="products-header">
        <div className="ph-left">
          <h2>ข้อมูลร้าน/บริษัท</h2>
          <p>ข้อมูลกลางของร้าน ใช้แสดงอัตโนมัติในใบสั่งซื้อ (PO) ทุกครั้งที่สร้างใหม่</p>
        </div>
        <div className="ph-right">
          <button className="btn-add" onClick={openEdit}>
            <FiEdit2 size={16} />
            <span>แก้ไขข้อมูล</span>
          </button>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div className="table-empty">
            <div className="spinner" />
            <p>กำลังโหลดข้อมูล...</p>
          </div>
        ) : (
          <div className="ud-body" style={{ padding: 24 }}>
            <div className="ud-section">
              <div className="ud-section-title"><FiHome size={14} /> ข้อมูลร้าน/บริษัท</div>
              <div className="ud-grid">
                <div className="ud-field">
                  <span className="ud-label">ชื่อร้าน / บริษัท</span>
                  <span className="ud-value">{profile?.company_name || <span className="null-val">ยังไม่ได้ตั้งค่า</span>}</span>
                </div>
                <div className="ud-field">
                  <span className="ud-label"><FiFileText size={12} /> เลขประจำตัวผู้เสียภาษี</span>
                  <span className="ud-value">{profile?.tax_id || <span className="null-val">-</span>}</span>
                </div>
                <div className="ud-field">
                  <span className="ud-label"><FiMapPin size={12} /> ที่อยู่</span>
                  <span className="ud-value">{profile?.address || <span className="null-val">-</span>}</span>
                </div>
                <div className="ud-field">
                  <span className="ud-label"><FiPhone size={12} /> เบอร์โทรศัพท์</span>
                  <span className="ud-value">{profile?.phone_number || <span className="null-val">-</span>}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pfm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="pfm-header">
              <div className="pfm-header-left">
                <div className="pfm-header-icon"><FiHome size={20} /></div>
                <div>
                  <h3>แก้ไขข้อมูลร้าน/บริษัท</h3>
                </div>
              </div>
              <button className="pfm-close" onClick={() => setShowModal(false)}><FiX size={20} /></button>
            </div>
            <div className="pfm-body">
              {formError && (
                <div className="pfm-alert">
                  <FiAlertTriangle size={14} />
                  {formError}
                </div>
              )}
              <div className="pfm-field">
                <label className="pfm-req">ชื่อร้าน / บริษัท</label>
                <input type="text" className="pfm-input" placeholder="ชื่อร้าน/บริษัท"
                  value={form.company_name} onChange={(e) => setF('company_name', e.target.value)} />
                {fieldErrors.company_name && <div className="pfm-error">{fieldErrors.company_name}</div>}
              </div>
              <div className="pfm-field">
                <label className="pfm-req">เลขประจำตัวผู้เสียภาษี</label>
                <input type="text" className="pfm-input" placeholder="เลขผู้เสียภาษี" maxLength={13}
                  value={form.tax_id} onChange={(e) => setF('tax_id', e.target.value.replace(/[^0-9]/g, ''))} />
                {fieldErrors.tax_id && <div className="pfm-error">{fieldErrors.tax_id}</div>}
              </div>
              <div className="pfm-field">
                <label className="pfm-req">ที่อยู่</label>
                <input type="text" className="pfm-input" placeholder="ที่อยู่ร้าน/บริษัท"
                  value={form.address} onChange={(e) => setF('address', e.target.value)} />
                {fieldErrors.address && <div className="pfm-error">{fieldErrors.address}</div>}
              </div>
              <div className="pfm-field">
                <label className="pfm-req">เบอร์โทรศัพท์</label>
                <input type="text" className="pfm-input" placeholder="เบอร์โทรศัพท์" maxLength={10}
                  value={form.phone_number} onChange={(e) => setF('phone_number', e.target.value.replace(/[^0-9]/g, ''))} />
                {fieldErrors.phone_number && <div className="pfm-error">{fieldErrors.phone_number}</div>}
              </div>
            </div>
            <div className="pfm-footer">
              <button className="pfm-btn pfm-btn-cancel" onClick={() => setShowModal(false)} disabled={saving}>ยกเลิก</button>
              <button className="pfm-btn pfm-btn-save" onClick={handleSave} disabled={saving}>
                {saving ? 'กำลังบันทึก...' : (<><FiCheck size={16} /> บันทึก</>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default CompanyProfilePage;
