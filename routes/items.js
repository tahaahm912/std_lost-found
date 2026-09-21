const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, recalculateMatchesForItem } = require('../database/database');

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    cb(null, 'item-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|webp|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPG, PNG, WEBP, GIF) under 5MB are allowed!'));
  }
});

// Helper to mask sensitive email and phone for public privacy
function maskEmail(email) {
  if (!email) return '';
  const parts = email.split('@');
  if (parts.length < 2) return email;
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) {
    return name[0] + '*@' + domain;
  }
  return name[0] + '*'.repeat(Math.min(name.length - 2, 4)) + name.slice(-1) + '@' + domain;
}

function maskPhone(phone) {
  if (!phone) return '';
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.length < 4) return '***-***-****';
  return '***-***-' + clean.slice(-4);
}

function sanitizeItem(item, isAuthorized = false) {
  if (!item) return null;
  if (isAuthorized) return item;

  return {
    ...item,
    reporter_email_masked: maskEmail(item.reporter_email),
    reporter_phone_masked: maskPhone(item.reporter_phone),
    reporter_email: undefined,
    reporter_phone: undefined
  };
}

// Generate unique report ID
function generateReportId(type) {
  const prefix = type === 'lost' ? 'LOST' : 'FOUND';
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${randomNum}`;
}

// GET /api/items/stats (Public summary stats for Home page & dashboard)
router.get('/stats', async (req, res) => {
  try {
    const totalLostRow = await db.get("SELECT COUNT(*) as count FROM items WHERE type = 'lost'");
    const totalFoundRow = await db.get("SELECT COUNT(*) as count FROM items WHERE type = 'found'");
    const activeReportsRow = await db.get("SELECT COUNT(*) as count FROM items WHERE status = 'Active' OR status = 'Possible Match'");
    const returnedItemsRow = await db.get("SELECT COUNT(*) as count FROM items WHERE status = 'Returned' OR status = 'Found/Returned'");
    const pendingClaimsRow = await db.get("SELECT COUNT(*) as count FROM claims WHERE status = 'Pending'");
    const possibleMatchesRow = await db.get("SELECT COUNT(*) as count FROM matches WHERE match_score >= 50");

    const totalLost = parseInt(totalLostRow ? totalLostRow.count : 0, 10);
    const totalFound = parseInt(totalFoundRow ? totalFoundRow.count : 0, 10);
    const activeReports = parseInt(activeReportsRow ? activeReportsRow.count : 0, 10);
    const returnedItems = parseInt(returnedItemsRow ? returnedItemsRow.count : 0, 10);
    const pendingClaims = parseInt(pendingClaimsRow ? pendingClaimsRow.count : 0, 10);
    const possibleMatches = parseInt(possibleMatchesRow ? possibleMatchesRow.count : 0, 10);

    const categories = await db.query(`
      SELECT category, COUNT(*) as count 
      FROM items 
      GROUP BY category 
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      stats: {
        totalLost,
        totalFound,
        activeReports,
        returnedItems,
        pendingClaims,
        possibleMatches,
        categories
      }
    });
  } catch (err) {
    console.error('Error fetching public stats:', err);
    res.status(500).json({ success: false, error: 'Failed to load statistics' });
  }
});

// GET /api/items/reports/my (Lookup by user email or report ID)
router.get('/reports/my', async (req, res) => {
  try {
    const queryStr = req.query.query ? req.query.query.trim() : '';
    if (!queryStr) {
      return res.status(400).json({ success: false, error: 'Please enter your email address or report ID to look up your reports.' });
    }

    let items = [];
    if (queryStr.includes('@')) {
      items = await db.query('SELECT * FROM items WHERE LOWER(reporter_email) = LOWER(?) ORDER BY created_at DESC', queryStr);
    } else {
      items = await db.query('SELECT * FROM items WHERE UPPER(report_id) = UPPER(?) ORDER BY created_at DESC', queryStr);
    }

    const fullReports = await Promise.all(items.map(async (item) => {
      // Find claims if this was a found item
      const claims = await db.query('SELECT * FROM claims WHERE item_id = ? ORDER BY created_at DESC', item.id);

      // Find possible matches
      let matches = [];
      if (item.type === 'lost') {
        const rawMatches = await db.query(`
          SELECT m.match_score, i.* 
          FROM matches m
          JOIN items i ON m.found_item_id = i.id
          WHERE m.lost_item_id = ?
          ORDER BY m.match_score DESC
        `, item.id);
        matches = rawMatches.map(m => sanitizeItem(m, false));
      } else {
        const rawMatches = await db.query(`
          SELECT m.match_score, i.* 
          FROM matches m
          JOIN items i ON m.lost_item_id = i.id
          WHERE m.found_item_id = ?
          ORDER BY m.match_score DESC
        `, item.id);
        matches = rawMatches.map(m => sanitizeItem(m, false));
      }

      return {
        ...item,
        claims,
        matches
      };
    }));

    res.json({ success: true, count: fullReports.length, reports: fullReports });
  } catch (err) {
    console.error('Error in my-reports lookup:', err);
    res.status(500).json({ success: false, error: 'Failed to search your reports' });
  }
});

// GET /api/items/lost
router.get('/lost', (req, res, next) => {
  req.query.type = 'lost';
  next();
});

// GET /api/items/found
router.get('/found', (req, res, next) => {
  req.query.type = 'found';
  next();
});

// GET /api/items (Search, filter, sort)
router.get('/', async (req, res) => {
  try {
    const { type, category, location, search, status, sort, dateFilter } = req.query;

    let query = 'SELECT * FROM items WHERE 1=1';
    const params = [];

    if (type && type !== 'all') {
      query += ' AND type = ?';
      params.push(type);
    }

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (location && location !== 'all') {
      query += ' AND location LIKE ?';
      params.push(`%${location}%`);
    }

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      query += ' AND (name LIKE ? OR description LIKE ? OR location LIKE ? OR color LIKE ? OR category LIKE ? OR report_id LIKE ?)';
      params.push(s, s, s, s, s, s);
    }

    if (dateFilter && dateFilter !== 'all') {
      const now = new Date();
      if (dateFilter === 'today') {
        const todayStr = now.toISOString().split('T')[0];
        query += ' AND item_date >= ?';
        params.push(todayStr);
      } else if (dateFilter === 'week') {
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query += ' AND item_date >= ?';
        params.push(lastWeek.toISOString().split('T')[0]);
      } else if (dateFilter === 'month') {
        const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        query += ' AND item_date >= ?';
        params.push(lastMonth.toISOString().split('T')[0]);
      }
    }

    // Sorting
    if (sort === 'oldest') {
      query += ' ORDER BY item_date ASC, id ASC';
    } else if (sort === 'name_asc') {
      query += ' ORDER BY name ASC';
    } else if (sort === 'name_desc') {
      query += ' ORDER BY name DESC';
    } else {
      query += ' ORDER BY item_date DESC, id DESC';
    }

    const rows = await db.query(query, params);
    const sanitizedRows = rows.map((r) => sanitizeItem(r, false));

    res.json({
      success: true,
      count: sanitizedRows.length,
      items: sanitizedRows
    });
  } catch (err) {
    console.error('Error fetching items:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve items' });
  }
});

// GET /api/items/:id (Get single item)
router.get('/:id', async (req, res) => {
  try {
    const idOrReportId = req.params.id;
    let item;

    if (/^\d+$/.test(idOrReportId)) {
      item = await db.get('SELECT * FROM items WHERE id = ?', Number(idOrReportId));
    } else {
      item = await db.get('SELECT * FROM items WHERE UPPER(report_id) = UPPER(?)', idOrReportId);
    }

    if (!item) {
      return res.status(404).json({ success: false, error: 'Item report not found' });
    }

    // Claims count
    const claimsRow = await db.get('SELECT COUNT(*) as c FROM claims WHERE item_id = ?', item.id);
    const claimsCount = parseInt(claimsRow ? claimsRow.c : 0, 10);

    // Matches count
    const matchesRow = item.type === 'lost'
      ? await db.get('SELECT COUNT(*) as c FROM matches WHERE lost_item_id = ?', item.id)
      : await db.get('SELECT COUNT(*) as c FROM matches WHERE found_item_id = ?', item.id);
    const matchesCount = parseInt(matchesRow ? matchesRow.c : 0, 10);

    // Check if requester provided reporter email or report ID for unmasking
    const userEmail = req.query.email;
    const isOwner = userEmail && userEmail.toLowerCase() === item.reporter_email.toLowerCase();

    res.json({
      success: true,
      item: sanitizeItem(item, isOwner),
      claimsCount,
      matchesCount
    });
  } catch (err) {
    console.error('Error fetching single item:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve item' });
  }
});

// Helper for validating report submission
function validateReportData(body) {
  const errors = [];
  if (!body.name || !body.name.trim()) errors.push('Item name is required');
  if (!body.category || !body.category.trim()) errors.push('Category is required');
  if (!body.description || !body.description.trim()) errors.push('Description is required');
  if (!body.color || !body.color.trim()) errors.push('Color is required');
  if (!body.location || !body.location.trim()) errors.push('Location is required');
  if (!body.item_date || !body.item_date.trim()) errors.push('Date is required');

  const contactName = body.contact_name || body.reporter_name || body.finder_name;
  const contactEmail = body.contact_email || body.reporter_email || body.finder_email;

  if (!contactName || !contactName.trim()) errors.push('Your name is required');
  if (!contactEmail || !contactEmail.trim() || !contactEmail.includes('@')) {
    errors.push('A valid contact email is required');
  }

  return errors;
}

// POST /api/items/lost
router.post('/lost', upload.single('image'), async (req, res) => {
  try {
    const errors = validateReportData(req.body);
    if (errors.length > 0) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ success: false, error: errors.join(', ') });
    }

    const {
      name,
      category,
      description,
      color,
      location,
      item_date,
      contact_name,
      reporter_name,
      contact_email,
      reporter_email,
      contact_phone,
      reporter_phone
    } = req.body;

    const rName = (contact_name || reporter_name || '').trim();
    const rEmail = (contact_email || reporter_email || '').trim().toLowerCase();
    const rPhone = (contact_phone || reporter_phone || '').trim();
    const reportId = generateReportId('lost');
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    // Insert or update user
    try {
      await db.run(`
        INSERT INTO users (name, email, phone) 
        VALUES (?, ?, ?) 
        ON CONFLICT(email) DO UPDATE SET name = excluded.name, phone = excluded.phone
      `, [rName, rEmail, rPhone]);
    } catch (e) {
      // Non-critical
    }

    const result = await db.run(`
      INSERT INTO items (
        report_id, type, name, category, description, color, location,
        item_date, image, reporter_name, reporter_email, reporter_phone, status
      ) VALUES (
        ?, 'lost', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active'
      )
    `, [
      reportId,
      name.trim(),
      category.trim(),
      description.trim(),
      color.trim(),
      location.trim(),
      item_date.trim(),
      imagePath,
      rName,
      rEmail,
      rPhone
    ]);

    const newItem = await db.get('SELECT * FROM items WHERE id = ?', result.lastInsertRowid);

    // Calculate matches immediately
    await recalculateMatchesForItem(newItem);

    // Check newly calculated matches
    const matches = await db.query(`
      SELECT m.match_score, i.id, i.name, i.location, i.category, i.item_date, i.image, i.report_id
      FROM matches m
      JOIN items i ON m.found_item_id = i.id
      WHERE m.lost_item_id = ?
      ORDER BY m.match_score DESC
    `, newItem.id);

    res.status(201).json({
      success: true,
      message: 'Lost item report submitted successfully!',
      report_id: reportId,
      item: sanitizeItem(newItem, true),
      matchesCount: matches.length,
      possibleMatches: matches
    });
  } catch (err) {
    console.error('Error submitting lost item:', err);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: 'Failed to submit lost item report' });
  }
});

// POST /api/items/found
router.post('/found', upload.single('image'), async (req, res) => {
  try {
    const errors = validateReportData(req.body);
    if (errors.length > 0) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ success: false, error: errors.join(', ') });
    }

    const {
      name,
      category,
      description,
      color,
      location,
      item_date,
      finder_name,
      contact_name,
      reporter_name,
      finder_email,
      contact_email,
      reporter_email,
      finder_phone,
      contact_phone,
      reporter_phone
    } = req.body;

    const rName = (finder_name || contact_name || reporter_name || '').trim();
    const rEmail = (finder_email || contact_email || reporter_email || '').trim().toLowerCase();
    const rPhone = (finder_phone || contact_phone || reporter_phone || '').trim();
    const reportId = generateReportId('found');
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    // Insert or update user
    try {
      await db.run(`
        INSERT INTO users (name, email, phone) 
        VALUES (?, ?, ?) 
        ON CONFLICT(email) DO UPDATE SET name = excluded.name, phone = excluded.phone
      `, [rName, rEmail, rPhone]);
    } catch (e) {
      // Non-critical
    }

    const result = await db.run(`
      INSERT INTO items (
        report_id, type, name, category, description, color, location,
        item_date, image, reporter_name, reporter_email, reporter_phone, status
      ) VALUES (
        ?, 'found', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active'
      )
    `, [
      reportId,
      name.trim(),
      category.trim(),
      description.trim(),
      color.trim(),
      location.trim(),
      item_date.trim(),
      imagePath,
      rName,
      rEmail,
      rPhone
    ]);

    const newItem = await db.get('SELECT * FROM items WHERE id = ?', result.lastInsertRowid);

    // Calculate matches immediately
    await recalculateMatchesForItem(newItem);

    const matches = await db.query(`
      SELECT m.match_score, i.id, i.name, i.location, i.category, i.item_date, i.image, i.report_id
      FROM matches m
      JOIN items i ON m.lost_item_id = i.id
      WHERE m.found_item_id = ?
      ORDER BY m.match_score DESC
    `, newItem.id);

    res.status(201).json({
      success: true,
      message: 'Found item report submitted successfully!',
      report_id: reportId,
      item: sanitizeItem(newItem, true),
      matchesCount: matches.length,
      possibleMatches: matches
    });
  } catch (err) {
    console.error('Error submitting found item:', err);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: 'Failed to submit found item report' });
  }
});

// GET /api/items/matches/:itemId (Potential matches calculated for this item)
router.get('/matches/:itemId', async (req, res) => {
  try {
    const idOrReportId = req.params.itemId;
    let item;
    if (/^\d+$/.test(idOrReportId)) {
      item = await db.get('SELECT * FROM items WHERE id = ?', Number(idOrReportId));
    } else {
      item = await db.get('SELECT * FROM items WHERE UPPER(report_id) = UPPER(?)', idOrReportId);
    }

    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    let matches = [];
    if (item.type === 'lost') {
      const rawMatches = await db.query(`
        SELECT m.match_score, i.* 
        FROM matches m
        JOIN items i ON m.found_item_id = i.id
        WHERE m.lost_item_id = ?
        ORDER BY m.match_score DESC
      `, item.id);
      matches = rawMatches.map(m => sanitizeItem(m, false));
    } else {
      const rawMatches = await db.query(`
        SELECT m.match_score, i.* 
        FROM matches m
        JOIN items i ON m.lost_item_id = i.id
        WHERE m.found_item_id = ?
        ORDER BY m.match_score DESC
      `, item.id);
      matches = rawMatches.map(m => sanitizeItem(m, false));
    }

    res.json({
      success: true,
      item: sanitizeItem(item, false),
      count: matches.length,
      matches
    });
  } catch (err) {
    console.error('Error fetching matches:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve matches' });
  }
});

// PATCH /api/items/:id/status (Change item status)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Active', 'Possible Match', 'Claimed', 'Found/Returned', 'Returned'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const item = await db.get('SELECT * FROM items WHERE id = ?', req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    await db.run('UPDATE items SET status = ? WHERE id = ?', status, req.params.id);
    const updated = await db.get('SELECT * FROM items WHERE id = ?', req.params.id);

    res.json({
      success: true,
      message: `Item status updated to ${status}`,
      item: sanitizeItem(updated, true)
    });
  } catch (err) {
    console.error('Error updating item status:', err);
    res.status(500).json({ success: false, error: 'Failed to update item status' });
  }
});

// DELETE /api/items/:id (Delete item)
router.delete('/:id', async (req, res) => {
  try {
    const item = await db.get('SELECT * FROM items WHERE id = ?', req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    // Delete image file if exists
    if (item.image) {
      const filename = path.basename(item.image);
      const filePath = path.join(uploadDir, filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          // Ignored
        }
      }
    }

    await db.run('DELETE FROM items WHERE id = ?', req.params.id);
    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (err) {
    console.error('Error deleting item:', err);
    res.status(500).json({ success: false, error: 'Failed to delete item' });
  }
});

module.exports = router;
