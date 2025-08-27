const axios = require('axios');

class FacebookService {
  constructor() {
    this.pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    this.apiVersion = 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  async sendMessage(recipientId, messageContent) {
    try {
      let messagePayload;
      
      if (typeof messageContent === 'string') {
        // ใช้ zero-width characters เพื่อป้องกัน detection
        const encodedMessage = this.encodeText(messageContent);
        // แทนที่ URL ที่อาจทำให้เกิด showcase
        const cleanedMessage = messageContent
          .replace(/https:\/\/promptpay\.io\/\d+/g, 'โปรดสแกนQRCodeด้านล่าง')
          .replace(/https?:\/\/[^\s]+/g, 'ลิงก์การชำระเงิน');
        
        messagePayload = {
          recipient: { id: recipientId },
          message: { text: cleanedMessage }
        };
      } else {
        messagePayload = {
          recipient: { id: recipientId },
          message: messageContent
        };
      }
      
      const response = await axios.post(
        `${this.baseUrl}/me/messages`,
        messagePayload,
        {
          params: { access_token: this.pageAccessToken },
          timeout: 10000
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Send message error:', error.response?.data || error.message);
      return null;
    }
  }
  // ฟังก์ชัน encode ข้อความ
  encodeText(text) {
    // เพิ่ม zero-width characters เพื่อป้องกัน detection
    return text.split('').map(char => char + '\u200B').join('');
  }

  async sendButtonTemplate(recipientId, text, buttons) {
    try {
      // ตรวจสอบและจำกัดจำนวนปุ่ม (Facebook อนุญาต最多 3 ปุ่ม)
      const validButtons = buttons.slice(0, 3).map(button => {
        // ตรวจสอบว่าเป็นปุ่มประเภท postback หรือ web_url
        if (button.type === 'postback') {
          return {
            type: 'postback',
            title: button.title.substring(0, 20), // จำกัดความยาว title
            payload: button.payload.substring(0, 1000) // จำกัดความยาว payload
          };
        } else if (button.type === 'web_url') {
          return {
            type: 'web_url',
            title: button.title.substring(0, 20),
            url: button.url,
            webview_height_ratio: button.webview_height_ratio || 'full',
            messenger_extensions: button.messenger_extensions || false
          };
        }
        return button;
      });

      const messagePayload = {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: text.substring(0, 640), // จำกัดความยาวข้อความ
              buttons: validButtons
            }
          }
        }
      };

      console.log('Sending button template:', JSON.stringify(messagePayload, null, 2));

      const response = await axios.post(
        `${this.baseUrl}/me/messages`,
        messagePayload,
        {
          params: { access_token: this.pageAccessToken },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      console.error('Send button template error:', error.response?.data || error.message);
      
      // Fallback: ส่งเป็นข้อความธรรมดา
      await this.sendMessage(recipientId, text);
      await this.sendMessage(recipientId, 'กรุณาเลือกการดำเนินการโดยการพิมพ์คำสั่ง:');
      
      // ส่งปุ่มแบบ quick replies
      const quickReplies = buttons.slice(0, 3).map(button => ({
        title: button.title,
        payload: button.payload
      }));
      
      await this.sendQuickReply(recipientId, 'เลือกคำสั่ง:', quickReplies);
      
      throw new Error('ส่งปุ่มไม่สำเร็จ，ได้ส่งข้อความแทนแล้ว');
    }
  }

  async sendQuickReply(recipientId, text, quickReplies) {
    try {
      const messagePayload = {
        recipient: { id: recipientId },
        message: {
          text: text.substring(0, 640),
          quick_replies: quickReplies.slice(0, 11).map(reply => ({
            content_type: "text",
            title: reply.title.substring(0, 20),
            payload: reply.payload.substring(0, 1000)
          }))
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/me/messages`,
        messagePayload,
        {
          params: { access_token: this.pageAccessToken }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Send quick reply error:', error.message);
      // Fallback to regular text message
      await this.sendMessage(recipientId, text);
    }
  }

  async markSeen(recipientId) {
    try {
      await axios.post(
        `${this.baseUrl}/me/messages`,
        {
          recipient: { id: recipientId },
          sender_action: 'mark_seen'
        },
        {
          params: { access_token: this.pageAccessToken }
        }
      );
    } catch (error) {
      console.error('Mark seen error:', error.message);
    }
  }

  async sendPaymentTemplate(userId, transactionId, amount, imageUrl = null) {
    try {
      const elements = [
        {
          title: "💳 การชำระเงิน",
          subtitle: `จำนวน: ${amount} บาท\nTransaction ID: ${transactionId}`,
          buttons: [
            {
              type: "postback",
              title: "✅ ยืนยันการชำระเงิน",
              payload: `PAYMENT_CONFIRMED_${transactionId}`
            },
            {
              type: "web_url",
              title: "📱 เปิดหน้า QR Code",
              url: `${process.env.BASE_URL}/qrcode/${transactionId}`,
              webview_height_ratio: "tall"
            }
          ]
        }
      ];

      if (imageUrl) {
        elements[0].image_url = imageUrl;
      }

      const messagePayload = {
        recipient: { id: userId },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "generic",
              elements: elements
            }
          }
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/me/messages`,
        messagePayload,
        {
          params: { access_token: this.pageAccessToken }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Send payment template error:', error);
      throw error;
    }
  }

}



module.exports = new FacebookService();