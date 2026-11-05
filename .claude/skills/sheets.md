# Skill: Google Sheets Operations

## Purpose
Read and write Google Sheets data, update FPU/LDO/amounts, append new meter readings.

---

## Prerequisites
- Google OAuth credentials configured (oauth-client.json + oauth-token.json in credentials/)
- Google Sheet ID stored in `.env` (GOOGLE_SHEET_ID)
- Sheet tab name: "Niete dedicated fleet" (configurable)
- Read/Write access granted

---

## Instructions

### 1. Read All Data from Sheet
```javascript
const { logisticsClient } = require('./src/sheets/logisticsClient.js');
const data = await logisticsClient.getAllData();
// Returns: [ [col1, col2, ...], [col1, col2, ...], ... ]
```

### 2. Update Single Cell
```javascript
await logisticsClient.updateCell('E5', 245); // Update FPU in row 5
```

### 3. Append New Row
```javascript
const newRow = [
  '2026-04-21',        // Date
  'Niete',             // Hub
  'Ahmed Khan',        // Coach
  '+92-321-5551234',   // Phone
  245,                 // FPU
  312,                 // LDO
  67,                  // Total (calculated)
  285,                 // Fuel Price
  'Balochistan-5',     // Route
  'Quetta',            // Destination
  1910                 // Amount (calculated)
];
await logisticsClient.appendRow(newRow);
```

### 4. Update Multiple Cells (Batch)
```javascript
const updates = [
  { cell: 'E5', value: 245 },  // FPU
  { cell: 'F5', value: 312 },  // LDO
  { cell: 'G5', value: 67 }    // Total
];
await logisticsClient.batchUpdate(updates);
```

---

## Examples

### Daily KM Report
```javascript
async function generateDailyReport() {
  const data = await logisticsClient.getAllData();
  
  // Filter today's data
  const today = new Date().toISOString().split('T')[0];
  const todayRows = data.filter(row => row[0] === today);
  
  const totalKM = todayRows.reduce((sum, row) => sum + row[6], 0);
  const avgAmount = todayRows.reduce((sum, row) => sum + row[10], 0) / todayRows.length;
  
  console.log(`Today: ${todayRows.length} coaches, ${totalKM} KM, ${avgAmount} PKR average`);
}
```

### Update FPU Reading
```javascript
async function updateFPU(rowNumber, kmValue) {
  // Validate KM range
  if (kmValue < 0 || kmValue > 500) {
    console.error(`Invalid KM: ${kmValue}. Must be 0-500.`);
    return;
  }
  
  // Update FPU column (E)
  const cellAddress = `E${rowNumber}`;
  await logisticsClient.updateCell(cellAddress, kmValue);
  console.log(`Updated FPU: Row ${rowNumber} = ${kmValue} KM`);
}
```

---

## Common Mistakes

### Mistake 1: Wrong Column Letter
❌ Bad: `updateCell('5E', value)` (wrong order)  
✅ Fix: `updateCell('E5', value)` (column first, then row)

### Mistake 2: Forgetting to Validate Data
❌ Bad: Accept any KM value, let it break calculations  
✅ Fix: Check 0 ≤ KM ≤ 500 before writing
```javascript
if (km < 0 || km > 500) throw new Error('Invalid KM');
```

### Mistake 3: Ignoring OAuth Expiration
❌ Symptom: 401 Unauthorized error after few days  
✅ Fix: Refresh token automatically (library handles this)

### Mistake 4: Writing to Protected Columns
❌ Bad: Trying to update formulas or read-only columns  
✅ Fix: Only write to these columns: E, F, G, H, I, J, K, L

### Mistake 5: No Validation After Write
❌ Bad: Write value, assume it worked  
✅ Fix: Read back and verify
```javascript
await logisticsClient.updateCell('E5', 245);
const updated = await logisticsClient.getCell('E5');
console.assert(updated === 245, 'Update failed');
```

---

## Code Reference
- **Main file:** `/src/sheets/logisticsClient.js`
- **API:** Google Sheets API v4
- **Library:** `google-auth-library-nodejs`
- **Key functions:**
  - `getAllData()`
  - `updateCell(cellAddress, value)`
  - `appendRow(rowData)`
  - `batchUpdate(updates)`
- **Last updated:** 2026-04-21

---

## Notes

1. **Rate limiting:** 60 queries/minute (rarely a constraint)
2. **Batch updates:** Always use `batchUpdate()` for 3+ changes (faster)
3. **Data types:** Numbers auto-converted; dates must be YYYY-MM-DD
4. **Formulas:** Protected columns prevent accidental overwrites
5. **Audit trail:** All writes logged to `/logs/app.log`
6. **Recovery:** Google Sheets auto-versions; can recover old data

---

**Last Updated:** 2026-04-21  
**Complexity:** Medium  
**Linked Skills:** schema (docs/SCHEMA.md), error-handling
