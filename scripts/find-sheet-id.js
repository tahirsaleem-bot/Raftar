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

    logger.info(`🔍 Finding sheet: "${SHEET_TAB}"`);

    const res = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
    });

    const allSheets = res.data.sheets;
    const targetSheet = allSheets.find(s => s.properties.title === SHEET_TAB);

    if (!targetSheet) {
      logger.error(`❌ Sheet "${SHEET_TAB}" not found!`);
      logger.info('📋 Available sheets:');
      allSheets.forEach(s => {
        logger.info(`   - ${s.properties.title} (ID: ${s.properties.sheetId})`);
      });
      process.exit(1);
    }

    const sheetId = targetSheet.properties.sheetId;
    logger.info(`✅ Found!`);
    logger.info(`📋 Sheet: "${SHEET_TAB}"`);
    logger.info(`🔑 Sheet ID: ${sheetId}`);
    logger.info(`📊 Rows: ${targetSheet.properties.gridProperties.rowCount}`);
    logger.info(`📐 Columns: ${targetSheet.properties.gridProperties.columnCount}`);

  } catch (err) {
    logger.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

main();
