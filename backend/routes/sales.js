const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, authorize, isEmployee } = require('../middleware/auth');
const { idParamRule, paginateRules, validate } = require('../middleware/validate');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { success, paginated } = require('../utils/response');
const { consumeLots } = require('../utils/inventory');

router.use(auth);
// ขายหน้าร้าน (POS) เป็นสิทธิ์ Admin/Employee เท่านั้น (ช่างขายไม่ได้)
router.use(authorize('admin', 'employee'));

router.get('/today-stats', asyncHandler(async (req, res) => {
  const emp = isEmployee(req);
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(net_amount), 0) AS total
     FROM sale WHERE DATE(sale_date) = CURDATE()${emp ? ' AND user_id = ?' : ''}`,
    emp ? [req.user.user_id] : []
  );
  return success(res, rows[0]);
}));

router.get('/monthly-stats', asyncHandler(async (req, res) => {
  const emp = isEmployee(req);
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(sale_date, '%Y-%m') AS month,
            COUNT(*) AS count,
            COALESCE(SUM(net_amount), 0) AS total
     FROM sale
     WHERE sale_date >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)${emp ? ' AND user_id = ?' : ''}
     GROUP BY DATE_FORMAT(sale_date, '%Y-%m')
     ORDER BY month`,
    emp ? [req.user.user_id] : []
  );
  return success(res, rows);
}));

router.get('/daily-stats', asyncHandler(async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year) || now.getFullYear();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);
  const emp = isEmployee(req);
  const [rows] = await db.query(
    `SELECT DAY(sale_date) AS day,
            COUNT(*) AS count,
            COALESCE(SUM(net_amount), 0) AS total
     FROM sale
     WHERE YEAR(sale_date) = ? AND MONTH(sale_date) = ?${emp ? ' AND user_id = ?' : ''}
     GROUP BY DAY(sale_date)
     ORDER BY day`,
    emp ? [year, month, req.user.user_id] : [year, month]
  );
  return success(res, rows);
}));

router.get('/summary', asyncHandler(async (req, res) => {
  const search = req.query.search || '';
  const dateFrom = req.query.date_from || '';
  const dateTo = req.query.date_to || '';

  let whereClause = '';
  const params = [];

  if (isEmployee(req)) {
    whereClause = 'WHERE s.user_id = ?';
    params.push(req.user.user_id);
  }

  if (search) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += '(s.receipt_number LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR s.customer_name LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  if (dateFrom) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 's.sale_date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 's.sale_date < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(dateTo);
  }

  const [rows] = await db.query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(s.net_amount), 0) AS total
     FROM sale s
     LEFT JOIN customers c ON s.customer_id = c.customer_id
     ${whereClause}`, params
  );
  return success(res, rows[0]);
}));

// GET /api/sales - รายการขายทั้งหมด
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
    whereClause = 'WHERE s.user_id = ?';
    params.push(req.user.user_id);
  }

  if (search) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += '(s.receipt_number LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR s.customer_name LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  if (dateFrom) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 's.sale_date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 's.sale_date < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(dateTo);
  }

  const [countResult] = await db.query(
    `SELECT COUNT(*) AS total FROM sale s LEFT JOIN customers c ON s.customer_id = c.customer_id ${whereClause}`, params
  );
  const total = countResult[0].total;

  const [rows] = await db.query(
    `SELECT s.*, COALESCE(s.customer_name, c.first_name) AS customer_first_name,
            CASE WHEN s.customer_name IS NOT NULL THEN '' ELSE c.last_name END AS customer_last_name,
            u.first_name AS user_first_name, u.last_name AS user_last_name,
            COALESCE(SUM(sd.quantity), 0) AS total_items
     FROM sale s
     LEFT JOIN customers c ON s.customer_id = c.customer_id
     LEFT JOIN user u ON s.user_id = u.user_id
     LEFT JOIN sale_details sd ON s.sale_id = sd.sale_id
     ${whereClause}
     GROUP BY s.sale_id, s.customer_id, s.customer_name, s.user_id, s.sale_date, s.receipt_number,
              s.total_amount, s.discount_amount, s.vat_amount, s.net_amount,
              s.payment_method, s.created_at, c.first_name, c.last_name, u.first_name, u.last_name
     ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return paginated(res, rows, total, page, limit);
}));

// GET /api/sales/:id - รายละเอียดการขาย (รวมรายการสินค้า)
router.get('/:id', idParamRule, validate, asyncHandler(async (req, res) => {
  const [sale] = await db.query(
    `SELECT s.*, COALESCE(s.customer_name, c.first_name) AS customer_first_name,
            CASE WHEN s.customer_name IS NOT NULL THEN '' ELSE c.last_name END AS customer_last_name,
            u.first_name AS user_first_name, u.last_name AS user_last_name
     FROM sale s
     LEFT JOIN customers c ON s.customer_id = c.customer_id
     LEFT JOIN user u ON s.user_id = u.user_id
     WHERE s.sale_id = ?`, [req.params.id]
  );
  if (sale.length === 0) throw new AppError('ไม่พบรายการขาย', 404);
  if (isEmployee(req) && sale[0].user_id !== req.user.user_id) throw new AppError('ไม่มีสิทธิ์เข้าถึงรายการนี้', 403);

  const [items] = await db.query(
    `SELECT sd.*, l.lot_number, l.received_at AS lot_received_at, l.unit_cost AS lot_unit_cost,
            p.product_name, p.barcode, p.product_image, p.model
     FROM sale_details sd
     LEFT JOIN inventory_lots l ON sd.lot_id = l.lot_id
     LEFT JOIN products p ON sd.product_id = p.product_id
     WHERE sd.sale_id = ?`, [req.params.id]
  );

  return success(res, { ...sale[0], items });
}));

// POST /api/sales - สร้างรายการขาย
router.post('/', asyncHandler(async (req, res) => {
  const { customer_id, items, payment_method, sale_date } = req.body;

  if (!items || items.length === 0) throw new AppError('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ', 400);
  if (!payment_method) throw new AppError('กรุณาเลือกวิธีการชำระเงิน', 400);

  const cid = customer_id || 'C00000';

  // Generate sale_id
  const [maxRow] = await db.query('SELECT MAX(CAST(SUBSTRING(sale_id,2) AS UNSIGNED)) AS maxId FROM sale WHERE sale_id REGEXP \'^S[0-9]\'');
  const nextNum = (maxRow[0].maxId || 0) + 1;
  const saleId = `S${String(nextNum).padStart(5, '0')}`;

  // Generate receipt_number
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const [receiptRow] = await db.query(
    'SELECT COUNT(*) AS cnt FROM sale WHERE receipt_number LIKE ?', [`REC-${dateStr}-%`]
  );
  const receiptNum = (receiptRow[0].cnt || 0) + 1;
  const receiptNumber = `REC-${dateStr}-${String(receiptNum).padStart(4, '0')}`;

  const saleDate = sale_date || now;

  // Validate and calculate
  let totalAmount = 0;
  const saleItems = [];

  for (const item of items) {
    if (!item.product_id || !item.quantity || item.quantity < 1) {
      throw new AppError('ข้อมูลสินค้าไม่ถูกต้อง', 400);
    }

    const [product] = await db.query('SELECT product_id, product_name, selling_price, stock_quantity FROM products WHERE product_id = ?', [item.product_id]);
    if (product.length === 0) {
      throw new AppError(`ไม่พบสินค้า ID: ${item.product_id}`, 404);
    }

    const p = product[0];
    if (p.stock_quantity < item.quantity) {
      throw new AppError(`สินค้า "${p.product_name}" มีสต๊อกไม่เพียงพอ (คงเหลือ ${p.stock_quantity})`, 400);
    }

    let unitPrice = parseFloat(p.selling_price || 0);
    if (item.lot_id) {
      const [lotRows] = await db.query('SELECT selling_price FROM inventory_lots WHERE lot_id = ? AND product_id = ?', [item.lot_id, item.product_id]);
      if (lotRows.length > 0 && lotRows[0].selling_price !== null && lotRows[0].selling_price !== undefined) {
        unitPrice = parseFloat(lotRows[0].selling_price);
      }
    }
    totalAmount += unitPrice * item.quantity;
    saleItems.push({ product_id: p.product_id, quantity: item.quantity, unit_price: unitPrice, lot_id: item.lot_id || null });
  }

  // ราคารวมทั้งหมด = สินค้า - ส่วนลด, VAT 7% คิดจากยอดหลังหักส่วนลด, ยอดสุทธิ = ยอดหลังหักส่วนลด + VAT
  const vatRate = 0.07;
  const discountAmount = Math.min(Math.max(0, parseFloat(req.body.discount_amount) || 0), totalAmount);
  const afterDiscount = totalAmount - discountAmount;
  const vatAmount = Math.round(afterDiscount * vatRate * 100) / 100;
  const netAmount = afterDiscount + vatAmount;

  // Begin transaction
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO sale (sale_id, customer_id, user_id, sale_date, receipt_number,
                         total_amount, discount_amount, vat_amount, net_amount, payment_method, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [saleId, cid, req.user.user_id, saleDate, receiptNumber,
       totalAmount.toFixed(2), discountAmount.toFixed(2), vatAmount.toFixed(2), netAmount.toFixed(2), payment_method]
    );

    for (const si of saleItems) {
      const allocations = await consumeLots(connection, si.product_id, si.quantity, si.lot_id);
      await connection.query(
        'UPDATE products SET stock_quantity = stock_quantity - ? WHERE product_id = ?',
        [si.quantity, si.product_id]
      );
      for (const allocation of allocations) {
        await connection.query(
          `INSERT INTO sale_details
            (sale_id, product_id, quantity, unit_price, lot_id, unit_cost)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [saleId, si.product_id, allocation.quantity, si.unit_price, allocation.lot_id, allocation.unit_cost]
        );
      }
    }

    await connection.commit();

    return success(res, { sale_id: saleId, receipt_number: receiptNumber, net_amount: netAmount }, 'บันทึกการขายสำเร็จ', 201);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}));

module.exports = router;
