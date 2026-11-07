const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, authorize } = require('../middleware/auth');
const { idParamRule, paginateRules, supplierRules, validate } = require('../middleware/validate');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { success, paginated } = require('../utils/response');

router.use(auth);

router.get('/all', asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT supp_id, supp_name, prefix, first_name, last_name, phone_number, email, house_no, sub_district, district, province, postal_code FROM supplier ORDER BY supp_name ASC'
  );
  return success(res, rows);
}));

router.get('/', paginateRules, validate, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  let whereClause = '';
  const params = [];

  if (search) {
    whereClause = 'WHERE supp_name LIKE ? OR phone_number LIKE ? OR email LIKE ?';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const [countResult] = await db.query(`SELECT COUNT(*) AS total FROM supplier ${whereClause}`, params);
  const total = countResult[0].total;

  const [rows] = await db.query(
    `SELECT * FROM supplier ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return paginated(res, rows, total, page, limit);
}));

router.get('/:id', idParamRule, validate, asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM supplier WHERE supp_id = ?', [req.params.id]);
  if (rows.length === 0) throw new AppError('ไม่พบผู้จำหน่าย', 404);
  return success(res, rows[0]);
}));

router.post('/', authorize('admin', 'employee'), supplierRules, validate, asyncHandler(async (req, res) => {
  const { supp_name, tax_id, prefix, first_name, last_name, phone_number, email,
          house_no, road, sub_district, district, province, postal_code } = req.body;

  const [maxRow] = await db.query('SELECT MAX(CAST(SUBSTRING(supp_id,5) AS UNSIGNED)) AS maxId FROM supplier');
  const nextNum = (maxRow[0].maxId || 0) + 1;
  const suppId = `SUPP${String(nextNum).padStart(5, '0')}`;

  await db.query(
    `INSERT INTO supplier (supp_id, supp_name, tax_id, prefix, first_name, last_name,
                           phone_number, email, house_no, road, sub_district,
                           district, province, postal_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [suppId, supp_name, tax_id || '', prefix || '', first_name || '', last_name || '',
     phone_number, email || '', house_no || '', road || '', sub_district || '',
     district || '', province || '', postal_code || '']
  );

  return success(res, { supp_id: suppId }, 'เพิ่มผู้จำหน่ายสำเร็จ', 201);
}));

router.put('/:id', authorize('admin', 'employee'), idParamRule.concat(supplierRules), validate, asyncHandler(async (req, res) => {
  const [exist] = await db.query('SELECT supp_id FROM supplier WHERE supp_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบผู้จำหน่าย', 404);

  const { supp_name, tax_id, prefix, first_name, last_name, phone_number, email,
          house_no, road, sub_district, district, province, postal_code } = req.body;

  await db.query(
    `UPDATE supplier SET supp_name=?, tax_id=?, prefix=?, first_name=?, last_name=?, phone_number=?,
                         email=?, house_no=?, road=?, sub_district=?, district=?,
                         province=?, postal_code=?
     WHERE supp_id=?`,
    [supp_name, tax_id || '', prefix || '', first_name || '', last_name || '', phone_number,
     email || '', house_no || '', road || '', sub_district || '', district || '',
     province || '', postal_code || '', req.params.id]
  );

  return success(res, { supp_id: req.params.id }, 'แก้ไขผู้จำหน่ายสำเร็จ');
}));

router.delete('/:id', authorize('admin'), idParamRule, validate, asyncHandler(async (req, res) => {
  const [exist] = await db.query('SELECT supp_id FROM supplier WHERE supp_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบผู้จำหน่าย', 404);

  await db.query('DELETE FROM supplier WHERE supp_id = ?', [req.params.id]);
  return success(res, null, 'ลบผู้จำหน่ายสำเร็จ');
}));

module.exports = router;
