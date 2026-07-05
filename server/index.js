/**
 * Tamil Daily Sheet Calendar — TRMNL Plugin Server
 * Uses Prokerala API (OAuth2) to fetch Tamil Panchangam data
 * API called in English (10 credits/call) to stay within the 5,000/month free tier.
 * Tamil script names are mapped client-side from built-in lookup tables.
 *
 * Setup:
 *   npm install express node-cache dotenv
 *   Set env vars: PROKERALA_CLIENT_ID, PROKERALA_CLIENT_SECRET
 *   Optional: LOCATION_LAT, LOCATION_LON (default: Chennai)
 */

require('dotenv').config();
const express = require('express');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 }); // cache token + data for 1 hour

const PORT = process.env.PORT || 3000;

// Default location: Chennai (Tamil Nadu)
const LAT  = process.env.LOCATION_LAT  || '13.0827';
const LON  = process.env.LOCATION_LON  || '80.2707';
const AYANAMSA = 1; // Lahiri (standard for Tamil calendar)

// ─── Tamil month & weekday names ─────────────────────────────────────────────
const TAMIL_MONTHS_EN = [
  'Chithirai','Vaikasi','Aani','Aadi','Aavani','Purattasi',
  'Aippasi','Karthigai','Margazhi','Thai','Maasi','Panguni'
];
const TAMIL_MONTHS_TA = [
  'சித்திரை','வைகாசி','ஆனி','ஆடி','ஆவணி','புரட்டாசி',
  'ஐப்பசி','கார்த்திகை','மார்கழி','தை','மாசி','பங்குனி'
];
// API spelling variants → canonical index (0-based)
// Handles Prokerala returning 'Karthika' instead of 'Karthigai', etc.
const MONTH_ALIASES = {
  'karthika': 7, 'karthik': 7, 'kartika': 7,
  'chithira': 0, 'chithra': 0,
  'vaikashi': 1,
  'aani': 2, 'ani': 2,
  'aadi': 3, 'adi': 3,
  'avani': 4, 'aavani': 4,
  'purattasi': 5, 'puratassi': 5,
  'aippasi': 6, 'aipasi': 6,
  'margazhi': 8, 'margazi': 8,
  'thai': 9, 'tai': 9,
  'maasi': 10, 'masi': 10,
  'panguni': 11, 'pangoni': 11,
};
const WEEKDAYS_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const WEEKDAYS_TA = ['ஞாயிறு','திங்கள்','செவ்வாய்','புதன்','வியாழன்','வெள்ளி','சனி'];

// ─── Tamil name lookup tables (English API → Tamil script) ───────────────────────────────
const TITHI_TA = {
  'Pratipada':'ப்ரதமை', 'Dwitiya':'த்விதியை', 'Tritiya':'த்ரிதியை',
  'Chaturthi':'சதுர்த்தி', 'Panchami':'பஞ்சமி', 'Shashthi':'சஷ்டி',
  'Saptami':'சப்தமி', 'Ashtami':'அஷ்டமி', 'Navami':'நவமி',
  'Dashami':'தசமி', 'Ekadashi':'ஏகாதசி', 'Dwadashi':'த்வாதசி',
  'Trayodashi':'த்ரயோதசி', 'Chaturdashi':'சதுர்தசி',
  'Purnima':'பூர்ணிமி', 'Amavasya':'அமாவாசை',
};

const NAK_TA = {
  'Ashwini':'அச்வினி', 'Bharani':'பரணி', 'Krittika':'கிருத்திகை',
  'Rohini':'ரோகிணி', 'Mrigashira':'மிருகசிரிடம்', 'Ardra':'ஆதிரை',
  'Punarvasu':'புனர்பூசம்', 'Pushya':'பூசம்', 'Ashlesha':'ஆயில்யம்',
  'Magha':'மகம்', 'Purva Phalguni':'பூரம்', 'Uttara Phalguni':'உத்திரம்',
  'Hasta':'அஸ்தம்', 'Chitra':'சித்திரை', 'Swati':'ச்வாதி',
  'Vishakha':'விஸாகம்', 'Anuradha':'அனுஷம்', 'Jyeshtha':'கேட்டை',
  'Mula':'மூலம்', 'Purva Ashadha':'பூராடம்', 'Uttara Ashadha':'உத்திராடம்',
  'Shravana':'திருவோணம்', 'Dhanishta':'அவிடம்', 'Shatabhisha':'சதயம்',
  'Purva Bhadrapada':'பூரட்டாதி', 'Uttara Bhadrapada':'உத்திரட்டாதி', 'Revati':'ரேவதி',
};

const YOGA_TA = {
  'Vishkambha':'விஷ்கம்பம்', 'Priti':'பிரீதி', 'Ayushman':'ஆயுஷ்மான்',
  'Saubhagya':'சௌபாக்யம்', 'Shobhana':'சோபனம்', 'Atiganda':'அதிகண்டம்',
  'Sukarma':'சுகர்மா', 'Dhriti':'த௃தி', 'Shula':'சூலம்',
  'Ganda':'கண்டம்', 'Vriddhi':'விருத்தி', 'Dhruva':'த்ருவம்',
  'Vyaghata':'வ்யாகாதம்', 'Harshana':'ஹர்ஷணம்', 'Vajra':'வஜ்ரம்',
  'Siddhi':'சித்தி', 'Vyatipata':'வ்யதீபாதம்', 'Variyan':'வரியான்',
  'Parigha':'பரிகாதம்', 'Shiva':'சிவம்', 'Siddha':'சித்தம்',
  'Sadhya':'சாதியம்', 'Shubha':'சுபம்', 'Shukla':'சுக்லம்',
  'Brahma':'பிரம்மம்', 'Indra':'இந்திரம்', 'Vaidhriti':'வைதிருதி',
};

// ─── Prokerala OAuth2 Token ───────────────────────────────────────────────────
async function getAccessToken() {
  const cached = cache.get('prokerala_token');
  if (cached) return cached;

  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.PROKERALA_CLIENT_ID,
    client_secret: process.env.PROKERALA_CLIENT_SECRET,
  });

  const res = await fetch('https://api.prokerala.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Prokerala token error: ${res.status} — ${err}`);
  }

  const json = await res.json();
  const token = json.access_token;
  const ttl   = (json.expires_in || 3600) - 60; // refresh 1 min early
  cache.set('prokerala_token', token, ttl);
  return token;
}

// ─── Prokerala Panchang API ───────────────────────────────────────────────────
async function fetchPanchang(token, datetime) {
  const params = new URLSearchParams({
    ayanamsa:    AYANAMSA,
    coordinates: `${LAT},${LON}`,
    datetime:    datetime,
    // no 'la' param → defaults to English (10 credits/call vs 200 for Tamil)
    // Tamil script names are resolved from local lookup tables below
  });

  const url = `https://api.prokerala.com/v2/astrology/panchang/advanced?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Prokerala panchang error: ${res.status} — ${err}`);
  }

  return res.json();
}

// ─── Format time string (HH:MM) ──────────────────────────────────────────────
function fmtTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── Build Tamil year (Kali Yuga based) ─────────────────────────────────────
function tamilYear(gregorianYear) {
  // Tamil year starts mid-April; approximate
  return gregorianYear + 5100;
}

// ─── Main data builder ───────────────────────────────────────────────────────
async function buildCalendarData() {
  const cacheKey = `tamil_cal_${new Date().toISOString().slice(0,10)}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const now = new Date();
  // Use Indian Standard Time (UTC+5:30) for the "today" datetime
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const datetimeISO = ist.toISOString().replace('Z', '+05:30');

  const token   = await getAccessToken();
  const raw     = await fetchPanchang(token, datetimeISO);
  const d       = raw.data;

  // ── Gregorian / weekday ──
  const wdIdx        = now.getDay();
  const weekday_en   = WEEKDAYS_EN[wdIdx];
  const weekday_ta   = WEEKDAYS_TA[wdIdx];

  // ── Tamil date ──
  const tMonth     = d.tamil_month   || {};
  const tDay       = d.tamil_day     || '—';
  const tYear      = d.tamil_year    || tamilYear(ist.getFullYear());

  // Resolve month index: try alias map first (handles variant spellings like
  // 'Karthika' vs 'Karthigai'), then fall back to the id field from the API.
  const apiMonthName  = (tMonth.name || '').trim();
  const aliasIdx      = MONTH_ALIASES[apiMonthName.toLowerCase()];
  const tMonthIdx     = aliasIdx !== undefined ? aliasIdx : (tMonth.id || 1) - 1;

  // API returns English names; Tamil script comes from local lookup tables
  const tamil_month_en  = TAMIL_MONTHS_EN[tMonthIdx] || apiMonthName || '—';
  const tamil_month_ta  = TAMIL_MONTHS_TA[tMonthIdx] || tamil_month_en;

  // ── Tithi ──
  const tithiArr   = d.tithi || [];
  const tithi0     = tithiArr[0] || {};
  // API returns English name; look up Tamil equivalent from hardcoded map
  const tithi_en   = tithi0.name   || '—';
  const tithi_ta   = TITHI_TA[tithi_en] || tithi_en;
  const tithi_end  = fmtTime(tithi0.ends_at);

  // ── Nakshatra ──
  const nakArr     = d.nakshatra || [];
  const nak0       = nakArr[0] || {};
  const nak_en     = nak0.name   || '—';
  const nak_ta     = NAK_TA[nak_en] || nak_en;
  const nak_end    = fmtTime(nak0.ends_at);

  // ── Sunrise / Sunset ──
  const sunrise    = fmtTime(d.sunrise);
  const sunset     = fmtTime(d.sunset);

  // ── Rahu Kalam ──
  const rahukalam  = d.rahu_kalam || {};
  const rahu_start = fmtTime(rahukalam.start);
  const rahu_end   = fmtTime(rahukalam.end);

  // ── Emi Kalam / Yamagandam ──
  const yamagandam = d.yamagandam || {};
  const yama_start = fmtTime(yamagandam.start);
  const yama_end   = fmtTime(yamagandam.end);

  // ── Festivals ──
  const festivals  = (d.auspicious_period || [])
    .filter(f => f.name)
    .map(f => ({ name_en: f.name, name_ta: f.name })) // English API; no Tamil translation needed here
    .slice(0, 3);

  const festival_today = festivals.length > 0
    ? festivals.map(f => f.name_en).join(' • ')
    : null;

  // ── Yoga ──
  const yogaArr   = d.yoga || [];
  const yoga0     = yogaArr[0] || {};
  const yoga_en   = yoga0.name   || '—';
  const yoga_ta   = YOGA_TA[yoga_en] || yoga_en;

  const result = {
    // Gregorian
    gregorian_date: ist.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    weekday_en,
    weekday_ta,

    // Tamil date
    tamil_day:       tDay,
    tamil_month_ta,
    tamil_month_en,
    tamil_year:      tYear,

    // Tithi
    tithi_ta,
    tithi_en,
    tithi_end,

    // Nakshatra
    nak_ta,
    nak_en,
    nak_end,

    // Yoga
    yoga_ta,
    yoga_en,

    // Sun
    sunrise,
    sunset,

    // Rahu Kalam
    rahu_start,
    rahu_end,

    // Yamagandam (Emi Kalam)
    yama_start,
    yama_end,

    // Festival
    festival_today,
    festivals,

    // Meta
    location: process.env.LOCATION_NAME || 'Chennai',
    updated_at: now.toISOString(),
  };

  cache.set(cacheKey, result, 3600);
  return result;
}

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get('/data', async (req, res) => {
  try {
    const data = await buildCalendarData();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Tamil Calendar server running on port ${PORT}`);
});
