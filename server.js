// People Analyzer Logbook — standalone server (Railway / cloud ready).
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// Mount the People Analyzer app at /pa
app.use('/pa', require('./src/peopleAnalyzer/routes'));

// Raftar dashboard (static page) at /dashboard
app.use('/', require('./src/dashboard'));

// Convenience: root redirects to /pa
app.get('/', (req, res) => res.redirect('/pa'));

// Clean shareable links for each skill (open the SPA on that view)
app.get('/meter', (req, res) => res.redirect('/pa#meter'));
app.get('/people-analyzer', (req, res) => res.redirect('/pa'));

// Health check (Railway/Render)
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => console.log(`People Analyzer Logbook running on port ${PORT}  ->  /pa`));
