const express = require('express');
const router = express.Router();
const { db } = require('../database/database');

// POST /api/claims (Submit a claim for a found item)
router.post('/', async (req, res) => {
  try {
    const { item_id, claimant_name, claimant_email, claimant_phone, explanation, proof } = req.body;

    // Validate fields
    if (!item_id) {
      return res.status(400).json({ success: false, error: 'Item ID is required.' });
    }
    if (!claimant_name || !claimant_name.trim()) {
      return res.status(400).json({ success: false, error: 'Your full name is required.' });
    }
    if (!claimant_email || !claimant_email.trim() || !claimant_email.includes('@')) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }
    if (!claimant_phone || !claimant_phone.trim()) {
      return res.status(400).json({ success: false, error: 'Your phone number is required.' });
    }
    if (!explanation || !explanation.trim() || explanation.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a detailed explanation of why this item belongs to you (at least 10 characters).'
      });
    }

    // Verify item exists
    const item = await db.get('SELECT * FROM items WHERE id = ?', item_id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'The item being claimed does not exist.' });
    }

    // Insert claim
    const result = await db.run(`
      INSERT INTO claims (item_id, claimant_name, claimant_email, claimant_phone, explanation, proof, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Pending')
    `, [
      item_id,
      claimant_name.trim(),
      claimant_email.trim().toLowerCase(),
      claimant_phone.trim(),
      explanation.trim(),
      (proof || '').trim()
    ]);

    const newClaim = await db.get('SELECT * FROM claims WHERE id = ?', result.lastInsertRowid);

    res.status(201).json({
      success: true,
      message: 'Your claim has been submitted successfully! Campus staff and the finder have been notified to review your claim.',
      claim: newClaim
    });
  } catch (err) {
    console.error('Error creating claim:', err);
    res.status(500).json({ success: false, error: 'Failed to submit claim. Please try again.' });
  }
});

// GET /api/claims (Get claims, optionally filtered by item_id)
router.get('/', async (req, res) => {
  try {
    const { item_id } = req.query;
    let query = 'SELECT * FROM claims';
    const params = [];

    if (item_id) {
      query += ' WHERE item_id = ?';
      params.push(item_id);
    }

    query += ' ORDER BY created_at DESC';

    const claims = await db.query(query, params);
    res.json({ success: true, count: claims.length, claims });
  } catch (err) {
    console.error('Error fetching claims:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve claims' });
  }
});

// PATCH /api/claims/:id/status (Approve or Reject a claim)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, markItemStatus } = req.body;
    const validStatuses = ['Pending', 'Approved', 'Rejected'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid claim status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const claim = await db.get('SELECT * FROM claims WHERE id = ?', req.params.id);
    if (!claim) {
      return res.status(404).json({ success: false, error: 'Claim not found' });
    }

    await db.run('UPDATE claims SET status = ? WHERE id = ?', status, req.params.id);

    // If claim was approved and markItemStatus specified or default
    if (status === 'Approved') {
      const nextItemStatus = markItemStatus || 'Claimed';
      await db.run('UPDATE items SET status = ? WHERE id = ?', nextItemStatus, claim.item_id);
    }

    const updated = await db.get('SELECT * FROM claims WHERE id = ?', req.params.id);

    res.json({
      success: true,
      message: `Claim status updated to ${status}`,
      claim: updated
    });
  } catch (err) {
    console.error('Error updating claim status:', err);
    res.status(500).json({ success: false, error: 'Failed to update claim status' });
  }
});

module.exports = router;
