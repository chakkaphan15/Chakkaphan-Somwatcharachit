const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, authorize } = require('../middleware/auth');
const { idParamRule, paginateRules, validate } = require('../middleware/validate');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { success, paginated } = require('../utils/response');

router.use(auth);

router.get('/', paginateRules, validate, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  const sort = req.query.sort || 'recent';

  const whereParts = ["c.customer_id <> 'C00000'"];
  const params = [];

  if (search) {
    whereParts.push('(c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone_number LIKE ? OR c.province LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  const whereClause = `WHERE ${whereParts.join(' AND ')}`;

  const orderMap = {
    recent: 'c.created_at DESC',
    name: 'c.first_name ASC, c.last_name ASC',
    spent: 'COALESCE(t.total_spent, 0) DESC',
    last_sale: 'COALESCE(t.last_visit, \'1900-01-01\') DESC'
  };

  const [countResult] = await db.query(
    `SELECT COUNT(*) AS total FROM customers c
     LEFT JOIN (SELECT customer_id, COUNT(*) AS visits, SUM(net_amount) AS total_spent
                FROM sale GROUP BY customer_id) t ON t.customer_id = c.customer_id
     ${whereClause}`,
    params
  );
  const total = countResult[0].total;

  const [rows] = await db.query(
    `SELECT c.*,
            COALESCE(t.visits, 0) AS visits,
            COALESCE(t.total_spent, 0) AS total_spent,
            t.last_visit
     FROM customers c
     LEFT JOIN (SELECT customer_id, COUNT(*) AS visits, SUM(net_amount) AS total_spent, MAX(sale_date) AS last_visit
                FROM sale GROUP BY customer_id) t ON t.customer_id = c.customer_id
     ${whereClause} ORDER BY ${orderMap[sort] || orderMap.recent} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return paginated(res, rows, total, page, limit);
}));

router.get('/stats', asyncHandler(async (req, res) => {
  const [total] = await db.query('SELECT COUNT(*) AS c FROM customers WHERE customer_id <> \'C00000\'');
  const [newMonth] = await db.query(`SELECT COUNT(*) AS c FROM customers WHERE customer_id <> 'C00000' AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`);
  const [buyers] = await db.query(`SELECT COUNT(DISTINCT customer_id) AS c FROM sale WHERE customer_id IS NOT NULL AND customer_id <> '' AND customer_id <> 'C00000'`);
  const [sales] = await db.query(`SELECT COALESCE(SUM(net_amount),0) AS t FROM sale WHERE customer_id IS NOT NULL AND customer_id <> '' AND customer_id <> 'C00000'`);

  return success(res, {
    total: total[0].c,
    new_this_month: newMonth[0].c,
    buyers: buyers[0].c,
    total_sales: parseFloat(sales[0].t)
  });
}));;

router.get('/all', asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT customer_id, prefix, first_name, last_name, phone_number
     FROM customers
     WHERE customer_id <> 'C00000'
     ORDER BY first_name ASC`
  );
  return success(res, rows);
}));

router.get('/:id', idParamRule, validate, asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM customers WHERE customer_id = ?', [req.params.id]);
  if (rows.length === 0) throw new AppError('ไม่พบลูกค้า', 404);
  return success(res, rows[0]);
}));

router.get('/:id/history', idParamRule, validate, asyncHandler(async (req, res) => {
  const [exist] = await db.query('SELECT * FROM customers WHERE customer_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบลูกค้า', 404);

  const [purchases] = await db.query(
    `SELECT sale_id, receipt_number, sale_date, total_amount, discount_amount, vat_amount, net_amount, payment_method
     FROM sale WHERE customer_id = ? ORDER BY sale_date DESC, created_at DESC LIMIT 15`,
    [req.params.id]
  );

  const [agg] = await db.query(
    `SELECT COUNT(*) AS visits,
            COALESCE(SUM(net_amount),0) AS total_spent,
            COALESCE(SUM(total_amount),0) AS total_before_vat,
            MAX(sale_date) AS last_visit,
            MIN(sale_date) AS first_visit
     FROM sale WHERE customer_id = ?`,
    [req.params.id]
  );

  let items = [];
  if (purchases.length > 0) {
    const saleIds = purchases.map(p => p.sale_id);
    const placeholders = saleIds.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT sd.sale_id, p.product_name, p.model, sd.quantity, sd.unit_price
       FROM sale_details sd JOIN products p ON p.product_id = sd.product_id
       WHERE sd.sale_id IN (${placeholders})`,
      saleIds
    );
    items = rows;
  }

  return success(res, {
    customer: exist[0],
    purchases,
    items,
    stats: {
      visits: agg[0].visits,
      total_spent: parseFloat(agg[0].total_spent),
      total_before_vat: parseFloat(agg[0].total_before_vat),
      last_visit: agg[0].last_visit,
      first_visit: agg[0].first_visit
    }
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { prefix, first_name, last_name, phone_number, house_no, village_no, alley, road, sub_district, district, province, post_code } = req.body;

  if (!first_name || !first_name.trim()) throw new AppError('กรุณากรอกชื่อลูกค้า', 400);
  if (!last_name || !last_name.trim()) throw new AppError('กรุณากรอกนามสกุลลูกค้า', 400);
  if (!phone_number || !phone_number.trim()) throw new AppError('กรุณากรอกเบอร์โทรศัพท์', 400);

  const [maxRow] = await db.query('SELECT MAX(CAST(SUBSTRING(customer_id,2) AS UNSIGNED)) AS maxId FROM customers WHERE customer_id REGEXP \'^C[0-9]\'');
  const nextNum = (maxRow[0].maxId || 0) + 1;
  const customerId = `C${String(nextNum).padStart(5, '0')}`;

  await db.query(
    `INSERT INTO customers (customer_id, prefix, first_name, last_name, phone_number,
                            house_no, village_no, alley, road, sub_district, district, province, post_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [customerId, prefix || '', first_name.trim(), last_name.trim(), phone_number.trim(),
     house_no || 0, village_no || '', alley || '', road || '',
     sub_district || '', district || '', province || '', post_code || '']
  );

  return success(res, { customer_id: customerId }, 'เพิ่มลูกค้าสำเร็จ', 201);
}));

router.put('/:id', authorize('admin', 'employee'), idParamRule, validate, asyncHandler(async (req, res) => {
  const [exist] = await db.query('SELECT customer_id FROM customers WHERE customer_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบลูกค้า', 404);

  const { prefix, first_name, last_name, phone_number, house_no, village_no, alley, road, sub_district, district, province, post_code } = req.body;

  await db.query(
    `UPDATE customers SET prefix=?, first_name=?, last_name=?, phone_number=?,
                          house_no=?, village_no=?, alley=?, road=?, sub_district=?,
                          district=?, province=?, post_code=?
     WHERE customer_id=?`,
    [prefix || '', first_name, last_name, phone_number,
     house_no || 0, village_no || '', alley || '', road || '',
     sub_district || '', district || '', province || '', post_code || '', req.params.id]
  );

  return success(res, { customer_id: req.params.id }, 'แก้ไขลูกค้าสำเร็จ');
}));

router.delete('/:id', authorize('admin'), idParamRule, validate, asyncHandler(async (req, res) => {
  const [exist] = await db.query('SELECT customer_id FROM customers WHERE customer_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบลูกค้า', 404);

  await db.query('DELETE FROM customers WHERE customer_id = ?', [req.params.id]);
  return success(res, null, 'ลบลูกค้าสำเร็จ');
}));

module.exports = router;
