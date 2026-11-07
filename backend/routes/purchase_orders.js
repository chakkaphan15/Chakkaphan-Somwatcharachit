const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, authorize, isEmployee } = require('../middleware/auth');
const { idParamRule, paginateRules, validate } = require('../middleware/validate');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { success, paginated } = require('../utils/response');

router.use(auth);
// จัดการ PO เป็นสิทธิ์ Admin/Employee เท่านั้น (ช่างห้ามดู/สร้าง/อนุมัติ)
router.use(authorize('admin', 'employee'));

router.get('/summary', asyncHandler(async (req, res) => {
  const search = req.query.search || '';
  const statuses = (req.query.status || '').split(',').map(s => s.trim()).filter(Boolean);
  const dateFrom = req.query.date_from || '';
  const dateTo = req.query.date_to || '';

  let whereClause = '';
  const params = [];

  if (isEmployee(req)) {
    whereClause = 'WHERE p.user_id = ?';
    params.push(req.user.user_id);
  }

  if (search) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += '(p.purchase_number LIKE ? OR s.supp_name LIKE ?)';
    const t = `%${search}%`;
    params.push(t, t);
  }

  if (statuses.length > 0) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += `p.purchase_status IN (${statuses.map(() => '?').join(', ')})`;
    params.push(...statuses);
  }

  if (dateFrom) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 'p.purchase_date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 'p.purchase_date < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(dateTo);
  }

  const [rows] = await db.query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(p.net_amount), 0) AS total
     FROM purchase_orders p
     LEFT JOIN supplier s ON p.supp_id = s.supp_id
     ${whereClause}`, params
  );
  return success(res, rows[0]);
}));

// ใบสั่งซื้อที่รอรับเข้า (คิวงานหน้ารับสินค้า) ทุกคนที่มีสิทธิ์รับเข้าต้องเห็น
const RECEIVABLE_STATUSES = ['อนุมัติ', 'รอรับสินค้า'];

router.get('/receivable', asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT p.*, s.supp_name, u.first_name AS user_first_name, u.last_name AS user_last_name,
            COALESCE(SUM(d.quantity), 0) AS total_items
     FROM purchase_orders p
     LEFT JOIN supplier s ON p.supp_id = s.supp_id
     LEFT JOIN user u ON p.user_id = u.user_id
     LEFT JOIN po_details d ON p.po_id = d.po_id
     WHERE p.purchase_status IN (?, ?)
     GROUP BY p.po_id, p.supp_id, p.user_id, p.purchase_date, p.purchase_number,
              p.total_amount, p.vat_amount, p.net_amount, p.purchase_status,
              p.document_pdf, p.created_at, s.supp_name, u.first_name, u.last_name
     ORDER BY p.created_at DESC LIMIT 100`,
    RECEIVABLE_STATUSES
  );
  return success(res, rows);
}));

router.get('/', paginateRules, validate, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  const statuses = (req.query.status || '').split(',').map(s => s.trim()).filter(Boolean);
  const dateFrom = req.query.date_from || '';
  const dateTo = req.query.date_to || '';

  let whereClause = '';
  const params = [];

  if (isEmployee(req)) {
    whereClause = 'WHERE p.user_id = ?';
    params.push(req.user.user_id);
  }

  if (search) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += '(p.purchase_number LIKE ? OR s.supp_name LIKE ?)';
    const t = `%${search}%`;
    params.push(t, t);
  }

  if (statuses.length > 0) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += `p.purchase_status IN (${statuses.map(() => '?').join(', ')})`;
    params.push(...statuses);
  }

  if (dateFrom) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 'p.purchase_date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 'p.purchase_date < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(dateTo);
  }

  const [countResult] = await db.query(
    `SELECT COUNT(*) AS total FROM purchase_orders p LEFT JOIN supplier s ON p.supp_id = s.supp_id ${whereClause}`, params
  );
  const total = countResult[0].total;

  const [rows] = await db.query(
    `SELECT p.*, s.supp_name, u.first_name AS user_first_name, u.last_name AS user_last_name,
            ap.first_name AS approver_first_name, ap.last_name AS approver_last_name,
            COALESCE(SUM(d.quantity), 0) AS total_items
     FROM purchase_orders p
     LEFT JOIN supplier s ON p.supp_id = s.supp_id
     LEFT JOIN user u ON p.user_id = u.user_id
     LEFT JOIN user ap ON p.approved_by = ap.user_id
     LEFT JOIN po_details d ON p.po_id = d.po_id
     ${whereClause}
     GROUP BY p.po_id, p.supp_id, p.user_id, p.purchase_date, p.purchase_number,
              p.total_amount, p.vat_amount, p.net_amount, p.purchase_status,
              p.document_pdf, p.created_at, s.supp_name, u.first_name, u.last_name,
              ap.first_name, ap.last_name
     ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return paginated(res, rows, total, page, limit);
}));

// GET /api/purchase-orders/:id - รายละเอียดใบสั่งซื้อ (รวมรายการสินค้า)
router.get('/:id', idParamRule, validate, asyncHandler(async (req, res) => {
  const [po] = await db.query(
    `SELECT p.*, s.supp_name, s.phone_number, s.house_no, s.sub_district, s.district,
            s.province, s.postal_code, s.email, s.tax_id,
            s.prefix, s.first_name, s.last_name,
            u.first_name AS user_first_name, u.last_name AS user_last_name,
            ap.first_name AS approver_first_name, ap.last_name AS approver_last_name
     FROM purchase_orders p
     LEFT JOIN supplier s ON p.supp_id = s.supp_id
     LEFT JOIN user u ON p.user_id = u.user_id
     LEFT JOIN user ap ON p.approved_by = ap.user_id
     WHERE p.po_id = ?`, [req.params.id]
  );
  if (po.length === 0) throw new AppError('ไม่พบใบสั่งซื้อ', 404);
  if (isEmployee(req) && po[0].user_id !== req.user.user_id && !RECEIVABLE_STATUSES.includes(po[0].purchase_status)) {
    const [linked] = await db.query(
      'SELECT 1 FROM goods_receipt WHERE po_id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.user_id]
    );
    if (linked.length === 0) throw new AppError('ไม่มีสิทธิ์เข้าถึงรายการนี้', 403);
  }

  const [items] = await db.query(
    `SELECT d.*, p.product_name, p.barcode, p.model
     FROM po_details d
     LEFT JOIN products p ON d.product_id = p.product_id
     WHERE d.po_id = ?`, [req.params.id]
  );

  return success(res, { ...po[0], items });
}));

// POST /api/purchase-orders - สร้างใบสั่งซื้อ
router.post('/', asyncHandler(async (req, res) => {
  const { supp_id, items, delivery_date, payment_term, shipping_method, discount_amount, notes, purchase_status } = req.body;

  if (!supp_id) throw new AppError('กรุณาเลือกผู้จำหน่าย', 400);
  if (!items || items.length === 0) throw new AppError('กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการ', 400);
  if (!req.user) throw new AppError('ไม่พบผู้ใช้งาน', 401);

  const [supplier] = await db.query('SELECT supp_id FROM supplier WHERE supp_id = ?', [supp_id]);
  if (supplier.length === 0) throw new AppError('ไม่พบผู้จำหน่าย', 404);

  const [companyRows] = await db.query(
    'SELECT company_name, tax_id, address, phone_number FROM company_profile WHERE id = 1'
  );
  const company = companyRows[0] || null;

  const [maxRow] = await db.query("SELECT MAX(CAST(SUBSTRING(po_id,3) AS UNSIGNED)) AS maxId FROM purchase_orders WHERE po_id REGEXP '^PO[0-9]'");
  const nextNum = (maxRow[0].maxId || 0) + 1;
  const poId = `PO${String(nextNum).padStart(8, '0')}`;

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const [numRow] = await db.query('SELECT COUNT(*) AS cnt FROM purchase_orders WHERE purchase_number LIKE ?', [`PO-${dateStr}-%`]);
  const purchaseNumber = `PO-${dateStr}-${String((numRow[0].cnt || 0) + 1).padStart(4, '0')}`;

  let totalAmount = 0;
  const poItems = [];

  for (const item of items) {
    if (!item.product_id || !item.quantity || item.quantity < 1) {
      throw new AppError('ข้อมูลสินค้าไม่ถูกต้อง', 400);
    }

    const [product] = await db.query(
      'SELECT product_id, product_name, purchase_price FROM products WHERE product_id = ?', [item.product_id]
    );
    if (product.length === 0) throw new AppError(`ไม่พบสินค้า ID: ${item.product_id}`, 404);

    const unitPrice = parseFloat(item.unit_price) || parseFloat(product[0].purchase_price) || 0;
    totalAmount += unitPrice * item.quantity;
    poItems.push({ product_id: product[0].product_id, quantity: item.quantity, unit_price: unitPrice });
  }

  const discount = Math.max(0, parseFloat(discount_amount) || 0);
  const afterDiscount = Math.max(0, totalAmount - discount);
  const vatAmount = afterDiscount * 0.07;
  const netAmount = afterDiscount + vatAmount;
  const status = req.user.user_role !== 'admin'
    ? 'รออนุมัติ'
    : (['รออนุมัติ', 'อนุมัติ', 'รอรับสินค้า', 'เสร็จสิ้น', 'ยกเลิก'].includes(purchase_status) ? purchase_status : 'รออนุมัติ');

  const mergedItems = [];
  for (const pi of poItems) {
    const existing = mergedItems.find(m => m.product_id === pi.product_id);
    if (existing) {
      existing.quantity += pi.quantity;
    } else {
      mergedItems.push({ ...pi });
    }
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO purchase_orders (po_id, supp_id, user_id, purchase_date, purchase_number,
                                    delivery_date, payment_term, shipping_method,
                                    total_amount, discount_amount, vat_amount, net_amount,
                                    purchase_status, notes,
                                    company_name, company_tax_id, company_address, company_phone,
                                    approved_by, approved_at, created_at)
       VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === 'อนุมัติ' ? 'NOW()' : 'NULL'}, NOW())`,
      [poId, supp_id, req.user.user_id, purchaseNumber,
       delivery_date || null, payment_term || '', shipping_method || '',
       totalAmount.toFixed(2), discount.toFixed(2), vatAmount.toFixed(2), netAmount.toFixed(2),
       status, notes || '',
       company?.company_name || null, company?.tax_id || null, company?.address || null, company?.phone_number || null,
       status === 'อนุมัติ' ? req.user.user_id : null]
    );

for (const pi of mergedItems) {
      await connection.query(
        'INSERT INTO po_details (po_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [poId, pi.product_id, pi.quantity, pi.unit_price]
      );
      await connection.query(
        'UPDATE products SET purchase_price = ? WHERE product_id = ?',
        [pi.unit_price, pi.product_id]
      );
    }

    await connection.commit();
    return success(res, { po_id: poId, purchase_number: purchaseNumber, net_amount: netAmount }, 'สั่งซื้อสำเร็จ ', 201);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}));

// PATCH /api/purchase-orders/:id - อัปเดตสถานะใบสั่งซื้อ
router.patch('/:id', authorize('admin'), idParamRule, validate, asyncHandler(async (req, res) => {
  const { purchase_status } = req.body;
  const validStatuses = ['รออนุมัติ', 'อนุมัติ', 'รอรับสินค้า', 'เสร็จสิ้น', 'ยกเลิก'];
  if (!purchase_status || !validStatuses.includes(purchase_status)) {
    throw new AppError('สถานะไม่ถูกต้อง', 400);
  }

  const [exist] = await db.query('SELECT po_id, approved_by FROM purchase_orders WHERE po_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบใบสั่งซื้อ', 404);

  if (purchase_status === 'อนุมัติ') {
    await db.query(
      'UPDATE purchase_orders SET purchase_status = ?, approved_by = ?, approved_at = NOW() WHERE po_id = ?',
      [purchase_status, req.user.user_id, req.params.id]
    );
  } else {
    await db.query('UPDATE purchase_orders SET purchase_status = ? WHERE po_id = ?', [purchase_status, req.params.id]);
  }
  return success(res, { po_id: req.params.id, purchase_status, approved_by: purchase_status === 'อนุมัติ' ? req.user.user_id : exist[0].approved_by }, 'อัปเดตสถานะสำเร็จ');
}));

module.exports = router;