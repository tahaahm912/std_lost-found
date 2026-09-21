const { Pool } = require('pg');

let activeClient = null;
let clientType = 'none';
let initPromise = null;
let isInitializing = false;

// Convert parameterized query from ? to $1, $2, etc. for PostgreSQL
function convertSqlForPg(sql) {
  if (!sql.includes('?')) return sql;

  let paramIndex = 1;
  let inString = false;
  let stringChar = '';
  let converted = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    if (
      (char === "'" || char === '"') &&
      (i === 0 || sql[i - 1] !== '\\')
    ) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }

      converted += char;
    } else if (char === '?' && !inString) {
      converted += `$${paramIndex++}`;
    } else {
      converted += char;
    }
  }

  return converted;
}

// Normalize parameters
function normalizeParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) {
    return params[0];
  }

  return params;
}

// Initialize PostgreSQL
async function initEngine() {
  isInitializing = true;

  const databaseUrl = process.env.DATABASE_URL;
  const pgHost = process.env.PGHOST;
  const pgUser = process.env.PGUSER;
  const pgDatabase = process.env.PGDATABASE;

  if (!databaseUrl && !pgHost) {
    throw new Error(
      'No PostgreSQL connection configured. Please set DATABASE_URL in your .env file.'
    );
  }

  let pool = null;

  try {
    let poolConfig;

    // Preferred: DATABASE_URL
    if (databaseUrl) {
      poolConfig = {
        connectionString: databaseUrl,
        connectionTimeoutMillis: 10000,
        ssl: databaseUrl.includes('sslmode=require')
          ? { rejectUnauthorized: false }
          : false
      };
    } else {
      // Alternative: individual PostgreSQL variables
      poolConfig = {
        host: pgHost,
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: pgUser,
        password: process.env.PGPASSWORD || '',
        database: pgDatabase,
        connectionTimeoutMillis: 10000,
        ssl:
          process.env.PGSSL === 'true'
            ? { rejectUnauthorized: false }
            : false
      };
    }

    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      console.error('[Database] PostgreSQL pool error:', err.message);
    });

    // Test connection directly
    const client = await pool.connect();

    await client.query('SELECT 1');

    client.release();

    activeClient = pool;
    clientType = 'external-pg';

    console.log('[Database] Connected to PostgreSQL successfully.');
  } catch (err) {
    if (pool) {
      await pool.end().catch(() => {});
    }

    console.error(
      `[Database] PostgreSQL connection failed: ${err.message}`
    );

    throw new Error(
      'PostgreSQL connection failed. Check your DATABASE_URL in .env.'
    );
  }

  // Create users table
  await activeClient.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create items table
  await activeClient.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      report_id VARCHAR(50) UNIQUE NOT NULL,
      type VARCHAR(20) NOT NULL CHECK(type IN ('lost', 'found')),
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      color VARCHAR(50) NOT NULL,
      location VARCHAR(255) NOT NULL,
      item_date VARCHAR(50) NOT NULL,
      image TEXT,
      reporter_name VARCHAR(255) NOT NULL,
      reporter_email VARCHAR(255) NOT NULL,
      reporter_phone VARCHAR(50),
      status VARCHAR(50) DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create claims table
  await activeClient.query(`
    CREATE TABLE IF NOT EXISTS claims (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL
        REFERENCES items(id)
        ON DELETE CASCADE,
      claimant_name VARCHAR(255) NOT NULL,
      claimant_email VARCHAR(255) NOT NULL,
      claimant_phone VARCHAR(50) NOT NULL,
      explanation TEXT NOT NULL,
      proof TEXT,
      status VARCHAR(50) DEFAULT 'Pending'
        CHECK(status IN ('Pending', 'Approved', 'Rejected')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create matches table
  await activeClient.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      lost_item_id INTEGER NOT NULL
        REFERENCES items(id)
        ON DELETE CASCADE,
      found_item_id INTEGER NOT NULL
        REFERENCES items(id)
        ON DELETE CASCADE,
      match_score INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(lost_item_id, found_item_id)
    )
  `);

  await seedInitialData();

  isInitializing = false;
}

// Make sure database is ready
function ensureReady() {
  if (activeClient && !isInitializing) {
    return Promise.resolve();
  }

  if (!initPromise) {
    initPromise = initEngine().catch((err) => {
      isInitializing = false;

      console.error('[Database] Fatal initialization error:', err);

      throw err;
    });
  }

  return initPromise;
}

// Unified database interface
const db = {
  get isPostgres() {
    return true;
  },

  get clientType() {
    return clientType;
  },

  async query(sql, ...params) {
    if (!isInitializing) {
      await ensureReady();
    }

    const cleanParams = normalizeParams(params);
    const pgSql = convertSqlForPg(sql);

    const res = await activeClient.query(pgSql, cleanParams);

    return res.rows || [];
  },

  async get(sql, ...params) {
    if (!isInitializing) {
      await ensureReady();
    }

    const cleanParams = normalizeParams(params);
    const pgSql = convertSqlForPg(sql);

    const res = await activeClient.query(pgSql, cleanParams);

    return res.rows && res.rows.length > 0
      ? res.rows[0]
      : null;
  },

  async run(sql, ...params) {
    if (!isInitializing) {
      await ensureReady();
    }

    const cleanParams = normalizeParams(params);
    let pgSql = convertSqlForPg(sql);

    const trimmedUpper = pgSql.trim().toUpperCase();

    let hasReturning = false;

    if (
      trimmedUpper.startsWith('INSERT') &&
      !trimmedUpper.includes('RETURNING')
    ) {
      pgSql += ' RETURNING id';
      hasReturning = true;
    }

    const res = await activeClient.query(pgSql, cleanParams);

    const lastId =
      hasReturning &&
      res.rows &&
      res.rows.length > 0
        ? res.rows[0].id
        : null;

    return {
      lastInsertRowid: lastId,
      rowCount: res.rowCount,
      changes: res.rowCount
    };
  }
};

// Tokenize text for matching algorithm
function tokenize(text) {
  if (!text) {
    return new Set();
  }

  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
}

// Calculate match score between lost and found item
function calculateMatchScore(lost, found) {
  let score = 0;

  // Category match: 25 points
  if (lost.category && found.category) {
    if (
      lost.category.toLowerCase().trim() ===
      found.category.toLowerCase().trim()
    ) {
      score += 25;
    }
  }

  // Name similarity: up to 20 points
  if (lost.name && found.name) {
    const lostName = lost.name.toLowerCase().trim();
    const foundName = found.name.toLowerCase().trim();

    if (lostName === foundName) {
      score += 20;
    } else {
      const lostTokens = tokenize(lost.name);
      const foundTokens = tokenize(found.name);

      let commonTokens = 0;

      for (const token of lostTokens) {
        if (foundTokens.has(token)) {
          commonTokens++;
        }
      }

      if (
        lostTokens.size > 0 &&
        commonTokens > 0
      ) {
        const ratio =
          commonTokens /
          Math.max(lostTokens.size, foundTokens.size);

        score += Math.round(ratio * 20);
      } else if (
        lostName.includes(foundName) ||
        foundName.includes(lostName)
      ) {
        score += 15;
      }
    }
  }

  // Color match: 15 points
  if (lost.color && found.color) {
    const lostColor = lost.color.toLowerCase().trim();
    const foundColor = found.color.toLowerCase().trim();

    if (lostColor === foundColor) {
      score += 15;
    } else {
      const lostColors = tokenize(lost.color);
      const foundColors = tokenize(found.color);

      for (const color of lostColors) {
        if (foundColors.has(color)) {
          score += 15;
          break;
        }
      }
    }
  }

  // Location similarity: 20 points
  if (lost.location && found.location) {
    const lostLocation = lost.location.toLowerCase().trim();
    const foundLocation = found.location.toLowerCase().trim();

    if (lostLocation === foundLocation) {
      score += 20;
    } else {
      const lostLocationTokens = tokenize(lost.location);
      const foundLocationTokens = tokenize(found.location);

      let commonLocation = 0;

      for (const token of lostLocationTokens) {
        if (foundLocationTokens.has(token)) {
          commonLocation++;
        }
      }

      if (
        lostLocationTokens.size > 0 &&
        commonLocation > 0
      ) {
        const ratio =
          commonLocation /
          Math.max(
            lostLocationTokens.size,
            foundLocationTokens.size
          );

        score += Math.max(10, Math.round(ratio * 20));
      } else if (
        lostLocation.includes(foundLocation) ||
        foundLocation.includes(lostLocation)
      ) {
        score += 15;
      }
    }
  }

  // Date similarity: 10 points
  if (lost.item_date && found.item_date) {
    const lostDate = new Date(lost.item_date);
    const foundDate = new Date(found.item_date);

    if (!isNaN(lostDate) && !isNaN(foundDate)) {
      const diffMs = Math.abs(foundDate - lostDate);
      const diffDays =
        diffMs / (1000 * 60 * 60 * 24);

      if (diffDays <= 1) {
        score += 10;
      } else if (diffDays <= 3) {
        score += 8;
      } else if (diffDays <= 7) {
        score += 6;
      } else if (diffDays <= 14) {
        score += 3;
      }
    }
  }

  // Description similarity: 10 points
  if (lost.description && found.description) {
    const lostDescriptionTokens =
      tokenize(lost.description);

    const foundDescriptionTokens =
      tokenize(found.description);

    const stopwords = new Set([
      'the',
      'and',
      'for',
      'with',
      'this',
      'that',
      'from',
      'near',
      'have',
      'lost',
      'found'
    ]);

    let matches = 0;

    for (const token of lostDescriptionTokens) {
      if (
        !stopwords.has(token) &&
        foundDescriptionTokens.has(token)
      ) {
        matches++;
      }
    }

    if (matches >= 3) {
      score += 10;
    } else if (matches === 2) {
      score += 7;
    } else if (matches === 1) {
      score += 4;
    }
  }

  return Math.min(100, Math.max(0, score));
}

// Recalculate matches for an item
async function recalculateMatchesForItem(item) {
  if (!item || !item.id || !activeClient) {
    return;
  }

  const threshold = 35;

  try {
    if (item.type === 'lost') {
      await activeClient.query(
        'DELETE FROM matches WHERE lost_item_id = $1',
        [item.id]
      );

      const foundRes = await activeClient.query(
        "SELECT * FROM items WHERE type = 'found' AND status != 'Returned'"
      );

      let highestScore = 0;

      for (const found of foundRes.rows) {
        const score = calculateMatchScore(item, found);

        if (score >= threshold) {
          if (score > highestScore) {
            highestScore = score;
          }

          await activeClient.query(
            `
              INSERT INTO matches (
                lost_item_id,
                found_item_id,
                match_score
              )
              VALUES ($1, $2, $3)
              ON CONFLICT (
                lost_item_id,
                found_item_id
              )
              DO UPDATE SET
                match_score = EXCLUDED.match_score
            `,
            [item.id, found.id, score]
          );
        }
      }

      if (
        highestScore >= 50 &&
        item.status === 'Active'
      ) {
        await activeClient.query(
          "UPDATE items SET status = 'Possible Match' WHERE id = $1",
          [item.id]
        );
      }
    } else if (item.type === 'found') {
      await activeClient.query(
        'DELETE FROM matches WHERE found_item_id = $1',
        [item.id]
      );

      const lostRes = await activeClient.query(
        "SELECT * FROM items WHERE type = 'lost' AND status != 'Found/Returned'"
      );

      for (const lost of lostRes.rows) {
        const score = calculateMatchScore(lost, item);

        if (score >= threshold) {
          await activeClient.query(
            `
              INSERT INTO matches (
                lost_item_id,
                found_item_id,
                match_score
              )
              VALUES ($1, $2, $3)
              ON CONFLICT (
                lost_item_id,
                found_item_id
              )
              DO UPDATE SET
                match_score = EXCLUDED.match_score
            `,
            [lost.id, item.id, score]
          );

          if (
            score >= 50 &&
            lost.status === 'Active'
          ) {
            await activeClient.query(
              "UPDATE items SET status = 'Possible Match' WHERE id = $1",
              [lost.id]
            );
          }
        }
      }
    }
  } catch (err) {
    console.error(
      '[Database] Error recalculating matches:',
      err
    );
  }
}

// Seed initial data
async function seedInitialData() {
  try {
    const countRow = await activeClient.query(
      'SELECT COUNT(*) AS count FROM items'
    );

    if (
      countRow.rows &&
      countRow.rows.length > 0 &&
      parseInt(countRow.rows[0].count, 10) > 0
    ) {
      return;
    }

    const sampleItems = [
      {
        report_id: 'FOUND-109284',
        type: 'found',
        name: 'Black Leather Bifold Wallet',
        category: 'Wallet/Purse',
        description:
          'Found a black leather wallet with white stitching on the 2nd floor silent study area. Contains student card and blue lanyard.',
        color: 'Black',
        location: 'University Library 2nd Floor',
        item_date: '2026-09-18',
        image: null,
        reporter_name: 'Campus Security Desk',
        reporter_email: 'security@campus.edu',
        reporter_phone: '555-0192',
        status: 'Active'
      },
      {
        report_id: 'LOST-820194',
        type: 'lost',
        name: 'Black Bifold Wallet',
        category: 'Wallet/Purse',
        description:
          'Lost my black leather wallet yesterday evening. Has my student ID card, driver license, and a blue gym pass inside.',
        color: 'Black',
        location: 'Main Library Study Cubicles',
        item_date: '2026-09-18',
        image: null,
        reporter_name: 'Alex Rivera',
        reporter_email: 'alex.rivera@student.campus.edu',
        reporter_phone: '555-0144',
        status: 'Active'
      },
      {
        report_id: 'FOUND-229381',
        type: 'found',
        name: 'Apple AirPods Pro in White MagSafe Case',
        category: 'Electronics',
        description:
          'Found white AirPods Pro in wireless charging case on the bench outside dining hall.',
        color: 'White',
        location: 'Student Union Plaza',
        item_date: '2026-09-19',
        image: null,
        reporter_name: 'Jordan Miller',
        reporter_email: 'jordan.m@student.campus.edu',
        reporter_phone: '555-0188',
        status: 'Active'
      },
      {
        report_id: 'LOST-518293',
        type: 'lost',
        name: 'Apple AirPods Pro 2nd Gen',
        category: 'Electronics',
        description:
          'Accidentally left my white AirPods case on one of the outdoor benches near the dining center after lunch.',
        color: 'White',
        location: 'Student Union Plaza Benches',
        item_date: '2026-09-19',
        image: null,
        reporter_name: 'Marcus Chen',
        reporter_email: 'marcus.chen@student.campus.edu',
        reporter_phone: '555-0123',
        status: 'Active'
      },
      {
        report_id: 'LOST-994821',
        type: 'lost',
        name: 'Silver Hydro Flask Water Bottle (32oz)',
        category: 'Accessories',
        description:
          'Stainless steel / silver Hydro Flask with NASA and Yosemite stickers on the side and a black flex cap.',
        color: 'Silver',
        location: 'Engineering Building Room 104',
        item_date: '2026-09-17',
        image: null,
        reporter_name: 'Taylor Swift',
        reporter_email: 'taylor.s@student.campus.edu',
        reporter_phone: '555-0133',
        status: 'Active'
      },
      {
        report_id: 'FOUND-771920',
        type: 'found',
        name: 'Set of Dorm Keys on Blue Carabiner',
        category: 'Keys',
        description:
          '3 brass keys and one magnetic electronic keycard attached to a blue metal carabiner ring.',
        color: 'Blue',
        location: 'Recreation & Fitness Center Gym',
        item_date: '2026-09-20',
        image: null,
        reporter_name: 'Gym Front Desk Staff',
        reporter_email: 'rec-desk@campus.edu',
        reporter_phone: '555-0155',
        status: 'Active'
      },
      {
        report_id: 'FOUND-440192',
        type: 'found',
        name: 'Navy Blue North Face Backpack',
        category: 'Bags',
        description:
          'Dark blue backpack found in the computer lab. Has spiral notebooks and calculus lecture notes inside.',
        color: 'Blue',
        location: 'Science & Tech Hall Lab 3B',
        item_date: '2026-09-16',
        image: null,
        reporter_name: 'Prof. David Vance',
        reporter_email: 'dvance@campus.edu',
        reporter_phone: '555-0199',
        status: 'Active'
      },
      {
        report_id: 'LOST-332910',
        type: 'lost',
        name: 'University Student ID Card - Samantha Lee',
        category: 'ID/Card',
        description:
          'Lost my university student card, red border lanyard, likely dropped between dining hall and dorm block C.',
        color: 'Red',
        location: 'Campus Walkway near Dorm Block C',
        item_date: '2026-09-20',
        image: null,
        reporter_name: 'Samantha Lee',
        reporter_email: 'slee@student.campus.edu',
        reporter_phone: '555-0177',
        status: 'Active'
      },
      {
        report_id: 'FOUND-881293',
        type: 'found',
        name: 'Graphing Calculator TI-84 Plus CE',
        category: 'Electronics',
        description:
          'Black Texas Instruments TI-84 Plus CE calculator with initials "E.K." etched with marker on the back slide cover.',
        color: 'Black',
        location: 'Mathematics Building Hall A',
        item_date: '2026-09-15',
        image: null,
        reporter_name: 'Math Department Office',
        reporter_email: 'math-dept@campus.edu',
        reporter_phone: '555-0160',
        status: 'Returned'
      }
    ];

    for (const item of sampleItems) {
      await activeClient.query(
        `
          INSERT INTO items (
            report_id,
            type,
            name,
            category,
            description,
            color,
            location,
            item_date,
            image,
            reporter_name,
            reporter_email,
            reporter_phone,
            status
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13
          )
        `,
        [
          item.report_id,
          item.type,
          item.name,
          item.category,
          item.description,
          item.color,
          item.location,
          item.item_date,
          item.image,
          item.reporter_name,
          item.reporter_email,
          item.reporter_phone,
          item.status
        ]
      );
    }

    // Insert sample claim
    const walletFound = await activeClient.query(
      "SELECT id FROM items WHERE report_id = 'FOUND-109284'"
    );

    if (
      walletFound.rows &&
      walletFound.rows.length > 0
    ) {
      await activeClient.query(
        `
          INSERT INTO claims (
            item_id,
            claimant_name,
            claimant_email,
            claimant_phone,
            explanation,
            proof,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          walletFound.rows[0].id,
          'Alex Rivera',
          'alex.rivera@student.campus.edu',
          '555-0144',
          'This wallet belongs to me. It has my student ID card (Alex Rivera #884920) and a blue gym membership tag inside the left fold.',
          'Can provide photo ID and match student number.',
          'Pending'
        ]
      );
    }

    // Calculate initial matches
    const allItemsRes = await activeClient.query(
      'SELECT * FROM items'
    );

    for (const item of allItemsRes.rows) {
      await recalculateMatchesForItem(item);
    }

    console.log(
      `[Database] Database initialized and seeded (${clientType}).`
    );
  } catch (err) {
    console.error(
      '[Database] Seeding error:',
      err
    );
  }
}

// Start database initialization
ensureReady();

module.exports = {
  db,
  ensureReady,
  calculateMatchScore,
  recalculateMatchesForItem
};