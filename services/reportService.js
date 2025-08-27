const ReportCase = require('../models/ReportCase');
const Transaction = require('../models/Transaction');
const facebookService = require('./facebookService');
const { generateCaseId } = require('../utils/generator');

class ReportService {
  // เริ่มรายงานปัญหาใหม่
    async startNewReport(userId, message, transactionId = null) {
        try {
            console.log('Starting new report for user:', userId, 'transaction:', transactionId);
            
            // ตรวจสอบว่ามีรายงานที่ยังไม่ปิดอยู่แล้วหรือไม่
            const existingOpenCase = await ReportCase.findOne({
            userId,
            status: 'open'
            });
            
            if (existingOpenCase) {
            await facebookService.sendMessage(
                userId, 
                `⚠️ คุณมีรายงานที่ยังไม่ปิดอยู่แล้ว (Case ID: ${existingOpenCase.caseId})\n\n` +
                `💬 โปรดรอการตอบกลับจากแอดมินหรือใช้คำสั่ง /close เพื่อปิดรายงานก่อน`
            );
            return existingOpenCase;
            }
            
            // สร้างรายงานใหม่
            const caseId = generateCaseId();
            const reportCase = new ReportCase({
            userId,
            caseId,
            transactionId,
            messages: [{
                senderId: userId,
                role: 'user',
                text: message
            }],
            status: 'open'
            });
            
            await reportCase.save();
            console.log('Report saved to database with ID:', caseId);
            
            // แจ้งผู้ใช้
            await facebookService.sendMessage(
            userId,
            `📋 สร้างรายงานปัญหาเรียบร้อย\n\n` +
            `🆔 Case ID: ${caseId}\n` +
            `📝 ข้อความ: ${message}\n\n` +
            `🛠️ แอดมินจะติดต่อกลับคุณเร็วๆ นี้\n` +
            `💬 คุณสามารถส่งข้อความเพิ่มเติมได้เลย หรือใช้คำสั่ง /close เพื่อปิดรายงาน`
            );
            
            // แจ้งแอดมิน
            await this.notifyAdminNewReport(reportCase);
            console.log('Admin notified for new report');
            
            return reportCase;
        } catch (error) {
            console.error('Start new report error:', error);
            throw error;
        }
    }
  
  // แจ้งแอดมินเมื่อมีรายงานใหม่
    async notifyAdminNewReport(reportCase) {
    const adminId = process.env.ADMIN_FB_ID;
    console.log('Notifying admin:', adminId);
    
    if (!adminId) {
        console.warn('ADMIN_FB_ID not set, cannot notify admin');
        return;
    }
    
    try {
        let message = `🚨 มีรายงานปัญหาใหม่\n\n`;
        message += `🆔 Case ID: ${reportCase.caseId}\n`;
        message += `👤 User ID: ${reportCase.userId}\n`;
        
        if (reportCase.transactionId) {
        message += `📋 Transaction ID: ${reportCase.transactionId}\n`;
        }
        
        message += `📝 ข้อความ: ${reportCase.messages[0].text}\n\n`;
        message += `💬 ตอบกลับด้วย: /reply ${reportCase.caseId} [ข้อความ]`;
        
        console.log('Sending admin notification:', message);
        await facebookService.sendMessage(adminId, message);
        console.log('Admin notification sent successfully');
    } catch (error) {
        console.error('Error notifying admin:', error);
    }
    }
  
  // เพิ่มข้อความจากผู้ใช้
  async addUserMessage(userId, caseId, message) {
    try {
      const reportCase = await ReportCase.findOne({ caseId, userId });
      
      if (!reportCase) {
        throw new Error('ไม่พบรายงานปัญหานี้');
      }
      
      if (reportCase.status === 'closed') {
        await facebookService.sendMessage(
          userId,
          `❌ รายงานนี้ถูกปิดแล้ว (Case ID: ${caseId})\n\n` +
          `📞 หากยังมีปัญหา โปรดสร้างรายงานใหม่ด้วย /report`
        );
        return;
      }
      
      reportCase.messages.push({
        senderId: userId,
        role: 'user',
        text: message
      });
      
      await reportCase.save();
      
      // แจ้งแอดมิน - แก้ไขบรรทัดนี้
      await this.notifyAdminNewMessage(reportCase, message);
      
      await facebookService.sendMessage(
        userId,
        `✅ รายงานเรียบร้อย\n\n` +
        `📝 ข้อความ: ${message}\n\n` +
        `🛠️ รอแอดมินตอบกลับ..`
      );
      
      return reportCase;
    } catch (error) {
      console.error('Add user message error:', error);
      throw error;
    }
  }
  
  // เพิ่มข้อความจากแอดมิน
  async addAdminMessage(adminId, caseId, message) {
    try {
      const reportCase = await ReportCase.findOne({ caseId });
      
      if (!reportCase) {
        throw new Error('ไม่พบรายงานปัญหานี้');
      }
      
      reportCase.messages.push({
        senderId: adminId,
        role: 'admin',
        text: message
      });
      
      reportCase.adminId = adminId;
      await reportCase.save();
      
      // แจ้งผู้ใช้
      await facebookService.sendMessage(
        reportCase.userId,
        `📩 ตอบกลับจากแอดมิน\n\n` +
        `💬 ข้อความ: ${message}\n\n` +
        `📞 ตอบกลับได้โดยการพิมพ์ข้อความปกติ ไม่ต้องพิมพ์คำสั่ง /report`
      );
      
      return reportCase;
    } catch (error) {
      console.error('Add admin message error:', error);
      throw error;
    }
  }
  
  // ปิดรายงาน
  async closeReport(userId, caseId) {
    try {
    const adminId = process.env.ADMIN_FB_ID;
      const reportCase = await ReportCase.findOne({ caseId, adminId : adminId });
      
      if (!reportCase) {
        throw new Error('ไม่พบรายงานปัญหานี้');
      }
      
      reportCase.status = 'closed';
      await reportCase.save();
      
      await facebookService.sendMessage(
        reportCase.userId,
        `✅ ปิดรายงานปัญหาเรียบร้อย (Case ID: ${caseId})\n\n` +
        `📞 หากยังมีปัญหา โปรดสร้างรายงานใหม่ด้วย /report`
      );
      
      // แจ้งแอดมิน
      if (adminId) {
        await facebookService.sendMessage(
          adminId,
          `✅ ปิดรายงานปัญหาแล้ว\n\n` +
          `🆔 Case ID: ${caseId}\n` +
          `👤 User ID: ${userId}`
        );
      }
      
      return reportCase;
    } catch (error) {
      console.error('Close report error:', error);
      throw error;
    }
  }

    // แจ้งแอดมินเมื่อมีข้อความใหม่ในรายงาน
  async notifyAdminNewMessage(reportCase, newMessage) {
    const adminId = process.env.ADMIN_FB_ID;
    if (!adminId) return;
    
    let message = `💬 มีข้อความใหม่ในรายงานปัญหา\n\n`;
    message += `🆔 Case ID: ${reportCase.caseId}\n`;
    message += `👤 User ID: ${reportCase.userId}\n`;
    
    if (reportCase.transactionId) {
      message += `📋 Transaction ID: ${reportCase.transactionId}\n`;
    }
    
    message += `📝 ข้อความใหม่: ${newMessage}\n\n`;
    message += `💬 ตอบกลับด้วย: /reply ${reportCase.caseId} [ข้อความ]`;
    
    await facebookService.sendMessage(adminId, message);
  }
  
    // แสดงประวัติรายงานทั้งหมดของผู้ใช้
    async getReportHistory(userId, limit = 10) {
    try {
        const reports = await ReportCase.find({ 
        userId: userId 
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec(); // ใช้ .exec() เพื่อให้ได้ Promise
        
        return reports || []; // 确保 return array ว่างถ้าไม่มีข้อมูล
    } catch (error) {
        console.error('Get report history error:', error);
        return []; // return array ว่างแทน null
    }
    }
  
    // แสดงรายงานที่เปิดอยู่ทั้งหมดของผู้ใช้
    async getOpenReports(userId) {
        try {
            const reports = await ReportCase.find({ 
            userId: userId, 
            status: 'open' 
            }).sort({ createdAt: -1 }).exec();
            
            return reports || [];
        } catch (error) {
            console.error('Get open reports error:', error);
            return [];
        }
    }

        // ตรวจสอบว่ามีรายงานที่เปิดอยู่
    async hasOpenReport(userId) {
        try {
            const report = await ReportCase.findOne({ 
            userId: userId, 
            status: 'open' 
            }).exec();
            
            return report || null;
        } catch (error) {
            console.error('Check open report error:', error);
            return null;
        }
    }
}

module.exports = new ReportService();