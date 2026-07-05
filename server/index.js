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

// ─── Format time from ISO string ────────────────────────────────────────────
// Prokerala returns full ISO timestamps e.g. "2026-07-06T05:51:19+05:30".
// Extract HH:MM directly from the string to avoid server-timezone drift.
function fmtTime(isoStr) {
  if (!isoStr) return '—';
  const match = isoStr.match(/T(\d{2}):(\d{2})/);
  if (!match) return '—';
  let h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

// ─── Calculate Tamil calendar date from Gregorian (IST date) ────────────────
// Fixed solar month start dates (approximate, accurate within 1 day).
const TAMIL_MONTH_STARTS = [
  { m: 4,  d: 14 }, { m: 5,  d: 15 }, { m: 6,  d: 15 }, { m: 7,  d: 16 },
  { m: 8,  d: 16 }, { m: 9,  d: 17 }, { m: 10, d: 17 }, { m: 11, d: 16 },
  { m: 12, d: 16 }, { m: 1,  d: 14 }, { m: 2,  d: 13 }, { m: 3,  d: 14 },
];

function getTamilDate(istDate) {
  const gMonth = istDate.getMonth() + 1;
  const gDay   = istDate.getDate();
  const gYear  = istDate.getFullYear();

  let tIdx = 0;
  for (let i = 0; i < 12; i++) {
    const cur  = TAMIL_MONTH_STARTS[i];
    const next = TAMIL_MONTH_STARTS[(i + 1) % 12];
    const afterStart = (gMonth > cur.m)  || (gMonth === cur.m  && gDay >= cur.d);
    const beforeNext = (gMonth < next.m) || (gMonth === next.m && gDay <  next.d);
    const wraps = cur.m > next.m;
    if (wraps) {
      if (afterStart || beforeNext) { tIdx = i; break; }
    } else {
      if (afterStart && beforeNext) { tIdx = i; break; }
    }
  }

  const { m: sm, d: sd } = TAMIL_MONTH_STARTS[tIdx];
  let startYear = gYear;
  if (sm > gMonth) startYear = gYear - 1;
  const startDate = new Date(startYear, sm - 1, sd);
  const tDay = Math.floor((istDate - startDate) / 86400000) + 1;

  const kaliYear = (gMonth > 4 || (gMonth === 4 && gDay >= 14))
    ? gYear + 5100
    : gYear + 5099;

  return { tDay, tIdx, kaliYear };
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

  // ── Gregorian / weekday (use IST date) ──
  const wdIdx      = ist.getDay();
  const weekday_en = WEEKDAYS_EN[wdIdx];
  const weekday_ta = WEEKDAYS_TA[wdIdx];

  // ── Tamil date (calculated from IST date) ──
  // The advanced panchang endpoint does not return tamil_day/tamil_month fields,
  // so we derive them from the Gregorian date using fixed solar month start dates.
  const { tDay, tIdx, kaliYear } = getTamilDate(ist);
  const tamil_day      = tDay;
  const tamil_month_en = TAMIL_MONTHS_EN[tIdx];
  const tamil_month_ta = TAMIL_MONTHS_TA[tIdx];
  const tamil_year     = kaliYear;

  // ── Tithi ──
  // API field is "end" (not "ends_at")
  const tithiArr = d.tithi || [];
  const tithi0   = tithiArr[0] || {};
  const tithi_en = tithi0.name || '—';
  const tithi_ta = TITHI_TA[tithi_en] || tithi_en;
  const tithi_end = fmtTime(tithi0.end);

  // ── Nakshatra ──
  const nakArr = d.nakshatra || [];
  const nak0   = nakArr[0] || {};
  const nak_en = nak0.name || '—';
  const nak_ta = NAK_TA[nak_en] || nak_en;
  const nak_end = fmtTime(nak0.end);

  // ── Sunrise / Sunset (ISO timestamps from API) ──
  const sunrise = fmtTime(d.sunrise);
  const sunset  = fmtTime(d.sunset);

  // ── Rahu Kalam & Yamagandam ──
  // API returns these inside inauspicious_period array, not as top-level fields.
  const inauspicious = d.inauspicious_period || [];
  const rahuEntry  = inauspicious.find(p => p.name === 'Rahu')       || {};
  const yamaEntry  = inauspicious.find(p => p.name === 'Yamaganda')  || {};
  const rahuPeriod = (rahuEntry.period  || [])[0] || {};
  const yamaPeriod = (yamaEntry.period  || [])[0] || {};
  const rahu_start = fmtTime(rahuPeriod.start);
  const rahu_end   = fmtTime(rahuPeriod.end);
  const yama_start = fmtTime(yamaPeriod.start);
  const yama_end   = fmtTime(yamaPeriod.end);

  // ── Auspicious periods (festivals / muhurats) ──
  const festivals = (d.auspicious_period || [])
    .filter(f => f.name)
    .map(f => ({ name_en: f.name, name_ta: f.name }))
    .slice(0, 3);
  const festival_today = festivals.length > 0
    ? festivals.map(f => f.name_en).join(' • ')
    : null;

  // ── Yoga ──
  const yogaArr = d.yoga || [];
  const yoga0   = yogaArr[0] || {};
  const yoga_en = yoga0.name || '—';
  const yoga_ta = YOGA_TA[yoga_en] || yoga_en;

  const result = {
    // Gregorian
    gregorian_date: ist.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    dd_mm_yyyy: `${String(ist.getDate()).padStart(2,'0')}-${String(ist.getMonth()+1).padStart(2,'0')}-${ist.getFullYear()}`,
    weekday_en,
    weekday_ta,

    // Tamil date
    tamil_day:       tDay,
    tamil_month_ta,
    tamil_month_en,
    tamil_year:      tamil_year,

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

// Temporary debug route — remove after field mapping is confirmed
app.get('/raw', async (req, res) => {
  try {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    const datetimeISO = ist.toISOString().replace('Z', '+05:30');
    const token = await getAccessToken();
    const raw = await fetchPanchang(token, datetimeISO);
    res.json(raw);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Tamil Calendar server running on port ${PORT}`);
});
