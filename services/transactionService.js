const Transaction = require('../models/Transaction');
const stateService = require('./stateService');
const paymentService = require('./paymentService');
const facebookService = require('./facebookService');
const { generateTransactionId } = require('../utils/generator');

class TransactionService {
  async startSellerFlow(userId) {
    stateService.setState(userId, 'awaiting_game_details');
    
    await facebookService.sendMessage(userId,
      `🎮 เริ่มต้นกลางบัญชีเกม\n\n` +
      `💵 ค่ากลาง 50 บาท\n` +
      `📋 กรุณาส่งรายละเอียดในรูปแบบ:\n` +
      `• ต้องการขายเกมอะไร\n\n` +
      `• ชื่อเฟสบุคผู้ขาย\n\n` +
      `• ราคาที่ต้องการ (ไม่รวมค่ากลาง)\n\n` +
      `• รายละเอียดเพิ่มเติม (ไม่บังคับ)\n\n` +
      `💡 ตัวอย่าง: "ArenaBreakout สมชาย 1700 มีสกินหายาก"`
    );
  }

  async handleGameDetails(userId, message) {
    const gameDetails = this.parseGameDetails(message);
    const transactionId = generateTransactionId();

    const transaction = new Transaction({
      transactionId,
      sellerId: userId,
      gameDetails,
      status: 'waiting_buyer'
    });

    await transaction.save();
    stateService.setState(userId, 'transaction_created', { transactionId });

    await facebookService.sendMessage(userId,
      `✅ สร้างธุรกรรมสำเร็จ!\n\n` +
      `🎮 เกม: ${gameDetails.game}\n` +
      `👤 ผู้ขาย: ${gameDetails.level}\n` +
      `💰 ราคา: ${gameDetails.price} บาท\n\n` +
      `💵 ค่ากลาง: 50 บาท\n\n` +
      `เมื่อมีผู้ซื้อเข้าร่วม ระบบจะแจ้งให้คุณทราบ\n\n` +
      `🔗 แชร์ Transaction ID ด้านล่างนี้ให้ผู้ซื้อ👇`
    );
    await facebookService.sendMessage(userId,
      `${transactionId}`
    );
  }

  async handleBuyerJoin(buyerId, transactionId) {
    try {
      const transaction = await Transaction.findOne({ transactionId });
      
      if (!transaction) {
        throw new Error('ไม่พบธุรกรรมนี้ในระบบ');
      }
      
      // ตรวจสอบว่าผู้ซื้อเป็นผู้ขายหรือไม่
      if (transaction.sellerId === buyerId) {
        throw new Error('คุณเป็นผู้ขายในธุรกรรมนี้ ไม่สามารถเป็นผู้ซื้อได้');
      }
      
      if (transaction.buyerId) {
        // ตรวจสอบว่าเป็นผู้ซื้อคนเดิมหรือไม่
        if (transaction.buyerId === buyerId) {
          await facebookService.sendMessage(buyerId,
            `✅ คุณได้เข้าร่วมธุรกรรมนี้แล้ว\n\n` +
            `💳 กดปุ่มชำระเงินเพื่อดำเนินการต่อ`
          );
          return;
        } else {
          throw new Error('มีผู้ซื้อในธุรกรรมนี้แล้ว');
        }
      }

      transaction.buyerId = buyerId;
      transaction.status = 'waiting_payment';
      await transaction.save();

      stateService.setState(buyerId, 'buyer_joined', { transactionId });

      // แจ้งเตือนทั้งสองฝ่าย
      await this.notifyBothParties(transaction);
      
      return transaction;
    } catch (error) {
      console.error('Error in handleBuyerJoin:', error);
      throw error;
    }
  }

  async handlePaymentRequest(userId, transactionId) {
    try {
      console.log('handlePaymentRequest called with:', { userId, transactionId });
      
      if (!transactionId) {
        // ลองค้นหาจาก state
        const state = stateService.getState(userId);
        if (state && state.data && state.data.transactionId) {
          transactionId = state.data.transactionId;
          console.log('Using transactionId from state:', transactionId);
        } else {
          throw new Error('缺少交易ID');
        }
      }

      // ค้นหา transaction โดยใช้ transactionId
      const transaction = await Transaction.findOne({ transactionId });
      console.log('Transaction found:', transaction);
      
      if (!transaction) {
        throw new Error('ไม่พบธุรกรรมนี้ในระบบ');
      }

      // ตรวจสอบว่าผู้ใช้เป็น buyer ใน transaction นี้
      if (transaction.buyerId !== userId) {
        console.log('User is not buyer:', { userId, buyerId: transaction.buyerId });
        throw new Error('只有买家可以进行支付');
      }

      // ตรวจสอบสถานะ
      if (transaction.status !== 'waiting_payment') {
        console.log('Invalid transaction status:', transaction.status);
        throw new Error(`ธุรกรรมอยู่ในสถานะ ${transaction.status} ไม่สามารถชำระเงินได้`);
      }

      const totalAmount = transaction.gameDetails.price + 50;
      console.log('Total amount:', totalAmount);

      // สร้าง QR Code พร้อมเพย์
      const paymentInfo = await paymentService.generatePromptPayQR(
        totalAmount, 
        transaction.transactionId
      );

      // บันทึกข้อมูลการชำระเงิน
      transaction.paymentAmount = totalAmount;
      await transaction.save();

      // ส่ง QR Code ให้ผู้ซื้อ
      await this.sendPaymentQRCode(userId, paymentInfo, transaction.transactionId);
      
      return transaction;
    } catch (error) {
      console.error('Handle payment request error:', error);
      throw error;
    }
  }

  async sendPaymentQRCode(userId, paymentInfo, transactionId) {
    try {
      console.log('Sending QR code to user:', userId);
      
      const transaction = await Transaction.findOne({ transactionId });
      if (!transaction) {
        throw new Error('ไม่พบธุรกรรมนี้ในระบบ');
      }

      if (!transaction.gameDetails || !transaction.gameDetails.price) {
        throw new Error('ข้อมูลเกมในธุรกรรมไม่สมบูรณ์');
      }

      const totalAmount = transaction.gameDetails.price + 50;
      const qrCodePageUrl = `${'https://web-production-950d.up.railway.app'}/qrcode/${transactionId}`;
      // process.env.BASE_URL ||
      
      // ส่งข้อความเกี่ยวกับการชำระเงิน (ไม่มีปุ่มส่งหลักฐาน)
      await facebookService.sendMessage(userId,
        `💳 ชำระเงินผ่านพร้อมเพย์\n\n` +
        `💰 จำนวน: ${totalAmount} บาท\n\n` +
        `🔗 กดเปิด QR Code เพื่อชำระเงิน\n\n` +
        `📸 หลังจากชำระเงินแล้ว **กรุณาส่งภาพหลักฐานการโอนเงิน** มาทางแชทนี้เพื่อดำเนินการต่อ`
      );

      // ส่งเฉพาะปุ่มชำระเงินแล้ว (ไม่มีปุ่มส่งหลักฐาน)
      await facebookService.sendButtonTemplate(userId,
        `หลังจากชำระเงินแล้ว:`,
        [
          {
            type: "postback",
            title: "✅ ฉันชำระเงินแล้ว",
            payload: `PAYMENT_CONFIRMED_${transactionId}`
          },
          {
            type: "web_url",
            title: "📱 เปิด QR Code",
            url: qrCodePageUrl,
            webview_height_ratio: "tall"
          },
          {
            type: "postback",
            title: "📞 รายงานปัญหา",
            payload: `REPORT_PAYMENT_${transactionId}`
          }
        ]
      );
    } catch (error) {
      console.error('Send QR code error:', error);
      
      // Fallback
      const fallbackAmount = paymentInfo.amount || 0;
      
      await facebookService.sendMessage(userId,
        `💳 ชำระเงินผ่านพร้อมเพย์\n\n` +
        `💰 จำนวน: ${fallbackAmount} บาท\n` +
        `⚠️ หลังจากชำระเงินแล้ว **กรุณาส่งภาพหลักฐานการโอนเงิน** มาทางแชทนี้`
      );
    }
  }

  async handlePaymentConfirmation(userId, transactionId) {
    try {
      const transaction = await Transaction.findOne({ transactionId });
      
      if (!transaction) {
        throw new Error('ไม่พบธุรกรรมนี้');
      }

      // แจ้งแอดมินเพื่อตรวจสอบการชำระเงิน
      await paymentService.notifyAdminForPaymentVerification(
        transactionId, 
        transaction.paymentAmount
      );

      // อัปเดตสถานะ
      transaction.status = 'payment_verification';
      await transaction.save();

      // แจ้งผู้ซื้อ
      await facebookService.sendMessage(userId,
        `✅ ระบบรับทราบการชำระเงินแล้ว\n\n` +
        `🕒 ระบบกำลังตรวจสอบการชำระเงิน\n` +
        `⏳ โดยปกติใช้เวลาไม่เกิน 5 นาที` 
      );

      // ส่งปุ่มให้แอดมินยืนยัน
      await this.notifyAdminWithButtons(transactionId, transaction.paymentAmount);

    } catch (error) {
      console.error('Payment confirmation error:', error);
      throw error;
    }
  }

  async notifyAdminWithButtons(transactionId, amount) {
    const adminId = process.env.ADMIN_FB_ID; // Facebook ID ของแอดมิน
    
    if (adminId) {
      await facebookService.sendButtonTemplate(adminId,
        `🔔 มีรายการชำระเงินใหม่\n\n` +
        `📋 Transaction ID: ${transactionId}\n` +
        `💰 จำนวน: ${amount} บาท\n\n` +
        `โปรดตรวจสอบการโอนเงินและกดยืนยัน`,
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
    }
  }

  async handleAdminPaymentConfirmation(transactionId) {
    const transaction = await Transaction.findOne({ transactionId });
    
    if (!transaction) {
      throw new Error('ไม่พบธุรกรรมนี้');
    }

    // อัปเดตสถานะ
    transaction.status = 'paid';
    transaction.paidAt = new Date();
    await transaction.save();

    // แจ้งผู้ขายให้ส่งบัญชี
    await facebookService.sendButtonTemplate(transaction.sellerId,
      `✅ การชำระเงินได้รับการยืนยันแล้ว!\n` +
      `• ยอดชำระ: ${transaction.paymentAmount} บาท\n\n` +
      `📦 กรุณามอบบัญชีเกมให้ผู้ซื้อ\n\n` +
      `• มอบบัญชีเกม: ${transaction.gameDetails.game}\n` +
     
      `💡 หลังจากมอบแล้ว กดปุ่ม "มอบแล้ว" ด้านล่าง`,
      [
        {
          type: "postback",
          title: "📦 มอบแล้ว",
          payload: `DELIVERED_${transaction.transactionId}`
        }
      ]
    );

    // แจ้งผู้ซื้อ
    await facebookService.sendMessage(transaction.buyerId,
      `✅ การชำระเงินได้รับการยืนยันแล้ว!\n\n` +
      `• ยอดชำระ: ${transaction.paymentAmount} บาท\n\n` +
      `📦 รอผู้ขายมอบบัญชีให้คุณ\n` +
      `⏳ ผู้ขายจะมอบบัญชีในเร็วๆนี้`
    );
  }

  async handleDeliveryConfirmation(sellerId, transactionId = null) {
    try {
      console.log('🔍 handleDeliveryConfirmation called with:', { sellerId, transactionId });
      
      let transaction;
      
      // ค้นหา transaction โดยใช้ transactionId
      if (transactionId) {
        transaction = await Transaction.findOne({ transactionId });
        console.log('📋 Transaction found by ID:', transaction ? transaction.transactionId : 'Not found');
      }
      
      // หากไม่มี transactionId，ค้นหาจาก state
      if (!transaction) {
        const state = stateService.getState(sellerId);
        console.log('🗂️ Seller state:', state);
        
        if (state && state.data && state.data.transactionId) {
          transaction = await Transaction.findOne({
            transactionId: state.data.transactionId
          });
          console.log('📋 Transaction found by state:', transaction ? transaction.transactionId : 'Not found');
        }
      }
      
      // หากยังไม่มี，ค้นหาธุรกรรมล่าสุดของผู้ขาย
      if (!transaction) {
        transaction = await Transaction.findOne({
          sellerId: sellerId,
          status: 'paid'
        }).sort({ createdAt: -1 });
        console.log('📋 Transaction found by seller:', transaction ? transaction.transactionId : 'Not found');
      }
      
      if (!transaction) {
        throw new Error('ไม่พบธุรกรรมที่รอการส่ง หรือธุรกรรมยังไม่ได้รับการชำระเงิน');
      }

      // ตรวจสอบว่าผู้ใช้เป็น seller ใน transaction นี้
      if (transaction.sellerId !== sellerId) {
        console.log('❌ User is not seller:', { userId: sellerId, sellerId: transaction.sellerId });
        throw new Error('只有卖家可以确认发货');
      }

      // ตรวจสอบสถานะ
      if (transaction.status !== 'paid') {
        console.log('❌ Invalid transaction status:', transaction.status);
        throw new Error(`ธุรกรรมอยู่ในสถานะ ${transaction.status} ไม่สามารถยืนยันการส่งได้`);
      }

      // อัปเดตสถานะ
      transaction.status = 'delivering';
      transaction.deliveredAt = new Date();
      await transaction.save();

      console.log('✅ Transaction status updated to delivering');

      // ส่งการแจ้งเตือนให้ผู้ซื้อ
      await this.sendDeliveryConfirmationToBuyer(transaction);

      // แจ้งผู้ขาย
      await facebookService.sendMessage(sellerId,
        `✅ ระบบรับทราบการส่งบัญชีแล้ว\n\n` +
        `📦 ระบบได้แจ้งผู้ซื้อให้ตรวจสอบบัญชีแล้ว\n` +
        `⏳ รอผู้ซื้อยืนยันรับบัญชี\n\n` +
        `💬 หากผู้ซื้อไม่ยืนยันภายใน 1 ชม. ระบบจะดำเนินการโอนเงินให้คุณ\n\n` +
        `🚫 หากผู้ซื้อไม่ได้รับบัญชีจากคุณภายใน 5 นาที การโอนเงินจะถูกหยุดลง`
      );

      return transaction;

    } catch (error) {
      console.error('❌ Handle delivery confirmation error:', error);
      
      // ส่งข้อความ error ไปให้ผู้ขาย
      await facebookService.sendMessage(sellerId,
        `❌ เกิดข้อผิดพลาด: ${error.message}\n\n` +
        `💬 กรุณาติดต่อ support หรือลองใหม่อีกครั้ง`
      );
      
      throw error;
    }
  }

  async sendDeliveryConfirmationToBuyer(transaction) {
    try {
      console.log('Sending delivery confirmation to buyer:', transaction.buyerId);
      
      await facebookService.sendButtonTemplate(transaction.buyerId,
        `📦 ผู้ขายส่งบัญชีให้คุณแล้ว!\n\n` +
        `🎮 กรุณาตรวจสอบบัญชี:\n` +
        `• เกม: ${transaction.gameDetails.game}\n\n` +
        `✅ หากได้รับและตรวจสอบเรียบร้อยแล้ว กดปุ่ม "ยืนยันรับบัญชี"\n\n` +
        `❌ หากผู้ขายไม่ได้ส่งบัญชีให้คุณภายใน 5 นาที กดปุ่ม "ยังไม่ได้รับ"`,
        [
          {
            type: "postback",
            title: "✅ ยืนยันรับบัญชี",
            payload: `CONFIRM_RECEIPT_${transaction.transactionId}`
          },
          {
            type: "postback",
            title: "❌ ยังไม่ได้รับ",
            payload: `NOT_ACCOUT_${transaction.transactionId}`
          }
        ]
      );
      
      console.log('✅ Delivery confirmation sent successfully');
    } catch (error) {
      console.error('❌ Send delivery confirmation error:', error);
      
      // Fallback: ส่งข้อความธรรมดา
      await facebookService.sendMessage(transaction.buyerId,
        `📦 ผู้ขายส่งบัญชีแล้ว!\n\n` +
        `🎮 กรุณาตรวจสอบบัญชี:\n` +
        `• เกม: ${transaction.gameDetails.game}\n` +
        `• ระดับ: ${transaction.gameDetails.level}\n\n` +
        `✅ หากได้รับและตรวจสอบเรียบร้อยแล้ว พิมพ์ "ยืนยันรับบัญชี"\n` +
        `❌ หากมีปัญหา พิมพ์ "มีปัญหา"`
      );
      
      throw new Error('無法向買家發送確認訊息');
    }
  }

  async handleBuyerConfirmation(buyerId, transactionId) {
    try {
      console.log('✅ Handling buyer confirmation:', { buyerId, transactionId });
      
      const transaction = await Transaction.findOne({ 
        transactionId: transactionId,
        buyerId: buyerId
      });
      
      if (!transaction) {
        throw new Error('ไม่พบธุรกรรมนี้หรือคุณ不是买家');
      }

      if (transaction.status !== 'delivering') {
        throw new Error(`ธุรกรรมอยู่ในสถานะ ${transaction.status} ไม่สามารถยืนยันได้`);
      }

      // อัปเดตสถานะ
      transaction.status = 'awaiting_seller_payment';
      await transaction.save();

      // แจ้งผู้ซื้อ
      await facebookService.sendMessage(buyerId,
        `✅ ยืนยันรับบัญชีเรียบร้อย!\n\n` +
        `🎉 ธุรกรรมเสร็จสิ้น\n` +
        `💰 ยอดชำระ: ${transaction.paymentAmount} บาท\n\n` +
        `⭐ ขอบคุณที่ใช้บริการ`
      );

      // แจ้งผู้ขาย
      await facebookService.sendMessage(transaction.sellerId,
        `✅ ผู้ซื้อยืนยันรับบัญชีเรียบร้อย!\n\n` +
        `💰 ระบบกำลังโอนเงินให้คุณ\n` +
        `⏳ จำนวน: ${transaction.paymentAmount - 50} บาท\n\n` +
        `💬 จะได้รับเงินภายใน 5 นาที.`
      );

      await paymentService.requestSellerBankInfo(transaction.sellerId)
      
      return transaction;

    } catch (error) {
      console.error('❌ Handle buyer confirmation error:', error);
      throw error;
    }
  }

  async notifyBothParties(transaction) {
    // แจ้งผู้ซื้อด้วยปุ่ม
    await facebookService.sendButtonTemplate(transaction.buyerId,
      `✅ เข้าร่วมธุรกรรมสำเร็จ!\n\n` +
      `📋 รายละเอียด:\n` +
      `• เกม: ${transaction.gameDetails.game}\n` +
      `• ผู้ขาย: ${transaction.gameDetails.level}\n` +
      `• ราคา: ${transaction.gameDetails.price} บาท\n` +
      `• ค่ากลาง: 50 บาท\n` +
      `• รวม: ${transaction.gameDetails.price + 50}\n\n` +
      `💳 กดปุ่มด้านล่างเพื่อชำระเงิน`,
      [
        {
          type: "postback",
          title: "💳 ชำระเงิน",
          payload: `PAY_NOW_${transaction.transactionId}`
        }
      ]
    );

    // แจ้งผู้ขาย
    await facebookService.sendMessage(transaction.sellerId,
      `🎯 มีผู้ซื้อเข้าร่วมแล้ว!\n\n` +
      `📋 Transaction ID: ${transaction.transactionId}\n\n` +
      `💰 ราคา: ${transaction.gameDetails.price} บาท\n` +
      `💵 ค่ากลาง: 50 บาท\n` +
      `📜 รวม: ${transaction.gameDetails.price + 50} บาท\n\n` +
      `⏳ รอผู้ซื้อชำระเงิน...`
    );
  }

  async notifyAdminForSellerPayment(sellerId, paymentInfo) {
    const adminId = process.env.ADMIN_FB_ID;
    if (!adminId) {
      console.warn('Admin FB ID not set, cannot notify admin');
      return;
    }

    try {

      const [bankName, accountNumber, accountName] = paymentInfo.split('|');
      
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
          console.log(transaction)
      // ส่งข้อมูลการจ่ายเงิน
      let infoMessage = `💰 จ่ายเงินให้ผู้ขาย\n\n`;
      
      if (paymentInfo.isFallback) {
        infoMessage += `⚠️ ใช้บัญชีแอดมินชั่วคราว (เนื่องจากผู้ขายยังไม่มีข้อมูลบัญชี)\n\n`;
      }
      
      infoMessage += `📋 Transaction ID: ${transaction.transactionId}\n` +
                    `👤 ผู้ขาย: ${transaction.sellerBankInfo.accountName}\n` +
                    `🏦 ธนาคาร: ${bankName}\n` +
                    `📞 พร้อมเพย์: ${accountNumber}\n`;
      
      infoMessage += `💵 จำนวน: ${transaction.gameDetails.price} บาท\n\n` +
                    `📱 สแกน QR Code ด้านบนเพื่อจ่ายเงินผ่านแอปธนาคาร`;

      await facebookService.sendMessage(adminId, infoMessage);

      // ส่งปุ่มให้แอดมิน
      await facebookService.sendButtonTemplate(adminId,
        `เลือกการดำเนินการ:`,
        [
          {
            type: "postback",
            title: "✅ จ่ายเงินเรียบร้อย",
            payload: `ADMIN_PAID_SELLER_${transaction.transactionId}`
          },
          {
            type: "postback",
            title: "❌ มีปัญหา",
            payload: `ADMIN_PAYMENT_PROBLEM_${transaction.transactionId}`
          },
          {
            type: "web_url",
            title: "📱 เปิดหน้าเว็บ",
            url: `${'https://web-production-950d.up.railway.app'}/seller-payment/${transaction.transactionId}`,
            webview_height_ratio: "tall"
          }
        ]
      );

      console.log('✅ Admin notified for seller payment');

    } catch (error) {
      console.error('❌ Notify admin for seller payment error:', error);
      
      // Fallback: ส่งเฉพาะลิงก์
      await facebookService.sendMessage(adminId,
        `💰 จ่ายเงินให้ผู้ขาย\n\n` +
        `📋 Transaction ID: ${transaction.transactionId}\n` +
        `💵 จำนวน: ${paymentInfo.amount} บาท\n\n` +
        `🔗 ลิงก์ QR Code: ${paymentInfo.imageUrl}\n\n` +
        `⚠️ กรุณาสแกน QR Code เพื่อจ่ายเงิน`
      );
    }
  }

  parseGameDetails(message) {
    const details = message.split(' ');
    return {
      game: details[0],
      level: details[1],
      price: parseInt(details[2]),
      description: details.slice(3).join(' ')
    };
  }
}

module.exports = new TransactionService();
