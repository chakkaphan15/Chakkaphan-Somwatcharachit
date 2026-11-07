import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FiX, FiPlus, FiCamera, FiPackage, FiAlertTriangle, FiCheck, FiChevronDown } from 'react-icons/fi';

const initialFormData = {
  product_name: '',
  barcode: '',
  brand_id: '',
  supp_id: '',
  model: '',
  reorder_level: '',
  product_condition: 'new',
  product_image: ''
};

const ProductFormModal = ({ show, onClose, onSave, editProduct, brands, suppliers, onBrandsChange, onSuppliersChange, nextProductId }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.user_role === 'admin';
  const [formData, setFormData] = useState(initialFormData);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const fileInputRef = useRef(null);
  const barcodeInputRef = useRef(null);

  const [brandSearch, setBrandSearch] = useState('');
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandSelected, setBrandSelected] = useState('');
  const brandRef = useRef(null);

  const [suppSearch, setSuppSearch] = useState('');
  const [suppOpen, setSuppOpen] = useState(false);
  const [suppSelected, setSuppSelected] = useState('');
  const suppRef = useRef(null);

  const [showAddBrand, setShowAddBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [addingItem, setAddingItem] = useState(false);

  useEffect(() => {
    if (!show) return;
    if (editProduct) {
      setFormData({
        product_name: editProduct.product_name || '',
        barcode: editProduct.barcode || '',
        brand_id: editProduct.brand_id || '',
        supp_id: editProduct.supp_id || '',
        model: editProduct.model || '',
        reorder_level: editProduct.reorder_level !== undefined ? String(editProduct.reorder_level) : '',
        product_condition: editProduct.product_condition || 'new',
        product_image: editProduct.product_image || ''
      });
      setBrandSelected(editProduct.brand_name || '');
      setSuppSelected(editProduct.supp_name || '');
      if (editProduct.product_image) {
        setImagePreview(`http://localhost:5000${editProduct.product_image}`);
      } else {
        setImagePreview(null);
      }
      setImageFile(null);
    } else {
      setFormData(initialFormData);
      setBrandSelected('');
      setSuppSelected('');
      setImagePreview(null);
      setImageFile(null);
    }
    setErrors({});
    setBrandSearch('');
    setSuppSearch('');
    setBrandOpen(false);
    setSuppOpen(false);
  }, [editProduct, show]);

  useEffect(() => {
    const handleClick = (e) => {
      if (brandRef.current && !brandRef.current.contains(e.target)) setBrandOpen(false);
      if (suppRef.current && !suppRef.current.contains(e.target)) setSuppOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const NUMERIC_FIELDS = { reorder_level: 0 };

  const handleNumericChange = (e) => {
    const { name, value } = e.target;
    const allowDecimal = NUMERIC_FIELDS[name];
    let cleaned;
    if (allowDecimal) {
      const parts = value.split('.');
      if (parts.length > 2) return;
      cleaned = parts.map((p, i) => i === 0 ? p.replace(/[^0-9]/g, '') : p.replace(/[^0-9]/g, '').slice(0, 2)).join('.');
      if (cleaned.startsWith('.')) cleaned = '0' + cleaned;
    } else {
      cleaned = value.replace(/[^0-9]/g, '');
    }
    setFormData(prev => ({ ...prev, [name]: cleaned }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setFormData(prev => ({ ...prev, product_image: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredBrands = brands.filter(b =>
    b.brand_name.toLowerCase().includes(brandSearch.toLowerCase())
  );

  const filteredSupps = suppliers.filter(s =>
    s.supp_name.toLowerCase().includes(suppSearch.toLowerCase())
  );

  const selectBrand = (b) => {
    setFormData(prev => ({ ...prev, brand_id: b.brand_id }));
    setBrandSelected(b.brand_name);
    setBrandSearch('');
    setBrandOpen(false);
  };

  const selectSupp = (s) => {
    setFormData(prev => ({ ...prev, supp_id: s.supp_id }));
    setSuppSelected(s.supp_name);
    setSuppSearch('');
    setSuppOpen(false);
  };

  const handleAddBrand = async () => {
    if (!newBrandName.trim()) return;
    setAddingItem(true);
    try {
      const res = await api.post('/brands', { brand_name: newBrandName.trim() });
      const newBrand = { brand_id: res.data.data.brand_id, brand_name: newBrandName.trim() };
      if (onBrandsChange) onBrandsChange([...brands, newBrand]);
      selectBrand(newBrand);
      setShowAddBrand(false);
      setNewBrandName('');
    } catch (err) {
      alert(err.response?.data?.message || 'ไม่สามารถเพิ่มแบรนด์ได้');
    } finally {
      setAddingItem(false);
    }
  };

  const goToAddSupplier = () => {
    setSuppOpen(false);
    onClose();
    navigate('/suppliers', { state: { openAddSupplier: true } });
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.product_name.trim()) newErrors.product_name = 'กรุณากรอกชื่อสินค้า';
    if (!formData.brand_id) newErrors.brand_id = 'กรุณาเลือกแบรนด์';
    if (!formData.supp_id) newErrors.supp_id = 'กรุณาเลือกผู้จำหน่าย';
    if (editProduct && isAdmin) {
      if (formData.reorder_level === '' || Number(formData.reorder_level) < 0 || !Number.isInteger(Number(formData.reorder_level))) {
        newErrors.reorder_level = 'กรุณากรอกจำนวนสต๊อกขั้นต่ำ';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('product_name', formData.product_name.trim());
      fd.append('barcode', formData.barcode.trim());
      fd.append('brand_id', formData.brand_id);
      fd.append('supp_id', formData.supp_id || '');
      fd.append('model', formData.model.trim());
      fd.append('reorder_level', formData.reorder_level || '0');
      fd.append('product_condition', formData.product_condition);
      if (imageFile) fd.append('product_image', imageFile);

      if (editProduct) {
        await api.put(`/products/${editProduct.product_id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await api.post('/products', fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      setShowAddBrand(false);
      setNewBrandName('');
      onSave({});
    } catch (err) {
      const msg = err.response?.data?.message || 'เกิดข้อผิดพลาด';
      setErrors({ form: msg });
    } finally {
      setSaving(false);
    }
  };

  const focusBarcode = () => {
    setFormData(prev => ({ ...prev, barcode: '' }));
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  };

  if (!show) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="pfm-modal" onClick={(e) => e.stopPropagation()}>
          <div className="pfm-header">
            <div className="pfm-header-left">
              <div className="pfm-header-icon">
                <FiPackage size={20} />
              </div>
              <div>
                <h5>{editProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h5>
                <p>{editProduct ? 'แก้ไขข้อมูลสินค้า #{editProduct.product_id}' : 'กรอกข้อมูลสินค้าที่ต้องการเพิ่ม'}</p>
              </div>
            </div>
            <button className="pfm-close" onClick={onClose}><FiX size={18} /></button>
          </div>

          {errors.form && (
            <div className="pfm-alert">
              <FiAlertTriangle size={16} />
              <span>{errors.form}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="pfm-body">
            <div className="pfm-section">
              <div className="pfm-section-title">ข้อมูลทั่วไป</div>
              <div className="pfm-grid-3">
                <div className="pfm-field">
                  <label>รหัสสินค้า</label>
                  <div className="pfm-id-display">
                    <FiPackage size={14} />
                    <span>{editProduct ? editProduct.product_id : nextProductId}</span>
                  </div>
                </div>
                <div className="pfm-field">
                  <label>บาร์โค้ด</label>
                  <div className="pfm-barcode-group">
                    <input type="text" ref={barcodeInputRef} name="barcode"
                      className="pfm-input pfm-input-mono"
                      placeholder="สแกนหรือป้อนบาร์โค้ด" autoComplete="off"
                      value={formData.barcode} onChange={handleChange} />
                    <button type="button" className="pfm-scan-btn" onClick={focusBarcode} title="พร้อมสแกน">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="2" y="5" width="2" height="14" rx="0.5" fill="currentColor" />
                        <rect x="5" y="4" width="2" height="16" rx="0.5" fill="currentColor" />
                        <rect x="8.5" y="6" width="1.5" height="12" rx="0.3" fill="currentColor" />
                        <rect x="11" y="3" width="2" height="18" rx="0.5" fill="currentColor" />
                        <rect x="14.5" y="7" width="1.5" height="10" rx="0.3" fill="currentColor" />
                        <rect x="17" y="5" width="2" height="14" rx="0.5" fill="currentColor" />
                        <rect x="20" y="4" width="2" height="16" rx="0.5" fill="currentColor" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="pfm-field">
                  <label className="pfm-req">ชื่อสินค้า</label>
                  <input type="text" name="product_name" className="pfm-input" placeholder="กรอกชื่อสินค้า"
                    value={formData.product_name} onChange={handleChange} maxLength={100} />
                  {errors.product_name && <div className="pfm-error">{errors.product_name}</div>}
                </div>
              </div>
            </div>

            <div className="pfm-section">
              <div className="pfm-section-title">แบรนด์และผู้จำหน่าย</div>
              <div className="pfm-grid-2">
                <div className="pfm-field">
                  <label className="pfm-req">แบรนด์</label>
                  <div className="pfm-select-group" ref={brandRef}>
                    <div className="pfm-select-inner">
                      <input type="text" className="pfm-input"
                        placeholder="พิมพ์ค้นหาแบรนด์..."
                        value={brandOpen ? brandSearch : brandSelected}
                        onChange={(e) => { setBrandSearch(e.target.value); setBrandOpen(true); }}
                        onFocus={() => setBrandOpen(true)} />
                      <button type="button" className="pfm-add-btn" onClick={() => setShowAddBrand(true)} title="เพิ่มแบรนด์ใหม่">
                        <FiPlus size={16} />
                      </button>
                      <button type="button" className="pfm-drop-btn" onClick={() => setBrandOpen(!brandOpen)}>
                        <FiChevronDown size={14} />
                      </button>
                    </div>
                    {brandOpen && (
                      <div className="pfm-dropdown">
                        {filteredBrands.length === 0 ? (
                          <div className="pfm-dropdown-empty" onClick={() => { setShowAddBrand(true); setBrandOpen(false); }}>
                            <FiPlus size={14} /> เพิ่ม "{brandSearch}"
                          </div>
                        ) : (
                          filteredBrands.map(b => (
                            <div key={b.brand_id} className="pfm-dropdown-item" onClick={() => selectBrand(b)}>
                              {b.brand_name}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {errors.brand_id && <div className="pfm-error">{errors.brand_id}</div>}
                </div>
                <div className="pfm-field">
                  <label className="pfm-req">ผู้จำหน่าย</label>
                  <div className="pfm-select-group" ref={suppRef}>
                    <div className="pfm-select-inner">
                      <input type="text" className="pfm-input"
                        placeholder="พิมพ์ค้นหาผู้จำหน่าย..."
                        value={suppOpen ? suppSearch : suppSelected}
                        onChange={(e) => { setSuppSearch(e.target.value); setSuppOpen(true); }}
                        onFocus={() => setSuppOpen(true)} />
                      <button type="button" className="pfm-add-btn" onClick={goToAddSupplier} title="เพิ่มผู้จำหน่ายใหม่">
                        <FiPlus size={16} />
                      </button>
                      <button type="button" className="pfm-drop-btn" onClick={() => setSuppOpen(!suppOpen)}>
                        <FiChevronDown size={14} />
                      </button>
                    </div>
                    {suppOpen && (
                      <div className="pfm-dropdown">
                        {filteredSupps.length === 0 ? (
                          <div className="pfm-dropdown-empty" onClick={goToAddSupplier}>
                            <FiPlus size={14} /> เพิ่ม "{suppSearch}"
                          </div>
                        ) : (
                          filteredSupps.map(s => (
                            <div key={s.supp_id} className="pfm-dropdown-item" onClick={() => selectSupp(s)}>
                              {s.supp_name}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {errors.supp_id && <div className="pfm-error">{errors.supp_id}</div>}
                </div>
              </div>
            </div>

            <div className="pfm-section">
              <div className="pfm-section-title">ราคาและสต๊อก</div>
              <div className="pfm-grid-3">
                <div className="pfm-field">
                  <label>รุ่น</label>
                  <input type="text" name="model" className="pfm-input" placeholder="รุ่นสินค้า"
                    value={formData.model} onChange={handleChange} />
                </div>
              </div>
              <div className="pfm-grid-3">
                <div className="pfm-field">
                  <label className="pfm-req">จำนวนสต๊อกขั้นต่ำ</label>
                  <input type="text" name="reorder_level" className="pfm-input" placeholder="0"
                    value={formData.reorder_level} onChange={handleNumericChange} inputMode="numeric" autoComplete="off" />
                  {errors.reorder_level && <div className="pfm-error">{errors.reorder_level}</div>}
                </div>
                <div className="pfm-field">
                  <label>สภาพสินค้า</label>
                  <div className="pfm-condition-group">
                    <label className={`pfm-condition ${formData.product_condition === 'new' ? 'checked' : ''}`}>
                      <input type="radio" name="product_condition" value="new"
                        checked={formData.product_condition === 'new'} onChange={handleChange} />
                      <span className="pfm-condition-dot new" />
                      <span>ใหม่</span>
                    </label>
                    <label className={`pfm-condition ${formData.product_condition === 'used' ? 'checked' : ''}`}>
                      <input type="radio" name="product_condition" value="used"
                        checked={formData.product_condition === 'used'} onChange={handleChange} />
                      <span className="pfm-condition-dot used" />
                      <span>เก่า</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="pfm-section">
              <div className="pfm-section-title">รูปภาพสินค้า</div>
              <div className="pfm-image-area">
                <input type="file" ref={fileInputRef} accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                {imagePreview ? (
                  <div className="pfm-image-preview">
                    <img src={imagePreview} alt="Preview" />
                    <button type="button" className="pfm-image-remove" onClick={removeImage}><FiX size={14} /></button>
                    <button type="button" className="pfm-image-change" onClick={() => fileInputRef.current?.click()}>
                      เปลี่ยนรูป
                    </button>
                  </div>
                ) : (
                  <div className="pfm-image-placeholder" onClick={() => fileInputRef.current?.click()}>
                    <FiCamera size={28} />
                    <span className="pfm-image-text">คลิกเพื่อเลือกรูปภาพ</span>
                    <span className="pfm-image-sub">JPG, PNG, GIF, WEBP สูงสุด 5MB</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pfm-footer">
              <button type="button" className="pfm-btn pfm-btn-cancel" onClick={onClose} disabled={saving}>
                ยกเลิก
              </button>
              <button type="submit" className="pfm-btn pfm-btn-save" disabled={saving}>
                {saving ? (
                  <><span className="pfm-spinner" /> บันทึก...</>
                ) : (
                  <><FiCheck size={16} /> {editProduct ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'}</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showAddBrand && (
        <div className="modal-overlay" onClick={() => setShowAddBrand(false)}>
          <div className="pfm-mini-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pfm-mini-header">
              <h5>เพิ่มแบรนด์ใหม่</h5>
              <button className="pfm-close" onClick={() => setShowAddBrand(false)}><FiX size={18} /></button>
            </div>
            <div className="pfm-mini-body">
              <div className="pfm-field">
                <label className="pfm-req">ชื่อแบรนด์</label>
                <input type="text" className="pfm-input" placeholder="กรอกชื่อแบรนด์"
                  value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddBrand(); } }} />
              </div>
            </div>
            <div className="pfm-footer">
              <button className="pfm-btn pfm-btn-cancel" onClick={() => setShowAddBrand(false)} disabled={addingItem}>ยกเลิก</button>
              <button className="pfm-btn pfm-btn-save" onClick={handleAddBrand} disabled={addingItem || !newBrandName.trim()}>
                {addingItem ? 'กำลังเพิ่ม...' : 'เพิ่มแบรนด์'}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
};

export default ProductFormModal;
