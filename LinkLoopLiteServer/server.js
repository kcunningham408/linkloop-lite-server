const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const { startDexcomSyncJob } = require('./jobs/dexcomSync');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Static pages (privacy policy, terms, support)
app.use(express.static(path.join(__dirname, 'public')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
app.get('/support', (req, res) => res.sendFile(path.join(__dirname, 'public', 'support.html')));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/linkloop')
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    // Drop the old bad unique index on CareCircle that blocked multiple pending invites
    try {
      await mongoose.connection.collection('carecircles').dropIndex('ownerId_1_memberId_1');
      console.log('✅ Dropped old CareCircle unique index');
    } catch (e) {
      // Index may not exist or already dropped — that's fine
    }
    startDexcomSyncJob();
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/glucose', require('./routes/glucose'));
app.use('/api/circle', require('./routes/circle'));
app.use('/api/insights', require('./routes/insights'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/supplies', require('./routes/supplies'));
app.use('/api/dexcom', require('./routes/dexcom'));
app.use('/api/nightscout', require('./routes/nightscout'));
app.use('/api/mood', require('./routes/mood'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.json({
    status: dbState === 1 ? 'ok' : 'degraded',
    message: 'LinkLoop Server is running! ⚡',
    database: states[dbState] || 'unknown'
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`⚡ LinkLoop Server running on port ${PORT}`);
});

// ── Keep-alive ping — prevents Render free tier from sleeping ─────
// Pings our own health endpoint every 10 minutes
const SERVER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(async () => {
  try {
    await axios.get(`${SERVER_URL}/api/health`);
    console.log('[KeepAlive] Pinged successfully');
  } catch (err) {
    console.log('[KeepAlive] Ping failed:', err.message);
  }
}, 10 * 60 * 1000); // every 10 minutes
