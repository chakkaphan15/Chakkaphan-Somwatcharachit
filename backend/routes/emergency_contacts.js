const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, authorize } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { success } = require('../utils/response');

router.use(auth, authorize('admin'));

const genContactId = async () => {
  const [maxRow] = await db.query('SELECT MAX(CAST(SUBSTRING(contact_id,6) AS UNSIGNED)) AS maxId FROM emergency_contacts');
  const nextNum = (maxRow[0].maxId || 0) + 1;
  return `CONTC${String(nextNum).padStart(5, '0')}`;
};

router.get('/user/:userId', asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM emergency_contacts WHERE user_id = ? ORDER BY frist_name ASC',
    [req.params.userId]
  );
  return success(res, rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { user_id } = req.body;
  const [user] = await db.query('SELECT user_id FROM user WHERE user_id = ?', [user_id]);
  if (user.length === 0) throw new AppError('ไม่พบพนักงาน', 404);

  const contactId = await genContactId();
  await db.query(
    'INSERT INTO emergency_contacts (contact_id, user_id, perfix, frist_name, last_name, relationship, phone_num) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [contactId, user_id, req.body.perfix || '', req.body.frist_name || '', req.body.last_name || '', req.body.relationship || '', req.body.phone_num || '']
  );
  return success(res, { contact_id: contactId }, 'เพิ่มผู้ติดต่อฉุกเฉินสำเร็จ', 201);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const [exist] = await db.query('SELECT contact_id FROM emergency_contacts WHERE contact_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบผู้ติดต่อฉุกเฉิน', 404);

  await db.query(
    'UPDATE emergency_contacts SET perfix=?, frist_name=?, last_name=?, relationship=?, phone_num=? WHERE contact_id=?',
    [req.body.perfix || '', req.body.frist_name || '', req.body.last_name || '', req.body.relationship || '', req.body.phone_num || '', req.params.id]
  );
  return success(res, { contact_id: req.params.id }, 'แก้ไขผู้ติดต่อฉุกเฉินสำเร็จ');
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const [exist] = await db.query('SELECT contact_id FROM emergency_contacts WHERE contact_id = ?', [req.params.id]);
  if (exist.length === 0) throw new AppError('ไม่พบผู้ติดต่อฉุกเฉิน', 404);
  await db.query('DELETE FROM emergency_contacts WHERE contact_id = ?', [req.params.id]);
  return success(res, null, 'ลบผู้ติดต่อฉุกเฉินสำเร็จ');
}));

module.exports = router;
