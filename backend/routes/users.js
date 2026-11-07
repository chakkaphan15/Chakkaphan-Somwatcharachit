const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { auth, authorize } = require('../middleware/auth');
const { userRules, userUpdateRules, idParamRule, paginateRules, validate } = require('../middleware/validate');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { success, paginated } = require('../utils/response');

// ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง (เข้าถึงได้โดยผู้ใช้ทั่วไป)
router.put('/change-password/me', auth, asyncHandler(async (req, res) => {
  const { old_password, new_password } = req.body;

  if (!old_password) throw new AppError('กรุณากรอกรหัสผ่านเดิม', 400);
  if (!new_password || new_password.length < 4 || new_password.length > 100) {
    throw new AppError('รหัสผ่านใหม่ต้องมีความยาว 4-100 ตัวอักษร', 400);
  }

  const [rows] = await db.query('SELECT password FROM user WHERE user_id = ?', [req.user.user_id]);
  if (rows.length === 0) throw new AppError('ไม่พบผู้ใช้', 404);

  if (!bcrypt.compareSync(old_password, rows[0].password)) {
    throw new AppError('รหัสผ่านเดิมไม่ถูกต้อง', 400);
  }

  const hashed = bcrypt.hashSync(new_password, 10);
  await db.query('UPDATE user SET password = ? WHERE user_id = ?', [hashed, req.user.user_id]);

  return success(res, null, 'เปลี่ยนรหัสผ่านสำเร็จ');
}));

// ผู้ใช้แก้ไขข้อมูลส่วนตัวของตัวเอง (เข้าถึงได้โดยผู้ใช้ทั่วไป, ห้ามแก้ user_role/username จากจุดนี้)
router.put('/me', auth, asyncHandler(async (req, res) => {
  const { prefix, first_name, last_name, phone_number,
          birth_date, house_no, village_no, alley, road, sub_district, district, province, post_code } = req.body;

  if (!first_name || !first_name.trim()) throw new AppError('กรุณากรอกชื่อ', 400);
  if (!last_name || !last_name.trim()) throw new AppError('กรุณากรอกนามสกุล', 400);
  if (!phone_number || !/^[0-9]{9,10}$/.test(phone_number)) throw new AppError('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (9-10 หลัก)', 400);

  await db.query(
    `UPDATE user SET prefix=?, first_name=?, last_name=?, phone_number=?,
                     birth_date=?, house_no=?, village_no=?, alley=?, road=?,
                     sub_district=?, district=?, province=?, post_code=?
     WHERE user_id=?`,
    [prefix || '', first_name.trim(), last_name.trim(), phone_number,
     birth_date || null, house_no || '', village_no || '', alley || '', road || '',
     sub_district || '', district || '', province || '', post_code || '', req.user.user_id]
  );

  return success(res, { user_id: req.user.user_id }, 'บันทึกข้อมูลส่วนตัวสำเร็จ');
}));

// All routes below require authenticated admin
router.use(auth, authorize('admin'));

router.get('/', paginateRules, validate, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  let whereClause = '';
  const params = [];

  if (search) {
    whereClause = 'WHERE first_name LIKE ? OR last_name LIKE ? OR username LIKE ? OR phone_number LIKE ?';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  const [countResult] = await db.query(`SELECT COUNT(*) AS total FROM user ${whereClause}`, params);
  const total = countResult[0].total;

  const [rows] = await db.query(
     `SELECT user_id, username, prefix, first_name, last_name, phone_number, user_role, created_at
      FROM user ${whereClause} ORDER BY FIELD(user_role,'admin','employee','supplier'), created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return paginated(res, rows, total, page, limit);
}));

router.get('/:id', idParamRule, validate, asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM user WHERE user_id = ?', [req.params.id]);
  if (rows.length === 0) throw new AppError('ไม่พบผู้ใช้', 404);
  return success(res, rows[0]);
}));

router.post('/', userRules, validate, asyncHandler(async (req, res) => {
  const { username, password, prefix, first_name, last_name, phone_number, user_role,
          birth_date, house_no, village_no, alley, road, sub_district, district, province, post_code } = req.body;

  const [exist] = await db.query('SELECT user_id FROM user WHERE username = ?', [username]);
  if (exist.length > 0) throw new AppError('ชื่อผู้ใช้นี้มีในระบบแล้ว', 409);

  const hashedPassword = bcrypt.hashSync(password, 10);

  const [maxRow] = await db.query('SELECT MAX(CAST(SUBSTRING(user_id,6) AS UNSIGNED)) AS maxId FROM user');
  const nextNum = (maxRow[0].maxId || 0) + 1;
  const userId = `USER${String(nextNum).padStart(5, '0')}`;

  await db.query(
    `INSERT INTO user (user_id, password, prefix, first_name, last_name, username, phone_number, user_role,
                       birth_date, house_no, village_no, alley, road, sub_district, district, province, post_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [userId, hashedPassword, prefix || '', first_name, last_name, username, phone_number, user_role,
     birth_date || null, house_no || '', village_no || '', alley || '', road || '',
     sub_district || '', district || '', province || '', post_code || '']
  );

  return success(res, { user_id: userId }, 'เพิ่มผู้ใช้สำเร็จ', 201);
}));

router.put('/:id', idParamRule.concat(userUpdateRules), validate, asyncHandler(async (req, res) => {
  const [exist] = await db.query('SELECT user_id FROM user WHERE user_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบผู้ใช้', 404);

  const { username, prefix, first_name, last_name, phone_number, user_role, password,
          birth_date, house_no, village_no, alley, road, sub_district, district, province, post_code } = req.body;

  const newUsername = typeof username === 'string' ? username.trim() : '';
  if (newUsername) {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) {
      throw new AppError('ชื่อผู้ใช้ต้องมี 3-20 ตัวอักษร (a-z, 0-9, _ เท่านั้น)', 400);
    }
    const [dup] = await db.query('SELECT user_id FROM user WHERE username = ? AND user_id <> ?', [newUsername, req.params.id]);
    if (dup.length > 0) throw new AppError('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว', 400);
  }

  let sql = `UPDATE user SET prefix=?, first_name=?, last_name=?, phone_number=?, user_role=?,
                           birth_date=?, house_no=?, village_no=?, alley=?, road=?,
                           sub_district=?, district=?, province=?, post_code=?`;
  const params = [prefix || '', first_name, last_name, phone_number, user_role,
                  birth_date || null, house_no || '', village_no || '', alley || '', road || '',
                  sub_district || '', district || '', province || '', post_code || ''];

  if (newUsername) {
    sql += ', username=?';
    params.push(newUsername);
  }

  if (password && password.trim()) {
    const hashed = bcrypt.hashSync(password, 10);
    sql += ', password=?';
    params.push(hashed);
  }

  sql += ' WHERE user_id=?';
  params.push(req.params.id);

  await db.query(sql, params);

  return success(res, { user_id: req.params.id }, 'แก้ไขผู้ใช้สำเร็จ');
}));

router.delete('/:id', idParamRule, validate, asyncHandler(async (req, res) => {
  const [exist] = await db.query('SELECT user_id FROM user WHERE user_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบผู้ใช้', 404);

  if (req.params.id === req.user.user_id) {
    throw new AppError('ไม่สามารถลบบัญชีของตัวเองได้', 400);
  }

  await db.query('DELETE FROM user WHERE user_id = ?', [req.params.id]);
  return success(res, null, 'ลบผู้ใช้สำเร็จ');
}));

// Admin เปลี่ยนรหัสผ่านของผู้อื่น
router.put('/:id/change-password', authorize('admin'), idParamRule, validate, asyncHandler(async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 4 || new_password.length > 100) {
    throw new AppError('รหัสผ่านต้องมีความยาว 4-100 ตัวอักษร', 400);
  }

  const [exist] = await db.query('SELECT user_id FROM user WHERE user_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบผู้ใช้', 404);

  const hashed = bcrypt.hashSync(new_password, 10);
  await db.query('UPDATE user SET password = ? WHERE user_id = ?', [hashed, req.params.id]);

  return success(res, null, 'เปลี่ยนรหัสผ่านสำเร็จ');
}));

module.exports = router;

