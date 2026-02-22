#!/usr/bin/env node
// Seed a demo user for App Review / testing
// Usage: node seedDemoUser.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/linkloop';
const demoEmail = process.env.DEMO_USER_EMAIL || 'demo@linkloop.test';
const demoPassword = process.env.DEMO_USER_PASSWORD || 'DemoPass123!';
const demoName = process.env.DEMO_USER_NAME || 'Demo User';

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if demo user exists
    let user = await User.findOne({ email: demoEmail });
    if (user) {
      console.log('Demo user already exists. Updating password and name...');
      user.password = demoPassword;
      user.name = demoName;
      await user.save();
    } else {
      user = new User({
        email: demoEmail,
        password: demoPassword,
        name: demoName,
        role: 't1d'
      });
      await user.save();
      console.log('Created demo user');
    }

    console.log('Demo credentials:');
    console.log(`  email: ${demoEmail}`);
    console.log(`  password: ${demoPassword}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seed();
