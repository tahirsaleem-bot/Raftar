const { processAllEmployees } = require('./src/routes/processEmployeeRoutes');
const logger = require('./src/logger');

async function main() {
  console.log(`\n🎯 Testing Row 2484 (Jamshaid Ahmad) - Al_Qaim Town Route`);
  console.log(`\n   Processing 1 employee starting from row 2484...`);

  try {
    const result = await processAllEmployees(1, 2484);

    console.log(`\n✅ Processing complete!`);

    if (result.results && result.results.length > 0) {
      const res = result.results[0];
      if (res.success) {
        console.log(`\n📍 Employee: ${res.name} (Row ${res.rowNumber})`);
        console.log(`   Employee ID: ${res.employeeId}`);
        console.log(`   Date: ${res.date}`);
        console.log(`\n📏 Route Calculation:`);
        console.log(`   Calculated Distance: ${res.calculatedDistance} km`);
        console.log(`   Calculated Duration: ${res.calculatedDuration} minutes`);

        if (res.segments && res.segments.length > 0) {
          console.log(`\n   Segments:`);
          res.segments.forEach((seg, i) => {
            console.log(`   ${i + 1}. ${seg.from} → ${seg.to}`);
            console.log(`      ${seg.distance} km, ${seg.duration} min`);
          });
        }

        console.log(`\n⛽ Vehicle & Fuel:`);
        console.log(`   Vehicle Type: ${res.vehicleType}`);
        console.log(`   Fuel Consumption: ${res.fuel} liters`);
        console.log(`   Fuel Price: ${res.fuelPrice} PKR/L`);

        console.log(`\n💰 Amount Calculation:`);
        console.log(`   Amount (Column X): ${res.amount.toFixed(2)} PKR`);

        console.log(`\n📋 Expected Sheet Update:`);
        console.log(`   Column S (Calculated KM): ${res.calculatedDistance}`);
        console.log(`   Column T (Discrepancy): Formula (R - S)`);
        console.log(`   Column U (Fuel Price): ${res.fuelPrice}`);
        console.log(`   Column W (Consumption): Formula`);
        console.log(`   Column X (Amount): Formula`);

        console.log(`\n✅ Row 2484 is ready! Check Google Sheet column S for: ${res.calculatedDistance} km`);
      } else {
        console.log(`\n❌ Processing failed: ${res.reason}`);
      }
    } else {
      console.log(`\n⚠️  No results returned`);
    }

    console.log(`\n   Written to sheet: ${result.written} rows`);

    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Error:`, err.message);
    logger.error(`[test] Row 2484 processing error: ${err.message}`);
    process.exit(1);
  }
}

main();
