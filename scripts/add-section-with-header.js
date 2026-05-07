#!/usr/bin/env node

require('dotenv').config();

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('./src/logger');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, 'credentials', 'google-token.json');

const SHEET_ID = process.env.LOGISTICS_SHEET_ID;
const SHEET_TAB = process.env.LOGISTICS_SHEET_TAB || 'Niete dedicated fleet';

// Hub → Coach mapping
const COACH_MAP = {
  'E-9 AHQ': 'Javeria, Hafsa, Zarmeen',
  'lane 6': 'Sehar, Maria, Waleed',
  'Khawaja corporation': 'Meerab, Hira',
  'Tramri Chowk': 'Ridda Abbas, Moiz Khan',
  'H-13 Tarnol': 'Iqra & Hamza Siddique',
  'I-10 Tarnol': 'Sana Nawaz, Abubakr',
  'Misrial Road': 'Saman & Iqra Arshad, M Salman',
};

const HUB_GROUPS = [
  { hubName: 'E-9 AHQ', region: 'B.K' },
  { hubName: 'lane 6', region: 'Nilore' },
  { hubName: 'Khawaja corporation', region: 'Sihala' },
  { hubName: 'Tramri Chowk', region: 'Sihala' },
  { hubName: 'H-13 Tarnol', region: 'Tarnol' },
  { hubName: 'I-10 Tarnol', region: 'Tarnol' },
  { hubName: 'Misrial Road', region: 'Tarnol' },
];

function getAuth() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const { client_id, client_secret } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  auth.setCredentials(token);
  return auth;
}

function getTodayDate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(now);
  const d = {};
  parts.forEach(p => { d[p.type] = p.value; });
  return `${d.day}-${d.month}-${d.year}`;
}

async function main() {
  try {
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });
    const dateStr = getTodayDate();

    logger.info(`📅 Adding section for: ${dateStr}`);

    // Header row
    const headers = [
      'Sr No',
      'Date',
      'Regions',
      'Respective Coaches',
      'Proposed Hub Locations',
      'Driver',
      'Vehicle',
      'Sign In',
      'Sign Out',
      'FPU Reading',
      'LDO Reading',
      'Total Reading',
    ];

    // Data rows with coaches
    const dataRows = HUB_GROUPS.map((hub, i) => [
      String(i + 1),
      dateStr,
      hub.region,
      COACH_MAP[hub.hubName] || '',
      hub.hubName,
      '', '', '', '', '', '', '',
    ]);

    // Combine header + data
    const allRows = [headers, ...dataRows];

    logger.info('📝 Adding header at row 4058...');
    logger.info('📊 Adding 7 hub rows at 4059-4065...');

    // Insert all rows starting from 4058
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A4058:L4065`,
      valueInputOption: 'RAW',
      requestBody: { values: allRows },
    });

    logger.info('✅ Done!');
    logger.info(`📋 Row 4058: Header`);
    logger.info(`📊 Rows 4059-4065: 7 hubs with coaches`);

  } catch (err) {
    logger.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

main();
