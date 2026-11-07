import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Layout from '../components/layout/Layout';
import ProductFormModal from './ProductFormModal';
import ConfirmModal from '../components/ConfirmModal';
import { FiSearch, FiPlus, FiEdit2, FiTrash2, FiPackage, FiAlertTriangle, FiX, FiBox } from 'react-icons/fi';
import { FaBarcode } from 'react-icons/fa';

const PDX_CSS = `
.pdx-modal{background:#fff;border-radius:12px;width:760px;max-width:94vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 50px -20px rgba(15,23,42,.35);animation:slideUp .25s ease}
.pdx-header{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #e2e8f0;flex-shrink:0;background:#fff}
.pdx-title{margin:0;font-size:18px;font-weight:700;color:#0f172a}
.pdx-close{width:32px;height:32px;border:none;border-radius:6px;background:transparent;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center}
.pdx-close:hover{background:#f1f5f9;color:#0f172a}
.pdx-body{padding:18px 20px 20px;overflow-y:auto;min-height:0;display:flex;flex-direction:column;gap:16px;background:#f8fafc}
.pdx-summary{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;background:#135DD1;border-radius:12px;padding:22px 20px;box-shadow:0 6px 16px -8px rgba(19,93,209,.55)}
.pdx-img{width:120px;height:120px;flex-shrink:0;border-radius:12px;border:3px solid #fff;background:#fff;color:#94a3b8;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 4px 12px rgba(2,8,23,.25);margin-bottom:6px}
.pdx-img img{width:100%;height:100%;object-fit:cover}
.pdx-summary-info{min-width:0;max-width:100%;display:flex;flex-direction:column;align-items:center;gap:6px}
.pdx-code{font-size:13px;color:rgba(255,255,255,.85);font-family:'SF Mono','Consolas',monospace;letter-spacing:.5px}
.pdx-summary .cond-tag{font-size:12px;font-weight:600;padding:3px 16px;border-radius:999px}
.pdx-name{font-size:21px;font-weight:700;color:#fff;line-height:1.35;word-break:break-word}
.pdx-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
.pdx-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.pdx-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px 6px}
.pdx-card-title{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#1d6fd6;padding-bottom:8px;margin-bottom:2px;border-bottom:1px solid #e2e8f0}
.pdx-row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:9px 0;border-bottom:1px dashed #e2e8f0}
.pdx-row:last-child{border-bottom:none}
.pdx-label{font-size:12.5px;color:#64748b;flex-shrink:0}
.pdx-value{font-size:14px;font-weight:500;color:#1e293b;text-align:right;min-width:0;word-break:break-word}
.pdx-mono{font-family:'SF Mono','Consolas',monospace;font-size:13px}
.pdx-price{font-weight:700;color:#15803d}
.pdx-expiry{color:#d97706;font-weight:600}
.pdx-expiry-empty{color:#e2b16a;font-weight:500}
@media (max-width:720px){
.pdx-cols{grid-template-columns:1fr}
.pdx-body{padding:14px}
}
`;

const ProductsPage = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [detailProduct, setDetailProduct] = useState(null);
  const [showFullImage, setShowFullImage] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [showLotModal, setShowLotModal] = useState(false);
  const [editLot, setEditLot] = useState(null);
  const [lotForm, setLotForm] = useState({ unit_cost: '', selling_price: '', expiry_date: '', received_at: '' });
  const [savingLot, setSavingLot] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(() => searchParams.get('low_stock') === '1');
  const lowStockOnlyRef = useRef(searchParams.get('low_stock') === '1');
  const searchInputRef = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [lotDeleteTarget, setLotDeleteTarget] = useState(null);
  const searchTimer = useRef(null);

  const allGroupsRef = useRef([]);
  const allRowsRef = useRef([]);
  const [sortBy, setSortBy] = useState('code');
  const sortByRef = useRef('code');

  // จัดกลุ่มตามสินค้า แล้วเรียงกลุ่มตามตัวเลือก "จัดเรียง" (ล็อตไม่ปะปนข้ามสินค้า)
  // ภายในสินค้าเดียวกันเรียง received_at ใหม่ → เก่า (ล็อตแรก = ล็อตหลัก) ถ้าเท่ากันใช้ lot_id
  // ซ่อนล็อตที่หมด (0) เมื่อยังมีล็อตอื่นเหลือ แต่ถ้าไม่เหลือเลยยังแสดงล็อตล่าสุดไว้ (อยู่ท้ายสุดเสมอ)
  const groupByProduct = useCallback((rows, sortKey = 'code') => {
    const map = new Map();
    rows.forEach((r) => {
      if (!map.has(r.product_id)) map.set(r.product_id, []);
      map.get(r.product_id).push(r);
    });
    const byCode = (a, b) => String(a.product_id).localeCompare(String(b.product_id), undefined, { numeric: true, sensitivity: 'base' });
    const time = (r) => (r.lot_id && r.received_at ? new Date(r.received_at).getTime() : NaN);
    const price = (r) => (r.lot_id && r.selling_price !== null && r.selling_price !== undefined && r.selling_price !== '' ? Number(r.selling_price) : NaN);
    const extreme = (g, fn) => {
      const ts = g.rows.map(time).filter((t) => !isNaN(t));
      return ts.length ? fn(...ts) : NaN;
    };
    // คืนค่าเรียงตาม key (ค่าที่ไม่มีข้อมูลไปท้ายสุดเสมอ)
    const byKey = (keyFn, dir) => (a, b) => {
      const ka = keyFn(a);
      const kb = keyFn(b);
      if (isNaN(ka) && isNaN(kb)) return 0;
      if (isNaN(ka)) return 1;
      if (isNaN(kb)) return -1;
      return (ka - kb) * dir;
    };
    const comparators = {
      code: byCode,
      name: (a, b) => String(a.rows[0].product_name || '').localeCompare(String(b.rows[0].product_name || ''), 'th', { numeric: true, sensitivity: 'base' }),
      priceAsc: byKey((g) => price(g.rows[0]), 1),
      priceDesc: byKey((g) => price(g.rows[0]), -1),
      newest: byKey((g) => extreme(g, Math.max), -1),
      oldest: byKey((g) => extreme(g, Math.min), 1),
    };
    const compare = comparators[sortKey] || byCode;
    return [...map.values()]
      .map((list) => {
        const allLots = list
          .filter((r) => r.lot_id)
          .sort((a, b) => (new Date(b.received_at) - new Date(a.received_at)) || (b.lot_id - a.lot_id));
        const inStock = allLots.filter((r) => Number(r.quantity_remaining) > 0);
        let lots = inStock;
        if (inStock.length === 0) lots = allLots.slice(0, 1);
        return {
          product_id: list[0].product_id,
          outOfStock: inStock.length === 0,
          rows: lots.length > 0 ? lots : [{ ...list[0], lot_id: null }],
        };
      })
      .sort((a, b) => (Number(a.outOfStock) - Number(b.outOfStock)) || compare(a, b) || byCode(a, b));
  }, []);

  const showPage = useCallback((page) => {
    const limit = 10;
    const groups = allGroupsRef.current;
    const totalPages = Math.max(1, Math.ceil(groups.length / limit));
    const current = Math.min(Math.max(1, page), totalPages);
    setProducts(groups.slice((current - 1) * limit, current * limit));
    setPagination({ page: current, limit, total: groups.length, totalPages });
  }, []);

  const fetchProducts = useCallback(async (page = 1, searchTerm = '', lowOnly = false) => {
    try {
      setLoading(true);
      const params = { page: 1, limit: 100, include_out_of_stock: '1' };
      if (searchTerm) params.search = searchTerm;
      if (lowOnly) params.low_stock = '1';
      const first = await api.get('/products/lots', { params });
      const rows = [...(first.data.data || [])];
      const totalPages = first.data.pagination?.totalPages || 1;
      if (totalPages > 1) {
        const rest = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) => api.get('/products/lots', { params: { ...params, page: i + 2 } }))
        );
        rest.forEach((r) => rows.push(...(r.data.data || [])));
      }
      allRowsRef.current = rows;
      allGroupsRef.current = groupByProduct(rows, sortByRef.current);
      showPage(page);
    } catch {
      allRowsRef.current = [];
      allGroupsRef.current = [];
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [groupByProduct, showPage]);

  const fetchBrands = async () => {
    try {
      const res = await api.get('/brands');
      setBrands(res.data.data || []);
    } catch { }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await api.get('/suppliers?limit=100');
      setSuppliers(res.data.data || []);
    } catch { }
  };

  useEffect(() => { fetchProducts(1, '', lowStockOnlyRef.current); fetchBrands(); fetchSuppliers(); }, [fetchProducts]);

  useEffect(() => {
    setSearchParams(lowStockOnly ? { low_stock: '1' } : {}, { replace: true });
  }, [lowStockOnly, setSearchParams]);

  useEffect(() => {
    fetchLowStockCount();
  }, []);

  const fetchLowStockCount = async () => {
    try {
      const res = await api.get('/products/low-stock');
      const data = res.data.data || [];
      setLowStockCount(Array.isArray(data) ? data.length : 0);
    } catch { }
  };

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchProducts(1, value, lowStockOnly), 500);
  };

  const handleSortChange = (e) => {
    const value = e.target.value;
    setSortBy(value);
    sortByRef.current = value;
    allGroupsRef.current = groupByProduct(allRowsRef.current, value);
    showPage(1);
  };

  const handleLowStockToggle = () => {
    const next = !lowStockOnly;
    setLowStockOnly(next);
    setSearch('');
    fetchProducts(1, '', next);
  };

  const handlePageChange = (page) => {
    if (page < 1 || page > pagination.totalPages) return;
    showPage(page);
  };

  const handleAdd = () => { setEditProduct(null); setShowModal(true); };
  const handleEdit = (product) => { setEditProduct(product); setShowModal(true); };

  const openProductDetail = async (row) => {
    if (!row.lot_id) {
      setDetailProduct({ ...row, lots: [] });
      return;
    }
    try {
      const res = await api.get(`/products/lots/${row.lot_id}`);
      setDetailProduct(res.data.data);
    } catch {
      setDetailProduct({ ...row, lots: [] });
    }
  };

  const toDateInput = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const openEditLot = (row) => {
    setEditLot(row);
    setLotForm({
      unit_cost: row.unit_cost !== null && row.unit_cost !== undefined ? String(row.unit_cost) : '',
      selling_price: row.selling_price !== null && row.selling_price !== undefined ? String(row.selling_price) : '',
      expiry_date: row.expiry_date ? String(row.expiry_date).split('T')[0] : '',
      received_at: toDateInput(row.received_at)
    });
    setShowLotModal(true);
  };

  const handleSaveLot = async () => {
    if (!editLot) return;
    setSavingLot(true);
    try {
      const payload = { ...lotForm };
      // ส่งวันที่รับเข้าเฉพาะเมื่อมีการแก้ไข เพื่อไม่ให้เวลาเดิมของล็อตถูกรีเซ็ต
      if (!payload.received_at || payload.received_at === toDateInput(editLot.received_at)) delete payload.received_at;
      await api.put(`/products/lots/${editLot.lot_id}`, payload);
      setShowLotModal(false);
      setEditLot(null);
      fetchProducts(pagination.page, search, lowStockOnly);
    } catch (err) {
      alert(err.response?.data?.message || 'ไม่สามารถแก้ไขล็อตสินค้าได้');
    } finally {
      setSavingLot(false);
    }
  };

  const handleDeleteLot = async () => {
    if (!lotDeleteTarget) return;
    try {
      await api.delete(`/products/lots/${lotDeleteTarget.lot_id}`);
      setLotDeleteTarget(null);
      fetchProducts(pagination.page, search, lowStockOnly);
      fetchLowStockCount();
    } catch (err) {
      alert(err.response?.data?.message || 'ไม่สามารถลบล็อตนี้ได้');
      setLotDeleteTarget(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/products/${deleteTarget.product_id}`);
      setDeleteTarget(null);
      fetchProducts(pagination.page, search, lowStockOnly);
      fetchLowStockCount();
    } catch (err) {
      alert(err.response?.data?.message || 'ไม่สามารถลบสินค้าได้');
      setDeleteTarget(null);
    }
  };

  const handleSave = async () => {
    setShowModal(false);
    setEditProduct(null);
    fetchProducts(pagination.page, search, lowStockOnly);
    fetchBrands();
    fetchSuppliers();
    fetchLowStockCount();
  };

  const formatPrice = (price) => Number(price || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  const isAdmin = user?.user_role === 'admin';
  const isTechnician = user?.user_role === 'supplier';
  const canEditLot = isAdmin || user?.user_role === 'employee';

  const getDisplayPageNumbers = () => {
    const total = pagination.totalPages;
    const cur = pagination.page;
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    if (cur <= 3) return [1, 2, 3, 4, 5].filter(n => n <= total);
    if (cur >= total - 2) return [total - 4, total - 3, total - 2, total - 1, total].filter(n => n >= 1);
    return [cur - 2, cur - 1, cur, cur + 1, cur + 2];
  };

  return (
    <Layout title="สินค้า">
      <div className="products-header">
        <div className="ph-left">
          <h2>รายการสินค้า</h2>
          <p>จัดการข้อมูลสินค้าทั้งหมดในระบบ</p>
        </div>
        <div className="ph-right">
          <div className="ph-stat">
            <FiPackage size={16} />
            <span>{pagination.total} รายการ</span>
          </div>
          {lowStockCount > 0 && (
            <button
              className={`ph-stat ph-stat-warning ${lowStockOnly ? 'ph-stat-active' : ''}`}
              onClick={handleLowStockToggle}
              title={lowStockOnly ? 'แสดงสินค้าทั้งหมด' : 'แสดงเฉพาะสินค้าใกล้หมด'}
            >
              <FiAlertTriangle size={16} />
              <span>{lowStockOnly ? 'แสดงสินค้าใกล้หมด' : `ใกล้หมด ${lowStockCount}`}</span>
              {lowStockOnly && <FiX size={14} />}
            </button>
          )}
        </div>
      </div>

      <div className="products-toolbar">
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, maxWidth: '100%' }}>
          <div className="search-box">
            <FiSearch size={16} className="search-icon" />
            <input ref={searchInputRef} type="text" placeholder="ค้นหาชื่อสินค้า, รหัสสินค้า, บาร์โค้ด หรือรุ่น..." value={search} onChange={handleSearch} />
          </div>
          <button
            type="button"
            title="สแกนบาร์โค้ด"
            aria-label="สแกนบาร์โค้ด"
            onClick={() => searchInputRef.current?.focus()}
            style={{ flexShrink: 0, width: 42, border: '1.5px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <FaBarcode size={18} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label htmlFor="products-sort" style={{ fontSize: 14, fontWeight: 500, color: '#475569', whiteSpace: 'nowrap', margin: 0 }}>จัดเรียง : </label>
          <select
            id="products-sort"
            className="pfm-input"
            value={sortBy}
            onChange={handleSortChange}
            style={{ width: 'auto', minWidth: 140, height: 42, cursor: 'pointer', marginLeft: -4, fontSize: 14, fontWeight: 500, color: '#475569' }}
          >
            <option value="code">รหัสสินค้า</option>
            <option value="name">ชื่อสินค้า</option>
            <option value="priceAsc">ราคาต่ำไปสูง</option>
            <option value="priceDesc">ราคาสูงไปต่ำ</option>
            <option value="newest">รับเข้าล่าสุด</option>
            <option value="oldest">รับเข้าเก่าสุด</option>
          </select>
          {!isTechnician && (
            <button className="btn-add" onClick={handleAdd}>
              <FiPlus size={18} />
              <span>เพิ่มสินค้า</span>
            </button>
          )}
        </div>
      </div>

      <div className="table-container">
        <div className="table-scroll">
          <table className="pro-table">
            <thead>
              <tr>
                <th className="col-code">รหัส</th>
                <th className="col-img">รูป</th>
                <th className="col-name">ชื่อสินค้า</th>
                <th className="col-price">ราคาขาย</th>
                <th className="col-stock">จำนวน</th>
                <th className="col-price">วันรับ</th>
                 <th style={{ width: 100, textAlign: 'right', fontFamily: "'SF Mono', 'Consolas', monospace", color: '#d97706' }}>วันหมดอายุ</th>
                <th className="col-condition">สภาพ</th>
                <th className="col-actions" style={{ width: 180, minWidth: 180 }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <div className="table-empty">
                      <div className="spinner" />
                      <p>กำลังโหลดข้อมูล...</p>
                    </div>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="table-empty">
                      <FiPackage size={40} />
                      <p>{search ? 'ไม่พบสินค้าที่ค้นหา' : lowStockOnly ? 'ไม่มีสินค้าใกล้หมด' : 'ยังไม่มีสินค้าในระบบ'}</p>
                      {!search && !lowStockOnly && (
                        <button className="btn-add-sm" onClick={handleAdd} style={{ marginTop: 8 }}>
                          เพิ่มสินค้าชิ้นแรก
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((group) => {
                  const renderRow = (product, isFirst) => {
                  const isEmpty = !product.lot_id || Number(product.quantity_remaining) === 0;
                  return (
                  <tr key={product.lot_id ? `lot-${product.lot_id}` : `p-${product.product_id}`} style={{ cursor: 'pointer', opacity: isEmpty ? 0.5 : 1, background: product.lot_id && !isFirst ? '#f8fafc' : '#fff' }} onClick={() => openProductDetail(product)}>
                    <td className="col-code" style={product.lot_id && !isFirst ? { boxShadow: 'inset 4px 0 0 #1d6fd6' } : undefined}>{product.product_id}</td>
                    <td className="col-img">
                      {product.product_image ? (
                        <img src={`http://localhost:5000${product.product_image}`} alt="" className="pro-thumb" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                      ) : (
                        <span className="pro-no-img" style={{ width: 64, height: 64, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>📷</span>
                      )}
                    </td>
                    <td className="col-name">
                      {product.product_name}
                      {product.barcode && <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>บาร์โค้ด {product.barcode}</div>}
                    </td>
                    <td className="col-price">{product.selling_price !== null && product.selling_price !== undefined && product.selling_price !== '' ? formatPrice(product.selling_price) : <span className="null-val">-</span>}</td>
                    <td className="col-stock">
                      {!product.lot_id ? (
                        <span className="null-val">-</span>
                      ) : Number(product.quantity_remaining) === 0 ? (
                        <span className="stock-tag stock-empty">หมด</span>
                      ) : Number(product.stock_quantity) <= Number(product.reorder_level) ? (
                        <span className="stock-tag stock-low">{product.quantity_remaining}</span>
                      ) : (
                        <span className="stock-tag stock-ok">{product.quantity_remaining}</span>
                      )}
                    </td>
                    <td className="col-price">{product.received_at ? new Date(product.received_at).toLocaleDateString('th-TH') : <span className="null-val">-</span>}</td>
                    <td className="col-price">{product.expiry_date ? <span style={{ color: '#d97706', fontWeight: 600 }}>{new Date(product.expiry_date).toLocaleDateString('th-TH')}</span> : product.lot_id ? <span style={{ color: '#e2b16a', fontWeight: 500 }}>ไม่ระบุ</span> : <span className="null-val">-</span>}</td>
                    <td className="col-condition">
                      <span className={`cond-tag ${product.product_condition}`}>
                        {product.product_condition === 'new' ? 'ใหม่' : 'เก่า'}
                      </span>
                    </td>
                    <td className="col-actions">
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {isFirst ? (
                          <>
                            {!isTechnician && (
                              <button className="tbl-action edit" style={{ width: 36, height: 36, marginRight: 0 }} onClick={(e) => { e.stopPropagation(); handleEdit(product); }} title="แก้ไขสินค้า">
                                <FiEdit2 size={18} />
                              </button>
                            )}
                            {canEditLot && product.lot_id && (
                              <button className="tbl-action edit" style={{ width: 36, height: 36, marginRight: 0 }} onClick={(e) => { e.stopPropagation(); openEditLot(product); }} title="แก้ไขล็อต">
                                <FiBox size={18} />
                              </button>
                            )}
                            {isAdmin && (
                              <button className="tbl-action delete" style={{ width: 36, height: 36 }} onClick={(e) => { e.stopPropagation(); setDeleteTarget(product); }} title="ลบสินค้า">
                                <FiTrash2 size={18} />
                              </button>
                            )}
                            {isAdmin && product.lot_id && (
                              <button className="tbl-action delete" style={{ width: 36, height: 36, color: '#dc2626' }} onClick={(e) => { e.stopPropagation(); setLotDeleteTarget(product); }} title="ลบล็อต">
                                <FiBox size={18} />
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            {!isTechnician && <span style={{ width: 36, height: 36 }} />}
                            {isAdmin && <span style={{ width: 36, height: 36 }} />}
                            {canEditLot && product.lot_id && (
                              <button className="tbl-action edit" style={{ width: 36, height: 36, marginRight: 0 }} onClick={(e) => { e.stopPropagation(); openEditLot(product); }} title="แก้ไขล็อต">
                                <FiBox size={18} />
                              </button>
                            )}
                            {isAdmin && product.lot_id && (
                              <button className="tbl-action delete" style={{ width: 36, height: 36, color: '#dc2626' }} onClick={(e) => { e.stopPropagation(); setLotDeleteTarget(product); }} title="ลบล็อต">
                                <FiBox size={18} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                  };
                  return (
                    <React.Fragment key={group.product_id}>
                      {group.rows.map((row, i) => renderRow(row, i === 0))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

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
      </div>

      <ProductFormModal
        show={showModal}
        onClose={() => { setShowModal(false); setEditProduct(null); }}
        onSave={handleSave}
        editProduct={editProduct}
        brands={brands}
        suppliers={suppliers}
        onBrandsChange={(newBrands) => setBrands(newBrands)}
        onSuppliersChange={(newSuppliers) => setSuppliers(newSuppliers)}
        nextProductId={(() => {
          if (products.length === 0) return 'A001';
          const maxNum = products.reduce((mx, p) => {
            const m = p.product_id?.match(/^A(\d+)$/);
            return m ? Math.max(mx, parseInt(m[1], 10)) : mx;
          }, 0);
          return `A${String(maxNum + 1).padStart(3, '0')}`;
        })()}
      />
      {detailProduct && (() => {
        const d = detailProduct;
        const hasValue = (v) => v !== null && v !== undefined && v !== '';
        const dateText = (v) => {
          if (!v) return null;
          const dt = new Date(v);
          return isNaN(dt.getTime()) ? null : dt.toLocaleDateString('th-TH');
        };
        const condLabel = d.product_condition === 'new' ? 'ใหม่' : d.product_condition === 'used' ? 'เก่า' : null;
        const money = (v) => (hasValue(v) ? formatPrice(v) : '-');
        const expiry = dateText(d.expiry_date);
        const closeDetail = () => setDetailProduct(null);
        const Row = ({ label, children }) => (
          <div className="pdx-row"><span className="pdx-label">{label}</span><span className="pdx-value">{children}</span></div>
        );
        return (
          <div className="modal-overlay" onClick={closeDetail} style={{ animation: 'fadeIn 0.15s ease' }}>
            <style>{PDX_CSS}</style>
            <div className="pdx-modal" onClick={e => e.stopPropagation()}>
              <div className="pdx-header">
                <h3 className="pdx-title">รายละเอียดสินค้า</h3>
                <button type="button" className="pdx-close" onClick={closeDetail} aria-label="ปิด"><FiX size={18} /></button>
              </div>
              <div className="pdx-body">
                <div className="pdx-summary">
                  <div className="pdx-img" onClick={(e) => { e.stopPropagation(); if (d.product_image) setShowFullImage(true); }} style={{ cursor: d.product_image ? 'zoom-in' : 'default' }}>
                    {d.product_image ? (
                      <img src={`http://localhost:5000${d.product_image}`} alt="" />
                    ) : (
                      <FiPackage size={36} />
                    )}
                  </div>
                  <div className="pdx-summary-info">
                    <div className="pdx-code">{d.product_id}</div>
                    <div className="pdx-name">{d.product_name}</div>
                    {condLabel && <span className={`cond-tag ${d.product_condition}`}>{condLabel}</span>}
                  </div>
                </div>
                <div className="pdx-cols">
                  <div className="pdx-col">
                    <div className="pdx-card">
                      <div className="pdx-card-title">ข้อมูลสินค้า</div>
                      <Row label="รหัสสินค้า">{d.product_id}</Row>
                      <Row label="ชื่อสินค้า">{d.product_name || '-'}</Row>
                      <Row label="แบรนด์">{d.brand_name || '-'}</Row>
                      <Row label="รุ่น">{d.model || '-'}</Row>
                      <Row label="สภาพสินค้า">{condLabel ? <span className={`cond-tag ${d.product_condition}`}>{condLabel}</span> : '-'}</Row>
                      <Row label="บาร์โค้ด"><span className="pdx-mono">{d.barcode || '-'}</span></Row>
                      <Row label="ผู้จำหน่าย">{d.supp_name || '-'}</Row>
                    </div>
                  </div>
                  <div className="pdx-col">
                    <div className="pdx-card">
                      <div className="pdx-card-title">ข้อมูลราคาและสต๊อก</div>
                      <Row label="ราคาทุน">{money(d.unit_cost)}</Row>
                      <Row label="ราคาขาย"><span className="pdx-price">{money(d.selling_price)}</span></Row>
                      <Row label="จำนวนคงเหลือ (รวมทุกล็อต)">
                        <span style={{ fontWeight: 600, color: (d.stock_quantity || 0) <= (d.reorder_level || 0) ? '#dc2626' : '#16a34a' }}>{(d.stock_quantity || 0).toLocaleString()} ชิ้น</span>
                      </Row>
                      <Row label="จุดสั่งซื้อ">{(d.reorder_level || 0).toLocaleString()} ชิ้น</Row>
                    </div>
                    <div className="pdx-card">
                      <div className="pdx-card-title">ข้อมูลล็อต</div>
                      <Row label="ล็อต"><span className="pdx-mono">{d.lot_number || '-'}</span></Row>
                      <Row label="จำนวนในล็อตนี้">{d.lot_id ? `${Number(d.quantity_remaining || 0).toLocaleString()} ชิ้น` : '-'}</Row>
                      <Row label="วันรับเข้า"><span style={{ color: '#059669', fontWeight: 600 }}>{dateText(d.received_at) || '-'}</span></Row>
                      <Row label="วันหมดอายุ">
                        {expiry
                          ? <span className="pdx-expiry">{expiry}</span>
                          : <span className="pdx-expiry pdx-expiry-empty">ไม่ระบุ</span>}
                      </Row>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {showFullImage && detailProduct?.product_image && (
        <div className="pd-img-overlay" onClick={() => setShowFullImage(false)}>
          <img src={`http://localhost:5000${detailProduct.product_image}`} alt={detailProduct.product_name} />
        </div>
      )}
      {showLotModal && editLot && (
        <div className="modal-overlay" onClick={() => setShowLotModal(false)}>
          <div className="pfm-mini-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pfm-mini-header">
              <h5>แก้ไขล็อต {editLot.lot_number}</h5>
              <button className="pfm-close" onClick={() => setShowLotModal(false)}><FiX size={18} /></button>
            </div>
            <div className="pfm-mini-body">
              <div className="pfm-field">
                <label>ราคาต้นทุน</label>
                <input type="text" className="pfm-input" placeholder="0.00" inputMode="decimal"
                  value={lotForm.unit_cost} onChange={(e) => setLotForm(prev => ({ ...prev, unit_cost: e.target.value.replace(/[^0-9.]/g, '') }))} />
              </div>
              <div className="pfm-field">
                <label>ราคาขาย</label>
                <input type="text" className="pfm-input" placeholder="0.00" inputMode="decimal"
                  value={lotForm.selling_price} onChange={(e) => setLotForm(prev => ({ ...prev, selling_price: e.target.value.replace(/[^0-9.]/g, '') }))} />
              </div>
              <div className="pfm-field">
                <label>วันที่รับเข้า</label>
                <input type="date" className="pfm-input"
                  value={lotForm.received_at} onChange={(e) => setLotForm(prev => ({ ...prev, received_at: e.target.value }))} />
              </div>
              <div className="pfm-field">
                <label>วันหมดอายุ</label>
                <input type="date" className="pfm-input"
                  value={lotForm.expiry_date} onChange={(e) => setLotForm(prev => ({ ...prev, expiry_date: e.target.value }))} />
              </div>
            </div>
            <div className="pfm-footer">
              <button className="pfm-btn pfm-btn-cancel" onClick={() => setShowLotModal(false)} disabled={savingLot}>ยกเลิก</button>
              <button className="pfm-btn pfm-btn-save" onClick={handleSaveLot} disabled={savingLot}>
                {savingLot ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteTarget && (
        <ConfirmModal
          show={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="ยืนยันการลบสินค้า"
          message={`คุณแน่ใจหรือไม่ว่าจะลบสินค้า "${deleteTarget.product_name}"?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`}
          confirmText="ลบสินค้า"
          cancelText="ยกเลิก"
          danger
        />
      )}
      {lotDeleteTarget && (
        <ConfirmModal
          show={!!lotDeleteTarget}
          onClose={() => setLotDeleteTarget(null)}
          onConfirm={handleDeleteLot}
          title="ยืนยันการลบล็อตสินค้า"
          message={`คุณแน่ใจหรือไม่ว่าจะลบล็อต "${lotDeleteTarget.lot_number}" ของสินค้า "${lotDeleteTarget.product_name}"?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`}
          confirmText="ลบล็อต"
          cancelText="ยกเลิก"
          danger
        />
      )}
    </Layout>
  );
};

export default ProductsPage;
