const { error } = require('../utils/response');

class AppError extends Error {
  constructor(message, statusCode = 500, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const notFound = (req, res, next) => {
  return error(res, `ไม่พบเส้นทาง: ${req.originalUrl}`, 404);
};

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  if (err.isOperational) {
    return error(res, err.message, err.statusCode, err.errors);
  }

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return error(res, 'ข้อมูลไม่ถูกต้อง', 400, messages);
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return error(res, 'ข้อมูลนี้มีอยู่ในระบบแล้ว', 409);
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
    return error(res, 'ไม่สามารถดำเนินการได้เนื่องจากมีข้อมูลอ้างอิงอยู่', 409);
  }

  if (err.code === 'ECONNREFUSED') {
    return error(res, 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้', 503);
  }

  return error(res, 'เกิดข้อผิดพลาดภายในระบบ', 500);
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { AppError, notFound, errorHandler, asyncHandler };
