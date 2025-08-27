const Admin = require('../models/Admin');
const Transaction = require('../models/Transaction');
const facebookService = require("./facebookService");
const promptpayService = require('./promptpayService');

class PaymentService {
  constructor() {
    this.adminId = process.env.ADMIN_ID || 'default_admin';
  }

  async generatePromptPayQR(amount, transactionId) {
    try {
      console.log('Generating payment QR for:', { amount, transactionId });
      
      // รับข้อมูลบัญชีแอดมิน
      const adminBankAccount = await this.getAdminBankAccount();
      const promptPayNumber = adminBankAccount.promptPayNumber;
      
      console.log('Using PromptPay number:', promptPayNumber);
      
      // ใช้ PromptPay.io สำหรับสร้าง QR Code
      const qrInfo = await promptpayService.generateQRCode(promptPayNumber, amount);
      
      return {
        ...qrInfo,
        transactionId: transactionId
      };
      
    } catch (error) {
      console.error('Payment QR generation error:', error);
      
      // Fallback
      const promptPayNumber = process.env.ADMIN_PROMPTPAY_NUMBER || '0812345678';
      const fallbackQR = promptpayService.generateFallbackQR(promptPayNumber, amount);
      
      return {
        ...fallbackQR,
        transactionId: transactionId
      };
    }
  }

  async generateSellerPaymentQR(transaction) {
    try {
      const adminId = process.env.ADMIN_FB_ID;
      if (!adminId) return;

      const amount = transaction.gameDetails.price;
      const promptPayNumber = transaction.sellerBankInfo.promptPayNumber;
      
      // สร้าง QR Code URL ด้วย promptpay.io
      const qrCodeUrl = `https://promptpay.io/${promptPayNumber}/${amount}`;
      
      // ส่ง QR Code ให้แอดมิน
      await facebookService.sendMessage(adminId, {
        attachment: {
          type: "image",
          payload: { url: qrCodeUrl, is_reusable: true }
        }
      });

      // ส่งข้อมูลการโอนให้แอดมิน
      await facebookService.sendQuickReply(adminId,
        `💰 โอนเงินให้ผู้ขาย\n\n` +
        `📋 Transaction ID: ${transaction.transactionId}\n` +
        `👤 ผู้ขาย: ${transaction.sellerBankInfo.accountName}\n` +
        `🏦 ธนาคาร: ${transaction.sellerBankInfo.bankName}\n` +
        `📞 พร้อมเพย์: ${promptPayNumber}\n` +
        `💵 จำนวน: ${amount} บาท\n\n` +
        `⚠️ กรุณาสแกน QR Code เพื่อโอนเงิน`,
        [
          {
            type: "postback",
            title: "✅ โอนเงินเรียบร้อย",
            payload: `ADMIN_PAID_SELLER_${transaction.transactionId}`
          },
          {
            type: "postback",
            title: "❌ มีปัญหา",
            payload: `ADMIN_PAYMENT_PROBLEM_${transaction.transactionId}`
          }
        ]
      );

    } catch (error) {
      console.error('Generate seller payment QR error:', error);
    }
  }

  async handleSellerBankInfo(sellerId, bankInfo) {
    try {
      const [bankName, accountNumber, accountName] = bankInfo.split('|');
      
      if (!bankName || !accountNumber || !accountName) {
        throw new Error('รูปแบบข้อมูลไม่ถูกต้อง');
      }

      // ค้นหา transaction ล่าสุดของผู้ขาย
      const transaction = await Transaction.findOne({ 
        sellerId: sellerId
      }).sort({ createdAt: -1 });

      if (transaction) {
        transaction.sellerBankInfo = {
          bankName: bankName.trim(),
          accountNumber: accountNumber.trim(),
          accountName: accountName.trim(),
          promptPayNumber: accountNumber.trim() // ใช้ accountNumber เป็น promptPayNumber
        };
        await transaction.save();
      }
    } catch (error) {
      console.error('Handle seller bank info error:', error);
      throw error;
    }
  }

  async requestSellerBankInfo(sellerId) {
    try {
      await facebookService.sendMessage(sellerId,
        `🏦 กรุณากรอกข้อมูลบัญชีธนาคาร\n\n` +
        `เพื่อรับเงินจากการขายบัญชีเกม\n\n` +
        `ส่งในรูปแบบ:\n` +
        `ชื่อธนาคาร|เลขพร้อมเพย์|ชื่อบัญชี\n\n` +
        `💡 ตัวอย่าง: "กสิกรไทย|0812345678|สมชาย ใจดี"\n\n` +
        `⚠️ ข้อมูลนี้จะถูกใช้สำหรับการโอนเงินให้คุณเท่านั้น`
      );
    } catch (error) {
      console.error('Request seller bank info error:', error);
    }
  }

  async getAdminBankAccount() {
    try {
      console.log('Getting admin bank account for:', this.adminId);
      
      const admin = await Admin.findOne({ adminId: this.adminId });
      
      if (!admin) {
        console.warn('ไม่พบข้อมูลแอดมินใน DB，ใช้ค่าจาก environment');
        return {
          bankName: process.env.ADMIN_BANK_NAME,
          accountNumber: process.env.ADMIN_ACCOUNT_NUMBER,
          accountName: process.env.ADMIN_ACCOUNT_NAME,
          promptPayNumber: process.env.ADMIN_PROMPTPAY_NUMBER || '0812345678'
        };
      }

      console.log('Found admin:', admin);
      return admin.bankAccount;
    } catch (error) {
      console.error('Get admin bank account error:', error);
      return {
        promptPayNumber: process.env.ADMIN_PROMPTPAY_NUMBER || '0812345678'
      };
    }
  }

  async notifyAdminForPaymentVerification(transactionId, amount, imageUrl) {
    const adminId = process.env.ADMIN_FB_ID;
    
    if (adminId) {
      try {
        // ส่งภาพหลักฐานให้แอดมิน
        await facebookService.sendMessage(adminId, {
          attachment: {
            type: "image",
            payload: { url: imageUrl, is_reusable: true }
          }
        });

        // ส่งปุ่มให้แอดมินตรวจสอบ
        await facebookService.sendButtonTemplate(adminId,
          `🔔 มีหลักฐานการชำระเงินใหม่\n\n` +
          `📋 Transaction ID: ${transactionId}\n` +
          `💰 จำนวน: ${amount} บาท\n\n` +
          `โปรดตรวจสอบหลักฐานการโอนเงิน:`,
          [
            {
              type: "postback",
              title: "✅ ยืนยันการชำระเงิน",
              payload: `ADMIN_CONFIRM_PAYMENT_${transactionId}`
            },
            {
              type: "postback",
              title: "❌ การชำระเงินไม่ถูกต้อง",
              payload: `ADMIN_REJECT_PAYMENT_${transactionId}`
            }
          ]
        );

      } catch (error) {
        console.error('Notify admin error:', error);
      }
    }
  }

  async handlePaymentWithProof(userId, transactionId, imageUrl) {
    try {
      const transaction = await Transaction.findOne({ transactionId });
      
      if (!transaction) {
        throw new Error('ไม่พบธุรกรรมนี้');
      }

      // บันทึกหลักฐานการโอน
      transaction.paymentProof = {
        imageUrl: imageUrl,
        uploadedAt: new Date()
      };
      transaction.status = 'payment_verification'; // เปลี่ยนสถานะเป็นรอตรวจสอบ
      await transaction.save();

      // แจ้งแอดมินให้ตรวจสอบหลักฐาน
      await this.notifyAdminForPaymentVerification(transactionId, transaction.paymentAmount, imageUrl);

      // แจ้งผู้ซื้อ
      await facebookService.sendMessage(userId,
        `✅ รับหลักฐานการโอนเงินเรียบร้อยแล้ว!\n\n` +
        `💰 จำนวน: ${transaction.paymentAmount} บาท\n\n` +
        `🕒 ระบบกำลังตรวจสอบการชำระเงิน\n` +
        `⏳ โดยปกติใช้เวลาไม่เกิน 5 นาที\n\n` +
        `📞 หากมีข้อสงสัย ติดต่อ support ที่ Line : @gameruleTh`
      );

      return transaction;
    } catch (error) {
      console.error('Handle payment with proof error:', error);
      throw error;
    }
  }
}


module.exports = new PaymentService();