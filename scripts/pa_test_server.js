// Minimal standalone server to test the People Analyzer app (no WhatsApp/schedulers).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const app = express();
app.use(express.json());
app.use('/pa', require('../src/peopleAnalyzer/routes'));
app.listen(3005, () => console.log('PA test server on http://localhost:3005/pa'));
