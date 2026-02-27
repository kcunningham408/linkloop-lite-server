const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['warrior', 'member', 'admin'],
    default: 'warrior'
  },
  // For Loop Members: the T1D Warrior whose data they are linked to
  linkedOwnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  profileEmoji: {
    type: String,
    default: '😊'
  },
  settings: {
    lowThreshold: { type: Number, default: 70 },
    highThreshold: { type: Number, default: 180 },
    shareRealTimeGlucose: { type: Boolean, default: true },
    lowAlerts: { type: Boolean, default: true },
    highAlerts: { type: Boolean, default: true }
  },
  // Dexcom Individual Access API (OAuth) — official, ~3h data delay until approved
  dexcom: {
    accessToken: { type: String, default: null },
    refreshToken: { type: String, default: null },
    tokenExpiry: { type: Date, default: null },
    dexcomUserId: { type: String, default: null },
    connected: { type: Boolean, default: false },
    lastSync: { type: Date, default: null }
  },
  // Dexcom Share API — real-time, same feed as Follow app, uses username+password
  dexcomShare: {
    username: { type: String, default: null },
    passwordEncrypted: { type: String, default: null },
    accountId: { type: String, default: null },
    sessionId: { type: String, default: null },
    region: { type: String, enum: ['us', 'ous'], default: 'us' },
    connected: { type: Boolean, default: false },
    lastSync: { type: Date, default: null }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Require at least email or phone
userSchema.pre('validate', function(next) {
  if (!this.email && !this.phone) {
    next(new Error('Either email or phone number is required'));
  } else {
    next();
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
