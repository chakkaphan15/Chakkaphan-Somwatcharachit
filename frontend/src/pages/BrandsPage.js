import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Layout from '../components/layout/Layout';
import { FiTag, FiPlus, FiEdit2, FiTrash2, FiSearch, FiX, FiAlertTriangle, FiCheck } from 'react-icons/fi';
import ConfirmModal from '../components/ConfirmModal';

const BrandsPage = () => {
  const { user } = useAuth();
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editBrand, setEditBrand] = useState(null);
  const [formName, setFormName] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const inputRef = useRef(null);

  const isAdmin = user?.user_role === 'admin';
  const canManage = isAdmin || user?.user_role === 'employee';

  const fetchBrands = async () => {
    try {
      setLoading(true);
      const res = await api.get('/brands');
      setBrands(res.data.data || []);
    } catch {
      setBrands([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBrands(); }, []);

  const filtered = brands.filter(b =>
    b.brand_name.toLowerCase().includes(search.toLowerCase()) ||
    b.brand_id.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    if (!canManage) return;
    setEditBrand(null);
    setFormName('');
    setFormError('');
    setShowModal(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const openEdit = (brand) => {
    if (!canManage) return;
    setEditBrand(brand);
    setFormName(brand.brand_name);
    setFormError('');
    setShowModal(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSave = async () => {
    if (!canManage) return;
    const name = formName.trim();
    if (!name) {
      setFormError('กรุณากรอกชื่อแบรนด์');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editBrand) {
        await api.put(`/brands/${editBrand.brand_id}`, { brand_name: name });
      } else {
        await api.post('/brands', { brand_name: name });
      }
      setShowModal(false);
      await fetchBrands();
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
      await api.delete(`/brands/${deleteTarget.brand_id}`);
      setDeleteTarget(null);
      await fetchBrands();
    } catch (err) {
      alert(err.response?.data?.message || 'ไม่สามารถลบแบรนด์ได้');
      setDeleteTarget(null);
    }
  };

  return (
    <Layout title="แบรนด์">
      <div className="products-header">
        <div className="ph-left">
          <h2>จัดการแบรนด์</h2>
          <p>จัดการแบรนด์สินค้าทั้งหมดในระบบ</p>
        </div>
        <div className="ph-right">
          <div className="ph-stat">
            <FiTag size={16} />
            <span>{brands.length} รายการ</span>
          </div>
        </div>
      </div>

      <div className="products-toolbar">
        <div className="search-box">
          <FiSearch size={16} className="search-icon" />
          <input type="text" placeholder="ค้นหาชื่อแบรนด์หรือรหัส..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {canManage && (
          <button className="btn-add" onClick={openAdd}>
            <FiPlus size={18} />
            <span>เพิ่มแบรนด์</span>
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
                <th>ชื่อแบรนด์</th>
                {canManage && <th className="col-actions">จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canManage ? 4 : 3}>
                    <div className="table-empty">
                      <div className="spinner" />
                      <p>กำลังโหลดข้อมูล...</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 4 : 3}>
                    <div className="table-empty">
                      <FiTag size={40} />
                      <p>{search ? 'ไม่พบแบรนด์ที่ค้นหา' : 'ยังไม่มีแบรนด์ในระบบ'}</p>
                      {!search && canManage && <button className="btn-add-sm" onClick={openAdd}>เพิ่มแบรนด์แรก</button>}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((brand, index) => (
                  <tr key={brand.brand_id}>
                    <td className="col-num">{index + 1}</td>
                    <td className="col-code">{brand.brand_id}</td>
                    <td className="col-name">{brand.brand_name}</td>
                    {canManage && (
                      <td className="col-actions">
                        <div className="action-group">
                          <button className="tbl-action edit" onClick={() => openEdit(brand)} title="แก้ไขแบรนด์">
                            <FiEdit2 size={15} />
                          </button>
                          {isAdmin && (
                            <button className="tbl-action delete" onClick={() => setDeleteTarget(brand)} title="ลบแบรนด์">
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

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pfm-mini-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pfm-mini-header">
              <h5>{editBrand ? 'แก้ไขแบรนด์' : 'เพิ่มแบรนด์'}</h5>
              <button className="pfm-close" onClick={() => setShowModal(false)}>
                <FiX size={18} />
              </button>
            </div>
            <div className="pfm-mini-body">
              {formError && (
                <div className="pfm-alert" style={{ marginBottom: 16 }}>
                  <FiAlertTriangle size={14} />
                  {formError}
                </div>
              )}
              <div className="pfm-field">
                <label className="pfm-req">ชื่อแบรนด์</label>
                <input
                  ref={inputRef}
                  className="pfm-input"
                  placeholder="กรอกชื่อแบรนด์"
                  value={formName}
                  onChange={(e) => { setFormName(e.target.value); setFormError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                />
              </div>
              <div className="pfm-footer" style={{ paddingBottom: 0 }}>
                <button className="pfm-btn pfm-btn-cancel" onClick={() => setShowModal(false)}>ยกเลิก</button>
                <button className="pfm-btn pfm-btn-save" onClick={handleSave} disabled={saving}>
                  {saving ? <span className="pfm-spinner" /> : <FiCheck size={16} />}
                  {editBrand ? 'บันทึกการแก้ไข' : 'เพิ่มแบรนด์'}
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
        title="ยืนยันการลบแบรนด์"
        message={`คุณแน่ใจหรือไม่ว่าจะลบแบรนด์ "${deleteTarget?.brand_name}"?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`}
        confirmText="ลบแบรนด์"
        cancelText="ยกเลิก"
        danger
      />
    </Layout>
  );
};

export default BrandsPage;
