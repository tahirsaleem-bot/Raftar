# Skill: Distance Calculation (OSRM)

## Purpose
Calculate distance between two locations using free OSRM API, calculate fuel consumption and smart amounts.

---

## Prerequisites
- OSRM API (free, no auth needed)
- School coordinates in DMS format or decimal
- Fuel price (updated daily)
- Vehicle type (car: 9 km/L, bike: 15 km/L)

---

## Instructions

### 1. Calculate Distance Between Two Points
```javascript
const { distanceCalculator } = require('./src/routes/distanceCalculator.js');

const distance = await distanceCalculator.calculateDistance(
  { lat: 34.8683, lon: 71.5469 },  // Start: Niete
  { lat: 34.9000, lon: 71.4500 }   // End: Al_Qaim
);
// Returns: { distanceKm: 6.5, durationMin: 15 }
```

### 2. Calculate Fuel Consumption
```javascript
const fuelConsumption = distanceCalculator.calculateConsumption({
  distanceKm: 67,
  vehicleType: 'car'  // car: 9 km/L, bike: 15 km/L
});
// Returns: { litersNeeded: 7.4, cost: 2109 } (at 285 PKR/L)
```

### 3. Calculate Smart Amount
```javascript
const amount = distanceCalculator.calculateAmount({
  distanceKm: 67,
  fuelPricePerLiter: 285
});
// Returns: 1910 (= 67 * 285 / 10)
```

### 4. Parse DMS Coordinates
```javascript
const decimal = distanceCalculator.parseDMS("34°52'08.0\"N");
// Returns: 34.8689 (decimal degrees)
```

---

## Examples

### Daily Route Calculation
```javascript
async function calculateRoute(coach) {
  const [startKm, endKm] = [245, 312];
  const distance = endKm - startKm;  // 67 KM
  
  const amount = distanceCalculator.calculateAmount({
    distanceKm: distance,
    fuelPricePerLiter: 285
  });
  
  console.log(`${coach}: ${distance} KM = ${amount} PKR`);
  return amount;
}
```

### School Distance Lookup
```javascript
const schoolCoords = {
  'Al_Qaim': { lat: 34.900, lon: 71.450 },
  'Niete': { lat: 34.868, lon: 71.546 }
};

async function getSchoolDistance(school1, school2) {
  const dist = await distanceCalculator.calculateDistance(
    schoolCoords[school1],
    schoolCoords[school2]
  );
  return dist.distanceKm;
}
```

---

## Common Mistakes

### Mistake 1: Longitude/Latitude Order
❌ Bad: `{ lat: 71.5469, lon: 34.8683 }` (swapped)  
✅ Fix: `{ lat: 34.8683, lon: 71.5469 }` (latitude first, then longitude)

**Remember:** LAT = North-South (Europe to Africa)  
LON = East-West (UK to India)

### Mistake 2: Coordinate Format Confusion
❌ Bad: Mix DMS and decimal `"34°52'08"N"` with `71.5469` in same array  
✅ Fix: Convert all to decimal first
```javascript
const lat = distanceCalculator.parseDMS("34°52'08.0\"N");  // → 34.8683
const lon = distanceCalculator.parseDMS("71°32'42.0\"E");  // → 71.5450
const decimal = { lat, lon };
```

### Mistake 3: Fuel Consumption Calculation Wrong
❌ Bad: 67 KM / 9 km/L = 7.4 L × 285 PKR = 2,109 PKR  
✅ Fix: Formula is (Distance × Price) / 10, not via consumption
```javascript
const amount = (67 * 285) / 10;  // = 1,910 PKR (simpler, correct)
```

### Mistake 4: No Rate Limiting
❌ Bad: Send 100 OSRM requests simultaneously (might get blocked)  
✅ Fix: Add 500ms delay between requests
```javascript
for (const route of routes) {
  await calculateDistance(...);
  await sleep(500);  // Rate limiting
}
```

### Mistake 5: Ignoring School Not Found
❌ Bad: Assume school exists, crash if not found  
✅ Fix: Check `location override` for unmapped schools
```javascript
if (!schoolCoords[schoolName]) {
  // Use location override or manual coordinates
  return { error: `School "${schoolName}" not found, use override` };
}
```

---

## Code Reference
- **Main file:** `/src/routes/distanceCalculator.js`
- **School data:** `/src/routes/schoolsData.js`
- **API:** OSRM (https://router.project-osrm.org/)
- **Key functions:**
  - `calculateDistance(start, end)`
  - `calculateConsumption(distanceKm, vehicleType)`
  - `calculateAmount(distanceKm, fuelPrice)`
  - `parseDMS(dmsString)`
- **Last updated:** 2026-04-21

---

## Notes

1. **OSRM is free and unlimited** — No auth needed, no quotas
2. **Response time:** Typically <100ms per request
3. **Accuracy:** Within ±5% for Pakistani roads
4. **School overrides:** If a school is not found, add to `schoolsData.js`
5. **Fuel price:** Updated daily (manual or via scraper)
6. **Vehicle types:** Car (9 km/L, typical sedan), Bike (15 km/L, typical motorcycle)

---

**Last Updated:** 2026-04-21  
**Complexity:** Medium  
**Linked Skills:** fuel-pricing, location-override
