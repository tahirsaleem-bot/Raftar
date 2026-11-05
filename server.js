// People Analyzer Logbook — standalone server (Railway / cloud ready).
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// The Raftar app lives at the site root (Tahir, 2026-10-26: drop the "/pa" name).
// Old /pa links redirect to the root — browsers keep the #meter fragment — and
// /pa/api/* keeps answering for any page still open from before.
const appRoutes = require('./src/peopleAnalyzer/routes');
app.get(['/pa', '/pa/'], (req, res) => res.redirect(301, '/'));
app.use('/pa', appRoutes);

// Raftar dashboard (static page) at /dashboard
app.use('/', require('./src/dashboard'));

// App page + /api/* at the root
app.use('/', appRoutes);

// Clean shareable links for each skill (open the SPA on that view)
app.get('/meter', (req, res) => res.redirect('/#meter'));
app.get('/people-analyzer', (req, res) => res.redirect('/'));

// Health check (Railway/Render)
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => console.log(`Raftar app running on port ${PORT}  ->  /`));
