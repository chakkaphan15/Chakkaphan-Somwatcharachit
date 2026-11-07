const { body, param, query, validationResult } = require('express-validator');
const { error } = require('../utils/response');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map(e => ({
      field: e.path,
      message: e.msg
    }));
    return error(res, 'ข้อมูลไม่ถูกต้อง', 400, messages);
  }
  next();
};

const loginRules = [
  body('username')
    .trim()
    .notEmpty().withMessage('กรุณากรอกชื่อผู้ใช้')
    .isLength({ min: 3, max: 50 }).withMessage('ชื่อผู้ใช้ต้องมีความยาว 3-50 ตัวอักษร'),
  body('password')
    .notEmpty().withMessage('กรุณากรอกรหัสผ่าน')
    .isLength({ min: 4, max: 100 }).withMessage('รหัสผ่านต้องมีความยาว 4-100 ตัวอักษร')
];

const userRules = [
  body('username')
    .trim()
    .notEmpty().withMessage('กรุณากรอกชื่อผู้ใช้')
    .isLength({ min: 3, max: 20 }).withMessage('ชื่อผู้ใช้ต้องมีความยาว 3-20 ตัวอักษร')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('ชื่อผู้ใช้สามารถมีได้เฉพาะตัวอักษร ตัวเลข และ _'),
  body('password')
    .notEmpty().withMessage('กรุณากรอกรหัสผ่าน')
    .isLength({ min: 4, max: 100 }).withMessage('รหัสผ่านต้องมีความยาว 4-100 ตัวอักษร'),
  body('first_name')
    .trim()
    .notEmpty().withMessage('กรุณากรอกชื่อ')
    .isLength({ max: 50 }).withMessage('ชื่อต้องไม่เกิน 50 ตัวอักษร'),
  body('last_name')
    .trim()
    .notEmpty().withMessage('กรุณากรอกนามสกุล')
    .isLength({ max: 50 }).withMessage('นามสกุลต้องไม่เกิน 50 ตัวอักษร'),
  body('phone_number')
    .trim()
    .notEmpty().withMessage('กรุณากรอกเบอร์โทรศัพท์')
    .matches(/^[0-9]{9,10}$/).withMessage('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (10 หลัก)'),
  body('user_role')
    .trim()
    .notEmpty().withMessage('กรุณาเลือกบทบาท')
    .isIn(['admin', 'employee', 'supplier']).withMessage('บทบาทไม่ถูกต้อง'),
  body('prefix')
    .trim()
    .notEmpty().withMessage('กรุณาเลือกคำนำหน้า')
];

const userUpdateRules = [
  body('first_name')
    .trim()
    .notEmpty().withMessage('กรุณากรอกชื่อ')
    .isLength({ max: 50 }).withMessage('ชื่อต้องไม่เกิน 50 ตัวอักษร'),
  body('last_name')
    .trim()
    .notEmpty().withMessage('กรุณากรอกนามสกุล')
    .isLength({ max: 50 }).withMessage('นามสกุลต้องไม่เกิน 50 ตัวอักษร'),
  body('phone_number')
    .trim()
    .notEmpty().withMessage('กรุณากรอกเบอร์โทรศัพท์')
    .matches(/^[0-9]{9,10}$/).withMessage('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง'),
  body('user_role')
    .trim()
    .notEmpty().withMessage('กรุณาเลือกบทบาท')
    .isIn(['admin', 'employee', 'supplier']).withMessage('บทบาทไม่ถูกต้อง')
];

const productRules = [
  body('product_name')
    .trim()
    .notEmpty().withMessage('กรุณากรอกชื่อสินค้า')
    .isLength({ max: 100 }).withMessage('ชื่อสินค้าต้องไม่เกิน 100 ตัวอักษร'),
  body('selling_price')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 }).withMessage('ราคาขายต้องมีค่ามากกว่าหรือเท่ากับ 0'),
  body('purchase_price')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 }).withMessage('ราคาต้นทุนต้องมีค่ามากกว่าหรือเท่ากับ 0'),
  body('brand_id')
    .notEmpty().withMessage('กรุณาเลือกแบรนด์')
];

const idParamRule = [
  param('id')
    .trim()
    .notEmpty().withMessage('กรุณาระบุ ID')
];

const paginateRules = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('เลขหน้าต้องเป็นจำนวนเต็มบวก'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('จำนวนต่อหน้าต้องอยู่ระหว่าง 1-100')
];

const supplierRules = [
  body('supp_name')
    .trim()
    .notEmpty().withMessage('กรุณากรอกชื่อผู้จำหน่าย')
    .isLength({ max: 100 }).withMessage('ชื่อผู้จำหน่ายต้องไม่เกิน 100 ตัวอักษร'),
  body('phone_number')
    .trim()
    .notEmpty().withMessage('กรุณากรอกเบอร์โทรศัพท์')
    .matches(/^[0-9]{9,10}$/).withMessage('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง'),
  body('email')
    .trim()
    .optional({ values: 'falsy' })
    .isEmail().withMessage('รูปแบบอีเมลไม่ถูกต้อง')
];

const saleRules = [
  body('customer_id')
    .notEmpty().withMessage('กรุณาเลือกลูกค้า'),
  body('items')
    .isArray({ min: 1 }).withMessage('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ'),
  body('items.*.product_id')
    .notEmpty().withMessage('กรุณาเลือกสินค้า'),
  body('items.*.quantity')
    .isInt({ min: 1 }).withMessage('จำนวนต้องมากกว่า 0'),
  body('items.*.unit_price')
    .isFloat({ min: 0 }).withMessage('ราคาต้องมากกว่าหรือเท่ากับ 0'),
  body('payment_method')
    .trim()
    .notEmpty().withMessage('กรุณาเลือกวิธีการชำระเงิน')
    .isIn(['cash', 'transfer', 'credit', 'other']).withMessage('วิธีการชำระเงินไม่ถูกต้อง')
];

const purchaseOrderRules = [
  body('supp_id')
    .notEmpty().withMessage('กรุณาเลือกผู้จำหน่าย'),
  body('items')
    .isArray({ min: 1 }).withMessage('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ'),
  body('items.*.product_id')
    .notEmpty().withMessage('กรุณาเลือกสินค้า'),
  body('items.*.quantity')
    .isInt({ min: 1 }).withMessage('จำนวนต้องมากกว่า 0'),
  body('items.*.unit_price')
    .isFloat({ min: 0 }).withMessage('ราคาต้องมากกว่าหรือเท่ากับ 0')
];

const receiveRules = [
  body('po_id')
    .notEmpty().withMessage('กรุณาเลือกใบสั่งซื้อ'),
  body('items')
    .isArray({ min: 1 }).withMessage('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ'),
  body('items.*.product_id')
    .notEmpty().withMessage('กรุณาเลือกสินค้า'),
  body('items.*.quantity')
    .isInt({ min: 1 }).withMessage('จำนวนต้องมากกว่า 0')
];

module.exports = {
  validate,
  loginRules,
  userRules,
  userUpdateRules,
  productRules,
  idParamRule,
  paginateRules,
  supplierRules,
  saleRules,
  purchaseOrderRules,
  receiveRules
};
