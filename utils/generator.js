const generateTransactionId = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomStr = Math.random().toString(36).substr(2, 6).toUpperCase();
  // ใช้รูปแบบที่ไม่เหมือน tracking number
  return `TX${timestamp}${randomStr}`;
};

function generateCaseId() {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CASE-${timestamp}-${randomStr}`;
}

module.exports = {
  generateTransactionId,
  generateCaseId  
};
