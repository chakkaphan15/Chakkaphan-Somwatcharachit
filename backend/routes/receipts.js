const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, authorize, isEmployee } = require('../middleware/auth');
const { idParamRule, paginateRules, validate } = require('../middleware/validate');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { success, paginated } = require('../utils/response');

router.use(auth);
// รับสินค้าเข้า/ดูประวัติการรับเป็นสิทธิ์ Admin/Employee เท่านั้น (ช่างเข้าไม่ได้)
router.use(authorize('admin', 'employee'));

router.get('/today-stats', asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count FROM goods_receipt WHERE DATE(receipt_date) = CURDATE()${isEmployee(req) ? ' AND user_id = ?' : ''}`,
    isEmployee(req) ? [req.user.user_id] : []
  );
  return success(res, rows[0]);
}));

router.get('/summary', asyncHandler(async (req, res) => {
  const search = req.query.search || '';
  const dateFrom = req.query.date_from || '';
  const dateTo = req.query.date_to || '';

  let whereClause = '';
  const params = [];

  if (isEmployee(req)) {
    whereClause = 'WHERE g.user_id = ?';
    params.push(req.user.user_id);
  }

  if (search) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += '(p.product_name LIKE ? OR po.purchase_number LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s);
  }

  if (dateFrom) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 'g.receipt_date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 'g.receipt_date < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(dateTo);
  }

  const [rows] = await db.query(
    `SELECT COUNT(DISTINCT g.receipt_id) AS count, COALESCE(SUM(gd.quantity), 0) AS total_items
     FROM goods_receipt g
     LEFT JOIN goods_receipt_details gd ON g.receipt_id = gd.receipt_id
     LEFT JOIN products p ON gd.product_id = p.product_id
     LEFT JOIN purchase_orders po ON g.po_id = po.po_id
     ${whereClause}`, params
  );
  return success(res, rows[0]);
}));

// GET /api/receipts - รายการรับสินค้า
router.get('/', paginateRules, validate, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  const dateFrom = req.query.date_from || '';
  const dateTo = req.query.date_to || '';

  let whereClause = '';
  const params = [];

  if (isEmployee(req)) {
    whereClause = 'WHERE g.user_id = ?';
    params.push(req.user.user_id);
  }

  if (search) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += '(p.product_name LIKE ? OR po.purchase_number LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s);
  }

  if (dateFrom) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 'g.receipt_date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 'g.receipt_date < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(dateTo);
  }

  const [countResult] = await db.query(
    `SELECT COUNT(DISTINCT g.receipt_id) AS total
     FROM goods_receipt g
     LEFT JOIN goods_receipt_details gd ON g.receipt_id = gd.receipt_id
     LEFT JOIN products p ON gd.product_id = p.product_id
     LEFT JOIN purchase_orders po ON g.po_id = po.po_id ${whereClause}`, params
  );
  const total = countResult[0].total;

  const [rows] = await db.query(
    `SELECT g.receipt_id, g.receipt_date, g.delivery_no, g.po_id, po.purchase_number, g.created_at,
            u.first_name AS user_first_name, u.last_name AS user_last_name,
            COALESCE(SUM(gd.quantity), 0) AS total_items
     FROM goods_receipt g
     LEFT JOIN goods_receipt_details gd ON g.receipt_id = gd.receipt_id
     LEFT JOIN user u ON g.user_id = u.user_id
     LEFT JOIN purchase_orders po ON g.po_id = po.po_id
     ${whereClause}
     GROUP BY g.receipt_id, g.receipt_date, g.delivery_no, g.po_id, po.purchase_number, g.created_at, u.first_name, u.last_name
     ORDER BY g.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return paginated(res, rows, total, page, limit);
}));

// GET /api/receipts/:id - รายละเอียดใบรับสินค้า
router.get('/:id', idParamRule, validate, asyncHandler(async (req, res) => {
  const [receipt] = await db.query(
    `SELECT g.*, po.purchase_number, s.supp_name,
            u.first_name AS user_first_name, u.last_name AS user_last_name
     FROM goods_receipt g
     LEFT JOIN purchase_orders po ON g.po_id = po.po_id
     LEFT JOIN supplier s ON po.supp_id = s.supp_id
     LEFT JOIN user u ON g.user_id = u.user_id
     WHERE g.receipt_id = ?`, [req.params.id]
  );
  if (receipt.length === 0) throw new AppError('ไม่พบใบรับสินค้า', 404);
  if (isEmployee(req) && receipt[0].user_id !== req.user.user_id) throw new AppError('ไม่มีสิทธิ์เข้าถึงรายการนี้', 403);

  const [items] = await db.query(
    `SELECT gd.*, l.lot_number, l.received_at AS lot_received_at, l.unit_cost AS lot_unit_cost, l.expiry_date,
            p.product_name, p.barcode, p.model, p.product_image
     FROM goods_receipt_details gd
     LEFT JOIN inventory_lots l ON gd.lot_id = l.lot_id
     LEFT JOIN products p ON gd.product_id = p.product_id
     WHERE gd.receipt_id = ?`, [req.params.id]
  );

  return success(res, { ...receipt[0], items });
}));

// POST /api/receipts - สร้างใบรับสินค้า
router.post('/', asyncHandler(async (req, res) => {
  const { items, receipt_date, po_id } = req.body;

  if (!items || items.length === 0) throw new AppError('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 400);

  if (po_id) {
    const [po] = await db.query(
      'SELECT po_id, purchase_status, purchase_number FROM purchase_orders WHERE po_id = ?', [po_id]
    );
    if (po.length === 0) throw new AppError('ไม่พบใบสั่งซื้อ', 404);
    if (!['อนุมัติ', 'รอรับสินค้า'].includes(po[0].purchase_status)) {
      throw new AppError(`ใบสั่งซื้อ ${po[0].purchase_number} ไม่สามารถรับสินค้าได้ (สถานะ ${po[0].purchase_status})`, 400);
    }
  }

  const [maxRow] = await db.query('SELECT MAX(CAST(SUBSTRING(receipt_id,2) AS UNSIGNED)) AS maxId FROM goods_receipt WHERE receipt_id REGEXP \'^R[0-9]\'');
  const nextNum = (maxRow[0].maxId || 0) + 1;
  const receiptId = `R${String(nextNum).padStart(5, '0')}`;

  const date = receipt_date || new Date();

  const receiptItems = [];
  let lotSequence = 1;
  for (const item of items) {
    if (!item.product_id || !item.quantity || item.quantity < 1) {
      throw new AppError('ข้อมูลสินค้าไม่ถูกต้อง', 400);
    }
    const [product] = await db.query('SELECT product_id, product_name, stock_quantity, purchase_price FROM products WHERE product_id = ?', [item.product_id]);
    if (product.length === 0) {
      throw new AppError(`ไม่พบสินค้า ID: ${item.product_id}`, 404);
    }
    const p = product[0];
    const oldQty = parseInt(p.stock_quantity) || 0;
    const oldCost = parseFloat(p.purchase_price) || 0;
    const unitCostValue = String(item.unit_cost ?? '').replace(/,/g, '');
    const unitCost = unitCostValue !== '' ? parseFloat(unitCostValue) : oldCost;
    if (isNaN(unitCost) || unitCost < 0) throw new AppError(`ต้นทุนต่อหน่วยของ "${p.product_name}" ไม่ถูกต้อง`, 400);

    const sellingPriceValue = String(item.selling_price ?? '').replace(/,/g, '');
    let sellingPrice = null;
    if (sellingPriceValue !== '') {
      sellingPrice = parseFloat(sellingPriceValue);
      if (isNaN(sellingPrice) || sellingPrice < 0) throw new AppError(`ราคาขายของ "${p.product_name}" ไม่ถูกต้อง`, 400);
    }

    let expiryDate = null;
    if (item.expiry_date) {
      expiryDate = String(item.expiry_date).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || isNaN(new Date(expiryDate).getTime())) {
        throw new AppError(`วันหมดอายุของ "${p.product_name}" ไม่ถูกต้อง`, 400);
      }
    }

    const newAvgCost = oldQty + item.quantity > 0
      ? ((oldQty * oldCost) + (item.quantity * unitCost)) / (oldQty + item.quantity)
      : unitCost;

    receiptItems.push({
      product_id: p.product_id,
      quantity: item.quantity,
      unit_cost: unitCost,
      selling_price: sellingPrice,
      expiry_date: expiryDate,
      new_avg_cost: Math.round(newAvgCost * 100) / 100,
      lot_number: `LOT-${receiptId}-${String(lotSequence).padStart(3, '0')}`
    });
    lotSequence += 1;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO goods_receipt (receipt_id, user_id, po_id, receipt_date, delivery_no, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [receiptId, req.user.user_id, po_id || null, date, '']
    );

    if (po_id) {
      await connection.query(
        'UPDATE purchase_orders SET purchase_status = ? WHERE po_id = ?',
        ['เสร็จสิ้น', po_id]
      );
    }

    for (const ri of receiptItems) {
      const lotResult = await connection.query(
        `INSERT INTO inventory_lots
          (lot_number, product_id, receipt_id, quantity_received, quantity_remaining, unit_cost, selling_price, received_at, expiry_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')`,
        [ri.lot_number, ri.product_id, receiptId, ri.quantity, ri.quantity, ri.unit_cost, ri.selling_price, date, ri.expiry_date]
      );
      const lotId = lotResult[0].insertId;
      await connection.query(
        'INSERT INTO goods_receipt_details (receipt_id, product_id, quantity, unit_cost, selling_price, lot_id) VALUES (?, ?, ?, ?, ?, ?)',
        [receiptId, ri.product_id, ri.quantity, ri.unit_cost, ri.selling_price, lotId]
      );
      await connection.query(
        'UPDATE products SET stock_quantity = stock_quantity + ?, purchase_price = ?, selling_price = COALESCE(?, selling_price) WHERE product_id = ?',
        [ri.quantity, ri.new_avg_cost, ri.selling_price, ri.product_id]
      );
    }

    await connection.commit();
    return success(res, { receipt_id: receiptId, total_items: receiptItems.length }, 'รับเข้าสินค้าสำเร็จ', 201);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}));

module.exports = router;
