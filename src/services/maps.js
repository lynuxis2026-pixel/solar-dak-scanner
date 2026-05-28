const axios = require('axios');

const DEMO_MODE = !process.env.GOOGLE_MAPS_API_KEY;
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Geocodeer adres → { lat, lng, formatted_address }
async function geocodeer(adres) {
  if (DEMO_MODE) {
    return { lat: 52.3148, lng: 4.9442, formatted_address: adres + ' (demo)' };
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json`;
  const { data } = await axios.get(url, {
    params: { address: adres, key: API_KEY, language: 'nl', region: 'nl' }
  });
  if (!data.results?.length) throw new Error(`Adres niet gevonden: ${adres}`);
  const r = data.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    formatted_address: r.formatted_address
  };
}

// Haal satellietfoto op als buffer (640×640, zoom 20)
async function haalSatellietfoto(lat, lng) {
  if (DEMO_MODE) return null; // geen afbeelding in demo-modus

  const url = `https://maps.googleapis.com/maps/api/staticmap`;
  const { data } = await axios.get(url, {
    params: {
      center: `${lat},${lng}`,
      zoom: 20,
      size: '640x640',
      maptype: 'satellite',
      scale: 2,
      key: API_KEY
    },
    responseType: 'arraybuffer'
  });
  return Buffer.from(data);
}

// Bouw publiek-toegankelijke URL voor frontend canvas rendering
function bouwKaartUrl(lat, lng, zoom = 20, size = '640x640') {
  if (DEMO_MODE) return null;
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${size}&maptype=satellite&scale=2&key=${API_KEY}`;
}

module.exports = { geocodeer, haalSatellietfoto, bouwKaartUrl, DEMO_MODE };
