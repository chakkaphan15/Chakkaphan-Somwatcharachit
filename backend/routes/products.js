const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, authorize } = require('../middleware/auth');
const { productRules, idParamRule, paginateRules, validate } = require('../middleware/validate');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { success, paginated } = require('../utils/response');

router.use(auth);

router.get('/next-id', asyncHandler(async (req, res) => {
  const [maxRow] = await db.query(`SELECT MAX(CAST(SUBSTRING(product_id,2) AS UNSIGNED)) AS maxId FROM products WHERE product_id REGEXP '^A[0-9]'`);
  const nextNum = (maxRow[0].maxId || 0) + 1;
  const productId = `A${String(nextNum).padStart(3, '0')}`;
  return success(res, { product_id: productId });
}));

router.get('/all', asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT p.*, b.brand_name, s.supp_name
     FROM products p
     LEFT JOIN brands b ON p.brand_id = b.brand_id
     LEFT JOIN supplier s ON p.supp_id = s.supp_id
     ORDER BY p.product_name ASC`
  );
  return success(res, rows);
}));

router.get('/', paginateRules, validate, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  const lowStock = req.query.low_stock === '1';
  const includeOutOfStock = req.query.include_out_of_stock === '1';

  let whereClause = '';
  const params = [];

  if (search) {
    whereClause = 'WHERE p.product_id LIKE ? OR p.product_name LIKE ? OR p.barcode LIKE ? OR p.model LIKE ?';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  if (lowStock) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += "p.stock_quantity <= p.reorder_level AND p.product_condition = 'new'";
  }

  if (!includeOutOfStock) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 'p.stock_quantity > 0';
  }

  const [countResult] = await db.query(
    `SELECT COUNT(*) AS total FROM products p ${whereClause}`, params
  );
  const total = countResult[0].total;

  const [rows] = await db.query(
    `SELECT p.*, b.brand_name, s.supp_name
     FROM products p
     LEFT JOIN brands b ON p.brand_id = b.brand_id
     LEFT JOIN supplier s ON p.supp_id = s.supp_id
     ${whereClause}
     ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return paginated(res, rows, total, page, limit);
}));

router.get('/low-stock', auth, asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT p.*, b.brand_name
     FROM products p
     LEFT JOIN brands b ON p.brand_id = b.brand_id
     WHERE p.stock_quantity <= p.reorder_level AND p.stock_quantity > 0 AND p.product_condition = 'new'
      ORDER BY p.stock_quantity ASC`
  );
  return success(res, rows);
}));

router.get('/:id/lots', idParamRule, validate, asyncHandler(async (req, res) => {
  const [product] = await db.query('SELECT product_id FROM products WHERE product_id = ?', [req.params.id]);
  if (product.length === 0) throw new AppError('ไม่พบสินค้า', 404);
  const [rows] = await db.query(
    `SELECT lot_id, lot_number, quantity_received, quantity_remaining, unit_cost, selling_price, received_at, expiry_date, status
     FROM inventory_lots
     WHERE product_id = ?
     ORDER BY received_at DESC, lot_id DESC`,
    [req.params.id]
  );
  return success(res, rows);
}));

// GET /api/products/lots - รายการสินค้าแบบแยกตามล็อต (1 แถว = 1 ล็อต, สินค้าที่ยังไม่มีล็อตจะได้ 1 แถวว่าง)
router.get('/lots', paginateRules, validate, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  const lowStock = req.query.low_stock === '1';
  const includeOutOfStock = req.query.include_out_of_stock === '1';

  let whereClause = '';
  const params = [];

  if (search) {
    whereClause = 'WHERE p.product_id LIKE ? OR p.product_name LIKE ? OR p.barcode LIKE ? OR p.model LIKE ? OR l.lot_number LIKE ?';
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }

  if (lowStock) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += "p.stock_quantity <= p.reorder_level AND p.product_condition = 'new'";
  }

  if (!includeOutOfStock) {
    whereClause += whereClause ? ' AND ' : 'WHERE ';
    whereClause += 'p.stock_quantity > 0';
  }

  const [countResult] = await db.query(
    `SELECT COUNT(*) AS total
     FROM products p
     LEFT JOIN inventory_lots l ON l.product_id = p.product_id
     ${whereClause}`, params
  );
  const total = countResult[0].total;

  const [rows] = await db.query(
    `SELECT p.product_id, p.product_name, p.barcode, p.model, p.product_image, p.product_condition,
            p.reorder_level, p.stock_quantity, p.brand_id, p.supp_id,
            b.brand_name, s.supp_name,
            l.lot_id, l.lot_number, l.quantity_received, l.quantity_remaining,
            l.unit_cost, l.selling_price, l.received_at, l.expiry_date, l.status
     FROM products p
     LEFT JOIN inventory_lots l ON l.product_id = p.product_id
     LEFT JOIN brands b ON p.brand_id = b.brand_id
     LEFT JOIN supplier s ON p.supp_id = s.supp_id
     ${whereClause}
     ORDER BY p.product_name ASC, l.received_at DESC, l.lot_id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return paginated(res, rows, total, page, limit);
}));

// GET /api/products/lots/:lotId - รายละเอียดเฉพาะล็อตนั้น (ไม่รวมล็อตอื่นของสินค้าเดียวกัน)
router.get('/lots/:lotId', asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT l.*, p.product_name, p.barcode, p.model, p.product_image, p.product_condition,
            p.reorder_level, p.stock_quantity, b.brand_name, s.supp_name
     FROM inventory_lots l
     JOIN products p ON l.product_id = p.product_id
     LEFT JOIN brands b ON p.brand_id = b.brand_id
     LEFT JOIN supplier s ON p.supp_id = s.supp_id
     WHERE l.lot_id = ?`,
    [req.params.lotId]
  );
  if (rows.length === 0) throw new AppError('ไม่พบล็อตสินค้า', 404);
  return success(res, rows[0]);
}));

// PUT /api/products/lots/:lotId - แก้ไขเฉพาะล็อตนี้ (ต้นทุน/ราคาขาย/วันหมดอายุ) ไม่กระทบล็อตอื่น
router.put('/lots/:lotId', authorize('admin', 'employee'), asyncHandler(async (req, res) => {
  const { unit_cost, selling_price, expiry_date, received_at } = req.body;
  const [exist] = await db.query('SELECT lot_id FROM inventory_lots WHERE lot_id = ?', [req.params.lotId]);
  if (exist.length === 0) throw new AppError('ไม่พบล็อตสินค้า', 404);

  if (unit_cost !== undefined && unit_cost !== '' && (isNaN(Number(unit_cost)) || Number(unit_cost) < 0)) {
    throw new AppError('ราคาต้นทุนไม่ถูกต้อง', 400);
  }
  if (selling_price !== undefined && selling_price !== '' && (isNaN(Number(selling_price)) || Number(selling_price) < 0)) {
    throw new AppError('ราคาขายไม่ถูกต้อง', 400);
  }

  await db.query(
    `UPDATE inventory_lots SET
       unit_cost = COALESCE(?, unit_cost),
       selling_price = COALESCE(?, selling_price),
       expiry_date = COALESCE(?, expiry_date),
       received_at = COALESCE(?, received_at)
     WHERE lot_id = ?`,
    [
      unit_cost !== undefined && unit_cost !== '' ? unit_cost : null,
      selling_price !== undefined && selling_price !== '' ? selling_price : null,
      expiry_date || null,
      received_at || null,
      req.params.lotId
    ]
  );

  return success(res, { lot_id: req.params.lotId }, 'แก้ไขล็อตสินค้าสำเร็จ');
}));

// DELETE /api/products/lots/:lotId - ลบเฉพาะล็อตนี้ (ลบไม่ได้ถ้าเคยถูกขาย/เบิกไปแล้วบางส่วน)
router.delete('/lots/:lotId', authorize('admin'), asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM inventory_lots WHERE lot_id = ?', [req.params.lotId]);
  if (rows.length === 0) throw new AppError('ไม่พบล็อตสินค้า', 404);
  const lot = rows[0];
  if (Number(lot.quantity_remaining) > 0 && Number(lot.quantity_remaining) !== Number(lot.quantity_received)) {
    throw new AppError('ไม่สามารถลบล็อตนี้ได้ เนื่องจากมีการขาย/เบิกสินค้าจากล็อตนี้ไปแล้ว', 400);
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      'UPDATE products SET stock_quantity = GREATEST(stock_quantity - ?, 0) WHERE product_id = ?',
      [lot.quantity_remaining, lot.product_id]
    );
    await connection.query('DELETE FROM inventory_lots WHERE lot_id = ?', [req.params.lotId]);
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  return success(res, null, 'ลบล็อตสินค้าสำเร็จ');
}));

router.get('/:id', idParamRule, validate, asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT p.*, b.brand_name, s.supp_name
     FROM products p
     LEFT JOIN brands b ON p.brand_id = b.brand_id
     LEFT JOIN supplier s ON p.supp_id = s.supp_id
     WHERE p.product_id = ?`,
    [req.params.id]
  );
  if (rows.length === 0) throw new AppError('ไม่พบสินค้า', 404);
  return success(res, rows[0]);
}));

router.post('/', authorize('admin', 'employee'), (req, res, next) => {
  req.app.upload.single('product_image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: 'ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)' });
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
}, productRules, validate, asyncHandler(async (req, res) => {
  const { product_name, barcode, brand_id, supp_id, model, selling_price, purchase_price,
          reorder_level, product_condition } = req.body;

  const imageFile = req.file ? `/uploads/${req.file.filename}` : '';

  const [maxRow] = await db.query(`SELECT MAX(CAST(SUBSTRING(product_id,2) AS UNSIGNED)) AS maxId FROM products WHERE product_id REGEXP '^A[0-9]'`);
  const nextNum = (maxRow[0].maxId || 0) + 1;
  const productId = `A${String(nextNum).padStart(3, '0')}`;

  await db.query(
    `INSERT INTO products (product_id, barcode, brand_id, supp_id, product_name, model,
                           selling_price, purchase_price, stock_quantity, reorder_level,
                           product_condition, product_status, product_image, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NOW())`,
    [productId, barcode || '', brand_id, supp_id || null, product_name, model || '',
     selling_price !== undefined && selling_price !== '' ? selling_price : null,
     purchase_price !== undefined && purchase_price !== '' ? purchase_price : null,
     reorder_level || 0, product_condition || 'new', 'active', imageFile]
  );

  return success(res, { product_id: productId, product_image: imageFile }, 'เพิ่มสินค้าสำเร็จ', 201);
}));

router.put('/:id', authorize('admin', 'employee'), (req, res, next) => {
  req.app.upload.single('product_image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: 'ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)' });
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
}, idParamRule.concat(productRules), validate, asyncHandler(async (req, res) => {
  const [exist] = await db.query('SELECT product_id, product_image, selling_price, purchase_price FROM products WHERE product_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบสินค้า', 404);

  const { product_name, barcode, brand_id, supp_id, model, selling_price, purchase_price,
          reorder_level, product_condition } = req.body;

  const isAdmin = req.user.user_role === 'admin';
  const existing = exist[0];
  const existingSelling = existing.selling_price !== null && existing.selling_price !== undefined ? Number(existing.selling_price) : null;
  const existingPurchase = existing.purchase_price !== null && existing.purchase_price !== undefined ? Number(existing.purchase_price) : null;
  const sellingProvided = selling_price !== undefined && selling_price !== '';
  const purchaseProvided = purchase_price !== undefined && purchase_price !== '';
  const sellingChanged = sellingProvided && Number(selling_price) !== existingSelling;
  const purchaseChanged = purchaseProvided && Number(purchase_price) !== existingPurchase;

  if (!isAdmin && (sellingChanged || purchaseChanged)) {
    throw new AppError('เฉพาะแอดมินเท่านั้นที่สามารถแก้ไขราคาต้นทุนและราคาขายได้', 403);
  }

  const finalSellingPrice = isAdmin && sellingProvided ? selling_price : existing.selling_price;
  const finalPurchasePrice = isAdmin && purchaseProvided ? purchase_price : existing.purchase_price;

  const imageFile = req.file ? `/uploads/${req.file.filename}` : exist[0].product_image;

  await db.query(
    `UPDATE products SET product_name=?, barcode=?, brand_id=?, supp_id=?, model=?, selling_price=?,
                         purchase_price=?, reorder_level=?, product_condition=?, product_image=?
     WHERE product_id=?`,
    [product_name, barcode || '', brand_id, supp_id || null, model || '', finalSellingPrice,
     finalPurchasePrice, reorder_level || 0, product_condition || 'new', imageFile, req.params.id]
  );

  return success(res, { product_id: req.params.id, product_image: imageFile }, 'แก้ไขสินค้าสำเร็จ');
}));

router.delete('/:id', authorize('admin'), idParamRule, validate, asyncHandler(async (req, res) => {
  const [exist] = await db.query('SELECT product_id FROM products WHERE product_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบสินค้า', 404);

  const productId = req.params.id;

  const [lotRows] = await db.query('SELECT COUNT(*) AS cnt FROM inventory_lots WHERE product_id = ?', [productId]);
  if (Number(lotRows[0].cnt) > 0) {
    throw new AppError('ไม่สามารถลบสินค้าได้ เนื่องจากมีล็อตสินค้าคงเหลืออยู่ ลบล็อตออกก่อนแล้วจึงจะลบสินค้านี้ได้', 400);
  }

  const [receiptRows] = await db.query('SELECT COUNT(*) AS cnt FROM goods_receipt_details WHERE product_id = ?', [productId]);
  if (Number(receiptRows[0].cnt) > 0) {
    throw new AppError('ไม่สามารถลบสินค้าได้ เนื่องจากมีประวัติการรับสินค้า', 400);
  }

  const [saleRows] = await db.query('SELECT COUNT(*) AS cnt FROM sale_details WHERE product_id = ?', [productId]);
  if (Number(saleRows[0].cnt) > 0) {
    throw new AppError('ไม่สามารถลบสินค้าได้ เนื่องจากมีประวัติการขาย', 400);
  }

  const [reqRows] = await db.query('SELECT COUNT(*) AS cnt FROM requisition_details WHERE product_id = ?', [productId]);
  if (Number(reqRows[0].cnt) > 0) {
    throw new AppError('ไม่สามารถลบสินค้าได้ เนื่องจากมีประวัติการเบิกสินค้า', 400);
  }

  await db.query('DELETE FROM products WHERE product_id = ?', [productId]);
  return success(res, null, 'ลบสินค้าสำเร็จ');
}));

module.exports = router;
