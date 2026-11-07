const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, authorize } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { success } = require('../utils/response');

router.use(auth);

// GET /api/company - ข้อมูลร้าน/บริษัทปัจจุบัน (admin+employee อ่านได้ เพื่อใช้ตอนสร้าง PO)
router.get('/', authorize('admin', 'employee'), asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT company_name, tax_id, address, phone_number, updated_at FROM company_profile WHERE id = 1'
  );
  return success(res, rows[0] || null);
}));

// PUT /api/company - แก้ไขข้อมูลร้าน/บริษัท (admin เท่านั้น)
router.put('/', authorize('admin'), asyncHandler(async (req, res) => {
  const { company_name, tax_id, address, phone_number } = req.body;
  if (!company_name || !company_name.trim()) throw new AppError('กรุณากรอกชื่อร้าน/บริษัท', 400);
  if (!address || !address.trim()) throw new AppError('กรุณากรอกที่อยู่', 400);
  if (!phone_number || !phone_number.trim()) throw new AppError('กรุณากรอกเบอร์โทรศัพท์', 400);

  await db.query(
    `INSERT INTO company_profile (id, company_name, tax_id, address, phone_number, updated_at, updated_by)
     VALUES (1, ?, ?, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE
       company_name = VALUES(company_name), tax_id = VALUES(tax_id),
       address = VALUES(address), phone_number = VALUES(phone_number),
       updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
    [company_name.trim(), (tax_id || '').trim(), address.trim(), phone_number.trim(), req.user.user_id]
  );

  return success(res, null, 'บันทึกข้อมูลร้าน/บริษัทสำเร็จ');
}));

module.exports = router;
