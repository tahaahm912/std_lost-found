const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../database/database');

// In-memory token store for admin sessions
const activeAdminTokens = new Map();

// Clean up old tokens (older than 24 hours)
setInterval(() => {
  const now = Date.now();

  for (const [token, data] of activeAdminTokens.entries()) {
    if (now - data.createdAt > 24 * 60 * 60 * 1000) {
      activeAdminTokens.delete(token);
    }
  }
}, 60 * 60 * 1000);

// Admin authentication middleware
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Admin authentication required.'
    });
  }

  const token = authHeader.split(' ')[1];

  if (!activeAdminTokens.has(token)) {
    return res.status(401).json({
      success: false,
      error: 'Session expired or invalid. Please log in again.'
    });
  }

  req.adminUser = activeAdminTokens.get(token);
  next();
}

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  const expectedEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const expectedPassword = process.env.ADMIN_PASSWORD || '';

  if (!expectedEmail || !expectedPassword) {
    console.error('Admin credentials are not configured in environment variables.');

    return res.status(500).json({
      success: false,
      error: 'Admin authentication is not configured.'
    });
  }

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required.'
    });
  }

  const inputEmail = email.trim().toLowerCase();

  if (inputEmail === expectedEmail && password === expectedPassword) {
    const token = crypto.randomBytes(32).toString('hex');

    activeAdminTokens.set(token, {
      email: inputEmail,
      createdAt: Date.now()
    });

    return res.json({
      success: true,
      token,
      admin: {
        email: inputEmail,
        name: 'University Admin'
      },
      message: 'Login successful'
    });
  }

  return res.status(401).json({
    success: false,
    error: 'Invalid admin email or password.'
  });
});

// GET /api/admin/verify
router.get('/verify', requireAdminAuth, (req, res) => {
  res.json({
    success: true,
    valid: true,
    admin: req.adminUser
  });
});

// POST /api/admin/logout
router.post('/logout', (req, res) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    activeAdminTokens.delete(token);
  }

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// GET /api/admin/stats
router.get('/stats', requireAdminAuth, async (req, res) => {
  try {
    const totalLostRow = await db.get(
      "SELECT COUNT(*) as count FROM items WHERE type = 'lost'"
    );

    const totalFoundRow = await db.get(
      "SELECT COUNT(*) as count FROM items WHERE type = 'found'"
    );

    const activeReportsRow = await db.get(
      "SELECT COUNT(*) as count FROM items WHERE status = 'Active' OR status = 'Possible Match'"
    );

    const returnedItemsRow = await db.get(
      "SELECT COUNT(*) as count FROM items WHERE status = 'Returned' OR status = 'Found/Returned'"
    );

    const pendingClaimsRow = await db.get(
      "SELECT COUNT(*) as count FROM claims WHERE status = 'Pending'"
    );

    const totalClaimsRow = await db.get(
      'SELECT COUNT(*) as count FROM claims'
    );

    const totalMatchesRow = await db.get(
      'SELECT COUNT(*) as count FROM matches'
    );

    const totalLost = parseInt(totalLostRow ? totalLostRow.count : 0, 10);
    const totalFound = parseInt(totalFoundRow ? totalFoundRow.count : 0, 10);
    const activeReports = parseInt(
      activeReportsRow ? activeReportsRow.count : 0,
      10
    );
    const returnedItems = parseInt(
      returnedItemsRow ? returnedItemsRow.count : 0,
      10
    );
    const pendingClaims = parseInt(
      pendingClaimsRow ? pendingClaimsRow.count : 0,
      10
    );
    const totalClaims = parseInt(
      totalClaimsRow ? totalClaimsRow.count : 0,
      10
    );
    const totalMatches = parseInt(
      totalMatchesRow ? totalMatchesRow.count : 0,
      10
    );

    const categoryStats = await db.query(`
      SELECT category, COUNT(*) as count
      FROM items
      GROUP BY category
      ORDER BY count DESC
    `);

    const recentActivity = await db.query(`
      SELECT id, report_id, type, name, status, created_at
      FROM items
      ORDER BY created_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      stats: {
        totalLost,
        totalFound,
        activeReports,
        returnedItems,
        pendingClaims,
        totalClaims,
        totalMatches,
        categoryStats,
        recentActivity
      }
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// GET /api/admin/items
router.get('/items', requireAdminAuth, async (req, res) => {
  try {
    const { type, status, search } = req.query;

    let query = 'SELECT * FROM items WHERE 1=1';
    const params = [];

    if (type && type !== 'all') {
      query += ' AND type = ?';
      params.push(type);
    }

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;

      query += `
        AND (
          name LIKE ?
          OR description LIKE ?
          OR location LIKE ?
          OR report_id LIKE ?
          OR reporter_name LIKE ?
          OR reporter_email LIKE ?
        )
      `;

      params.push(s, s, s, s, s, s);
    }

    query += ' ORDER BY created_at DESC';

    const items = await db.query(query, params);

    const itemsWithCounts = await Promise.all(
      items.map(async (item) => {
        const claimsRow = await db.get(
          'SELECT COUNT(*) as c FROM claims WHERE item_id = ?',
          item.id
        );

        const matchesRow =
          item.type === 'lost'
            ? await db.get(
                'SELECT COUNT(*) as c FROM matches WHERE lost_item_id = ?',
                item.id
              )
            : await db.get(
                'SELECT COUNT(*) as c FROM matches WHERE found_item_id = ?',
                item.id
              );

        return {
          ...item,
          claimsCount: parseInt(claimsRow ? claimsRow.c : 0, 10),
          matchesCount: parseInt(matchesRow ? matchesRow.c : 0, 10)
        };
      })
    );

    res.json({
      success: true,
      items: itemsWithCounts
    });
  } catch (err) {
    console.error('Error fetching admin items:', err);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch items'
    });
  }
});

// GET /api/admin/claims
router.get('/claims', requireAdminAuth, async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT
        c.*,
        i.name as item_name,
        i.report_id as item_report_id,
        i.type as item_type,
        i.category as item_category,
        i.location as item_location,
        i.status as item_status
      FROM claims c
      JOIN items i ON c.item_id = i.id
      WHERE 1=1
    `;

    const params = [];

    if (status && status !== 'all') {
      query += ' AND c.status = ?';
      params.push(status);
    }

    query += ' ORDER BY c.created_at DESC';

    const claims = await db.query(query, params);

    res.json({
      success: true,
      claims
    });
  } catch (err) {
    console.error('Error fetching admin claims:', err);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch claims'
    });
  }
});

module.exports = {
  router,
  requireAdminAuth
};