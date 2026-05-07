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

function getAuth() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const { client_id, client_secret } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  auth.setCredentials(token);
  return auth;
}

async function main() {
  try {
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });

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

    logger.info('📋 Inserting header row before data (row 4057)...');

    // Insert row at 4056 (before 4057)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId: 0,
                dimension: 'ROWS',
                startIndex: 4055, // Insert before row 4057 (0-indexed: 4056)
                endIndex: 4056,
              },
            },
          },
        ],
      },
    });

    // Add headers to the new row 4056
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A4056:L4056`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });

    logger.info('✅ Header row inserted at row 4056!');
    logger.info('📊 Data now starts from row 4057');

  } catch (err) {
    logger.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

main();
