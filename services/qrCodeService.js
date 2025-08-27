const axios = require('axios');

class QRCodeService {
  constructor() {
    // this.uploadUrl = process.env.QR_UPLOAD_URL || 'https://api.imgbb.com/1/upload';
    // this.apiKey = process.env.IMGBB_API_KEY;
  }

    async uploadImage(buffer) {
        // ใช้บริการฟรีเช่น QR Server
        try {
            // Convert buffer to base64
            const base64Image = buffer.toString('base64');
            
            // ใช้บริการฟรีที่รองรับ base64 upload
            const response = await axios.post(
            'https://api.imgur.com/3/image',
            {
                image: base64Image,
                type: 'base64'
            },
            {
                headers: {
                'Authorization': 'Client-ID YOUR_IMGUR_CLIENT_ID' // optional
                }
            }
            );
            
            return response.data.data.link;
        } catch (error) {
            console.warn('Image upload failed, using fallback QR');
            return this.getFallbackQRUrl();
        }
    }

    getFallbackQRUrl(amount, transactionId, promptPayNumber) {
    // ใช้ QR Server API ฟรี
    const qrData = encodeURIComponent(`${promptPayNumber}|${amount}|${transactionId}`);
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${qrData}&format=png`;
    }

    // ใน qrCodeService.js
    async generatePromptPayQR(amount, transactionId) {
        try {
        // รับข้อมูลบัญชีแอดมิน
        const adminBankAccount = await this.getAdminBankAccount();
        
        // สร้าง QR Code
        const qrInfo = await qrCodeService.generatePromptPayQR(
            amount, 
            transactionId,
            adminBankAccount.promptPayNumber
        );
        
        return qrInfo;
        } catch (error) {
        console.error('Payment QR generation error:', error);
        
        // Fallback: ใช้ค่าจาก environment
        const promptPayNumber = process.env.ADMIN_PROMPTPAY_NUMBER || '0812345678';
        return {
            imageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(promptPayNumber + '|' + amount + '|' + transactionId)}`,
            amount,
            transactionId,
            promptPayNumber
        };
        }
    }



    // สำหรับการทดสอบหรือ development
    async generateTestQR(amount, transactionId) {
        const promptPayNumber = process.env.ADMIN_PROMPTPAY_NUMBER || '0812345678';
        return {
        imageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(promptPayNumber + '|' + amount + '|' + transactionId)}`,
        amount,
        transactionId,
        promptPayNumber
        };
    }
    }

module.exports = new QRCodeService();