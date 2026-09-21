require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

// Initialize database
require('./database/database');

const itemsRouter = require('./routes/items');
const claimsRouter = require('./routes/claims');
const { router: adminRouter } = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Serve static frontend assets
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Page Routing Aliases
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/lost', (req, res) => {
  res.sendFile(path.join(publicDir, 'lost.html'));
});

app.get('/found', (req, res) => {
  res.sendFile(path.join(publicDir, 'found.html'));
});

app.get('/report-lost', (req, res) => {
  res.sendFile(path.join(publicDir, 'report-lost.html'));
});

app.get('/report-found', (req, res) => {
  res.sendFile(path.join(publicDir, 'report-found.html'));
});

app.get('/item', (req, res) => {
  res.sendFile(path.join(publicDir, 'item.html'));
});

app.get('/my-reports', (req, res) => {
  res.sendFile(path.join(publicDir, 'my-reports.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// API Routes
app.use('/api/items', itemsRouter);
app.use('/api/claims', claimsRouter);
app.use('/api/admin', adminRouter);

// Convenient root aliases for API routes specified in prompt
app.get('/api/matches/:itemId', (req, res, next) => {
  req.url = `/matches/${req.params.itemId}`;
  itemsRouter(req, res, next);
});

app.get('/api/stats', (req, res, next) => {
  req.url = '/stats';
  itemsRouter(req, res, next);
});

app.get('/api/reports/my', (req, res, next) => {
  req.url = '/reports/my';
  itemsRouter(req, res, next);
});


// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Student Lost & Found API', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'API endpoint not found' });
  }
  res.status(404).sendFile(path.join(publicDir, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
  res.status(500).send('Something went wrong. Please try again.');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Student Lost & Found server running on http://0.0.0.0:${PORT}`);
});
