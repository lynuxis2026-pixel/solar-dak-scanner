// Opbrengstfactoren per oriëntatie (% van optimale zuidopstelling)
const ORIENTATIE_FACTOR = {
  'plat': 0.93,       // plat dak, optimaal hellend gemonteerd (30°)
  'zuid': 1.00,
  'zuidwest': 0.96,
  'zuidoost': 0.96,
  'west': 0.82,
  'oost': 0.82,
  'noordwest': 0.70,
  'noordoost': 0.70,
  'noord': 0.62
};

// Energieverbruiksprofiel per gebouwtype (kWh/jaar)
const VERBRUIKSPROFIEL = {
  woning:    3500,
  bedrijf:   75000,
  gym:       280000,
  magazijn:  450000,
  school:    130000
};

// Zelfverbruik ratio (hoe groot deel eigen gebruik vs. teruglevering)
const ZELFVERBRUIK = {
  woning: 0.55,
  bedrijf: 0.80,
  gym: 0.85,
  magazijn: 0.90,
  school: 0.75
};

// Energieprijs per type (€/kWh)
const ENERGIEPRIJS = {
  woning:  0.32,
  bedrijf: 0.26,
  gym:     0.24,
  magazijn:0.22,
  school:  0.25
};

// Installatiekosten per kWp
const KOSTEN_PER_KWP = {
  woning:  1400,
  bedrijf: 1150,
  gym:     1050,
  magazijn: 950,
  school:  1100
};

const IRRADIANTIE_BASIS_KWH = 1000; // kWh/kWp/jaar in Nederland (jaargemiddelde)
const PANEL_OPPERVLAK_M2   = 2.0;   // m² per paneel incl. spacing
const PANEL_VERMOGEN_WP     = 400;   // Wp per paneel
const CO2_PER_KWH           = 0.42;  // kg CO2 per kWh NL stroomnet 2024
const TERUGLEVERING_PRIJS   = 0.05;  // €/kWh terugleververgoeding

function berekenSolarpotentieel(dakAnalyse, gebouwType) {
  const gtype = gebouwType || 'bedrijf';

  // Oriëntatiefactor
  const oriMax = dakAnalyse.orientatie?.toLowerCase() || 'plat';
  const orientatieFactor = ORIENTATIE_FACTOR[oriMax] ?? 0.85;

  // Hellingshoek correctie (alleen relevant bij hellend dak)
  const hoek = dakAnalyse.hellingshoek_graden ?? (dakAnalyse.daktype === 'plat' ? 0 : 35);
  const hoekFactor = dakAnalyse.daktype === 'plat'
    ? 1.0   // ballastsysteem, optimale hoek gekozen bij installatie
    : 1 - Math.abs(hoek - 35) * 0.003; // kleine correctie voor sub-optimale helling

  // Panelen en systeem
  const bruikbaarM2   = dakAnalyse.bruikbaar_oppervlak_m2 ?? 50;
  const aantalPanelen = Math.floor(bruikbaarM2 / PANEL_OPPERVLAK_M2);
  const systeemKwp    = parseFloat((aantalPanelen * PANEL_VERMOGEN_WP / 1000).toFixed(1));

  // Energieproductie
  const jaarproductieKwh = Math.round(
    systeemKwp * IRRADIANTIE_BASIS_KWH * orientatieFactor * hoekFactor
  );

  // Financieel
  const energieprijs    = ENERGIEPRIJS[gtype] ?? 0.28;
  const zelfverbruikRat = ZELFVERBRUIK[gtype]  ?? 0.70;
  const jaarbesparingEuro = Math.round(
    jaarproductieKwh * zelfverbruikRat * energieprijs +
    jaarproductieKwh * (1 - zelfverbruikRat) * TERUGLEVERING_PRIJS
  );

  const investeringEuro    = Math.round(systeemKwp * (KOSTEN_PER_KWP[gtype] ?? 1200));
  const terugverdientijdJr = parseFloat((investeringEuro / jaarbesparingEuro).toFixed(1));

  // CO2
  const co2ReductieKgJaar = Math.round(jaarproductieKwh * CO2_PER_KWH);

  // Subsidies
  const sdeEligible    = systeemKwp >= 15;
  const btwCorrectie   = gtype === 'woning' ? Math.round(investeringEuro * 0.21 / 1.21) : 0;
  const eiaKortingEuro = gtype !== 'woning' ? Math.round(investeringEuro * 0.455 * 0.25) : 0; // EIA 45.5% aftrek × 25% VPB

  // 25-jaar projectie
  let cumulatief = 0;
  const projectie = [];
  for (let j = 1; j <= 25; j++) {
    const productie   = jaarproductieKwh * Math.pow(0.9950, j - 1); // 0.5%/jr degradatie
    const prijsFactor = Math.pow(1.03, j - 1); // 3%/jr energieprijsstijging
    const besparing   = Math.round(
      productie * zelfverbruikRat * energieprijs * prijsFactor +
      productie * (1 - zelfverbruikRat) * TERUGLEVERING_PRIJS
    );
    cumulatief += besparing;
    projectie.push({ jaar: j, besparing, cumulatief: Math.round(cumulatief) });
  }

  // Maandelijkse besparing
  const maandBesparing = Math.round(jaarbesparingEuro / 12);

  // Gemiddeld verbruik dekking
  const verbruikProfiel  = VERBRUIKSPROFIEL[gtype] ?? 3500;
  const dekkingPct       = Math.min(100, Math.round((jaarproductieKwh / verbruikProfiel) * 100));

  return {
    aantalPanelen,
    systeemKwp,
    jaarproductieKwh,
    jaarbesparingEuro,
    maandBesparing,
    investeringEuro,
    investeringNaBtw:  Math.max(0, investeringEuro - btwCorrectie),
    investeringNaEia:  Math.max(0, investeringEuro - eiaKortingEuro),
    terugverdientijdJr,
    co2ReductieKgJaar,
    co2BomenEquivalent: Math.round(co2ReductieKgJaar / 21.77),
    dekkingPct,
    sdeEligible,
    btwTeruggaafEuro:   btwCorrectie,
    eiaKortingEuro,
    projectie25jaar:    projectie,
    totaalBesparing25jr: Math.round(cumulatief),
    nettoprofit25jr:    Math.round(cumulatief - investeringEuro)
  };
}

module.exports = { berekenSolarpotentieel };
