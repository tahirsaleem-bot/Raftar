const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const {
  getSchoolCoordinates,
  calculateRouteDistance,
  calculateFuel,
  calculateAmount,
  checkDiscrepancy
} = require('./distanceCalculator');
const logger = require('../logger');

const CREDENTIALS_PATH = path.join(__dirname, '..', '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, '..', '..', 'credentials', 'google-token.json');

const OWN_VEHICLE_SHEET_ID = '12nKyUZxrnH9kAtP8UAKrdAh5rWGBXSeO2tJjyjurG2E';
const OWN_VEHICLE_TAB = 'Own Vehicle';
const SCHOOLS_SHEET_ID = '1QhXzJSXr-HXrgIa4LGhaMrFpAwAPEFj0YL5XxvXiLEU';
const SCHOOLS_TAB = 'Data';

function getAuth() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const { client_id, client_secret } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  auth.setCredentials(token);
  return auth;
}

// ─── Fetch all schools with coordinates ──────────────────────────────────────
async function fetchSchools() {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SCHOOLS_SHEET_ID,
    range: `${SCHOOLS_TAB}!C:G`, // Institution_Name, Coordinates
  });

  const rows = res.data.values || [];
  return rows.slice(1).map(row => ({
    name: row[0] || '',
    coordinates: row[4] || '' // Column G = Coordinates
  })).filter(s => s.name);
}

// ─── Fetch employee routes from Own Vehicle sheet ────────────────────────────
async function fetchEmployeeRoutes(limit = null, startRow = 2) {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: OWN_VEHICLE_SHEET_ID,
    range: `${OWN_VEHICLE_TAB}!A:X`, // Extended to include Mode of Travel (V) and manual entries (R-S)
  });

  const rows = res.data.values || [];
  const header = rows[0];
  const employees = [];

  // startRow is 1-based, but rows array is 0-indexed (with header at index 0)
  const startIndex = startRow - 1; // Convert to 0-indexed for rows array (accounting for header)

  for (let i = startIndex; i < rows.length; i++) {
    if (limit && employees.length >= limit) break;
    const row = rows[i];
    if (!row[1]) continue; // Skip empty rows

    employees.push({
      rowNumber: i + 1, // 1-based for sheets
      employeeId: row[0] || '',
      name: row[1] || '',
      date: row[2] || '',
      email: row[4] || '',
      home: row[5] || '',
      school1_drop: row[6] || '',
      school2_pick: row[7] || '',
      school2_drop: row[8] || '',
      school3_pick: row[9] || '',
      school3_drop: row[10] || '',
      school4_pick: row[11] || '',
      manualDistance: parseFloat(row[17]) || 0, // Column R: Employee's manual entry (0-indexed: 17)
      modeOfTravel: (row[21] || 'Car').trim(), // Column V: Mode of Travel (0-indexed: 21)
    });
  }

  return employees;
}

// ─── Get PSO fuel price based on date ──────────────────────────────────────
function getFuelPriceByDate(dateStr) {
  // Parse date from format like "4/6/2026", "4/7/2026", etc.
  const date = new Date(dateStr);

  // PSO Fuel Price History April 2026:
  // Until 4/10: 378.41 PKR/L
  // 4/11 onwards: 366.41 PKR/L

  if (date < new Date('2026-04-11')) {
    return 378.41;
  } else {
    return 366.41;
  }
}

// ─── Process single employee route ───────────────────────────────────────────
async function processEmployeeRoute(employee, schoolsData) {
  logger.info(`[route] Processing ${employee.name} (${employee.date})`);

  // Build location sequence: Home → School1 → School2 (drop off point)
  const locations = [
    { name: employee.home, type: 'home' },
    { name: employee.school1_drop, type: 'school' },
    { name: employee.school2_drop, type: 'school' },
  ];

  if (employee.school3_drop) locations.push({ name: employee.school3_drop, type: 'school' });
  if (employee.school4_pick) locations.push({ name: 'NIETE Office', type: 'office' });

  // Fetch coordinates for each location
  for (const loc of locations) {
    // Try to find coordinates in Schools sheet or LOCATION_OVERRIDES
    loc.coordinates = await getSchoolCoordinates(loc.name, schoolsData);

    if (!loc.coordinates) {
      logger.warn(`[route] Could not find coordinates for: ${loc.name} (${loc.type})`);
      return { success: false, reason: `Location not found: ${loc.name}` };
    }
  }

  // Calculate distance
  const routeResult = await calculateRouteDistance(locations);
  if (!routeResult) {
    return { success: false, reason: 'Could not calculate route' };
  }

  // Use vehicle mode from sheet (Car or Bike), default to Car
  const vehicleType = employee.modeOfTravel && employee.modeOfTravel.toLowerCase().includes('bike') ? 'bike' : 'car';
  // Get fuel price based on date (dynamic pricing)
  const fuelPrice = getFuelPriceByDate(employee.date);

  const fuel = calculateFuel(routeResult.totalDistance, vehicleType);
  const amount = calculateAmount(routeResult.totalDistance, vehicleType, fuelPrice);

  return {
    success: true,
    rowNumber: employee.rowNumber,
    employeeId: employee.employeeId,
    name: employee.name,
    date: employee.date,
    calculatedDistance: routeResult.totalDistance,
    calculatedDuration: routeResult.totalDuration,
    segments: routeResult.segments,
    vehicleType,
    fuel,
    amount,
    fuelPrice
  };
}

// ─── Write results to Own Vehicle sheet ────────────────────────────────────────
async function writeResultsToSheet(results) {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });

  // Prepare batch update requests using values.batchUpdate
  const updates = [];

  for (const result of results) {
    if (!result.success) continue;

    const rowNum = result.rowNumber;

    // Build the values - write ONLY to S, T, U, W, X (SKIP R and V completely)
    // Column R: Employee's manual KM (DON'T TOUCH) ⚠️
    // Column S: Tahir Working = Agent's OSRM calculated KM
    // Column T: Discrepancy = R - S (Employee - Agent)
    // Column U: Fuel Price
    // Column V: Mode of Travel (DON'T TOUCH) ⚠️
    // Column W: Consumption formula
    // Column X: Amount formula

    // Write S, T, U separately from W, X to avoid touching V
    const rowValuesSTU = [
      result.calculatedDistance,        // S: Tahir Working (Agent's OSRM calculated)
      `=R${rowNum}-S${rowNum}`,         // T: Discrepancy formula (Employee - Agent)
      result.fuelPrice                  // U: Fuel Price
    ];

    const rowValuesWX = [
      `=IF(V${rowNum}="Bike",15,9)`,    // W: Consumption formula
      // X: Amount = IF |Discrepancy|<=5 then use R else use S
      `=IF(ABS(T${rowNum})<=5,(R${rowNum}/W${rowNum})*U${rowNum},(S${rowNum}/W${rowNum})*U${rowNum})`
    ];

    // Write to S:U (skip V)
    updates.push({
      range: `${OWN_VEHICLE_TAB}!S${rowNum}:U${rowNum}`,
      values: [rowValuesSTU]
    });

    // Write to W:X (skip V)
    updates.push({
      range: `${OWN_VEHICLE_TAB}!W${rowNum}:X${rowNum}`,
      values: [rowValuesWX]
    });
  }

  if (updates.length === 0) {
    logger.warn('[sheet] No successful results to write');
    return { success: true, written: 0 };
  }

  try {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: OWN_VEHICLE_SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED', // Allows formulas to be recognized
        data: updates
      }
    });
    logger.info(`[sheet] Written ${updates.length} rows to Own Vehicle sheet`);
    return { success: true, written: updates.length };
  } catch (err) {
    logger.error(`[sheet] Write error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ─── Batch process all employees ─────────────────────────────────────────────
async function processAllEmployees(limit = null, startRow = 2) {
  logger.info('[route] Fetching schools data...');
  const schoolsData = await fetchSchools();
  logger.info(`[route] Loaded ${schoolsData.length} schools`);

  logger.info(`[route] Fetching employee routes (starting from row ${startRow})...`);
  const employees = await fetchEmployeeRoutes(limit, startRow);
  logger.info(`[route] Loaded ${employees.length} employees`);

  const results = [];
  for (const emp of employees) {
    const result = await processEmployeeRoute(emp, schoolsData);
    results.push({ employee: emp.name, ...result });

    // Rate limit: 500ms between requests to avoid overwhelming OSRM
    await new Promise(r => setTimeout(r, 500));
  }

  // Write results to Google Sheet
  logger.info('[route] Writing results to sheet...');
  const writeResult = await writeResultsToSheet(results);
  if (!writeResult.success) {
    logger.error(`[route] Sheet write failed: ${writeResult.error}`);
  }

  return {
    processed: results.length,
    written: writeResult.written,
    results
  };
}

module.exports = {
  fetchSchools,
  fetchEmployeeRoutes,
  processEmployeeRoute,
  writeResultsToSheet,
  processAllEmployees
};
