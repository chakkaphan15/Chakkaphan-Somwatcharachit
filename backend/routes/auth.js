const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { auth } = require('../middleware/auth');
const { loginRules, validate } = require('../middleware/validate');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { success } = require('../utils/response');

router.post('/login', loginRules, validate, asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const [users] = await db.query('SELECT * FROM user WHERE username = ?', [username]);

  if (users.length === 0) {
    throw new AppError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 401);
  }

  const user = users[0];
  const isMatch = bcrypt.compareSync(password, user.password);

  if (!isMatch) {
    throw new AppError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 401);
  }

  const payload = {
    user_id: user.user_id,
    username: user.username,
    fullname: `${user.prefix || ''}${user.first_name} ${user.last_name}`.trim(),
    role: user.user_role,
    user_role: user.user_role
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });

  return success(res, { token, user: payload }, 'เข้าสู่ระบบสำเร็จ');
}));

router.get('/me', auth, asyncHandler(async (req, res) => {
  const [users] = await db.query(
    `SELECT user_id, username, prefix, first_name, last_name, user_role,
            phone_number, birth_date, house_no, village_no, alley, road,
            sub_district, district, province, post_code
     FROM user WHERE user_id = ?`,
    [req.user.user_id]
  );

  if (users.length === 0) {
    throw new AppError('ไม่พบผู้ใช้', 404);
  }

  const u = users[0];
  const payload = {
    user_id: u.user_id,
    username: u.username,
    fullname: `${u.prefix || ''}${u.first_name} ${u.last_name}`.trim(),
    role: u.user_role,
    user_role: u.user_role
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });

  return success(res, {
    ...u,
    fullname: `${u.prefix || ''}${u.first_name} ${u.last_name}`.trim(),
    token
  });
}));

router.put('/change-password', auth, asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    throw new AppError('กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่', 400);
  }

  if (new_password.length < 4) {
    throw new AppError('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร', 400);
  }

  const [users] = await db.query('SELECT * FROM user WHERE user_id = ?', [req.user.user_id]);
  if (users.length === 0) {
    throw new AppError('ไม่พบผู้ใช้', 404);
  }

  const isMatch = bcrypt.compareSync(current_password, users[0].password);
  if (!isMatch) {
    throw new AppError('รหัสผ่านปัจจุบันไม่ถูกต้อง', 401);
  }

  const hashedPassword = bcrypt.hashSync(new_password, 10);
  await db.query('UPDATE user SET password = ? WHERE user_id = ?', [hashedPassword, req.user.user_id]);

  return success(res, null, 'เปลี่ยนรหัสผ่านสำเร็จ');
}));

module.exports = router;
