require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const setupAdmin = async () => {
  try {
    const adminData = {
      adminId: process.env.ADMIN_ID,
      bankAccount: {
        bankName: process.env.ADMIN_BANK_NAME,
        accountNumber: process.env.ADMIN_ACCOUNT_NUMBER,
        accountName: process.env.ADMIN_ACCOUNT_NAME,
        promptPayNumber: process.env.ADMIN_PROMPTPAY_NUMBER
      }
    };

    await Admin.findOneAndUpdate(
      { adminId: adminData.adminId },
      adminData,
      { upsert: true, new: true }
    );

    console.log('✅ Admin setup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Admin setup failed:', error);
    process.exit(1);
  }
};

setupAdmin();