const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = function(req, res, next) {
  const authHeader = req.header('Authorization');

  if (!authHeader) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ message: 'Invalid token format' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Touch lastActive (fire-and-forget, don't block the request)
    User.findByIdAndUpdate(decoded.userId, { lastActive: new Date() }).catch(() => {});

    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};
