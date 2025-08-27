const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  adminId: {
    type: String,
    required: true,
    unique: true
  },
  bankAccount: {
    bankName: String,
    accountNumber: String,
    accountName: String,
    promptPayNumber: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Admin', adminSchema);