const success = (res, data = null, message = 'สำเร็จ', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    ...(data && { data })
  });
};

const error = (res, message = 'เกิดข้อผิดพลาด', statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message,
    ...(errors && { errors })
  };
  return res.status(statusCode).json(response);
};

const paginated = (res, data, total, page, limit, message = 'สำเร็จ') => {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  });
};

module.exports = { success, error, paginated };
