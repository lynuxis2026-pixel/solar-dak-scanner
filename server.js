require('dotenv').config();
const express = require('express');
const path    = require('path');
const app     = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/rapporten', express.static(path.join(__dirname, 'output')));

app.use('/analyse', require('./src/routes/analyse'));

app.get('/health', (req, res) => res.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  maps_configured:  !!process.env.GOOGLE_MAPS_API_KEY,
  claude_configured: !!process.env.ANTHROPIC_API_KEY
}));

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: 'Interne fout' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n  Solar Dak Scanner: http://localhost:${PORT}`);
  console.log(`  Maps API:  ${process.env.GOOGLE_MAPS_API_KEY ? 'Geconfigureerd ✓' : 'ONTBREEKT — demo-modus'}`);
  console.log(`  Claude:    ${process.env.ANTHROPIC_API_KEY  ? 'Geconfigureerd ✓' : 'ONTBREEKT — demo-modus'}\n`);
});
