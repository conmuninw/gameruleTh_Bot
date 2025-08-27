// app.js
const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();
const path = require('path');
const Transaction = require('./models/Transaction');
const Admin = require('./models/Admin');
const cors = require('cors')


const app = express();


// Middleware
app.use(express.json({ verify: verifyRequestSignature }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: '*' }));
// ✅ ให้ Express เสิร์ฟไฟล์ใน public/
app.use(express.static(path.join(__dirname, 'public')));

function verifyRequestSignature(req, res, buf) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) {
    throw new Error("No signature found in headers.");
  }
}

// เชื่อมต่อ MongoDB

console.log("MONGO_URI from env:", process.env.MONGO_URI);  // ✅ เช็คว่ามีค่าไหม

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.error("❌ MongoDB Error:", err));

// Routes
app.use('/webhook', require('./routes/webhook'));
// Serve static files
app.use('/qrcodes', express.static(path.join(__dirname, 'temp/qrcodes')));
// QR Code page route
app.get('/qrcode/:transactionId', async (req, res) => {
  try {
    const transactionId = req.params.transactionId;
    const transaction = await Transaction.findOne({ transactionId });
    
    if (!transaction) {
      return res.status(404).send('Transaction not found');
    }
    
    const promptPayNumber = process.env.ADMIN_PROMPTPAY_NUMBER || '0645265274';
    const amount = transaction.paymentAmount || (transaction.gameDetails.price + 50);
    const qrCodeUrl = `https://promptpay.io/${promptPayNumber}/${amount}`;
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Code for Transaction ${transactionId}</title>
        <meta property="og:image" content="${qrCodeUrl}">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            text-align: center; 
            padding: 20px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .container { 
            max-width: 400px; 
            width: 100%;
            margin: 0 auto; 
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            color: #333;
          }
          .qrcode-container { 
            margin: 20px 0; 
            padding: 15px;
            background: #f8f9fa;
            border-radius: 10px;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .info { 
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            padding: 20px; 
            border-radius: 10px;
            color: white;
            margin: 20px 0;
          }
          h1 {
            color: #6c5ce7;
            margin-bottom: 20px;
            font-size: 24px;
          }
          .btn {
            display: inline-block;
            background: #6c5ce7;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 25px;
            margin: 10px;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
            font-size: 16px;
          }
          .btn:hover {
            background: #5b4cdb;
            transform: translateY(-2px);
          }
          .btn-download {
            background: #00b894;
          }
          .btn-download:hover {
            background: #00a085;
          }
          @media (max-width: 480px) {
            .container {
              padding: 20px;
              margin: 10px;
            }
            h1 {
              font-size: 20px;
            }
            .btn {
              padding: 10px 20px;
              font-size: 14px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>💳 ชำระเงินผ่าน PromptPay</h1>
          <div class="qrcode-container">
            <img src="${qrCodeUrl}" 
                 alt="PromptPay QR Code" width="300" height="300"
                 style="border-radius: 8px; display: block; margin: 0 auto;">
          </div>
          <div class="info">
            <p><strong>📋 Transaction ID:</strong> ${transactionId}</p>
            <p><strong>💰 จำนวนเงิน:</strong> ${amount} บาท</p>
            <p><strong>🎮 เกม:</strong> ${transaction.gameDetails.game}</p>
            <p><strong>👤 ผู้ขาย:</strong> ${transaction.gameDetails.level}</p>
          </div>
          <p>📱 สแกน QR Code เพื่อชำระเงินผ่านแอปธนาคาร</p>
        </div>
        
        <script>
          function downloadQRCode() {
            const qrCodeUrl = '${qrCodeUrl}';
            
            // สร้างลิงก์สำหรับดาวน์โหลด
            const downloadLink = document.createElement('a');
            downloadLink.href = qrCodeUrl;
            downloadLink.download = 'qrcode-${transactionId}.png';
            
            // เพิ่มลิงก์ไปยัง DOM และคลิก
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
          }

          // Auto-refresh QR code every 5 minutes to prevent caching issues
          setTimeout(() => {
            window.location.reload();
          }, 300000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('QR code page error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
          }
          .error { 
            background: white; 
            color: #e74c3c; 
            padding: 30px; 
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            max-width: 400px;
            width: 100%;
          }
        </style>
      </head>
      <body>
        <div class="error">
          <h2>❌ เกิดข้อผิดพลาด</h2>
          <p>ไม่สามารถสร้าง QR Code ได้ในขณะนี้</p>
          <p>กรุณาลองใหม่ในภายหลังหรือติดต่อ support</p>
        </div>
      </body>
      </html>
    `);
  }
});


app.get('/seller-payment/:transactionId', async (req, res) => {
  try {
    const transactionId = req.params.transactionId;
    const transaction = await Transaction.findOne({ transactionId });
    
    if (!transaction) {
      return res.status(404).send('Transaction not found');
    }

    if (!transaction.sellerBankInfo) {
      return res.status(400).send('Seller bank information not available');
    }

    const amount = transaction.gameDetails.price;
    const promptPayNumber = transaction.sellerBankInfo.promptPayNumber;
    const qrCodeUrl = `https://promptpay.io/${promptPayNumber}/${amount}`;
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>จ่ายเงินให้ผู้ขาย - ${transactionId}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            text-align: center; 
            padding: 20px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .container { 
            max-width: 400px; 
            width: 100%;
            margin: 0 auto; 
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            color: #333;
          }
          .qrcode-container { 
            margin: 20px 0; 
            padding: 15px;
            background: #f8f9fa;
            border-radius: 10px;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .info { 
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            padding: 20px; 
            border-radius: 10px;
            color: white;
            margin: 20px 0;
          }
          .btn {
            display: inline-block;
            background: #00b894;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 25px;
            margin: 10px;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
            font-size: 16px;
          }
          .btn:hover {
            background: #00a085;
            transform: translateY(-2px);
          }
          @media (max-width: 480px) {
            .container {
              padding: 20px;
              margin: 10px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>💰 จ่ายเงินให้ผู้ขาย</h1>
          <div class="qrcode-container">
            <img src="${qrCodeUrl}" 
                 alt="QR Code จ่ายเงิน" width="300" height="300"
                 style="border-radius: 8px; display: block; margin: 0 auto;">
          </div>
          <div class="info">
            <p><strong>📋 Transaction ID:</strong> ${transactionId}</p>
            <p><strong>👤 ผู้ขาย:</strong> ${transaction.sellerBankInfo.accountName}</p>
            <p><strong>🏦 ธนาคาร:</strong> ${transaction.sellerBankInfo.bankName}</p>
            <p><strong>📞 พร้อมเพย์:</strong> ${promptPayNumber}</p>
            <p><strong>💵 จำนวน:</strong> ${amount} บาท</p>
          </div>
          <p>📱 สแกน QR Code เพื่อจ่ายเงินผ่านแอปธนาคาร</p>
        </div>

        <script>
          function downloadQRCode() {
            const qrCodeUrl = '${qrCodeUrl}';
            
            // สร้างลิงก์สำหรับดาวน์โหลด
            const downloadLink = document.createElement('a');
            downloadLink.href = qrCodeUrl;
            downloadLink.download = 'seller-payment-${transactionId}.png';
            
            // เพิ่มลิงก์ไปยัง DOM และคลิก
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Seller payment page error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
          }
          .error { 
            background: white; 
            color: #e74c3c; 
            padding: 30px; 
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            max-width: 400px;
            width: 100%;
          }
        </style>
      </head>
      <body>
        <div class="error">
          <h2>❌ เกิดข้อผิดพลาด</h2>
          <p>ไม่สามารถสร้างหน้า payment ได้</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Admin Auth Middleware
const adminAuth = async (req, res, next) => {
    try {
        // ตรวจสอบ authentication ของ admin
        // ในทางปฏิบัติควรใช้ JWT หรือ session
        next();
    } catch (error) {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Admin API Routes
app.get('/api/admin/dashboard', adminAuth, async (req, res) => {
    try {
        const [
            totalTransactions,
            pendingTransactions,
            totalUsers,
            totalIncome,
            pendingVerifications
        ] = await Promise.all([
            Transaction.countDocuments(),
            Transaction.countDocuments({ status: 'payment_verification' }),
            // คำนวณจำนวน users จาก transactions
            Transaction.distinct('sellerId').then(ids => ids.length),
            Transaction.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$gameDetails.price' } } }
            ]),
            Transaction.countDocuments({ status: 'payment_verification' })
        ]);

        // ข้อมูลสำหรับ charts
        const dailyData = await Transaction.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            { $limit: 7 }
        ]);

        const statusData = await Transaction.aggregate([
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            totalIncome: totalIncome[0]?.total || 0,
            totalTransactions,
            pendingTransactions,
            totalUsers,
            pendingVerifications,
            charts: {
                dailyLabels: dailyData.map(d => d._id),
                dailyData: dailyData.map(d => d.count),
                statusLabels: statusData.map(s => s._id),
                statusData: statusData.map(s => s.count)
            },
            recentActivities: [
                // ตัวอย่าง activities
                { icon: 'exchange-alt', message: 'มีธุรกรรมใหม่: TX123456', timestamp: new Date() }
            ]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/transactions', adminAuth, async (req, res) => {
    try {
        const { page = 1, status, date } = req.query;
        const limit = 10;
        const skip = (page - 1) * limit;

        let filter = {};
        if (status && status !== 'all') {
            filter.status = status;
        }
        if (date) {
            filter.createdAt = { $gte: new Date(date) };
        }

        const transactions = await Transaction.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Transaction.countDocuments(filter);

        res.json({
            transactions,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/transactions/:id', adminAuth, async (req, res) => {
    try {
        const transaction = await Transaction.findOne({ transactionId: req.params.id });
        res.json(transaction);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/payments/verification', adminAuth, async (req, res) => {
    try {
        const payments = await Transaction.find({ 
            status: 'payment_verification'
        }).sort({ createdAt: -1 });
        
        res.json(payments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/payments/:id/confirm', adminAuth, async (req, res) => {
    try {
        const transaction = await Transaction.findOne({ transactionId: req.params.id });
        
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        // Update transaction status to paid
        transaction.status = 'paid';
        transaction.paidAt = new Date();
        await transaction.save();
        
        res.json({ message: 'Payment confirmed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/payments/:id/reject', adminAuth, async (req, res) => {
    try {
        const transaction = await Transaction.findOne({ transactionId: req.params.id });
        
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        // Update transaction status back to waiting_payment
        transaction.status = 'waiting_payment';
        await transaction.save();
        
        res.json({ message: 'Payment rejected successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/seller-payments', adminAuth, async (req, res) => {
    try {
        // Find completed transactions that haven't been paid to sellers yet
        const payments = await Transaction.find({ 
            status: 'completed',
            sellerPaid: { $ne: true }
        }).populate('sellerId', 'bankName accountNumber accountName promptPayNumber');
        
        res.json(payments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/seller-payments/:id/confirm', adminAuth, async (req, res) => {
    try {
        const transaction = await Transaction.findOne({ transactionId: req.params.id });
        
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        // Mark as paid to seller
        transaction.sellerPaid = true;
        transaction.sellerPaidAt = new Date();
        await transaction.save();
        
        res.json({ message: 'Seller payment confirmed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
    try {
        const users = await User.aggregate([
            {
                $lookup: {
                    from: "transactions",
                    localField: "_id",
                    foreignField: "sellerId",
                    as: "transactions"
                }
            },
            {
                $project: {
                    userId: "$_id",
                    type: "$userType",
                    transactionCount: { $size: "$transactions" },
                    totalAmount: { 
                        $sum: {
                            $map: {
                                input: "$transactions",
                                as: "txn",
                                in: { $cond: [{ $eq: ["$$txn.status", "completed"] }, "$$txn.gameDetails.price", 0] }
                            }
                        }
                    },
                    createdAt: 1,
                    status: { $cond: [{ $eq: ["$isActive", true] }, "active", "inactive"] }
                }
            },
            { $sort: { createdAt: -1 } }
        ]);
        
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/logout', adminAuth, (req, res) => {
    // In a real application, you would invalidate the session or JWT token here
    res.json({ message: 'Logged out successfully' });
});

mongoose.connection.once('open', () => {
  console.log('DB ready');
  app.listen(process.env.PORT || 3000, () => {
    console.log('Server running...');
  });
});
