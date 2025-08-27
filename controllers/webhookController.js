const transactionService = require('../services/transactionService');
const paymentService = require('../services/paymentService');
const facebookService = require('../services/facebookService');
const stateService = require('../services/stateService');
const Transaction = require('../models/Transaction');
const reportService = require('../services/reportService');

const handleWebhook = async (req, res) => {
  try {
    const body = req.body;

    // Facebook webhook verification
    if (body.object === 'page') {
      for (const entry of body.entry) {
        for (const event of entry.messaging) {
          await handleMessage(event);
        }
      }
      res.status(200).send('EVENT_RECEIVED');
    } 
    // Omise webhook
    else if (body.object === 'event') {
      await paymentService.handleWebhook(body);
      res.status(200).send('WEBHOOK_RECEIVED');
    }
    else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
};

const handleMessage = async (event) => {
  const senderId = event.sender.id;
  const message = event.message?.text?.trim();
  const postback = event.postback;
  const attachments = event.message?.attachments;

  if (postback) {
    await handlePostback(senderId, postback);
    return;
  }



  // ตรวจสอบว่ามีไฟล์แนบ (ภาพหลักฐานการโอน)
  if (attachments && attachments.length > 0) {
    await handlePaymentProof(senderId, attachments);
    return;
  }

  if (!message) return;

  try {
    await facebookService.markSeen(senderId);

        // ตรวจสอบ state reporting_issue ก่อนเงื่อนไขอื่นๆ
    const state = stateService.getState(senderId);
    if (state?.state === 'reporting_issue') {
      const transactionId = state.data?.transactionId;
      console.log('User is reporting issue for transaction:', transactionId);
      
      await reportService.startNewReport(senderId, message, transactionId);
      stateService.clearState(senderId); // ล้าง state หลังจากรายงานเสร็จ
      return;
    }
    else if (message === 'เริ่มขาย') {
      await transactionService.startSellerFlow(senderId);
    }
    else if (message.match(/^TX[A-Z0-9]/i)) {
      const transactionId = message.toUpperCase();
      const transactionExists = await Transaction.findOne({ transactionId });
      
      if (transactionExists) {
        await transactionService.handleBuyerJoin(senderId, transactionId);
      } else {
        await facebookService.sendMessage(senderId, 
          `❌ ไม่พบธุรกรรม ID: ${transactionId} ในระบบ\n\n` +
          `💡 ตรวจสอบว่าได้คัดลอก Transaction ID ถูกต้องหรือไม่`
        );
      }
    }
    else if (message.startsWith('ยืนยันชำระเงิน ')) {
      const transactionId = message.replace('ยืนยันชำระเงิน ', '').trim();
      await transactionService.handlePaymentConfirmation(senderId, transactionId);
    }

    else if (message.startsWith('/report')) {
      const reportMessage = message.replace('/report', '').trim();
      if (!reportMessage) {
        await facebookService.sendMessage(
          senderId, 
          '❌ กรุณาระบุปัญหาหลังคำสั่ง /report\n\n' +
          '💡 ตัวอย่าง: /report ไม่สามารถชำระเงินได้'
        );
        return;
      }
      
      // ตรวจสอบ transactionId ถ้ามีการอ้างอิง
      let transactionId = null;
      // ตรวจสอบจาก state ก่อน (อัตโนมัติ)
      const userState = stateService.getState(senderId);
      if (userState && userState.data && userState.data.transactionId) {
        transactionId = userState.data.transactionId;
        console.log('Found transactionId from state:', transactionId);
      }
      // ถ้าไม่มีใน state ให้ลองหาจากข้อความ
      if (!transactionId) {
        const txMatch = reportMessage.match(/TX[a-z0-9]+-[A-Z0-9]+/i);
        if (txMatch) {
          transactionId = txMatch[0].toUpperCase();
          console.log('Found transactionId from message:', transactionId);
        }
      }
      // ตรวจสอบว่า transaction นี้เกี่ยวข้องกับผู้ใช้
      if (transactionId) {
        const transaction = await Transaction.findOne({ 
          transactionId,
          $or: [{ sellerId: senderId }, { buyerId: senderId }]
        });
      if (!transaction) {
        await facebookService.sendMessage(
          senderId,
          `⚠️ พบ Transaction ID: ${transactionId} แต่ไม่เกี่ยวข้องกับคุณ\n\n` +
          `📋 รายงานปัญหาจะถูกส่งโดยไม่มี Transaction ID`
        );
        transactionId = null;
      }
    }
      await reportService.startNewReport(senderId, reportMessage, transactionId);
      return;
    }
    else if (message.startsWith('/reply')) {
      // ตรวจสอบว่าเป็นแอดมินหรือไม่
      if (senderId !== process.env.ADMIN_FB_ID) {
        await facebookService.sendMessage(senderId, '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น');
        return;
      }
      
      const parts = message.split(' ');
      if (parts.length < 3) {
        await facebookService.sendMessage(
          senderId,
          '❌ รูปแบบคำสั่งไม่ถูกต้อง\n\n' +
          '💡 ตัวอย่าง: /reply CASE-1234abc สวัสดีครับ'
        );
        return;
      }
      
      const caseId = parts[1];
      const replyMessage = parts.slice(2).join(' ');
      
      await reportService.addAdminMessage(senderId, caseId, replyMessage);
      return;
    }
    else if (message.startsWith('/listreports')) {
      try {
        const reports = await reportService.getReportHistory(senderId, 5);
        
        // ตรวจสอบว่า reports เป็น array และมีข้อมูล
        if (!reports || reports.length === 0) {
          await facebookService.sendMessage(
            senderId,
            '📋 ไม่พบรายงานปัญหา\n\n' +
            '💡 สร้างรายงานใหม่ด้วย /report [ข้อความปัญหา]'
          );
          return;
        }
        
        let message = `📋 ประวัติรายงานปัญหา (ล่าสุด ${reports.length} รายการ):\n\n`;
        
        reports.forEach((report, index) => {
          const statusEmoji = report.status === 'open' ? '🔓' : '🔒';
          const firstMessage = report.messages && report.messages[0] ? report.messages[0].text : 'ไม่มีข้อความ';
          message += `${index + 1}. ${statusEmoji} ${report.caseId}\n`;
          message += `   📝 ${firstMessage.substring(0, 30)}${firstMessage.length > 30 ? '...' : ''}\n`;
          message += `   📊 สถานะ: ${report.status === 'open' ? 'เปิด' : 'ปิด'}\n`;
          message += `   ⏰ ${new Date(report.createdAt).toLocaleDateString('th-TH')}\n\n`;
        });
        
        message += '💡 ปิดรายงานด้วย: /close CASE-ID';
        
        await facebookService.sendMessage(senderId, message);
      } catch (error) {
        console.error('List reports error:', error);
        await facebookService.sendMessage(
          senderId, 
          '❌ เกิดข้อผิดพลาดในการดึงประวัติรายงาน\n\n' +
          '📞 โปรดลองอีกครั้งหรือติดต่อ support'
        );
      }
      return;
    }
    else if (message.startsWith('/close')) {
      const caseId = message.replace('/close', '').trim();
      
      if (!caseId) {
        // พยายามหา case ที่เปิดอยู่
        const openCase = await reportService.hasOpenReport(senderId);
        if (openCase) {
          await reportService.closeReport(senderId, openCase.caseId);
        } else {
          await facebookService.sendMessage(
            senderId,
            '❌ ไม่พบรายงานที่เปิดอยู่\n\n' +
            '💡 กรุณาระบุ Case ID: /close CASE-1234abc'
          );
        }
        return;
      }
      
      await reportService.closeReport(senderId, caseId);
      return;
    }
    const openCase = await reportService.hasOpenReport(senderId);
    if (openCase && !message.startsWith('/')) {
      // ถ้ามีรายงานเปิดอยู่และข้อความไม่ใช่คำสั่ง ให้เพิ่มเป็นข้อความในรายงาน
      await reportService.addUserMessage(senderId, openCase.caseId, message);
      return;
    }
    else {
      const state = stateService.getState(senderId);
      if (state?.state === 'awaiting_game_details') {
        await transactionService.handleGameDetails(senderId, message);
      }
      else if (message.includes('|') && message.split('|').length === 3) {
        // ข้อมูลบัญชีธนาคาร
        await transactionService.notifyAdminForSellerPayment(senderId, message);
      }
      else {
        // ส่งปุ่มเมนูหลัก
        if (message.match(/^TX[A-Z0-9]/i)) {
          return
        }
        await facebookService.sendButtonTemplate(
          senderId,
          `🤖 บริการกลางบัญชีเกม\n\n` +
          `เลือกเมนูที่ต้องการ:`,
          [
            { type: "postback", title: "🎮 เริ่มกลาง", payload: "START_SELLING" },
            { type: "postback", title: "📞 รายงานปัญหา", payload: "REPORT_ISSUE" },
            { type: "postback", title: "ℹ️ วิธีใช้", payload: "HOW_TO_USE" }
          ]
        );
      }
    }
  } catch (error) {
    console.error('Message handling error:', error);
    await facebookService.sendMessage(senderId, 
      `❌ ${error.message}\n\n` +
      `💬 หากมีปัญหา ติดต่อ support`
    );
  }
};

const handlePostback = async (senderId, postback) => {
  const payload = postback.payload;
  
  console.log('Received postback:', { senderId, payload });
  
  try {
    if (payload.startsWith('PAY_NOW_')) {
      const transactionId = payload.replace('PAY_NOW_', '');
      if (!transactionId || transactionId === 'PAY_NOW_') {
        throw new Error('ไม่พบ Transaction ID');
      }
      console.log('Processing PAY_NOW for transaction:', transactionId);
      await transactionService.handlePaymentRequest(senderId, transactionId);
    }
    else if (payload.startsWith('PAYMENT_CONFIRMED_')) {
      const transactionId = payload.replace('PAYMENT_CONFIRMED_', '');
      console.log('💳 Processing PAYMENT_CONFIRMED for transaction:', transactionId);
      
      // ขอให้ส่งหลักฐานการโอน
      await facebookService.sendMessage(senderId,
        `✅ รับทราบการชำระเงิน\n\n` +
        `📸 **กรุณาส่งภาพหลักฐานการโอนเงิน** มาทางแชทนี้\n` +
        `• สกรีนช็อตการโอนเงินจากแอปธนาคาร\n` +
        `• หรือหลักฐานการชำระเงิน\n\n` +
        `⚠️ ระบบจะดำเนินการต่อหลังจากได้รับหลักฐาน`
      );
      
      stateService.setState(senderId, 'awaiting_payment_proof', { transactionId });
    }
    else if (payload.startsWith('ADMIN_CONFIRM_PAYMENT_')) {
      const transactionId = payload.replace('ADMIN_CONFIRM_PAYMENT_', '');
      await handleAdminPaymentConfirmation(senderId, transactionId);
      console.log('Admin confirmed payment for transaction:', transactionId);
      await transactionService.handleAdminPaymentConfirmation(transactionId);
    }
    else if (payload.startsWith('ADMIN_REJECT_PAYMENT_')) {
      const transactionId = payload.replace('ADMIN_REJECT_PAYMENT_', '');
      await handleAdminPaymentRejection(senderId, transactionId);
      console.log('Admin rejected payment for transaction:', transactionId);
      // TODO: อาจส่งข้อความแจ้ง buyer + seller ว่าไม่ผ่าน
      await facebookService.sendMessage(senderId,
        `❌ การชำระเงินของธุรกรรม ${transactionId} ไม่ถูกต้อง\n\n` +
        `📞 โปรดติดต่อ support เพื่อแก้ไข ที่ Line : @gameruleTh`
      );
    }
    else if (payload.startsWith('DELIVERED_')) {
      const transactionId = payload.replace('DELIVERED_', '');
      console.log('🚚 Processing DELIVERED for transaction:', transactionId);
      await transactionService.handleDeliveryConfirmation(senderId, transactionId);
    }
    else if (payload.startsWith('CONFIRM_RECEIPT_')) {
      const transactionId = payload.replace('CONFIRM_RECEIPT_', '');
      console.log('✅ Processing CONFIRM_RECEIPT for transaction:', transactionId);
      await transactionService.handleBuyerConfirmation(senderId, transactionId);
    }
    else if (payload.startsWith('REPORT_PAYMENT_')) {
      const transactionId = payload.replace('REPORT_PAYMENT_', '');
      
      // บันทึก transactionId ใน state
      stateService.setState(senderId, 'reporting_issue', { transactionId });
      
      await facebookService.sendMessage(
        senderId,
        `📞 รายงานปัญหาการชำระเงิน\n\n` +
        `📋 Transaction ID: ${transactionId}\n\n` +
        `💬 โปรดระบุปัญหาที่คุณพบ:\n` +
        `• ไม่สามารถสแกน QR Code ได้\n` +
        `• เกิดข้อผิดพลาดในการโอน\n` +
        `• หรือปัญหาอื่นๆ\n\n` +
        '📝 พิมพ์ปัญหาของคุณหลังคำสั่ง /report\n\n' +
        '💡 ตัวอย่าง: /report ไม่สามารถชำระเงินได้'
      );
    }
    else if (payload.startsWith('ADMIN_PAID_SELLER_')) {
      const transactionId = payload.replace('ADMIN_PAID_SELLER_', '');
      await handleAdminPaymentToSeller(senderId, transactionId);
    }
    else if (payload.startsWith('ADMIN_PAYMENT_PROBLEM_')) {
      const transactionId = payload.replace('ADMIN_PAYMENT_PROBLEM_', '');
      await handleAdminPaymentProblem(senderId, transactionId);
    }
    else if (payload.startsWith('NOT_ACCOUT_')) {
      const transactionId = payload.replace('NOT_ACCOUT_', '');
      const userId = await Transaction.findOne( {transactionId : transactionId} )
      // แจ้งผู้ขาย
      await facebookService.sendMessage( userId.sellerId,
        `❌ ผู้ซื้อยังไม่ได้รับบัญชีจากคุณ\n\n` +
        `⚠️ กรุณาส่งบัญชีเกมให้ผู้ซื้อตอนนี้`
      )
      // แจ้งผู้ซื้อ
      await facebookService.sendButtonTemplate( userId.buyerId,
        `❗️ แจ้งผู้ซื้อให้ส่งบัญชีอีกครั้งแล้ว\n\n` +
        `⚠️ หากยังไม่ได้รับอีก กดปุ่ม "ขอคืนเงิน" แอดมินจะเข้ามาตรวจสอบและการคืนเงิน\n\n`,
          [
            { type: "postback", title: "💸 ขอคืนเงิน", payload: `REFUN_${transactionId}` }
          ]
      )
    }
    else if (payload.startsWith('REFUN_')) {
      const transactionId = payload.replace('REFUN_', '');
      const userId = await Transaction.findOne( {transactionId : transactionId} )
      // แจ้งผู้ขาย
      await facebookService.sendMessage( userId.sellerId,
        `❌ ผู้ซื้อขอคืนเงินเนื่องจากไม่ได้รับบัญชีจากคุณ\n\n` +
        `⚠️ กรุณาส่งภาพหลักฐานการส่งบัญชีให้ผู้ซื้อทาง Line: @gameruleTh พร้อมรหัส Transaction ID\n\n` +
        `❗️ หากไม่ได้รับหลักฐานภายใน 5 นาทีถือว่าคุณไม่ได้ส่งบัญชีให้จริง ระบบจะทำการคืนเงินให้ผู้ซื้อทันทีและปิดธุรกรรมการซื้อขายนี้\n\n`
      )
      // แจ้งผู้ซื้อ
      await facebookService.sendMessage( userId.buyerId,
        `⚠️ แอดมินกำลังตรวจสอบหลักฐานจากผู้ขาย\n\n` +
        `❗️ หากไม่ได้รับหลักฐานการส่งมอบจากผู้ขาย ระบบจะทำการคืนเงินให้คุณ\n\n` +
        `❗️ หากผู้ขายยืนยันได้ว่า ได้ส่งมอบบัญชีให้คุณแล้ว ระบบจะทำการให้ผู้ขายและจบธุรกรรมการซื้อขายนี้ทันที\n\n` +
        `✅ ถ้าได้รับบัญชีแล้วกดปุ่ม "ยืนยันรับบัญชี"\n\n` +
        `📝 เพื่อความรวดเร็วในการคืนเงิน กรุณาแจ้ง\n` +
        `๐ชื่อธนาคาร\n` +
        `๐เลขบัญชี\n` +
        `๐ชื่อบัญชี\n\n` +
        `💡 ตัวอย่าง: "กสิกรไทย 04412345678 สมชาย"` 
      )
      // แจ้งแอดมิน
      await facebookService.sendButtonTemplate( process.env.ADMIN_FB_ID,
        `⚠️ ผู้ซื้อขอคืนเงิน\n\n` +
        `Transaction ID: ${transactionId}\n\n` + 
        `❗️ ตรวจสอบหลักฐานการส่งมอบใน Line\n\n` +
        `ดูรายละเอียดบัญชีธนาคารผู้ซื้อในแชทเพจ`,
        [
          { type: "postback", title: "❌ ยกเลิกธุรกรรม", payload: `CANCELLED_${transactionId}` }
        ]
      )
    }
    else if (payload.startsWith('CANCELLED_')) {
      const transactionId = payload.replace('CANCELLED_', '');
      const transaction = await Transaction.findOne({ transactionId : transactionId})
      console.log(transactionId)
      if (!transaction) {
        console.error("❌ Transaction not found for transactionId:", transactionId);
        await facebookService.sendMessage(senderId, "❌ ไม่พบดีลที่คุณเลือก กรุณาลองใหม่อีกครั้ง");
        return;
      }
      transaction.status = 'cancelled';
      transaction.cancelledAt = new Date();
      await transaction.save();
        // แจ้งผู้ขาย
      await facebookService.sendMessage( transaction.sellerId,
        `❌ ธุรกรรมนี้ถูกยกเลิกแล้ว\n`
      )
        // แจ้งผู้ซื้อ
      await facebookService.sendMessage( transaction.buyerId,
        `❌ ธุรกรรมนี้ถูกยกเลิกแล้ว\n`
      )
        // แจ้งแอดมิน
      await facebookService.sendMessage( process.env.ADMIN_FB_ID,
         `❌ ยกเลิกธุรกรรม\n\n` +
         `Transaction ID : ${transactionId}`
      )
    }
    else if (payload.startsWith('UPLOAD_PROOF_')) {
      const transactionId = payload.replace('UPLOAD_PROOF_', '');
      if (!transactionId || transactionId === 'UPLOAD_PROOF_') {
        throw new Error('ไม่พบ Transaction ID');
      }
      console.log('Processing UPLOAD_PROOF for transaction:', transactionId);
      await facebookService.sendMessage(senderId,
        `📸 กรุณาส่งภาพหลักฐานการโอนเงิน\n\n` +
        `⚠️ ส่งภาพสกรีนช็อตการโอนเงินมาในแชทนี้`
      );
      stateService.setState(senderId, 'awaiting_payment_proof', { transactionId });
    }
    else if (payload === 'START_SELLING') {
      await transactionService.startSellerFlow(senderId);
    }
    else if (payload === 'HOW_TO_USE') {
      await facebookService.sendMessage(
        senderId,
        `📖 วิธีใช้ระบบ:\n\n` +
        `1. กด "เริ่มกลาง" เพื่อสร้างธุรกรรมใหม่\n` +
        `2. ส่งรายละเอียดบัญชีเกม\n` +
        `3. แชร์ Transaction ID ให้ผู้ซื้อ\n` +
        `4. ผู้ซื้อส่ง Transaction ID เพื่อเข้าร่วม\n` +
        `5. ชำระเงินผ่านระบบ\n` +
        `6. ส่งและยืนยันรับบัญชี\n\n` +
        `📞 รายงานปัญหา:\n` +
        `• ใช้คำสั่ง /report [ข้อความปัญหา]\n` +
        `• ตัวอย่าง: /report ไม่สามารถชำระเงินได้\n` +
        `• ปิดรายงาน: /close\n\n` +
        `💰 ค่าบริการ: 50 บาท/ธุรกรรม`
      );
    }
    else if (payload === 'REPORT_ISSUE') {
      await facebookService.sendMessage(
        senderId,
        `📞 รายงานปัญหา\n\n` +
        `💬 หากคุณพบปัญหาในการใช้บริการ\n` +
        `โปรดแจ้งเราด้วยคำสั่ง:\n\n` +
        `🔧 /report [ข้อความปัญหา]\n` +
        `💡 ตัวอย่าง: /report ไม่สามารถชำระเงินได้\n\n` +
        `📋 หากปัญหาเกี่ยวข้องกับธุรกรรม\n` +
        `โปรดระบุ Transaction ID ในข้อความ\n\n` +
        `🛠️ แอดมินจะติดต่อกลับคุณเร็วๆ นี้`
      );
    }
    else if (payload === 'CONTACT_SUPPORT') {
      await facebookService.sendMessage(senderId,
        `📞 ติดต่อ Support:\n\n` +
        `• Line: @gameruleTh\n` +
        `• โทร: 064-526-5274\n\n` +
        `🕒 เวลาทำการ: 09:00-23:00 น.`
      );
    }
  } catch (error) {
    console.error('Postback handling error:', error);
    await facebookService.sendMessage(senderId,
      `❌ เกิดข้อผิดพลาด: ${error.message}\n\n` +
      `💬 หากมีปัญหา ติดต่อ support`
    );
  }
};

const handleAdminPaymentConfirmation = async (adminId, transactionId) => {
  try {
    const transaction = await Transaction.findOne({ transactionId });
    
    if (!transaction) {
      throw new Error('ไม่พบธุรกรรมนี้');
    }

    // อัปเดตสถานะการตรวจสอบ
    transaction.paymentVerification = {
      verified: true,
      verifiedBy: adminId,
      verifiedAt: new Date(),
      notes: 'การชำระเงินได้รับการยืนยันโดยแอดมิน'
    };
    transaction.status = 'paid';
    transaction.paidAt = new Date();
    await transaction.save();

    // แจ้งแอดมิน
    await facebookService.sendMessage(adminId,
      `✅ ยืนยันการชำระเงินเรียบร้อย\n\n` +
      `📋 Transaction ID: ${transactionId}\n` +
      `💰 จำนวน: ${transaction.paymentAmount} บาท\n\n` +
      `📧 แจ้งผู้ขายและผู้ซื้อเรียบร้อยแล้ว`
    );

  } catch (error) {
    console.error('Admin payment confirmation error:', error);
  }
};

  const handleAdminPaymentToSeller = async (adminId, transactionId) => {
    try {
      const transaction = await Transaction.findOne({ transactionId });
      
      if (!transaction) {
        throw new Error('ไม่พบธุรกรรมนี้');
      }

      // อัปเดตสถานะเป็น completed
      transaction.status = 'completed';
      transaction.completedAt = new Date();
      await transaction.save();

      // แจ้งผู้ขาย
      await facebookService.sendMessage(transaction.sellerId,
        `🎉 โปรเช็คยอดเงินเข้าของคุณ!\n\n` +
        `✅ ระบบได้โอนเงินให้คุณแล้ว\n` +
        `💰 จำนวน: ${transaction.gameDetails.price} บาท\n` +
        `🏦 เข้าบัญชี: ${transaction.sellerBankInfo.bankName}\n\n` +
        `⭐ ขอบคุณที่ใช้บริการ`
      );

      // แจ้งแอดมิน
      await facebookService.sendMessage(adminId,
        `✅ โอนเงินให้ผู้ขายเรียบร้อย\n\n` +
        `📋 Transaction ID: ${transactionId}\n` +
        `💰 จำนวน: ${transaction.gameDetails.price} บาท\n` +
        `👤 ผู้ขาย: ${transaction.sellerBankInfo.accountName}`
      );

    } catch (error) {
      console.error('Admin payment to seller error:', error);
      await facebookService.sendMessage(adminId, `❌ เกิดข้อผิดพลาด: ${error.message}`);
    }
  };

const handleAdminPaymentProblem = async (adminId, transactionId) => {
  try {
    await facebookService.sendMessage(adminId,
      `❌ รับทราบปัญหาการโอนเงิน\n\n` +
      `📋 Transaction ID: ${transactionId}\n\n` +
      `🛠️ กรุณาติดต่อทีม support หรือจัดการ manually`
    );
  } catch (error) {
    console.error('Admin payment problem error:', error);
  }
};

const handlePaymentProof = async (senderId, attachments) => {
  try {
    const imageUrl = attachments[0].payload.url;
    
    // ค้นหา transaction ล่าสุดของผู้ใช้ที่รอการชำระเงิน
    const transaction = await Transaction.findOne({
      buyerId: senderId,
      status: 'waiting_payment'
    }).sort({ createdAt: -1 });

    if (!transaction) {
      throw new Error('ไม่พบธุรกรรมที่รอการชำระเงิน');
    }

    // ส่งข้อความก่อนเพื่อป้องกันการ detect
    await facebookService.sendMessage(
      senderId,
      '📸 ระบบกำลังประมวลผลภาพหลักฐานการโอนเงิน...'
    );

    // ใช้ paymentService เพื่อจัดการหลักฐานการโอน
    await paymentService.handlePaymentWithProof(senderId, transaction.transactionId, imageUrl);

  } catch (error) {
    console.error('Handle payment proof error:', error);
    await facebookService.sendMessage(
      senderId,
      `❌ เกิดข้อผิดพลาด: ${error.message}\n\n` +
      `💬 กรุณาติดต่อ support หากมีปัญหา`
    );
  }
};

module.exports = { handleWebhook };