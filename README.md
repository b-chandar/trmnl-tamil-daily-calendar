# Tamil Daily Sheet Calendar — TRMNL Plugin

A daily Tamil Panchangam calendar for your TRMNL e-ink display.

## What it shows
- **Tamil date** — day, month (Tamil script + English), year
- **Weekday** — in Tamil and English
- **திதி (Tithi)** — lunar day with end time
- **நட்சத்திரம் (Nakshatra)** — star of the day with end time
- **யோகம் (Yoga)** — auspicious yoga
- **Sunrise / Sunset** times
- **ராகு காலம் (Rahu Kalam)** — inauspicious period
- **எமகண்டம் (Emi Kalam / Yamagandam)** — inauspicious period
- **Festival / Special day** banner (when applicable)

## Architecture
```
server/          ← Node.js Express server (deploy to Render)
  index.js       ← main server
  package.json
  .env.example   ← copy to .env and fill in credentials

plugin/          ← TRMNL plugin files (import as ZIP)
  settings.yml
  full.liquid
  half_horizontal.liquid
  half_vertical.liquid
  quadrant.liquid
```

## Setup

### 1. Prokerala API key
- Sign up at [api.prokerala.com](https://api.prokerala.com)
- Create an app → copy **Client ID** and **Client Secret**
- Free tier: 5,000 credits/month (Basic Panchang = 10 credits in English, 20 in Tamil)
  → ~250 Tamil-language calls/month free (daily refresh = 31 calls/month, well within limit)

### 2. Deploy the server to Render
```bash
cd server
npm install
# Copy .env.example → .env and fill in credentials
# Push to GitHub, then deploy on Render as a Web Service
```
Set these environment variables in Render:
| Variable | Value |
|---|---|
| `PROKERALA_CLIENT_ID` | from Prokerala dashboard |
| `PROKERALA_CLIENT_SECRET` | from Prokerala dashboard |
| `LOCATION_LAT` | your latitude (default: 13.0827 Chennai) |
| `LOCATION_LON` | your longitude (default: 80.2707 Chennai) |
| `LOCATION_NAME` | display name (default: Chennai) |

### 3. Import plugin into TRMNL
1. Zip the `plugin/` folder contents (not the folder itself — just the files inside)
2. In TRMNL dashboard → Private Plugins → **Import new**
3. After import, edit the plugin and update the `polling_url` to your Render URL + `/data`
4. Set refresh interval to **1440 minutes** (once per day)
5. Add to your playlist

## Font note
Tamil characters render using the device's built-in fallback fonts. For best results, the TRMNL markup editor uses system-available Unicode fonts. Tamil script is fully Unicode-compliant and renders correctly on modern browsers/TRMNL.

## Credits usage
- Prokerala free tier: **5,000 credits/month**
- API is called in **English** (no `la` param) → **10 credits/call** (Advanced Panchang)
- Daily refresh = 31 calls × 10 = **310 credits/month** — well within the free tier
- Tamil script (month, weekday, tithi, nakshatra, yoga) is resolved entirely from built-in lookup tables in `server/index.js` — no extra API cost
