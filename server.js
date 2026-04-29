// server.js — Custodial Planning Suite API
// Single Express server with all routes for Rooms, Custodians, and Factors.
// Deployed on Render as a Web Service.

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { v4: uuidv4 } = require('uuid');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
}));
app.use(express.json());

// ── Simple API key check (optional but recommended) ────────────────────────
// Set API_KEY in your Render environment variables.
// The frontend sends it as the x-api-key header.
function checkApiKey(req, res, next) {
  const key = process.env.API_KEY;
  if (!key) return next(); // No key set — allow all (for initial testing)
  if (req.headers['x-api-key'] === key) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ── Health check (Render pings this to confirm the service is alive) ───────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ═══════════════════════════════════════════════════════════════════════════
// ROOMS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/rooms  — get all rooms, optionally filtered by building
app.get('/api/rooms', checkApiKey, async (req, res) => {
  try {
    const { building } = req.query;
    let query  = 'SELECT * FROM rooms';
    const vals = [];
    if (building) {
      query += ' WHERE building = $1';
      vals.push(building);
    }
    query += ' ORDER BY building, floor, room_number';
    const result = await db.query(query, vals);

    // Convert snake_case DB columns to camelCase for the frontend
    const rows = result.rows.map(normaliseRoom);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rooms — create a single room
app.post('/api/rooms', checkApiKey, async (req, res) => {
  try {
    const b = req.body;
    if (!b.building || !b.roomNumber || !b.spaceType) {
      return res.status(400).json({ error: 'building, roomNumber, and spaceType are required' });
    }
    const result = await db.query(`
      INSERT INTO rooms
        (building, room_number, floor, space_type, sqft,
         fixtures, bins, dispensers, mirrors, appliances,
         microwaves, mats, requires_cleaning, notes,
         floor_type, hard_split)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        b.building, b.roomNumber, b.floor || '1', b.spaceType,
        b.sqft || 0, b.fixtures || 1, b.bins || 1, b.dispensers || 1,
        b.mirrors || 0, b.appliances || 0, b.microwaves || 0, b.mats || 0,
        b.requiresCleaning !== false, b.notes || '',
        b.floorType || 'Hard Floor', b.hardSplit ?? 50,
      ]
    );
    res.status(201).json(normaliseRoom(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rooms/bulk — import many rooms at once (used by Excel upload)
app.post('/api/rooms/bulk', checkApiKey, async (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).json({ error: 'Body must be a non-empty array of rooms' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];
    for (const b of rows) {
      const r = await client.query(`
        INSERT INTO rooms
          (building, room_number, floor, space_type, sqft,
           fixtures, bins, dispensers, mirrors, appliances,
           microwaves, mats, requires_cleaning, notes,
           floor_type, hard_split)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (building, room_number) DO UPDATE SET
          space_type        = EXCLUDED.space_type,
          sqft              = EXCLUDED.sqft,
          fixtures          = EXCLUDED.fixtures,
          bins              = EXCLUDED.bins,
          dispensers        = EXCLUDED.dispensers,
          mirrors           = EXCLUDED.mirrors,
          appliances        = EXCLUDED.appliances,
          microwaves        = EXCLUDED.microwaves,
          mats              = EXCLUDED.mats,
          requires_cleaning = EXCLUDED.requires_cleaning,
          notes             = EXCLUDED.notes,
          floor_type        = EXCLUDED.floor_type,
          hard_split        = EXCLUDED.hard_split,
          updated_at        = NOW()
        RETURNING id`,
        [
          b.building || 'Unknown', b.roomNumber || '?',
          b.floor || '1', b.spaceType || 'Office / Admin Space',
          b.sqft || 0, b.fixtures || 1, b.bins || 1, b.dispensers || 1,
          b.mirrors || 0, b.appliances || 0, b.microwaves || 0, b.mats || 0,
          b.requiresCleaning !== false, b.notes || '',
          b.floorType || 'Hard Floor', b.hardSplit ?? 50,
        ]
      );
      inserted.push(r.rows[0].id);
    }
    await client.query('COMMIT');
    res.status(201).json({ inserted: inserted.length, ids: inserted });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/rooms/:id — update a room
app.put('/api/rooms/:id', checkApiKey, async (req, res) => {
  try {
    const b = req.body;
    const result = await db.query(`
      UPDATE rooms SET
        building          = $1,  room_number    = $2,  floor        = $3,
        space_type        = $4,  sqft           = $5,  fixtures     = $6,
        bins              = $7,  dispensers     = $8,  mirrors      = $9,
        appliances        = $10, microwaves     = $11, mats         = $12,
        requires_cleaning = $13, notes          = $14,
        floor_type        = $15, hard_split     = $16, updated_at   = NOW()
      WHERE id = $17
      RETURNING *`,
      [
        b.building, b.roomNumber, b.floor || '1', b.spaceType,
        b.sqft || 0, b.fixtures || 1, b.bins || 1, b.dispensers || 1,
        b.mirrors || 0, b.appliances || 0, b.microwaves || 0, b.mats || 0,
        b.requiresCleaning !== false, b.notes || '',
        b.floorType || 'Hard Floor', b.hardSplit ?? 50,
        req.params.id,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Room not found' });
    res.json(normaliseRoom(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/rooms/:id
app.delete('/api/rooms/:id', checkApiKey, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM rooms WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Room not found' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CUSTODIANS
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/custodians', checkApiKey, async (req, res) => {
  try {
    const { building } = req.query;
    let query = 'SELECT * FROM custodians';
    const vals = [];
    if (building) { query += ' WHERE building = $1'; vals.push(building); }
    query += ' ORDER BY building, name';
    const result = await db.query(query, vals);
    res.json(result.rows.map(normaliseCustodian));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/custodians', checkApiKey, async (req, res) => {
  try {
    const b = req.body;
    if (!b.name || !b.building) return res.status(400).json({ error: 'name and building are required' });
    const result = await db.query(`
      INSERT INTO custodians (name, building, shift, days_off, fte_type)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *`,
      [b.name, b.building, b.shift || 'Day (7am–3pm)', b.daysOff || 'Sat-Sun', b.fte || 'Full Time']
    );
    res.status(201).json(normaliseCustodian(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/custodians/:id', checkApiKey, async (req, res) => {
  try {
    const b = req.body;
    const result = await db.query(`
      UPDATE custodians SET
        name = $1, building = $2, shift = $3,
        days_off = $4, fte_type = $5, updated_at = NOW()
      WHERE id = $6 RETURNING *`,
      [b.name, b.building, b.shift || 'Day (7am–3pm)', b.daysOff || 'Sat-Sun', b.fte || 'Full Time', req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Custodian not found' });
    res.json(normaliseCustodian(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/custodians/:id', checkApiKey, async (req, res) => {
  try {
    const result = await db.query('DELETE FROM custodians WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Custodian not found' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// FACTORS
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/factors', checkApiKey, async (req, res) => {
  try {
    const result = await db.query('SELECT space_type, factor FROM factors ORDER BY space_type');
    const map = {};
    for (const r of result.rows) map[r.space_type] = parseFloat(r.factor);
    res.json(map);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/factors', checkApiKey, async (req, res) => {
  try {
    const body = req.body;
    // Accept either a full map {spaceType: factor} or array [{spaceType, factor}]
    const entries = Array.isArray(body)
      ? body
      : Object.entries(body).map(([spaceType, factor]) => ({ spaceType, factor }));

    for (const { spaceType, factor } of entries) {
      await db.query(`
        INSERT INTO factors (space_type, factor)
        VALUES ($1, $2)
        ON CONFLICT (space_type) DO UPDATE SET factor = $2, updated_at = NOW()`,
        [spaceType, parseFloat(factor) || 1.0]
      );
    }
    res.json({ updated: entries.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — convert DB snake_case to frontend camelCase
// ═══════════════════════════════════════════════════════════════════════════

function normaliseRoom(r) {
  return {
    id:               r.id,
    building:         r.building,
    roomNumber:       r.room_number,
    floor:            r.floor,
    spaceType:        r.space_type,
    sqft:             Math.round(parseFloat(r.sqft) || 0),
    fixtures:         r.fixtures,
    bins:             r.bins,
    dispensers:       r.dispensers,
    mirrors:          r.mirrors,
    appliances:       r.appliances,
    microwaves:       r.microwaves,
    mats:             r.mats,
    requiresCleaning: r.requires_cleaning,
    notes:            r.notes || '',
    floorType:        r.floor_type || 'Hard Floor',
    hardSplit:        r.hard_split ?? 50,
  };
}

function normaliseCustodian(r) {
  return {
    id:       r.id,
    name:     r.name,
    building: r.building,
    shift:    r.shift,
    daysOff:  r.days_off,
    fte:      r.fte_type,
  };
}

// ── Start server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Custodial Planning API running on port ${PORT}`);
});
