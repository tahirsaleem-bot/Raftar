const { processAllEmployees } = require('./src/routes/processEmployeeRoutes');
const logger = require('./src/logger');

async function main() {
  const args = process.argv.slice(2);

  const limit = args[0] ? parseInt(args[0]) : 10;
  const startRow = args[1] ? parseInt(args[1]) : 2; // Default: row 2 (first employee after header)

  console.log(`\n🚀 Batch Processing Employee Routes`);
  console.log(`   Start Row: ${startRow}`);
  console.log(`   Limit: ${limit} employees`);
  console.log(`\n   Running...`);

  try {
    const result = await processAllEmployees(limit, startRow);

    console.log(`\n✅ Batch processing complete!`);
    console.log(`   Processed: ${result.processed} employees`);
    console.log(`   Written: ${result.written} rows to Google Sheet`);

    if (result.results && result.results.length > 0) {
      console.log(`\n📊 Sample Results:`);
      result.results.slice(0, 3).forEach((res, i) => {
        if (res.success) {
          console.log(`   ${i + 1}. ${res.name} (Row ${res.rowNumber})`);
          console.log(`      Distance: ${res.calculatedDistance} km`);
          console.log(`      Amount: ${res.amount.toFixed(2)} PKR`);
        } else {
          console.log(`   ${i + 1}. ${res.employee} - Failed: ${res.reason}`);
        }
      });
    }

    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Error:`, err.message);
    logger.error(`[batch] Processing error: ${err.message}`);
    process.exit(1);
  }
}

main();
