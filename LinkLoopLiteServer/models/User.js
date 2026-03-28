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
    enum: ['warrior', 'member', 'hybrid', 'admin'],
    default: 'warrior'
  },
  // For Loop Members: the T1D Warrior whose data they are linked to
  // DEPRECATED — kept for backward compatibility. Use activeViewingId + CareCircle lookup instead.
  linkedOwnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Cross-Circle: which warrior's data this user is currently viewing
  // null = viewing own data (warrior default) or no active circle (member default)
  activeViewingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Optional display name the member uses for their warrior (e.g. "Shayla", "My Daughter")
  warriorDisplayName: {
    type: String,
    default: null
  },
  profileEmoji: {
    type: String,
    default: '😊'
  },
  settings: {
    lowThreshold: { type: Number, default: 70 },
    highThreshold: { type: Number, default: 180 },
    highAlertDelay: { type: Number, default: 0 },  // minutes glucose must stay above highThreshold before alerting (0 = immediate)
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
  // Nightscout — universal CGM bridge (Dexcom, Libre, Medtronic, etc.)
  nightscout: {
    url: { type: String, default: null },          // e.g. https://mysite.herokuapp.com
    apiSecret: { type: String, default: null },     // SHA-1 hashed or plain — sent as api-secret header
    connected: { type: Boolean, default: false },
    lastSync: { type: Date, default: null }
  },
  // Expo push token for native push notifications
  pushToken: {
    type: String,
    default: null
  },
  // APNs push token for Apple Watch sync
  watchPushToken: {
    type: String,
    default: null
  },
  // IANA timezone string (e.g. "America/Los_Angeles") — sent alongside push token
  timezone: {
    type: String,
    default: 'America/New_York'
  },
  // Per-category push notification preferences (all ON by default)
  pushPreferences: {
    glucoseAlerts:   { type: Boolean, default: true },  // low, high, urgent, rapid change
    acknowledgments: { type: Boolean, default: true },  // someone acknowledged an alert
    alertResolved:   { type: Boolean, default: true },  // warrior resolved an alert
    newMessages:     { type: Boolean, default: true },  // 1-on-1 chat messages
    groupMessages:   { type: Boolean, default: true },  // group Care Circle messages
    dailyInsights:   { type: Boolean, default: true },  // 7 PM daily AI insight push
  },
  // Last time the user opened the app / made an API call
  lastActive: {
    type: Date,
    default: null
  },
  // Password reset
  resetToken: {
    type: String,
    default: null
  },
  resetTokenExpiry: {
    type: Date,
    default: null
  },
  // Apple Watch pairing — 6-digit code the Watch enters to get a JWT
  watchPairCode: {
    type: String,
    default: null
  },
  watchPairExpiry: {
    type: Date,
    default: null
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
