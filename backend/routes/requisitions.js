const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, authorize, isEmployee } = require('../middleware/auth');
const { idParamRule, paginateRules, validate } = require('../middleware/validate');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { success, paginated } = require('../utils/response');
const { consumeLots } = require('../utils/inventory');

router.use(auth);

const STATUS = {
  PENDING: 'รออนุมัติ',
  APPROVED: 'อนุมัติ',
  REJECTED: 'ปฏิเสธ'
};

// ใบเบิกที่ยังไม่ตัดสต๊อกจริง (รออนุมัติ หรือ อนุมัติแล้วแต่ยังไม่ชำระเงิน) = สินค้าถูกจอง
const ACTIVE_RESERVATION = `(r.requisition_status = 'รออนุมัติ'
  OR (r.requisition_status = 'อนุมัติ' AND r.payment_status <> 'ชำระแล้ว'))`;

const getReservedQty = async (conn, productId, excludeRequisitionId = null) => {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(d.quantity), 0) AS reserved
     FROM requisition_details d
     JOIN requisition r ON r.requisition_id = d.requisition_id
     WHERE d.product_id = ? AND ${ACTIVE_RESERVATION}
       AND (? IS NULL OR r.requisition_id <> ?)`,
    [productId, excludeRequisitionId, excludeRequisitionId]
  );
  return parseInt(rows[0].reserved) || 0;
};

// จำนวนที่ถูกจองต่อสินค้า (ทุกใบเบิก) ใช้คำนวณจำนวนที่เบิกได้
router.get('/reserved', asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT d.product_id, SUM(d.quantity) AS reserved
     FROM requisition_details d
     JOIN requisition r ON r.requisition_id = d.requisition_id
     WHERE ${ACTIVE_RESERVATION}
     GROUP BY d.product_id`
  );
  return success(res, rows);
}));

router.get('/today-stats', asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count FROM requisition WHERE DATE(requisition_date) = CURDATE()`
  );
  return success(res, rows[0]);
}));

router.get('/pending-count', authorize('admin', 'employee'), asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count FROM requisition WHERE requisition_status = 'รออนุมัติ'`
  );
  return success(res, rows[0]);
}));
// GET /api/requisitions - รายการใบเบิกสินค้า (ช่างเห็นเฉพาะของตนเอง)
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

  if (req.user.role === 'supplier') {
    whereClause = 'WHERE r.user_id = ?';
    params.push(req.user.user_id);
  } else if (isEmployee(req)) {
    whereClause = "WHERE (r.approved_by = ? OR r.requisition_status = 'รออนุมัติ')";
    params.push(req.user.user_id);
  }

  if (search) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += '(r.requisition_id LIKE ? OR r.customer_name LIKE ? OR r.job_detail LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  if (statuses.length > 0) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += `r.requisition_status IN (${statuses.map(() => '?').join(', ')})`;
    params.push(...statuses);
  }

  if (dateFrom) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 'r.requisition_date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 'r.requisition_date < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(dateTo);
  }

  const [countResult] = await db.query(
    `SELECT COUNT(*) AS total FROM requisition r ${whereClause}`, params
  );
  const total = countResult[0].total;

  const [rows] = await db.query(
    `SELECT r.*, u.first_name AS user_first_name, u.last_name AS user_last_name,
            a.first_name AS approver_first_name, a.last_name AS approver_last_name,
            COALESCE(t.total_items, 0) AS total_items
     FROM requisition r
     LEFT JOIN user u ON r.user_id = u.user_id
     LEFT JOIN user a ON r.approved_by = a.user_id
     LEFT JOIN (
       SELECT requisition_id, SUM(quantity) AS total_items
       FROM requisition_details GROUP BY requisition_id
     ) t ON t.requisition_id = r.requisition_id
     ${whereClause}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return paginated(res, rows, total, page, limit);
}));

// GET /api/requisitions/:id - รายละเอียดใบเบิกสินค้า
router.get('/:id', idParamRule, validate, asyncHandler(async (req, res) => {
  const [reqRows] = await db.query(
    `SELECT r.*, u.first_name AS user_first_name, u.last_name AS user_last_name,
            a.first_name AS approver_first_name, a.last_name AS approver_last_name
     FROM requisition r
     LEFT JOIN user u ON r.user_id = u.user_id
     LEFT JOIN user a ON r.approved_by = a.user_id
     WHERE r.requisition_id = ?`, [req.params.id]
  );
  if (reqRows.length === 0) throw new AppError('ไม่พบใบเบิกสินค้า', 404);

  const record = reqRows[0];
  if (req.user.role === 'supplier' && record.user_id !== req.user.user_id) {
    throw new AppError('ไม่มีสิทธิ์เข้าถึงใบเบิกสินค้านี้', 403);
  }
  if (isEmployee(req) && record.requisition_status !== STATUS.PENDING && record.approved_by !== req.user.user_id) {
    throw new AppError('ไม่มีสิทธิ์เข้าถึงใบเบิกสินค้านี้', 403);
  }

  const [items] = await db.query(
    `SELECT d.*, l.lot_number, l.unit_cost AS lot_unit_cost,
            p.product_name, p.barcode, p.model, p.stock_quantity, p.selling_price
     FROM requisition_details d
     LEFT JOIN inventory_lots l ON d.lot_id = l.lot_id
     LEFT JOIN products p ON d.product_id = p.product_id
     WHERE d.requisition_id = ?`, [req.params.id]
  );

  return success(res, { ...record, items });
}));

// POST /api/requisitions - สร้างใบเบิกสินค้า (สถานะเริ่มต้น: รออนุมัติ)
router.post('/', asyncHandler(async (req, res) => {
  const { customer_name, job_detail, items, requisition_date } = req.body;

  if (!customer_name || !customer_name.trim()) throw new AppError('กรุณากรอกชื่อลูกค้า', 400);
  if (!job_detail || !job_detail.trim()) throw new AppError('กรุณากรอกรายละเอียดงาน หรือทะเบียนรถ', 400);
  if (!items || items.length === 0) throw new AppError('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ', 400);

  const reqItems = [];
  for (const item of items) {
    if (!item.product_id || !item.quantity || item.quantity < 1) {
      throw new AppError('ข้อมูลสินค้าไม่ถูกต้อง', 400);
    }

    const [product] = await db.query(
      'SELECT product_id, product_name, stock_quantity FROM products WHERE product_id = ?', [item.product_id]
    );
    if (product.length === 0) throw new AppError(`ไม่พบสินค้า ID: ${item.product_id}`, 404);

    const p = product[0];
    const available = p.stock_quantity - await getReservedQty(db, p.product_id);
    if (available < item.quantity) {
      throw new AppError(`สินค้า "${p.product_name}" มีจำนวนที่เบิกได้ไม่เพียงพอ (เบิกได้ ${Math.max(0, available)})`, 400);
    }

    reqItems.push({ product_id: p.product_id, quantity: item.quantity });
  }

  const mergedItems = [];
  for (const ri of reqItems) {
    const existing = mergedItems.find(m => m.product_id === ri.product_id);
    if (existing) existing.quantity += ri.quantity;
    else mergedItems.push({ ...ri });
  }

  const [maxRow] = await db.query("SELECT MAX(CAST(SUBSTRING(requisition_id,3) AS UNSIGNED)) AS maxId FROM requisition WHERE requisition_id REGEXP '^RQ[0-9]'");
  const nextNum = (maxRow[0].maxId || 0) + 1;
  const requisitionId = `RQ${String(nextNum).padStart(6, '0')}`;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO requisition (requisition_id, user_id, customer_name, job_detail,
                                requisition_date, requisition_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [requisitionId, req.user.user_id, customer_name.trim(), job_detail.trim(),
       requisition_date || new Date(), STATUS.PENDING]
    );

    for (const mi of mergedItems) {
      await connection.query(
        'INSERT INTO requisition_details (requisition_id, product_id, quantity) VALUES (?, ?, ?)',
        [requisitionId, mi.product_id, mi.quantity]
      );
    }

    await connection.commit();
    return success(res, { requisition_id: requisitionId, requisition_status: STATUS.PENDING }, 'ส่งใบเบิกสินค้าสำเร็จ รอการอนุมัติ', 201);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}));

// PATCH /api/requisitions/:id/approve - อนุมัติใบเบิก (ไม่ตัดสต๊อก แค่คำนวณยอด)
router.patch('/:id/approve', authorize('admin', 'employee'), idParamRule, validate, asyncHandler(async (req, res) => {
  const [reqRows] = await db.query('SELECT * FROM requisition WHERE requisition_id = ?', [req.params.id]);
  if (reqRows.length === 0) throw new AppError('ไม่พบใบเบิกสินค้า', 404);
  if (reqRows[0].requisition_status !== STATUS.PENDING) {
    throw new AppError('ใบเบิกสินค้านี้ถูกดำเนินการไปแล้ว', 400);
  }

  const [items] = await db.query(
    `SELECT d.product_id, d.quantity, p.product_name, p.stock_quantity, p.selling_price
     FROM requisition_details d
     LEFT JOIN products p ON d.product_id = p.product_id
     WHERE d.requisition_id = ?`, [req.params.id]
  );

  for (const item of items) {
    const available = item.stock_quantity - await getReservedQty(db, item.product_id, req.params.id);
    if (available < item.quantity) {
      throw new AppError(`สินค้า "${item.product_name}" มีจำนวนที่เบิกได้ไม่เพียงพอ (เบิกได้ ${Math.max(0, available)})`, 400);
    }
  }

  // คำนวณยอดจากราคาขายปัจจุบัน
  let subtotalAmount = 0;
  for (const item of items) {
    const unitPrice = parseFloat(item.selling_price) || 0;
    subtotalAmount += unitPrice * item.quantity;
  }

  const vatAmount = subtotalAmount * 0.07;
  const netAmount = subtotalAmount + vatAmount;

  await db.query(
    `UPDATE requisition
     SET requisition_status = ?, approved_by = ?, approved_at = NOW(),
         subtotal_amount = ?, vat_amount = ?, net_amount = ?,
         discount_amount = 0, labor_cost = 0,
         payment_status = 'ยังไม่ชำระ', payment_method = NULL, paid_at = NULL
     WHERE requisition_id = ?`,
    [STATUS.APPROVED, req.user.user_id, subtotalAmount.toFixed(2), vatAmount.toFixed(2), netAmount.toFixed(2), req.params.id]
  );

  return success(res, {
    requisition_id: req.params.id,
    requisition_status: STATUS.APPROVED,
    subtotal_amount: subtotalAmount,
    vat_amount: vatAmount,
    net_amount: netAmount,
    discount_amount: 0,
    labor_cost: 0,
    payment_status: 'ยังไม่ชำระ'
  }, 'อนุมัติใบเบิกสินค้าและคำนวณยอดเรียกเก็บสำเร็จ (ยังไม่ตัดสต๊อก)');
}));

// PATCH /api/requisitions/:id/payment - บันทึกการชำระเงินใบเบิก (ตัดสต๊อกที่นี่)
router.patch('/:id/payment', authorize('admin', 'employee'), idParamRule, validate, asyncHandler(async (req, res) => {
  const { payment_method, discount_amount = 0, labor_cost = 0 } = req.body;
  if (!['cash', 'transfer'].includes(payment_method)) {
    throw new AppError('กรุณาเลือกวิธีการชำระเงิน', 400);
  }

  const [reqRows] = await db.query('SELECT * FROM requisition WHERE requisition_id = ?', [req.params.id]);
  if (reqRows.length === 0) throw new AppError('ไม่พบใบเบิกสินค้า', 404);
  if (reqRows[0].requisition_status !== STATUS.APPROVED) {
    throw new AppError('ใบเบิกสินค้านี้ยังไม่ได้รับการอนุมัติ', 400);
  }
  if (reqRows[0].payment_status === 'ชำระแล้ว') {
    throw new AppError('ใบเบิกสินค้านี้ชำระเงินแล้ว', 400);
  }

  const requisition = reqRows[0];
  const subtotal = parseFloat(requisition.subtotal_amount || 0);
  const discount = Math.max(0, parseFloat(discount_amount) || 0);
  const labor = Math.max(0, parseFloat(labor_cost) || 0);

  // ตัดสต๊อกจริงตอนชำระเงิน
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [items] = await connection.query(
      `SELECT d.product_id, d.quantity, p.product_name, p.stock_quantity, p.selling_price
       FROM requisition_details d
       LEFT JOIN products p ON d.product_id = p.product_id
       WHERE d.requisition_id = ?`, [req.params.id]
    );

    // คำนวณราคา: ราคารวมทั้งหมด = สินค้า + ค่าแรง - ส่วนลด, VAT 7% คิดจากราคารวมทั้งหมด, ยอดสุทธิ = ราคารวมทั้งหมด + VAT
    const totalBeforeVat = subtotal + labor - discount;
    if (totalBeforeVat < 0) throw new AppError('ส่วนลดต้องไม่มากกว่ายอดรวม', 400);
    const vatAmount = Math.round(totalBeforeVat * 0.07 * 100) / 100;
    const netAmount = totalBeforeVat + vatAmount;

    // บันทึกเป็นรายการขาย เพื่อให้แสดงในประวัติการขาย
    const [maxRow] = await connection.query("SELECT MAX(CAST(SUBSTRING(sale_id,2) AS UNSIGNED)) AS maxId FROM sale WHERE sale_id REGEXP '^S[0-9]'");
    const saleId = `S${String((maxRow[0].maxId || 0) + 1).padStart(5, '0')}`;
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const [receiptRow] = await connection.query('SELECT COUNT(*) AS cnt FROM sale WHERE receipt_number LIKE ?', [`REC-${dateStr}-%`]);
    const receiptNumber = `REC-${dateStr}-${String((receiptRow[0].cnt || 0) + 1).padStart(4, '0')}`;

    await connection.query(
      `INSERT INTO sale (sale_id, customer_id, customer_name, user_id, sale_date, receipt_number,
                         total_amount, discount_amount, vat_amount, net_amount, payment_method, created_at)
       VALUES (?, 'C00000', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [saleId, requisition.customer_name, requisition.user_id, now, receiptNumber,
       (subtotal + labor).toFixed(2), discount.toFixed(2), vatAmount.toFixed(2), netAmount.toFixed(2), payment_method]
    );

    for (const item of items) {
      if (item.stock_quantity < item.quantity) {
        throw new AppError(`สินค้า "${item.product_name}" มีสต๊อกไม่เพียงพอ (คงเหลือ ${item.stock_quantity})`, 400);
      }
      const allocations = await consumeLots(connection, item.product_id, item.quantity);
      const unitPrice = parseFloat(item.selling_price) || 0;

      for (const allocation of allocations) {
        await connection.query(
          `INSERT INTO sale_details (sale_id, product_id, quantity, unit_price, lot_id, unit_cost)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [saleId, item.product_id, allocation.quantity, unitPrice, allocation.lot_id, allocation.unit_cost]
        );
      }

      await connection.query(
        'UPDATE products SET stock_quantity = stock_quantity - ? WHERE product_id = ?',
        [item.quantity, item.product_id]
      );

      const [details] = await connection.query(
        'SELECT requisition_detail_id FROM requisition_details WHERE requisition_id = ? AND product_id = ? ORDER BY requisition_detail_id LIMIT 1',
        [req.params.id, item.product_id]
      );
      if (details.length === 0) throw new AppError(`ไม่พบรายการเบิกสินค้า "${item.product_name}"`, 400);

      const firstAllocation = allocations[0];
      await connection.query(
        `UPDATE requisition_details
         SET quantity = ?, lot_id = ?, unit_cost = ?, unit_price = ?
         WHERE requisition_detail_id = ?`,
        [firstAllocation.quantity, firstAllocation.lot_id, firstAllocation.unit_cost, unitPrice, details[0].requisition_detail_id]
      );

      for (let index = 1; index < allocations.length; index += 1) {
        const allocation = allocations[index];
        await connection.query(
          `INSERT INTO requisition_details
            (requisition_id, product_id, quantity, lot_id, unit_cost, unit_price)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [req.params.id, item.product_id, allocation.quantity, allocation.lot_id, allocation.unit_cost, unitPrice]
        );
      }
    }

    await connection.query(
      `UPDATE requisition
       SET payment_status = 'ชำระแล้ว', payment_method = ?, paid_at = NOW(),
           discount_amount = ?, labor_cost = ?,
           vat_amount = ?, net_amount = ?
       WHERE requisition_id = ?`,
      [payment_method, discount.toFixed(2), labor.toFixed(2), vatAmount.toFixed(2), netAmount.toFixed(2), req.params.id]
    );

    await connection.commit();
    return success(res, {
      requisition_id: req.params.id,
      payment_status: 'ชำระแล้ว',
      payment_method,
      discount_amount: discount,
      labor_cost: labor,
      vat_amount: vatAmount,
      net_amount: netAmount,
      paid_at: new Date()
    }, 'บันทึกการชำระเงินใบเบิกและตัดสต๊อกสำเร็จ');
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}));

// PATCH /api/requisitions/:id/reject - ปฏิเสธใบเบิกสินค้า
router.patch('/:id/reject', authorize('admin', 'employee'), idParamRule, validate, asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const [reqRows] = await db.query('SELECT requisition_status FROM requisition WHERE requisition_id = ?', [req.params.id]);
  if (reqRows.length === 0) throw new AppError('ไม่พบใบเบิกสินค้า', 404);
  if (reqRows[0].requisition_status !== STATUS.PENDING) {
    throw new AppError('ใบเบิกสินค้านี้ถูกดำเนินการไปแล้ว', 400);
  }

  await db.query(
    `UPDATE requisition SET requisition_status = ?, approved_by = ?, approved_at = NOW(), reject_reason = ?
     WHERE requisition_id = ?`,
    [STATUS.REJECTED, req.user.user_id, (reason || '').trim(), req.params.id]
  );

  return success(res, { requisition_id: req.params.id, requisition_status: STATUS.REJECTED }, 'ปฏิเสธใบเบิกสินค้าสำเร็จ');
}));

// PATCH /api/requisitions/:id/cancel - ยกเลิกใบเบิกก่อนชำระเงิน (คืนยอดจอง)
router.patch('/:id/cancel', authorize('admin', 'employee'), idParamRule, validate, asyncHandler(async (req, res) => {
  const [reqRows] = await db.query(
    'SELECT requisition_status, payment_status FROM requisition WHERE requisition_id = ?', [req.params.id]
  );
  if (reqRows.length === 0) throw new AppError('ไม่พบใบเบิกสินค้า', 404);
  const { requisition_status: status, payment_status: payStatus } = reqRows[0];
  const cancellable = status === STATUS.PENDING || (status === STATUS.APPROVED && payStatus !== 'ชำระแล้ว');
  if (!cancellable) throw new AppError('ไม่สามารถยกเลิกใบเบิกสินค้านี้ได้', 400);

  await db.query(
    `UPDATE requisition SET requisition_status = ?, approved_by = ?, approved_at = NOW(), reject_reason = ?
     WHERE requisition_id = ?`,
    [STATUS.REJECTED, req.user.user_id, (req.body.reason || '').trim(), req.params.id]
  );

  return success(res, { requisition_id: req.params.id, requisition_status: STATUS.REJECTED }, 'ยกเลิกใบเบิกสินค้าสำเร็จ');
}));

module.exports = router;
