const mongoose = require('mongoose');

const reportCaseSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  adminId: { type: String },
  caseId: { 
    type: String, 
    required: true
    // ต้องไม่มี unique: true ในนี้
  },
  transactionId: { type: String, ref: 'Transaction' },
  messages: [
    {
      senderId: String,
      role: String,
      text: String,
      timestamp: { type: Date, default: Date.now }
    }
  ],
  status: { type: String, enum: ["open", "closed"], default: "open" }
}, { timestamps: true });

// กำหนด index ที่นี่เพียงที่เดียว
reportCaseSchema.index({ caseId: 1 }, { unique: true });
reportCaseSchema.index({ userId: 1, status: 1 });
reportCaseSchema.index({ createdAt: 1 });

module.exports = mongoose.model("ReportCase", reportCaseSchema);