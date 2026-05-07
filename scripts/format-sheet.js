#!/usr/bin/env node

require('dotenv').config();

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('./src/logger');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, 'credentials', 'google-token.json');

const SHEET_ID = process.env.LOGISTICS_SHEET_ID;

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

    logger.info('🎨 Applying formatting...');

    // Find correct sheet ID
    const res = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
    });
    const targetSheet = res.data.sheets.find(s => s.properties.title === 'Niete Dedicated Fleet');
    if (!targetSheet) {
      logger.error('❌ Sheet "Niete Dedicated Fleet" not found!');
      process.exit(1);
    }
    const sheetId = targetSheet.properties.sheetId;

    // Format requests
    const requests = [
      // 1. Full borders for data range (A4058:L4065)
      {
        updateBorders: {
          range: {
            sheetId: sheetId,
            startRowIndex: 4057, // Row 4058 (0-indexed)
            endRowIndex: 4065,   // Up to row 4065
            startColumnIndex: 0,
            endColumnIndex: 12,
          },
          top: { style: 'SOLID', width: 1 },
          bottom: { style: 'SOLID', width: 1 },
          left: { style: 'SOLID', width: 1 },
          right: { style: 'SOLID', width: 1 },
          innerHorizontal: { style: 'SOLID', width: 1 },
          innerVertical: { style: 'SOLID', width: 1 },
        },
      },
      // 2. Yellow background + bold for header (row 4058)
      {
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 4057, // Row 4058
            endRowIndex: 4058,
            startColumnIndex: 0,
            endColumnIndex: 12,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: {
                red: 1,
                green: 1,
                blue: 0, // Yellow (RGB: 255, 255, 0)
              },
              textFormat: {
                bold: true,
                fontSize: 11,
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        },
      },
    ];

    // Apply formatting
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: { requests },
    });

    logger.info('✅ Formatting complete!');
    logger.info('📋 Borders: Added to all cells (A4058:L4065)');
    logger.info('🟨 Header (row 4058): Yellow background + Bold');

  } catch (err) {
    logger.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

main();
