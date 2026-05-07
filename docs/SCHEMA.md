# Google Sheets Schema — Logistics Operations

Complete data structure for the Raftar project. This is the source of truth for all data fields, types, and validation rules.

---

## 📊 Main Sheet: Logistics Operations

**Location:** Google Sheets ID (see `.env` for GOOGLE_SHEET_ID)  
**Tab Name:** "Niete dedicated fleet" (configurable)  
**Read/Write Access:** Yes via OAuth (tahir.saleem@niete.edu.pk)

---

## 📋 Columns (Complete Schema)

| # | Column Name | Type | Range | Example | Notes |
|----|-------------|------|-------|---------|-------|
| A | Date | DATE | YYYY-MM-DD | 2026-04-21 | Day of operation |
| B | Hub Name | TEXT | Any | Niete | Hub identifier |
| C | Coach Name | TEXT | Any | Ahmed Khan | Full name |
| D | Phone | TEXT | +92-3XX-XXXXXXX | +92-321-5551234 | WhatsApp phone (with country code) |
| E | FPU (KM) | NUMBER | 0–500 | 245 | Starting odometer reading (morning) |
| F | LDO (KM) | NUMBER | 0–500 | 312 | Ending odometer reading (evening) |
| G | Total (KM) | NUMBER | 0–500 | 67 | Calculated: LDO - FPU |
| H | Fuel Price | NUMBER | 50–300 | 285 | PKR per liter (from fuel market) |
| I | Route | TEXT | Any | Balochistan-5 | Route identifier |
| J | Destination | TEXT | Any | Quetta | Main destination |
| K | Amount (PKR) | NUMBER | 0–10000 | 3240 | Calculated: (Total KM × Fuel Price) / 10 |
| L | Status | TEXT | Submitted / Pending / Error | Submitted | Meter reading status |
| M | Timestamp | DATETIME | ISO 8601 | 2026-04-21T10:30:00Z | When reading was submitted |
| N | Image URL | TEXT | URL or empty | [URL] | Photo of meter (if applicable) |
| O | Notes | TEXT | Any | "Returned late" | Free-form notes |

---

## 📐 Calculation Rules

### Total Distance
```
Total = LDO - FPU
```
**Validation:** 
- Total must be between 0–500 KM
- If Total > 500, flag as error (unrealistic distance)

### Amount (Fuel Cost)
```
Amount = (Total KM × Fuel Price) / 10
```
**Example:** 67 KM × 285 PKR/L ÷ 10 = 1,910 PKR  
**Rounding:** Round to nearest integer  
**Validation:**
- Amount must be between 0–10,000 PKR
- If Amount exceeds 10,000, flag as error

### Fuel Price (Dynamic)
- Updated manually or via automated scraper
- Current source: [TBD]
- Update frequency: Daily (ideally)
- Fallback: Previous day's price if not available

---

## 🎯 Hub Groups (WhatsApp Integration)

Coaches are organized into WhatsApp groups by hub. See `/src/config/hubGroups.js` for mapping.

| Hub Name | WhatsApp Group ID | Coaches |
|----------|------------------|---------|
| Niete | 120363322453549511@g.us | 5–10 |
| Balochistan | [Group ID] | 5–10 |
| [Other] | [Group ID] | [Count] |

---

## 📸 School Locations (Coordinates)

Routes point to school locations. Coordinates stored in format: **DMS (Degrees, Minutes, Seconds)**

### Format
```
Latitude: 34°52'08.0"N
Longitude: 71°32'42.0"E
```

### Current Schools in System
- Al_Qaim
- Niete
- School 3
- School 4
- ... (20+ total)

See `/src/routes/schoolsData.js` for complete list with coordinates.

---

## 🔄 Data Flow & Lifecycle

```
1. Coach uploads meter photo to WhatsApp
   ↓
2. Agent extracts KM via Gemini Vision
   ↓
3. KM validated (must be 0–500)
   ↓
4. Data inserted into Sheets (FPU or LDO column)
   ↓
5. Total calculated automatically (LDO - FPU)
   ↓
6. Amount calculated (Total × Fuel Price / 10)
   ↓
7. Status updated to "Submitted"
   ↓
8. Log entry created (timestamp + source)
```

---

## ⏰ Timing & Schedules

### Daily Submission Windows
- **FPU (Morning):** 10:00 AM PKT — Coaches submit start odometer
- **LDO (Evening):** 3:00 PM PKT — Coaches submit end odometer
- **Reminders:** 5:00 PM PKT — Missing readings reminder

### Data Structure by Time
| Time | Data Point | Status |
|------|-----------|--------|
| 10:00 AM | FPU collected | Processing |
| 10:30 AM | Total calculated | Ready |
| 3:00 PM | LDO collected | Processing |
| 3:30 PM | Amount calculated | Complete |
| 5:00 PM | Missing reminder sent | Finalized |

---

## 🔒 Data Validation Rules

All incoming data must pass these checks:

| Field | Rule | Example |
|-------|------|---------|
| **FPU/LDO** | 0–500 KM, integer | ✅ 245, ❌ 600 |
| **Total** | 0–500 KM, integer | ✅ 67, ❌ -10 |
| **Fuel Price** | 50–300 PKR, integer | ✅ 285, ❌ 500 |
| **Amount** | 0–10,000 PKR, integer | ✅ 1,910, ❌ 50,000 |
| **Date** | YYYY-MM-DD format | ✅ 2026-04-21, ❌ 21/04/2026 |
| **Phone** | +92-3XX-XXXXXXX format | ✅ +92-321-5551234, ❌ 3215551234 |

---

## 🚨 Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| KM extraction fails | Blurry photo or poor lighting | Retake photo with better focus |
| LDO < FPU | Coach entered wrong reading | Manual correction in Sheets |
| Amount > 10,000 PKR | Abnormally high fuel price | Verify fuel price data |
| Missing day's data | Coach forgot to submit | Automated reminder at 5 PM |

---

## 📝 Special Notes

1. **Timezone:** All timestamps are in Asia/Karachi (PKT, UTC+5)
2. **Null values:** FPU/LDO can be null before submission; Total/Amount calculated after both present
3. **Immutable:** Once submitted, FPU/LDO should not change (audit trail needed if corrected)
4. **Frequency:** New rows added daily (one per coach, per day minimum)
5. **Backup:** Google Sheets auto-versioning (can recover old versions)

---

**Last Updated:** 2026-04-21  
**Completeness:** 95% (missing some override fields, will add if needed)  
**Maintenance:** Updated when schema changes

