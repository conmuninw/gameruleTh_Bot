const axios = require('axios');

class PromptPayService {
  constructor() {
    this.apiUrl = 'https://promptpay.io';
  }

  async generateQRCode(phoneNumber, amount) {
    try {
      console.log('Generating PromptPay QR code for:', { phoneNumber, amount });
      
      // ใช้ PromptPay.io API
      const qrCodeUrl = `${this.apiUrl}/${phoneNumber}/${amount}.png`;
      
      // ทดสอบว่า URL ทำงานได้
      try {
        const response = await axios.head(qrCodeUrl, { timeout: 5000 });
        
        if (response.status === 200) {
          return {
            imageUrl: qrCodeUrl,
            amount: amount,
            promptPayNumber: phoneNumber,
            success: true
          };
        }
      } catch (error) {
        console.warn('PromptPay.io API test failed, using fallback');
      }
      
      // Fallback: ใช้ QuickChart.io
      return this.generateFallbackQR(phoneNumber, amount);
      
    } catch (error) {
      console.error('PromptPay QR generation error:', error);
      return this.generateFallbackQR(phoneNumber, amount);
    }
  }

  generateFallbackQR(phoneNumber, amount) {
    const qrData = `|${amount}|${phoneNumber}`;
    return {
      imageUrl: `https://quickchart.io/qr?text=${encodeURIComponent(qrData)}&size=300&margin=1&format=png`,
      amount: amount,
      promptPayNumber: phoneNumber,
      success: false
    };
  }

  // ตรวจสอบว่าเป็นเบอร์โทรศัพท์ไทยที่ถูกต้อง
  isValidThaiPhoneNumber(phoneNumber) {
    const thaiPhoneRegex = /^0[6|8|9]\d{8}$/;
    return thaiPhoneRegex.test(phoneNumber);
  }

  // แปลงเลขบัญชี bank account เป็นเบอร์โทรศัพท์ (ถ้าเป็นไปได้)
  convertToPhoneNumber(accountNumber) {
    // Logic การแปลง - ในทางปฏิบัติ可能需要ปรับแต่ง
    if (accountNumber && accountNumber.length === 10 && accountNumber.startsWith('0')) {
      return accountNumber; // ถ้าเป็นเบอร์โทรศัพท์อยู่แล้ว
    }
    return null;
  }
}

module.exports = new PromptPayService();