const express = require('express');
const router = express.Router();
const maps = require('../services/maps');
const claude = require('../services/claude');
const { berekenSolarpotentieel } = require('../services/berekeningen');
const { genereerRapportPDF } = require('../services/pdf');
const path = require('path');
const fs = require('fs');

const GEBOUWTYPE_LABELS = {
  woning: 'Woning',
  bedrijf: 'Kantoor / Bedrijf',
  gym: 'Gym / Sporthal',
  magazijn: 'Magazijn / Distributiecentrum',
  school: 'School / Onderwijsinstelling'
};

// GET /analyse/locatie — geocodeer adres en geef satelliet URL terug
router.get('/locatie', async (req, res) => {
  const { adres } = req.query;
  if (!adres?.trim()) return res.status(400).json({ error: 'Adres verplicht' });
  try {
    const locatie = await maps.geocodeer(adres.trim());
    const kaartUrl = maps.bouwKaartUrl(locatie.lat, locatie.lng);
    const metersPerPixel = 156543.03392 * Math.cos(locatie.lat * Math.PI / 180) / Math.pow(2, 20) / 2;
    res.json({
      lat: locatie.lat,
      lng: locatie.lng,
      formatted_address: locatie.formatted_address,
      kaartUrl,
      metersPerPixel,
      demoModus: maps.DEMO_MODE
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /analyse — analyseer adres en genereer rapport
router.post('/', async (req, res) => {
  const { adres, gebouwType = 'bedrijf', handmatigOppervlak } = req.body;

  if (!adres || !adres.trim()) {
    return res.status(400).json({ error: 'Adres is verplicht' });
  }

  try {
    // 1. Geocodeer adres
    const locatie = await maps.geocodeer(adres.trim());

    // 2. Haal satellietfoto op (server-side voor PDF)
    const imageBuffer = await maps.haalSatellietfoto(locatie.lat, locatie.lng);

    // 3. Analyseer dak met Claude Vision
    const dakAnalyse = await claude.analyseerDak(
      imageBuffer,
      'image/png',
      gebouwType,
      handmatigOppervlak ? Number(handmatigOppervlak) : null
    );

    // 4. Bereken financieel potentieel
    const berekening = berekenSolarpotentieel(dakAnalyse, gebouwType);

    // 5. Genereer PDF rapport
    const timestamp = new Date().toLocaleString('nl-NL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const { bestandsnaam } = await genereerRapportPDF({
      adres: locatie.formatted_address,
      gebouwType,
      gebouwTypeLabel: GEBOUWTYPE_LABELS[gebouwType] || gebouwType,
      dakAnalyse,
      berekening,
      imageBuffer,
      timestamp
    });

    const kaartUrl = maps.bouwKaartUrl(locatie.lat, locatie.lng);
    const pdfUrl   = `/rapporten/${bestandsnaam}`;

    res.json({
      succes: true,
      locatie: locatie.formatted_address,
      kaartUrl,
      dakAnalyse,
      berekening,
      pdfUrl,
      demoModus: maps.DEMO_MODE || claude.DEMO_MODE
    });

  } catch (err) {
    console.error('[Analyse]', err.message);
    res.status(500).json({ error: err.message || 'Analyse mislukt' });
  }
});

// GET /analyse/demo — forceer demo data (zonder API calls)
router.get('/demo', async (req, res) => {
  const { type = 'gym' } = req.query;
  const dakAnalyse  = require('../services/claude').analyseerDak(null, null, type);
  const berekening  = berekenSolarpotentieel(await dakAnalyse, type);

  res.json({
    succes: true,
    locatie: 'Sportlaan 1, Amsterdam (demo)',
    kaartUrl: null,
    dakAnalyse: await dakAnalyse,
    berekening,
    pdfUrl: null,
    demoModus: true
  });
});

module.exports = router;
