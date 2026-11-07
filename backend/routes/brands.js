const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, authorize } = require('../middleware/auth');
const { idParamRule, validate } = require('../middleware/validate');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { success } = require('../utils/response');

router.use(auth);

router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM brands ORDER BY brand_name ASC');
  return success(res, rows);
}));

router.get('/:id', idParamRule, validate, asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM brands WHERE brand_id = ?', [req.params.id]);
  if (rows.length === 0) throw new AppError('ไม่พบแบรนด์', 404);
  return success(res, rows[0]);
}));

router.post('/', authorize('admin', 'employee'), asyncHandler(async (req, res) => {
  const { brand_name } = req.body;
  if (!brand_name || !brand_name.trim()) {
    throw new AppError('กรุณากรอกชื่อแบรนด์', 400);
  }

  const [maxRow] = await db.query('SELECT MAX(CAST(SUBSTRING(brand_id,4) AS UNSIGNED)) AS maxId FROM brands');
  const nextNum = (maxRow[0].maxId || 0) + 1;
  const brandId = `BRD${String(nextNum).padStart(5, '0')}`;

  await db.query('INSERT INTO brands (brand_id, brand_name) VALUES (?, ?)', [brandId, brand_name.trim()]);
  return success(res, { brand_id: brandId }, 'เพิ่มแบรนด์สำเร็จ', 201);
}));

router.put('/:id', authorize('admin', 'employee'), idParamRule, validate, asyncHandler(async (req, res) => {
  const { brand_name } = req.body;
  if (!brand_name || !brand_name.trim()) {
    throw new AppError('กรุณากรอกชื่อแบรนด์', 400);
  }

  const [exist] = await db.query('SELECT brand_id FROM brands WHERE brand_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบแบรนด์', 404);

  await db.query('UPDATE brands SET brand_name = ? WHERE brand_id = ?', [brand_name.trim(), req.params.id]);
  return success(res, { brand_id: req.params.id }, 'แก้ไขแบรนด์สำเร็จ');
}));

router.delete('/:id', authorize('admin'), idParamRule, validate, asyncHandler(async (req, res) => {
  const [exist] = await db.query('SELECT brand_id FROM brands WHERE brand_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบแบรนด์', 404);

  const [used] = await db.query('SELECT product_id FROM products WHERE brand_id = ? LIMIT 1', [req.params.id]);
  if (used.length > 0) throw new AppError('ไม่สามารถลบได้เนื่องจากมีสินค้าที่ใช้แบรนด์นี้อยู่', 409);

  await db.query('DELETE FROM brands WHERE brand_id = ?', [req.params.id]);
  return success(res, null, 'ลบแบรนด์สำเร็จ');
}));

module.exports = router;
