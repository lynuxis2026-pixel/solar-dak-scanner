const Anthropic = require('@anthropic-ai/sdk');

const DEMO_MODE = !process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// Demo dakanalyse per gebouwtype
const DEMO_ANALYSES = {
  gym: {
    dakoppervlak_m2: 2400, bruikbaar_oppervlak_m2: 1800,
    daktype: 'plat', orientatie: 'plat',
    hellingshoek_graden: 5, obstakels: ['HVAC units', 'ventilatiekokers', 'dakluiken'],
    geschiktheid_score: 9,
    panel_zones: [
      { x_pct: 5, y_pct: 10, breedte_pct: 85, hoogte_pct: 35 },
      { x_pct: 5, y_pct: 52, breedte_pct: 85, hoogte_pct: 35 }
    ],
    opmerkingen: 'Groot plat commercieel dak, uitstekend geschikt. Ballastsysteem aanbevolen.'
  },
  magazijn: {
    dakoppervlak_m2: 5000, bruikbaar_oppervlak_m2: 3800,
    daktype: 'plat', orientatie: 'plat',
    hellingshoek_graden: 3, obstakels: ['dakluiken', 'ventilatieunits'],
    geschiktheid_score: 10,
    panel_zones: [
      { x_pct: 3, y_pct: 5, breedte_pct: 90, hoogte_pct: 40 },
      { x_pct: 3, y_pct: 50, breedte_pct: 90, hoogte_pct: 40 }
    ],
    opmerkingen: 'Uitzonderlijk groot plat dak — ideaal voor grootschalige installatie.'
  },
  bedrijf: {
    dakoppervlak_m2: 800, bruikbaar_oppervlak_m2: 580,
    daktype: 'plat', orientatie: 'plat',
    hellingshoek_graden: 5, obstakels: ['HVAC units', 'liftopbouw'],
    geschiktheid_score: 8,
    panel_zones: [
      { x_pct: 8, y_pct: 12, breedte_pct: 80, hoogte_pct: 70 }
    ],
    opmerkingen: 'Solide zakendak met goed bruikbaar oppervlak.'
  },
  woning: {
    dakoppervlak_m2: 80, bruikbaar_oppervlak_m2: 52,
    daktype: 'hellend', orientatie: 'zuidwest',
    hellingshoek_graden: 38, obstakels: ['schoorsteen', 'dakkapel'],
    geschiktheid_score: 8,
    panel_zones: [
      { x_pct: 18, y_pct: 15, breedte_pct: 62, hoogte_pct: 60 }
    ],
    opmerkingen: 'Goed zuidwestgericht hellend dak.'
  },
  school: {
    dakoppervlak_m2: 1600, bruikbaar_oppervlak_m2: 1150,
    daktype: 'plat', orientatie: 'plat',
    hellingshoek_graden: 3, obstakels: ['HVAC units', 'dakluiken', 'parabolische schotels'],
    geschiktheid_score: 9,
    panel_zones: [
      { x_pct: 5, y_pct: 8, breedte_pct: 88, hoogte_pct: 38 },
      { x_pct: 5, y_pct: 52, breedte_pct: 88, hoogte_pct: 38 }
    ],
    opmerkingen: 'Groot schooldak met uitstekend potentieel en educatieve meerwaarde.'
  }
};

async function analyseerDak(imageBuffer, mimeType, gebouwType, handmatigOppervlak = null) {
  if (DEMO_MODE || !imageBuffer) {
    const demo = { ...(DEMO_ANALYSES[gebouwType] || DEMO_ANALYSES.bedrijf) };
    if (handmatigOppervlak && handmatigOppervlak > 0) {
      demo.dakoppervlak_m2 = Math.round(handmatigOppervlak);
      demo.bruikbaar_oppervlak_m2 = Math.round(handmatigOppervlak * 0.75);
    }
    return demo;
  }

  const base64 = imageBuffer.toString('base64');

  const oppNoot = handmatigOppervlak && handmatigOppervlak > 0
    ? `\nLET OP: De gebruiker heeft een dakcontour ingetekend van ${Math.round(handmatigOppervlak)} m². Gebruik dit als dakoppervlak_m2 en schat bruikbaar_oppervlak_m2 op basis van de zichtbare obstakels binnen dat vlak.`
    : '';

  const prompt = `Je bent een expert solar installateur die een satellietfoto van een dak analyseert.${oppNoot}

Analyseer deze satellietfoto zorgvuldig en geef een JSON-object terug met EXACT deze velden:
{
  "dakoppervlak_m2": totale dakoppervlak in m² (integer),
  "bruikbaar_oppervlak_m2": bruikbaar oppervlak voor zonnepanelen in m² (integer, rekening houdend met obstakels en veiligheidsmarges),
  "daktype": "plat" | "hellend" | "combinatie",
  "orientatie": "oost" | "west" | "noord" | "zuid" | "zuidoost" | "zuidwest" | "noordoost" | "noordwest" | "plat",
  "hellingshoek_graden": hellingshoek in graden (0 voor plat dak, 15-45 voor hellend),
  "obstakels": ["lijst", "van", "zichtbare", "obstakels"],
  "geschiktheid_score": score 1-10 voor zonne-installatie,
  "panel_zones": [
    {"x_pct": links als % van afbeeldingsbreedte, "y_pct": top als % van afbeeldingshoogte, "breedte_pct": breedte %, "hoogte_pct": hoogte %}
  ],
  "opmerkingen": "korte observatie in het Nederlands (max 1 zin)"
}

Het gebouwtype is: ${gebouwType}

Geef ALLEEN het JSON-object terug, geen uitleg eromheen. Geen markdown code blocks.`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/png', data: base64 } },
        { type: 'text', text: prompt }
      ]
    }]
  });

  const tekst = response.content[0].text.trim();
  try {
    return JSON.parse(tekst.replace(/```json\n?|\n?```/g, '').trim());
  } catch {
    return DEMO_ANALYSES[gebouwType] || DEMO_ANALYSES.bedrijf;
  }
}

module.exports = { analyseerDak, DEMO_MODE };
