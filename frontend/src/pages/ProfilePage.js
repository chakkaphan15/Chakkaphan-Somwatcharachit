import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Layout from '../components/layout/Layout';
import {
  FiUser, FiEdit2, FiCheck, FiAlertTriangle, FiLock,
  FiPhone, FiCalendar, FiHome, FiCreditCard, FiEye, FiEyeOff
} from 'react-icons/fi';

const PREFIX_OPTIONS = ['นาย', 'นาง', 'นางสาว'];

const roleLabel = (role) => role === 'admin' ? 'ผู้ดูแลระบบ' : role === 'supplier' ? 'ช่าง' : 'พนักงาน';

const emptyForm = {
  prefix: '', first_name: '', last_name: '', phone_number: '', birth_date: '',
  house_no: '', village_no: '', alley: '', road: '', sub_district: '', district: '', province: '', post_code: ''
};

const emptyPwForm = { current_password: '', new_password: '', confirm_password: '' };

const PasswordInput = ({ value, onChange, autoComplete }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={visible ? 'text' : 'password'}
        className="pfm-input"
        style={{ paddingRight: 38 }}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        title={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#64748b',
          display: 'flex', alignItems: 'center',
        }}
      >
        {visible ? <FiEyeOff size={16} /> : <FiEye size={16} />}
      </button>
    </div>
  );
};

const ProfilePage = () => {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  const [pwForm, setPwForm] = useState(emptyPwForm);
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccessOpen, setPwSuccessOpen] = useState(false);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get('/auth/me');
      setProfile(res.data.data);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfile(); }, []);

  const setF = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const setPw = (field, value) => setPwForm(prev => ({ ...prev, [field]: value }));

  const openEdit = () => {
    setForm({
      prefix: profile?.prefix || '',
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      phone_number: profile?.phone_number || '',
      birth_date: profile?.birth_date ? String(profile.birth_date).split('T')[0] : '',
      house_no: profile?.house_no || '',
      village_no: profile?.village_no || '',
      alley: profile?.alley || '',
      road: profile?.road || '',
      sub_district: profile?.sub_district || '',
      district: profile?.district || '',
      province: profile?.province || '',
      post_code: profile?.post_code || ''
    });
    setFormError('');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setFormError('');
  };

  const handleSave = async () => {
    if (!form.first_name.trim()) { setFormError('กรุณากรอกชื่อ'); return; }
    if (!form.last_name.trim()) { setFormError('กรุณากรอกนามสกุล'); return; }
    if (!/^[0-9]{9,10}$/.test(form.phone_number)) { setFormError('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (9-10 หลัก)'); return; }

    setSaving(true);
    setFormError('');
    try {
      await api.put('/users/me', form);
      await fetchProfile();
      await refreshUser();
      setIsEditing(false);
      setSaveResult({ type: 'success' });
    } catch (err) {
      setSaveResult({ type: 'error', message: err.response?.data?.message || 'เกิดข้อผิดพลาด' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pwForm.current_password) { setPwError('กรุณากรอกรหัสผ่านปัจจุบัน'); return; }
    if (!pwForm.new_password || pwForm.new_password.length < 4) { setPwError('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร'); return; }
    if (pwForm.new_password !== pwForm.confirm_password) { setPwError('ยืนยันรหัสผ่านใหม่ไม่ตรงกัน'); return; }

    setPwSaving(true);
    setPwError('');
    try {
      await api.put('/users/change-password/me', {
        old_password: pwForm.current_password,
        new_password: pwForm.new_password
      });
      setPwForm(emptyPwForm);
      setPwSuccessOpen(true);
    } catch (err) {
      setPwError(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setPwSaving(false);
    }
  };

  const userInitial = (profile?.fullname || profile?.username || user?.username || 'U').charAt(0).toUpperCase();
  const addressText = [
    profile?.house_no, profile?.village_no ? `หมู่ ${profile.village_no}` : '', profile?.alley ? `ซ.${profile.alley}` : '',
    profile?.road ? `ถ.${profile.road}` : '', profile?.sub_district ? `ต.${profile.sub_district}` : '',
    profile?.district ? `อ.${profile.district}` : '', profile?.province ? `จ.${profile.province}` : '', profile?.post_code
  ].filter(Boolean).join(' ');

  return (
    <Layout title="โปรไฟล์ของฉัน">
      {loading ? (
        <div className="table-empty">
          <div className="spinner" />
          <p>กำลังโหลดข้อมูล...</p>
        </div>
      ) : (
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div
            style={{
              background: 'linear-gradient(135deg,#11408c,#1d6fd6)', color: '#fff', borderRadius: 12, padding: '14px 20px',
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', boxShadow: '0 2px 8px rgba(15,23,42,0.12)', marginBottom: 14,
            }}
          >
            <div
              style={{
                width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, flexShrink: 0,
              }}
            >
              {userInitial}
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{profile?.fullname || profile?.username}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 999, padding: '1px 10px', fontSize: 12, fontWeight: 600 }}>
                  {roleLabel(profile?.user_role)}
                </span>
                <span style={{ fontSize: 13, opacity: 0.85 }}>@{profile?.username}</span>
              </div>
            </div>
            {!isEditing && (
              <button
                onClick={openEdit}
                title="แก้ไข"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                  background: '#fff', color: '#11408c', border: 'none', fontWeight: 600, fontSize: 13.5,
                }}
              >
                <FiEdit2 size={14} /> แก้ไขข้อมูล
              </button>
            )}
          </div>

          <div className="row g-3">
            <div className="col-12 col-lg-7">
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.06)', height: '100%' }}>
            <div className="ud-section" style={{ marginBottom: 0 }}>
              <div className="ud-section-title" style={{ display: 'flex', fontSize: 13, color: '#11408c' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FiUser size={14} /> ข้อมูลส่วนตัว</span>
              </div>

              {formError && (
                <div className="pfm-alert">
                  <FiAlertTriangle size={14} />
                  {formError}
                </div>
              )}

              {!isEditing ? (
                <div className="ud-grid">
                  <div className="ud-field">
                    <span className="ud-label">คำนำหน้า</span>
                    <span className="ud-value">{profile?.prefix || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label">ชื่อ-นามสกุล</span>
                    <span className="ud-value">{profile?.first_name} {profile?.last_name}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label"><FiPhone size={11} /> เบอร์โทรศัพท์</span>
                    <span className="ud-value">{profile?.phone_number || '-'}</span>
                  </div>
                  <div className="ud-field">
                    <span className="ud-label"><FiCalendar size={11} /> วันเกิด</span>
                    <span className="ud-value">{profile?.birth_date ? String(profile.birth_date).split('T')[0] : '-'}</span>
                  </div>
                  <div className="ud-field" style={{ gridColumn: '1 / -1' }}>
                    <span className="ud-label"><FiHome size={11} /> ที่อยู่</span>
                    <span className="ud-value">{addressText || '-'}</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="pfm-grid-3" style={{ gridTemplateColumns: '100px 1fr 1fr' }}>
                    <div className="pfm-field">
                      <label>คำนำหน้า</label>
                      <select className="pfm-input" value={form.prefix} onChange={(e) => setF('prefix', e.target.value)}>
                        <option value="">-</option>
                        {PREFIX_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="pfm-field">
                      <label className="pfm-req">ชื่อ</label>
                      <input className="pfm-input" value={form.first_name} onChange={(e) => setF('first_name', e.target.value)} />
                    </div>
                    <div className="pfm-field">
                      <label className="pfm-req">นามสกุล</label>
                      <input className="pfm-input" value={form.last_name} onChange={(e) => setF('last_name', e.target.value)} />
                    </div>
                  </div>
                  <div className="pfm-grid-2" style={{ marginTop: 12 }}>
                    <div className="pfm-field">
                      <label className="pfm-req">เบอร์โทรศัพท์</label>
                      <input className="pfm-input" maxLength={10} value={form.phone_number}
                        onChange={(e) => setF('phone_number', e.target.value.replace(/[^0-9]/g, ''))} />
                    </div>
                    <div className="pfm-field">
                      <label>วันเกิด</label>
                      <input type="date" className="pfm-input" value={form.birth_date} onChange={(e) => setF('birth_date', e.target.value)} />
                    </div>
                  </div>
                  <div className="pfm-grid-2" style={{ marginTop: 12 }}>
                    <div className="pfm-field">
                      <label>บ้านเลขที่</label>
                      <input className="pfm-input" value={form.house_no} onChange={(e) => setF('house_no', e.target.value)} />
                    </div>
                    <div className="pfm-field">
                      <label>หมู่ที่</label>
                      <input className="pfm-input" value={form.village_no} onChange={(e) => setF('village_no', e.target.value.replace(/[^0-9]/g, ''))} />
                    </div>
                  </div>
                  <div className="pfm-grid-2" style={{ marginTop: 12 }}>
                    <div className="pfm-field">
                      <label>ซอย</label>
                      <input className="pfm-input" value={form.alley} onChange={(e) => setF('alley', e.target.value)} />
                    </div>
                    <div className="pfm-field">
                      <label>ถนน</label>
                      <input className="pfm-input" value={form.road} onChange={(e) => setF('road', e.target.value)} />
                    </div>
                  </div>
                  <div className="pfm-grid-3" style={{ marginTop: 12 }}>
                    <div className="pfm-field">
                      <label>ตำบล/แขวง</label>
                      <input className="pfm-input" value={form.sub_district} onChange={(e) => setF('sub_district', e.target.value)} />
                    </div>
                    <div className="pfm-field">
                      <label>อำเภอ/เขต</label>
                      <input className="pfm-input" value={form.district} onChange={(e) => setF('district', e.target.value)} />
                    </div>
                    <div className="pfm-field">
                      <label>จังหวัด</label>
                      <input className="pfm-input" value={form.province} onChange={(e) => setF('province', e.target.value)} />
                    </div>
                  </div>
                  <div className="pfm-grid-2" style={{ marginTop: 12 }}>
                    <div className="pfm-field">
                      <label>รหัสไปรษณีย์</label>
                      <input className="pfm-input" maxLength={5} value={form.post_code} onChange={(e) => setF('post_code', e.target.value.replace(/[^0-9]/g, ''))} />
                    </div>
                  </div>

                  <div className="pfm-footer" style={{ padding: '16px 0 0' }}>
                    <button className="pfm-btn pfm-btn-cancel" onClick={cancelEdit} disabled={saving}>ยกเลิก</button>
                    <button className="pfm-btn pfm-btn-save" onClick={handleSave} disabled={saving}>
                      {saving ? 'กำลังบันทึก...' : (<><FiCheck size={16} /> บันทึก</>)}
                    </button>
                  </div>
                </>
              )}
            </div>
              </div>
            </div>

            <div className="col-12 col-lg-5">
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 3px rgba(15,23,42,0.06)', height: '100%' }}>
            <div className="ud-section" style={{ marginBottom: 0 }}>
              <div className="ud-section-title" style={{ fontSize: 13, color: '#11408c' }}><FiLock size={14} /> ความปลอดภัย</div>

              {pwError && (
                <div className="pfm-alert">
                  <FiAlertTriangle size={14} />
                  {pwError}
                </div>
              )}

              <div className="pfm-field">
                <label className="pfm-req">รหัสผ่านปัจจุบัน</label>
                <PasswordInput value={pwForm.current_password}
                  onChange={(e) => setPw('current_password', e.target.value)} autoComplete="current-password" />
              </div>
              <div className="pfm-grid-2" style={{ marginTop: 12 }}>
                <div className="pfm-field">
                  <label className="pfm-req"><FiCreditCard size={11} /> รหัสผ่านใหม่</label>
                  <PasswordInput value={pwForm.new_password}
                    onChange={(e) => setPw('new_password', e.target.value)} autoComplete="new-password" />
                </div>
                <div className="pfm-field">
                  <label className="pfm-req">ยืนยันรหัสผ่านใหม่</label>
                  <PasswordInput value={pwForm.confirm_password}
                    onChange={(e) => setPw('confirm_password', e.target.value)} autoComplete="new-password" />
                </div>
              </div>
              <div className="pfm-footer" style={{ padding: '16px 0 0', justifyContent: 'flex-start' }}>
                <button className="pfm-btn pfm-btn-save" onClick={handleChangePassword} disabled={pwSaving}>
                  {pwSaving ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
                </button>
              </div>
            </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {pwSuccessOpen && (
        <div
          onClick={() => setPwSuccessOpen(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 14, padding: '28px 32px', width: 'calc(100% - 32px)', maxWidth: 360,
              textAlign: 'center', boxShadow: '0 10px 30px rgba(15,23,42,0.25)',
            }}
          >
            <div
              style={{
                width: 60, height: 60, borderRadius: '50%', background: '#dcfce7', color: '#16a34a',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
              }}
            >
              <FiCheck size={32} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>เปลี่ยนรหัสผ่านสำเร็จ</div>
            <div style={{ fontSize: 13.5, color: '#64748b', marginBottom: 20 }}>รหัสผ่านของคุณถูกเปลี่ยนเรียบร้อยแล้ว</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="pfm-btn pfm-btn-save" onClick={() => setPwSuccessOpen(false)} autoFocus>ตกลง</button>
            </div>
          </div>
        </div>
      )}
      {saveResult && (
        <div
          onClick={() => setSaveResult(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 14, padding: '28px 32px', width: 'calc(100% - 32px)', maxWidth: 360,
              textAlign: 'center', boxShadow: '0 10px 30px rgba(15,23,42,0.25)',
            }}
          >
            <div
              style={{
                width: 60, height: 60, borderRadius: '50%', margin: '0 auto 14px',
                background: saveResult.type === 'success' ? '#dcfce7' : '#fee2e2',
                color: saveResult.type === 'success' ? '#16a34a' : '#dc2626',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {saveResult.type === 'success' ? <FiCheck size={32} /> : <FiAlertTriangle size={30} />}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
              {saveResult.type === 'success' ? 'บันทึกข้อมูลสำเร็จ' : 'บันทึกข้อมูลไม่สำเร็จ'}
            </div>
            <div style={{ fontSize: 13.5, color: '#64748b', marginBottom: 20 }}>
              {saveResult.type === 'success' ? 'ข้อมูลโปรไฟล์ของคุณถูกบันทึกเรียบร้อยแล้ว' : saveResult.message}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="pfm-btn pfm-btn-save" onClick={() => setSaveResult(null)} autoFocus>ตกลง</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default ProfilePage;
