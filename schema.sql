-- ============================================================
-- CUSTODIAL PLANNING SUITE — PostgreSQL Schema for Render
-- Run this once in the Render database shell
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Buildings reference table
CREATE TABLE IF NOT EXISTS buildings (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Room inventory
CREATE TABLE IF NOT EXISTS rooms (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  building         VARCHAR(200) NOT NULL,
  room_number      VARCHAR(50)  NOT NULL,
  floor            VARCHAR(20)  NOT NULL DEFAULT '1',
  space_type       VARCHAR(100) NOT NULL,
  sqft             NUMERIC(10,2) NOT NULL DEFAULT 0,
  fixtures         INT NOT NULL DEFAULT 1,
  bins             INT NOT NULL DEFAULT 1,
  dispensers       INT NOT NULL DEFAULT 1,
  mirrors          INT NOT NULL DEFAULT 0,
  appliances       INT NOT NULL DEFAULT 0,
  microwaves       INT NOT NULL DEFAULT 0,
  mats             INT NOT NULL DEFAULT 0,
  requires_cleaning BOOLEAN NOT NULL DEFAULT TRUE,
  notes            VARCHAR(500),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (building, room_number)
);

-- Custodian roster
CREATE TABLE IF NOT EXISTS custodians (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  building   VARCHAR(200) NOT NULL,
  shift      VARCHAR(50)  NOT NULL DEFAULT 'Day (7am–3pm)',
  days_off   VARCHAR(20)  NOT NULL DEFAULT 'Sat-Sun',
  fte_type   VARCHAR(30)  NOT NULL DEFAULT 'Full Time',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ISSA adjustment factors per space type
CREATE TABLE IF NOT EXISTS factors (
  id         SERIAL PRIMARY KEY,
  space_type VARCHAR(100) NOT NULL UNIQUE,
  factor     NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_rooms_building    ON rooms (building);
CREATE INDEX IF NOT EXISTS idx_rooms_space_type  ON rooms (space_type);
CREATE INDEX IF NOT EXISTS idx_custodians_building ON custodians (building);

-- Seed default factors for all 15 space types
INSERT INTO factors (space_type, factor) VALUES
  ('Common Kitchen',                                   1.00),
  ('Common Washroom',                                  1.00),
  ('Study Rooms / Lounges / Library / Theatre',        1.00),
  ('Lobby / Circulation Space',                        1.00),
  ('Corridor / Common Space (Carpet)',                 1.00),
  ('Corridor / Common Space (Hard Floor)',             1.00),
  ('Entrances / Vestibules',                           1.00),
  ('Fitness / Gym',                                    1.00),
  ('Office / Admin Space',                             1.00),
  ('Employee Lounge',                                  1.00),
  ('Elevator',                                         1.00),
  ('Stairwell',                                        1.00),
  ('Parking Garage',                                   1.00),
  ('Dining Areas',                                     1.00),
  ('Locker Rooms',                                     1.00)
ON CONFLICT (space_type) DO NOTHING;
