const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const ORANJE  = '#F97316';
const DONKER  = '#0F172A';
const GROEN   = '#10B981';
const BLAUW   = '#1D4ED8';
const LICHTBG = '#F8FAFC';
const GRIJS   = '#64748B';

const fmt = (n) => Math.round(n).toLocaleString('nl-NL');

function genereerRapportPDF(data) {
  return new Promise((resolve, reject) => {
    const {
      adres,
      gebouwType,
      gebouwTypeLabel,
      dakAnalyse,
      berekening,
      imageBuffer,
      timestamp
    } = data;

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const naam = `rapport_${Date.now()}.pdf`;
    const pad  = path.join(__dirname, '../../output', naam);
    fs.mkdirSync(path.dirname(pad), { recursive: true });
    const stream = fs.createWriteStream(pad);
    doc.pipe(stream);

    const B = berekening;

    // ── PAGINA 1 ─────────────────────────────────────────────

    // Header banner
    doc.rect(0, 0, 595, 100).fill(DONKER);
    doc.fillColor(ORANJE).fontSize(8).font('Helvetica-Bold')
      .text('SOLAR DAK SCANNER', 50, 22, { characterSpacing: 2 });
    doc.fillColor('white').fontSize(20).font('Helvetica-Bold')
      .text('Persoonlijk Zonnescan Rapport', 50, 36);
    doc.fillColor('#94A3B8').fontSize(9).font('Helvetica')
      .text(`${adres}  ·  ${gebouwTypeLabel}  ·  ${timestamp}`, 50, 68);

    let y = 118;

    // Zes statistiek-blokken
    const stats = [
      { label: 'Zonnepanelen',  waarde: B.aantalPanelen,          eenheid: 'stuks',  kleur: BLAUW  },
      { label: 'Systeem',        waarde: B.systeemKwp,              eenheid: 'kWp',    kleur: BLAUW  },
      { label: 'Productie/jaar', waarde: fmt(B.jaarproductieKwh),   eenheid: 'kWh',    kleur: GROEN  },
      { label: 'Besparing/jaar', waarde: '€' + fmt(B.jaarbesparingEuro), eenheid: '/jaar', kleur: ORANJE },
      { label: 'Investering',    waarde: '€' + fmt(B.investeringEuro),   eenheid: '',       kleur: GRIJS  },
      { label: 'Terugverdien',   waarde: B.terugverdientijdJr,       eenheid: 'jaar',   kleur: GROEN  }
    ];

    const blokW = 82, blokH = 58, blokGap = 7;
    const startX = 50;
    stats.forEach((s, i) => {
      const bx = startX + i * (blokW + blokGap);
      doc.rect(bx, y, blokW, blokH).fill(LICHTBG);
      doc.rect(bx, y, blokW, 3).fill(s.kleur);
      doc.fillColor(s.kleur).fontSize(16).font('Helvetica-Bold')
        .text(String(s.waarde), bx + 6, y + 12, { width: blokW - 12, align: 'center' });
      doc.fillColor(GRIJS).fontSize(7).font('Helvetica')
        .text(s.eenheid, bx + 6, y + 32, { width: blokW - 12, align: 'center' });
      doc.fillColor(DONKER).fontSize(7).font('Helvetica-Bold')
        .text(s.label.toUpperCase(), bx + 6, y + 44, { width: blokW - 12, align: 'center', characterSpacing: 0.5 });
    });

    y += blokH + 18;

    // Satellietfoto met panel-overlay (als beschikbaar)
    if (imageBuffer) {
      const imgW = 240, imgH = 200;
      const imgX = 50;
      doc.image(imageBuffer, imgX, y, { width: imgW, height: imgH });

      // Teken panelen op de satellietfoto
      const zones = dakAnalyse.panel_zones || [];
      zones.forEach(zone => {
        const zx = imgX + (zone.x_pct / 100) * imgW;
        const zy = y + (zone.y_pct / 100) * imgH;
        const zw = (zone.breedte_pct / 100) * imgW;
        const zh = (zone.hoogte_pct / 100) * imgH;

        // Individuele panelen
        const pw = 11, ph = 7, pgap = 1.5;
        for (let py = zy + 2; py < zy + zh - ph; py += ph + pgap) {
          for (let px = zx + 2; px < zx + zw - pw; px += pw + pgap) {
            doc.fillColor(BLAUW).fillOpacity(0.72).rect(px, py, pw, ph).fill();
            doc.strokeColor('#60A5FA').lineWidth(0.4).fillOpacity(1)
              .rect(px, py, pw, ph).stroke();
            // Cellijnen
            doc.strokeColor('#93C5FD').lineWidth(0.2)
              .moveTo(px + pw / 2, py).lineTo(px + pw / 2, py + ph).stroke()
              .moveTo(px, py + ph / 2).lineTo(px + pw, py + ph / 2).stroke();
          }
        }
      });
      doc.fillOpacity(1);

      // Foto-label
      doc.fillColor(GRIJS).fontSize(7).font('Helvetica')
        .text('Satellietfoto met gevisualiseerde panelen', imgX, y + imgH + 4);

      // Dakinfo rechts naast foto
      const infoX = imgX + imgW + 16;
      sectie(doc, 'Dakanalyse', ORANJE, infoX, y);
      rij(doc, 'Dakoppervlak', dakAnalyse.dakoppervlak_m2 + ' m²', infoX, y + 16);
      rij(doc, 'Bruikbaar', dakAnalyse.bruikbaar_oppervlak_m2 + ' m²', infoX, y + 28);
      rij(doc, 'Type', dakAnalyse.daktype || '-', infoX, y + 40);
      rij(doc, 'Oriëntatie', dakAnalyse.orientatie || '-', infoX, y + 52);
      rij(doc, 'Hellingshoek', (dakAnalyse.hellingshoek_graden || 0) + '°', infoX, y + 64);
      rij(doc, 'Score', `${dakAnalyse.geschiktheid_score}/10`, infoX, y + 76);

      if (dakAnalyse.obstakels?.length) {
        doc.fillColor(GRIJS).fontSize(8).font('Helvetica-Bold')
          .text('Obstakels:', infoX, y + 92);
        dakAnalyse.obstakels.slice(0, 4).forEach((o, i) => {
          doc.fillColor(DONKER).fontSize(8).font('Helvetica')
            .text(`• ${o}`, infoX, y + 104 + i * 11);
        });
      }

      if (dakAnalyse.opmerkingen) {
        const opY = y + 160;
        doc.rect(infoX, opY, 235, 30).fill('#FFF7ED');
        doc.fillColor('#92400E').fontSize(7.5).font('Helvetica')
          .text(dakAnalyse.opmerkingen, infoX + 6, opY + 8, { width: 220 });
      }

      y += imgH + 20;
    } else {
      // Geen foto — toon dakinfo horizontaal
      sectie(doc, 'Dakanalyse', ORANJE, 50, y);
      y += 16;
      ['Dakoppervlak', 'Bruikbaar', 'Type', 'Oriëntatie'].forEach((label, i) => {
        const vals = [
          dakAnalyse.dakoppervlak_m2 + ' m²',
          dakAnalyse.bruikbaar_oppervlak_m2 + ' m²',
          dakAnalyse.daktype,
          dakAnalyse.orientatie
        ];
        const cx = 50 + i * 125;
        doc.rect(cx, y, 118, 42).fill(LICHTBG);
        doc.fillColor(DONKER).fontSize(13).font('Helvetica-Bold')
          .text(vals[i], cx + 6, y + 8, { width: 106, align: 'center' });
        doc.fillColor(GRIJS).fontSize(7.5).font('Helvetica')
          .text(label, cx + 6, y + 28, { width: 106, align: 'center' });
      });
      y += 58;
    }

    // Financieel overzicht
    sectie(doc, 'Financieel overzicht', GROEN, 50, y);
    y += 16;

    const finRijen = [
      ['Bruto investering', '€' + fmt(B.investeringEuro)],
      B.btwTeruggaafEuro  > 0 ? ['BTW-teruggaaf',  '−€' + fmt(B.btwTeruggaafEuro)] : null,
      B.eiaKortingEuro    > 0 ? ['EIA-aftrek (VPB)', '−€' + fmt(B.eiaKortingEuro)] : null,
      ['Jaarlijkse besparing', '€' + fmt(B.jaarbesparingEuro)],
      ['Maandelijkse besparing', '€' + fmt(B.maandBesparing)],
      ['Terugverdientijd', B.terugverdientijdJr + ' jaar'],
      ['Dekking eigen verbruik', B.dekkingPct + '%'],
      ['Totaalwinst over 25 jaar', '€' + fmt(B.totaalBesparing25jr)]
    ].filter(Boolean);

    finRijen.forEach((r, i) => {
      const ry = y + i * 15;
      if (i % 2 === 0) doc.rect(50, ry, 495, 15).fill('#F8FAFC');
      doc.fillColor(GRIJS).fontSize(8.5).font('Helvetica')
        .text(r[0], 58, ry + 3, { width: 280 });
      const isPositief = r[1].includes('−') === false && r[1].startsWith('€');
      const labelK = r[0].includes('besparing') || r[0].includes('winst') || r[0].includes('Dekking') ? GROEN
                   : r[0].includes('aftrek') || r[0].includes('Teruggaaf') ? ORANJE : DONKER;
      doc.fillColor(labelK).fontSize(8.5).font('Helvetica-Bold')
        .text(r[1], 58, ry + 3, { width: 480, align: 'right' });
    });
    y += finRijen.length * 15 + 10;

    // Subsidies
    sectie(doc, 'Subsidies & fiscale voordelen', ORANJE, 50, y);
    y += 14;
    const subsidieregels = [];
    if (gebouwType === 'woning')
      subsidieregels.push('Salderingsregeling (tot 15kWp) — volledig terugleveren tegen stroomtarief');
    if (B.sdeEligible)
      subsidieregels.push(`SDE++ subsidie eligible (${B.systeemKwp} kWp > 15 kWp) — aanvraag via RVO`);
    if (B.btwTeruggaafEuro > 0)
      subsidieregels.push(`BTW-teruggaaf: €${fmt(B.btwTeruggaafEuro)} — via belastingaangifte`);
    if (B.eiaKortingEuro > 0)
      subsidieregels.push(`EIA Energie-investeringsaftrek: €${fmt(B.eiaKortingEuro)} belastingvoordeel`);
    subsidieregels.push('Postcoderoos / Energiecoöperatie — controleer lokale mogelijkheden');

    subsidieregels.forEach(regel => {
      doc.fillColor(DONKER).fontSize(8.5).font('Helvetica').text(`• ${regel}`, 58, y, { width: 480 });
      y += 12;
    });

    // CO2
    y += 6;
    doc.rect(50, y, 495, 40).fill('#ECFDF5');
    doc.fillColor('#065F46').fontSize(11).font('Helvetica-Bold')
      .text('Milieu-impact per jaar', 60, y + 8);
    doc.fontSize(9).font('Helvetica').fillColor('#047857')
      .text(`CO₂-reductie: ${fmt(B.co2ReductieKgJaar)} kg/jaar  ·  Equivalent: ${fmt(B.co2BomenEquivalent)} bomen  ·  Productie: ${fmt(B.jaarproductieKwh)} kWh/jaar`, 60, y + 24, { width: 475 });

    // Footer
    doc.fillColor(GRIJS).fontSize(7.5)
      .text('Solar Dak Scanner — Rapport gegenereerd op ' + timestamp + '  ·  Berekeningen zijn indicatief. Vraag offerte aan voor exacte prijzen.', 50, 790, { width: 495, align: 'center' });

    // ── PAGINA 2: 25-jaars projectie ────────────────────────

    doc.addPage();
    doc.rect(0, 0, 595, 60).fill(DONKER);
    doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
      .text('25-jaar besparingsprojectie', 50, 20);
    doc.fillColor('#94A3B8').fontSize(9).font('Helvetica')
      .text(adres, 50, 44);

    y = 80;

    // Staafgrafiek cumulatieve besparing
    const grafH = 160, grafW = 495, grafX = 50;
    const maxCumulatief = B.projectie25jaar[B.projectie25jaar.length - 1].cumulatief;
    doc.fillColor(GRIJS).fontSize(8).font('Helvetica')
      .text('Cumulatieve besparing over 25 jaar (€)', grafX, y);
    y += 12;

    // Y-as labels
    for (let p = 0; p <= 4; p++) {
      const yl = y + grafH - (p / 4) * grafH;
      doc.fillColor(GRIJS).fontSize(6.5).font('Helvetica')
        .text('€' + fmt((maxCumulatief / 4) * p), grafX - 48, yl - 3, { width: 45, align: 'right' });
      doc.strokeColor('#E2E8F0').lineWidth(0.5)
        .moveTo(grafX, yl).lineTo(grafX + grafW, yl).stroke();
    }

    // Staven
    const stavBreedte = Math.floor(grafW / 25) - 2;
    B.projectie25jaar.forEach((punt, i) => {
      const bx    = grafX + i * (stavBreedte + 2);
      const hoogte = Math.round((punt.cumulatief / maxCumulatief) * grafH);
      const by    = y + grafH - hoogte;
      const isBreakeven = punt.cumulatief >= B.investeringEuro;

      // Kleur groen na breakeven
      doc.rect(bx, by, stavBreedte, hoogte).fill(isBreakeven ? GROEN : BLAUW);

      // Jaar label elke 5 jaar
      if ((punt.jaar % 5 === 0) || punt.jaar === 1) {
        doc.fillColor(GRIJS).fontSize(6).font('Helvetica')
          .text(punt.jaar, bx, y + grafH + 3, { width: stavBreedte + 2, align: 'center' });
      }
    });

    // Investering lijn
    const invLijnY = y + grafH - (B.investeringEuro / maxCumulatief) * grafH;
    doc.strokeColor(ORANJE).lineWidth(1.5).dash(4, { space: 3 })
      .moveTo(grafX, invLijnY).lineTo(grafX + grafW, invLijnY).stroke();
    doc.undash();
    doc.fillColor(ORANJE).fontSize(7).font('Helvetica-Bold')
      .text('← Investering terugverdiend (€' + fmt(B.investeringEuro) + ')', grafX + grafW - 200, invLijnY - 10);

    y += grafH + 24;

    // Tabel jaarresultaten
    doc.fillColor(GRIJS).fontSize(8).font('Helvetica-Bold')
      .text('Jaar', 50, y, { width: 40 })
      .text('Productie (kWh)', 100, y, { width: 120 })
      .text('Besparing (€)', 230, y, { width: 100 })
      .text('Cumulatief (€)', 340, y, { width: 120 })
      .text('vs. Investering', 470, y, { width: 75 });
    y += 12;

    doc.moveTo(50, y).lineTo(545, y).stroke('#E2E8F0').lineWidth(0.5);
    y += 4;

    B.projectie25jaar.forEach((punt, i) => {
      if (y > 760) { doc.addPage(); y = 50; }
      if (i % 2 === 0) doc.rect(50, y - 1, 495, 11).fill(LICHTBG);
      const overschot = punt.cumulatief - B.investeringEuro;
      const kleur = overschot >= 0 ? GROEN : DONKER;
      doc.fillColor(DONKER).fontSize(7.5).font('Helvetica')
        .text(punt.jaar, 50, y, { width: 40 })
        .text(fmt(punt.besparing / 1), 100, y, { width: 120 }) // approx productie
        .text('€' + fmt(punt.besparing), 230, y, { width: 100 })
        .text('€' + fmt(punt.cumulatief), 340, y, { width: 120 });
      doc.fillColor(kleur).fontSize(7.5).font('Helvetica-Bold')
        .text((overschot >= 0 ? '+' : '') + '€' + fmt(overschot), 470, y, { width: 75 });
      y += 11;
    });

    doc.fillColor(GRIJS).fontSize(7.5)
      .text('Solar Dak Scanner · Indicatieve berekeningen, prijsstijging 3%/jr, paneel degradatie 0.5%/jr', 50, 790, { width: 495, align: 'center' });

    doc.end();
    stream.on('finish', () => resolve({ pad, bestandsnaam: naam }));
    stream.on('error', reject);
  });
}

function sectie(doc, label, kleur, x, y) {
  doc.fillColor(kleur).fontSize(9).font('Helvetica-Bold').text(label, x, y);
  doc.moveTo(x, y + 11).lineTo(545, y + 11).strokeColor(kleur).lineWidth(0.7).stroke();
}

function rij(doc, label, waarde, x, y) {
  doc.fillColor(GRIJS).fontSize(7.5).font('Helvetica').text(label + ':', x, y, { continued: true, width: 100 });
  doc.fillColor(DONKER).font('Helvetica-Bold').text(' ' + waarde);
}

module.exports = { genereerRapportPDF };
