// models/Transaction.js
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  sellerId: {
    type: String,
    required: true
  },
  sellerBankInfo: {
    bankName: String,
    accountNumber: String,
    accountName: String,
    promptPayNumber: String
  },
  buyerId: {
    type: String
  },
  gameDetails: {
    game: String,
    level: String,
    price: Number,
    description: String
  },
  status: {
    type: String,
    enum: ['waiting_buyer', 'waiting_payment', 'payment_verification', 'paid', 'delivering', 'awaiting_seller_payment', 'completed', 'cancelled'],
    default: 'waiting_buyer'
  },
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
  paymentAmount: Number,
  paymentProof: {
    imageUrl: String,
    uploadedAt: Date
  },
  paymentVerification: {
    verified: { type: Boolean, default: false },
    verifiedBy: String, // admin ID
    verifiedAt: Date,
    notes: String
  },
  paidAt: Date,
  deliveredAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  adminNotified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Auto delete after 24 hours
transactionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('Transaction', transactionSchema);