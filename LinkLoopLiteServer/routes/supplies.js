const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Supply = require('../models/Supply');

// GET /api/supplies - Get all supplies for user
router.get('/', auth, async (req, res) => {
  try {
    const supplies = await Supply.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(supplies);
  } catch (err) {
    console.error('Get supplies error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/supplies - Add a supply
router.post('/', auth, async (req, res) => {
  try {
    const { name, emoji, category, quantity, unit, daysLeft } = req.body;

    if (!name || quantity === undefined) {
      return res.status(400).json({ message: 'Name and quantity are required' });
    }

    const supply = new Supply({
      userId: req.user._id,
      name,
      emoji: emoji || '📦',
      category: category || 'other',
      quantity,
      unit: unit || 'units',
      daysLeft: daysLeft || 30,
    });

    await supply.save();
    res.status(201).json(supply);
  } catch (err) {
    console.error('Add supply error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/supplies/:id - Update a supply
router.put('/:id', auth, async (req, res) => {
  try {
    const supply = await Supply.findOne({ _id: req.params.id, userId: req.user._id });
    if (!supply) {
      return res.status(404).json({ message: 'Supply not found' });
    }

    const { name, emoji, category, quantity, unit, daysLeft } = req.body;
    if (name !== undefined) supply.name = name;
    if (emoji !== undefined) supply.emoji = emoji;
    if (category !== undefined) supply.category = category;
    if (quantity !== undefined) supply.quantity = quantity;
    if (unit !== undefined) supply.unit = unit;
    if (daysLeft !== undefined) supply.daysLeft = daysLeft;

    await supply.save();
    res.json(supply);
  } catch (err) {
    console.error('Update supply error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/supplies/:id - Delete a supply
router.delete('/:id', auth, async (req, res) => {
  try {
    const supply = await Supply.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!supply) {
      return res.status(404).json({ message: 'Supply not found' });
    }
    res.json({ message: 'Supply deleted' });
  } catch (err) {
    console.error('Delete supply error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
