import { DangerLevel } from '../types';

export interface CatalogEntry {
  name: string;
  description: string;
  descriptionHe: string;
  version: string;
  author: string;
  dangerLevel: DangerLevel;
  dependencies: string[];
  tags: string[];
  inputSchema: Record<string, unknown>;
  handlerCode: string;
}

export const PLUGIN_CATALOG: CatalogEntry[] = [
  // ===== WEATHER =====
  {
    name: 'weather',
    description: 'Get current weather for any city using wttr.in',
    descriptionHe: 'מזג אוויר נוכחי לכל עיר',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: ['curl'],
    tags: ['weather', 'מזג אוויר', 'temperature', 'טמפרטורה'],
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name (e.g. "Tel Aviv", "London")' },
        format: { type: 'string', description: '"short" for one-line, "full" for detailed forecast', enum: ['short', 'full'] },
      },
      required: ['city'],
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
CITY=$(echo "$INPUT" | grep -o '"city"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"city"[[:space:]]*:[[:space:]]*"//;s/"$//')
FORMAT=$(echo "$INPUT" | grep -o '"format"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"format"[[:space:]]*:[[:space:]]*"//;s/"$//')
if [ "$FORMAT" = "full" ]; then
  curl -s "wttr.in/$CITY?lang=he" 2>/dev/null | head -25
else
  curl -s "wttr.in/$CITY?format=3&lang=he" 2>/dev/null
fi
`,
  },

  // ===== TRANSLATE =====
  {
    name: 'translate',
    description: 'Translate text between languages using translate-shell',
    descriptionHe: 'תרגום טקסט בין שפות',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: ['translate-shell'],
    tags: ['translate', 'תרגום', 'language', 'שפה'],
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to translate' },
        from: { type: 'string', description: 'Source language code (e.g. "en", "he", "auto")' },
        to: { type: 'string', description: 'Target language code (e.g. "he", "en", "ar")' },
      },
      required: ['text', 'to'],
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
TEXT=$(echo "$INPUT" | grep -o '"text"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"text"[[:space:]]*:[[:space:]]*"//;s/"$//')
FROM=$(echo "$INPUT" | grep -o '"from"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"from"[[:space:]]*:[[:space:]]*"//;s/"$//')
TO=$(echo "$INPUT" | grep -o '"to"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"to"[[:space:]]*:[[:space:]]*"//;s/"$//')
[ -z "$FROM" ] && FROM="auto"
trans -brief "$FROM":"$TO" "$TEXT" 2>/dev/null
`,
  },

  // ===== CALCULATOR =====
  {
    name: 'calculator',
    description: 'Advanced math calculator with bc (supports decimals, sqrt, trigonometry)',
    descriptionHe: 'מחשבון מתקדם — עשרוניים, שורשים, טריגונומטריה',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: ['bc'],
    tags: ['calc', 'math', 'מחשבון', 'חישוב'],
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Math expression (e.g. "sqrt(144)", "3.14*5^2", "scale=4; 22/7")' },
      },
      required: ['expression'],
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
EXPR=$(echo "$INPUT" | grep -o '"expression"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"expression"[[:space:]]*:[[:space:]]*"//;s/"$//')
echo "scale=6; $EXPR" | bc -l 2>/dev/null
`,
  },

  // ===== CRYPTO PRICE =====
  {
    name: 'crypto_price',
    description: 'Get current cryptocurrency price from CoinGecko API',
    descriptionHe: 'מחיר מטבע קריפטו בזמן אמת',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: ['curl', 'jq'],
    tags: ['crypto', 'bitcoin', 'קריפטו', 'ביטקוין', 'price'],
    inputSchema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin ID (e.g. "bitcoin", "ethereum", "solana")' },
        currency: { type: 'string', description: 'Fiat currency (default: "usd"). Options: usd, ils, eur' },
      },
      required: ['coin'],
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
COIN=$(echo "$INPUT" | grep -o '"coin"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"coin"[[:space:]]*:[[:space:]]*"//;s/"$//')
CURR=$(echo "$INPUT" | grep -o '"currency"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"currency"[[:space:]]*:[[:space:]]*"//;s/"$//')
[ -z "$CURR" ] && CURR="usd"
DATA=$(curl -s "https://api.coingecko.com/api/v3/simple/price?ids=$COIN&vs_currencies=$CURR&include_24hr_change=true" 2>/dev/null)
PRICE=$(echo "$DATA" | jq -r ".$COIN.$CURR // empty" 2>/dev/null)
CHANGE=$(echo "$DATA" | jq -r ".$COIN.$CURR\_24h_change // empty" 2>/dev/null)
if [ -z "$PRICE" ]; then
  echo "לא נמצא מטבע: $COIN"
else
  SIGN=""
  [ "$(echo "$CHANGE > 0" | bc -l 2>/dev/null)" = "1" ] && SIGN="+"
  echo "$COIN: $PRICE $CURR ($SIGN$CHANGE% 24h)"
fi
`,
  },

  // ===== IP INFO =====
  {
    name: 'ip_info',
    description: 'Get public IP address and geolocation info',
    descriptionHe: 'כתובת IP ציבורית ומיקום גאוגרפי',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: ['curl'],
    tags: ['ip', 'network', 'רשת', 'location'],
    inputSchema: {
      type: 'object',
      properties: {
        ip: { type: 'string', description: 'IP to lookup (leave empty for your own IP)' },
      },
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
IP=$(echo "$INPUT" | grep -o '"ip"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"ip"[[:space:]]*:[[:space:]]*"//;s/"$//')
if [ -z "$IP" ]; then
  curl -s "http://ipinfo.io/json" 2>/dev/null | jq -r '"IP: " + .ip + "\\nCity: " + .city + "\\nRegion: " + .region + "\\nCountry: " + .country + "\\nOrg: " + .org' 2>/dev/null
else
  curl -s "http://ipinfo.io/$IP/json" 2>/dev/null | jq -r '"IP: " + .ip + "\\nCity: " + .city + "\\nRegion: " + .region + "\\nCountry: " + .country + "\\nOrg: " + .org' 2>/dev/null
fi
`,
  },

  // ===== SPEEDTEST =====
  {
    name: 'speedtest',
    description: 'Test internet download/upload speed',
    descriptionHe: 'בדיקת מהירות אינטרנט',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: ['curl'],
    tags: ['speed', 'internet', 'מהירות', 'אינטרנט'],
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handlerCode: `#!/bin/bash
echo "בודק מהירות הורדה..."
START=$(date +%s%N)
curl -s -o /dev/null -w "%{speed_download}" "http://speedtest.tele2.net/1MB.zip" 2>/dev/null
END=$(date +%s%N)
SPEED=$(curl -s -o /dev/null -w "%{speed_download}" "http://speedtest.tele2.net/1MB.zip" 2>/dev/null)
MBPS=$(echo "scale=2; $SPEED / 125000" | bc -l 2>/dev/null)
echo "מהירות הורדה: ~$MBPS Mbps"
`,
  },

  // ===== YOUTUBE DOWNLOAD =====
  {
    name: 'youtube_download',
    description: 'Download audio/video from YouTube using yt-dlp',
    descriptionHe: 'הורדת אודיו/וידאו מיוטיוב',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'moderate',
    dependencies: ['python', 'yt-dlp'],
    tags: ['youtube', 'download', 'video', 'audio', 'יוטיוב', 'הורדה'],
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'YouTube URL' },
        format: { type: 'string', description: '"audio" for mp3, "video" for mp4', enum: ['audio', 'video'] },
      },
      required: ['url'],
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
URL=$(echo "$INPUT" | grep -o '"url"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"url"[[:space:]]*:[[:space:]]*"//;s/"$//')
FORMAT=$(echo "$INPUT" | grep -o '"format"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"format"[[:space:]]*:[[:space:]]*"//;s/"$//')
OUTDIR="/storage/emulated/0/Download"
if [ "$FORMAT" = "audio" ]; then
  yt-dlp -x --audio-format mp3 -o "$OUTDIR/%(title)s.%(ext)s" "$URL" 2>&1 | tail -3
else
  yt-dlp -f "best[height<=720]" -o "$OUTDIR/%(title)s.%(ext)s" "$URL" 2>&1 | tail -3
fi
`,
  },

  // ===== PDF READER =====
  {
    name: 'pdf_reader',
    description: 'Extract text from PDF files',
    descriptionHe: 'קריאת טקסט מקובצי PDF',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: ['poppler'],
    tags: ['pdf', 'read', 'extract', 'text'],
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the PDF file' },
        pages: { type: 'string', description: 'Page range (e.g. "1-3", "5"). Default: all pages' },
      },
      required: ['path'],
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
FILEPATH=$(echo "$INPUT" | grep -o '"path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"path"[[:space:]]*:[[:space:]]*"//;s/"$//')
PAGES=$(echo "$INPUT" | grep -o '"pages"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"pages"[[:space:]]*:[[:space:]]*"//;s/"$//')
if [ ! -f "$FILEPATH" ]; then
  echo "קובץ לא נמצא: $FILEPATH"
  exit 1
fi
if [ -n "$PAGES" ]; then
  pdftotext -f $(echo "$PAGES" | cut -d- -f1) -l $(echo "$PAGES" | cut -d- -f2) "$FILEPATH" - 2>/dev/null
else
  pdftotext "$FILEPATH" - 2>/dev/null | head -500
fi
`,
  },

  // ===== OCR =====
  {
    name: 'ocr',
    description: 'Extract text from images using Tesseract OCR (supports Hebrew & English)',
    descriptionHe: 'זיהוי טקסט מתמונות — תומך עברית ואנגלית',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: ['tesseract'],
    tags: ['ocr', 'image', 'text', 'תמונה', 'טקסט', 'זיהוי'],
    inputSchema: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Path to the image file' },
        language: { type: 'string', description: 'Language: "heb" for Hebrew, "eng" for English, "heb+eng" for both (default)' },
      },
      required: ['image_path'],
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
IMG=$(echo "$INPUT" | grep -o '"image_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"image_path"[[:space:]]*:[[:space:]]*"//;s/"$//')
LANG=$(echo "$INPUT" | grep -o '"language"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"language"[[:space:]]*:[[:space:]]*"//;s/"$//')
[ -z "$LANG" ] && LANG="heb+eng"
if [ ! -f "$IMG" ]; then
  echo "תמונה לא נמצאה: $IMG"
  exit 1
fi
tesseract "$IMG" stdout -l "$LANG" 2>/dev/null
`,
  },

  // ===== UNIT CONVERTER =====
  {
    name: 'unit_convert',
    description: 'Convert between units (length, weight, temperature, currency)',
    descriptionHe: 'המרת יחידות — אורך, משקל, טמפרטורה',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: [],
    tags: ['convert', 'units', 'המרה', 'יחידות'],
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'The value to convert' },
        from: { type: 'string', description: 'Source unit (e.g. "km", "lb", "fahrenheit", "usd")' },
        to: { type: 'string', description: 'Target unit (e.g. "miles", "kg", "celsius", "ils")' },
      },
      required: ['value', 'from', 'to'],
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
VALUE=$(echo "$INPUT" | grep -o '"value"[[:space:]]*:[[:space:]]*[0-9.]*' | sed 's/"value"[[:space:]]*:[[:space:]]*//')
FROM=$(echo "$INPUT" | grep -o '"from"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"from"[[:space:]]*:[[:space:]]*"//;s/"$//')
TO=$(echo "$INPUT" | grep -o '"to"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"to"[[:space:]]*:[[:space:]]*"//;s/"$//')
FROM=$(echo "$FROM" | tr '[:upper:]' '[:lower:]')
TO=$(echo "$TO" | tr '[:upper:]' '[:lower:]')
RESULT=""
case "$FROM-$TO" in
  km-miles|km-mi) RESULT=$(echo "scale=4; $VALUE * 0.621371" | bc -l);;
  miles-km|mi-km) RESULT=$(echo "scale=4; $VALUE * 1.60934" | bc -l);;
  kg-lb|kg-pounds) RESULT=$(echo "scale=4; $VALUE * 2.20462" | bc -l);;
  lb-kg|pounds-kg) RESULT=$(echo "scale=4; $VALUE * 0.453592" | bc -l);;
  cm-inch|cm-in) RESULT=$(echo "scale=4; $VALUE / 2.54" | bc -l);;
  inch-cm|in-cm) RESULT=$(echo "scale=4; $VALUE * 2.54" | bc -l);;
  celsius-fahrenheit|c-f) RESULT=$(echo "scale=2; ($VALUE * 9/5) + 32" | bc -l);;
  fahrenheit-celsius|f-c) RESULT=$(echo "scale=2; ($VALUE - 32) * 5/9" | bc -l);;
  m-ft|meters-feet) RESULT=$(echo "scale=4; $VALUE * 3.28084" | bc -l);;
  ft-m|feet-meters) RESULT=$(echo "scale=4; $VALUE * 0.3048" | bc -l);;
  *) RESULT="המרה לא נתמכת: $FROM -> $TO";;
esac
echo "$VALUE $FROM = $RESULT $TO"
`,
  },

  // ===== PASSWORD GENERATOR =====
  {
    name: 'password_gen',
    description: 'Generate secure random passwords',
    descriptionHe: 'יצירת סיסמאות חזקות ואקראיות',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: [],
    tags: ['password', 'security', 'סיסמה', 'אבטחה', 'random'],
    inputSchema: {
      type: 'object',
      properties: {
        length: { type: 'number', description: 'Password length (default: 16)' },
        count: { type: 'number', description: 'Number of passwords to generate (default: 1)' },
        type: { type: 'string', description: '"full" (all chars), "alpha" (letters+numbers), "pin" (digits only)', enum: ['full', 'alpha', 'pin'] },
      },
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
LENGTH=$(echo "$INPUT" | grep -o '"length"[[:space:]]*:[[:space:]]*[0-9]*' | sed 's/"length"[[:space:]]*:[[:space:]]*//')
COUNT=$(echo "$INPUT" | grep -o '"count"[[:space:]]*:[[:space:]]*[0-9]*' | sed 's/"count"[[:space:]]*:[[:space:]]*//')
TYPE=$(echo "$INPUT" | grep -o '"type"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"type"[[:space:]]*:[[:space:]]*"//;s/"$//')
[ -z "$LENGTH" ] && LENGTH=16
[ -z "$COUNT" ] && COUNT=1
[ -z "$TYPE" ] && TYPE="full"
CHARS=""
case "$TYPE" in
  full) CHARS='A-Za-z0-9!@#$%^&*()_+-=';;
  alpha) CHARS='A-Za-z0-9';;
  pin) CHARS='0-9';;
esac
for i in $(seq 1 $COUNT); do
  cat /dev/urandom | tr -dc "$CHARS" | head -c "$LENGTH"
  echo
done
`,
  },

  // ===== JSON FORMATTER =====
  {
    name: 'json_format',
    description: 'Format, validate, and query JSON data',
    descriptionHe: 'עיצוב, אימות ושאילתות JSON',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: ['jq'],
    tags: ['json', 'format', 'validate', 'jq'],
    inputSchema: {
      type: 'object',
      properties: {
        json_string: { type: 'string', description: 'JSON string to format/query' },
        query: { type: 'string', description: 'jq query (e.g. ".name", ".items[]", ".[] | select(.age > 20)")' },
      },
      required: ['json_string'],
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
JSON_STR=$(echo "$INPUT" | jq -r '.json_string // empty' 2>/dev/null)
QUERY=$(echo "$INPUT" | jq -r '.query // "."' 2>/dev/null)
[ -z "$QUERY" ] && QUERY="."
echo "$JSON_STR" | jq "$QUERY" 2>&1
`,
  },

  // ===== SYSTEM INFO =====
  {
    name: 'system_info',
    description: 'Detailed system information (CPU, memory, uptime, disk, network)',
    descriptionHe: 'מידע מערכת מפורט — CPU, זיכרון, uptime, דיסק, רשת',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: [],
    tags: ['system', 'info', 'cpu', 'memory', 'מערכת', 'מידע'],
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'string', description: '"all", "cpu", "memory", "disk", "network", "uptime"', enum: ['all', 'cpu', 'memory', 'disk', 'network', 'uptime'] },
      },
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
SECTION=$(echo "$INPUT" | grep -o '"section"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"section"[[:space:]]*:[[:space:]]*"//;s/"$//')
[ -z "$SECTION" ] && SECTION="all"
show_cpu() { echo "=== CPU ==="; cat /proc/cpuinfo 2>/dev/null | grep -E "model name|processor" | head -4; echo "Load: $(cat /proc/loadavg 2>/dev/null)"; }
show_mem() { echo "=== Memory ==="; free -h 2>/dev/null || cat /proc/meminfo 2>/dev/null | head -3; }
show_disk() { echo "=== Disk ==="; df -h /storage/emulated/0 2>/dev/null || df -h / 2>/dev/null; }
show_net() { echo "=== Network ==="; ifconfig 2>/dev/null | grep -E "inet |Link" | head -6; }
show_uptime() { echo "=== Uptime ==="; uptime 2>/dev/null; }
case "$SECTION" in
  cpu) show_cpu;;
  memory) show_mem;;
  disk) show_disk;;
  network) show_net;;
  uptime) show_uptime;;
  all) show_cpu; echo; show_mem; echo; show_disk; echo; show_net; echo; show_uptime;;
esac
`,
  },

  // ===== CURRENCY CONVERT =====
  {
    name: 'currency_convert',
    description: 'Convert between currencies using real-time exchange rates',
    descriptionHe: 'המרת מטבעות בזמן אמת',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: ['curl', 'jq'],
    tags: ['currency', 'exchange', 'money', 'מטבע', 'המרה', 'כסף', 'דולר', 'שקל'],
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount to convert' },
        from: { type: 'string', description: 'Source currency code (e.g. "USD", "EUR", "ILS")' },
        to: { type: 'string', description: 'Target currency code (e.g. "ILS", "USD", "EUR")' },
      },
      required: ['amount', 'from', 'to'],
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
AMOUNT=$(echo "$INPUT" | grep -o '"amount"[[:space:]]*:[[:space:]]*[0-9.]*' | sed 's/"amount"[[:space:]]*:[[:space:]]*//')
FROM=$(echo "$INPUT" | grep -o '"from"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"from"[[:space:]]*:[[:space:]]*"//;s/"$//' | tr '[:lower:]' '[:upper:]')
TO=$(echo "$INPUT" | grep -o '"to"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"to"[[:space:]]*:[[:space:]]*"//;s/"$//' | tr '[:lower:]' '[:upper:]')
RATE=$(curl -s "https://open.er-api.com/v6/latest/$FROM" 2>/dev/null | jq -r ".rates.$TO // empty" 2>/dev/null)
if [ -z "$RATE" ]; then
  echo "לא הצלחתי לקבל שער חליפין $FROM -> $TO"
else
  RESULT=$(echo "scale=2; $AMOUNT * $RATE" | bc -l 2>/dev/null)
  echo "$AMOUNT $FROM = $RESULT $TO (שער: $RATE)"
fi
`,
  },

  // ===== NEWS =====
  {
    name: 'news',
    description: 'Get latest news headlines',
    descriptionHe: 'כותרות חדשות אחרונות',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: ['curl'],
    tags: ['news', 'חדשות', 'headlines', 'כותרות'],
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic to search (optional, default: top headlines)' },
        lang: { type: 'string', description: '"he" for Hebrew, "en" for English', enum: ['he', 'en'] },
      },
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
TOPIC=$(echo "$INPUT" | grep -o '"topic"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"topic"[[:space:]]*:[[:space:]]*"//;s/"$//')
LANG=$(echo "$INPUT" | grep -o '"lang"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"lang"[[:space:]]*:[[:space:]]*"//;s/"$//')
[ -z "$LANG" ] && LANG="he"
if [ "$LANG" = "he" ]; then
  curl -s "https://news.google.com/rss?hl=iw&gl=IL&ceid=IL:he" 2>/dev/null | grep -o '<title>[^<]*</title>' | sed 's/<[^>]*>//g' | head -10
else
  if [ -n "$TOPIC" ]; then
    curl -s "https://news.google.com/rss/search?q=$TOPIC&hl=en" 2>/dev/null | grep -o '<title>[^<]*</title>' | sed 's/<[^>]*>//g' | head -10
  else
    curl -s "https://news.google.com/rss?hl=en" 2>/dev/null | grep -o '<title>[^<]*</title>' | sed 's/<[^>]*>//g' | head -10
  fi
fi
`,
  },

  // ===== DICTIONARY =====
  {
    name: 'dictionary',
    description: 'Look up word definitions using an online dictionary API',
    descriptionHe: 'הגדרת מילים מהמילון',
    version: '1.0.0',
    author: 'ai-agent',
    dangerLevel: 'safe',
    dependencies: ['curl', 'jq'],
    tags: ['dictionary', 'define', 'word', 'מילון', 'הגדרה'],
    inputSchema: {
      type: 'object',
      properties: {
        word: { type: 'string', description: 'English word to define' },
      },
      required: ['word'],
    },
    handlerCode: `#!/bin/bash
INPUT="$1"
WORD=$(echo "$INPUT" | grep -o '"word"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"word"[[:space:]]*:[[:space:]]*"//;s/"$//')
DATA=$(curl -s "https://api.dictionaryapi.dev/api/v2/entries/en/$WORD" 2>/dev/null)
echo "$DATA" | jq -r '.[0].meanings[] | "\\(.partOfSpeech):\\n" + (.definitions[:2][] | "  - " + .definition)' 2>/dev/null
if [ $? -ne 0 ]; then
  echo "לא נמצאה הגדרה עבור: $WORD"
fi
`,
  },
];

export function searchCatalog(query: string): CatalogEntry[] {
  const q = query.toLowerCase();
  return PLUGIN_CATALOG.filter(p =>
    p.name.includes(q) ||
    p.description.toLowerCase().includes(q) ||
    p.descriptionHe.includes(q) ||
    p.tags.some(t => t.includes(q))
  );
}

export function getCatalogEntry(name: string): CatalogEntry | undefined {
  return PLUGIN_CATALOG.find(p => p.name === name);
}

export function catalogToString(): string {
  return PLUGIN_CATALOG.map(p =>
    `📦 **${p.name}** — ${p.descriptionHe}\n   תגיות: ${p.tags.join(', ')} | תלויות: ${p.dependencies.join(', ') || 'אין'}`
  ).join('\n\n');
}
