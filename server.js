// People Analyzer Logbook — standalone server (Railway / cloud ready).
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// Mount the People Analyzer app at /pa
app.use('/pa', require('./src/peopleAnalyzer/routes'));

// Convenience: root redirects to /pa
app.get('/', (req, res) => res.redirect('/pa'));

// Health check (Railway/Render)
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => console.log(`People Analyzer Logbook running on port ${PORT}  ->  /pa`));
