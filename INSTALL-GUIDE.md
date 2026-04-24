# 🤖 מדריך התקנה מלא — AI Agent לטלפון אנדרואיד

> מדריך שלב-אחר-שלב להתקנת הסוכן החכם על טלפון חדש.
> זמן התקנה משוער: **15-25 דקות** (תלוי במהירות האינטרנט והטלפון).

---

## 📋 מה צריך לפני שמתחילים

| # | דרישה | הערות |
|---|---|---|
| 1 | טלפון **Android** (גרסה 7+) | לא עובד על iPhone |
| 2 | **חיבור אינטרנט** (WiFi מומלץ) | להורדת חבילות ותלויות |
| 3 | **מפתח API של Anthropic** | [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key |
| 4 | ~**500MB** מקום פנוי | לקוד + תלויות |

---

## שלב 1: התקנת Termux 📱

Termux = טרמינל Linux שרץ על אנדרואיד. **חובה להוריד מ-F-Droid** (הגרסה ב-Google Play ישנה ושבורה).

1. **פתח Chrome בטלפון** וגלוש ל:
   ```
   https://f-droid.org/packages/com.termux/
   ```

2. לחץ **"Download APK"**

3. אם הטלפון מבקש אישור "Install from unknown sources" → **אשר**

4. **התקן** ופתח את Termux

5. תראה **מסך שחור עם שורת פקודה** — זה נורמלי, זה הטרמינל

> ⚠️ **חשוב**: אל תוריד Termux מ-Google Play Store — הגרסה שם ישנה ולא עובדת!

---

## שלב 2: התקנת Termux:API 🔌

Termux:API נותן גישה לחומרה של הטלפון — מצלמה, SMS, GPS, סוללה, התראות, חיישנים, WiFi ועוד.

1. **ב-Chrome**, גלוש ל:
   ```
   https://f-droid.org/packages/com.termux.api/
   ```

2. לחץ **"Download APK"** והתקן

3. **תן את כל ההרשאות**:
   - לך ל: **הגדרות הטלפון** → **אפליקציות** → **Termux:API** → **הרשאות**
   - סמן **הכל**: מיקום, מצלמה, אנשי קשר, SMS, טלפון, מיקרופון, אחסון
   - זה קריטי — בלי זה הרבה פונקציות לא יעבדו!

4. **חזור ל-Termux** והרץ:
   ```bash
   pkg install -y termux-api
   ```

> 💡 **בדיקה מהירה**: הרץ `termux-battery-status` — אם מראה JSON עם אחוזי סוללה, הכל עובד!

---

## שלב 3: עדכון Termux והתקנת כלים בסיסיים 🛠️

הרץ ב-Termux (שורה אחרי שורה):

```bash
pkg update -y && pkg upgrade -y
```
> ⏱️ לוקח 1-3 דקות. אם שואל שאלות — פשוט לחץ Enter.

```bash
pkg install -y nodejs-lts git openssh
```
> ⏱️ לוקח 2-5 דקות.

**בדוק שהכל הותקן**:
```bash
node --version    # אמור להראות v20.x.x או v22.x.x
git --version     # אמור להראות git version 2.x.x
```

> ❌ אם `node --version` לא עובד — הרץ שוב `pkg install nodejs-lts`

---

## שלב 4: הורדת הפרויקט לטלפון 📥

### אפשרות א — Git Clone (הכי קל ✅)

```bash
git clone https://github.com/or4551-cyber/ai-agent.git ~/ai-agent
```
> ⏱️ לוקח 1-2 דקות.

### אפשרות ב — העתקה מהמחשב דרך USB

1. חבר את הטלפון למחשב בכבל USB
2. במחשב: העתק את תיקיית הפרויקט → Internal Storage → תקרא לה `ai-agent`
3. ב-Termux הרץ:
   ```bash
   termux-setup-storage
   ```
   > לחץ **"Allow"** כשיבקש הרשאת אחסון

4. העתק לתיקיית הבית:
   ```bash
   cp -r /storage/emulated/0/ai-agent ~/ai-agent
   ```

### אפשרות ג — SCP מהמחשב (WiFi)

ב-Termux:
```bash
sshd  # מפעיל SSH server
ifconfig wlan0  # מראה את ה-IP
whoami  # מראה את שם המשתמש
```

במחשב (PowerShell):
```powershell
scp -P 8022 -r "C:\path\to\phone-agent" USER@PHONE_IP:~/ai-agent
```

---

## שלב 5: התקנת תלויות הפרויקט 📦

### Server (Backend)

```bash
cd ~/ai-agent/server
npm install
```
> ⏱️ לוקח 3-5 דקות.

### Web (Frontend)

```bash
cd ~/ai-agent/web
npm install
npm run build
```
> ⏱️ לוקח 3-8 דקות (תלוי בטלפון).

> ❌ אם נתקעת על `npm install` — נסה:
> ```bash
> npm cache clean --force
> rm -rf node_modules package-lock.json
> npm install
> ```

---

## שלב 6: הגדרת קובץ Environment 🔑

```bash
cd ~/ai-agent/server
```

**צור קובץ `.env`:**
```bash
cat > .env << 'EOF'
# === REQUIRED ===
ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY-HERE

# === OPTIONAL ===
AUTH_TOKEN=dev-token
PORT=3002

# Google Services (optional — for Gmail, Drive, Calendar, Tasks, Contacts)
# GOOGLE_CLIENT_ID=your-client-id
# GOOGLE_CLIENT_SECRET=your-client-secret

# Local LLM fallback (optional — for offline mode)
# LLAMA_BIN=/path/to/llama-cli
# LLAMA_MODEL=/path/to/model.gguf
EOF
```

**עכשיו ערוך ושים את המפתח האמיתי שלך:**
```bash
nano .env
```

- **שנה** את `sk-ant-api03-YOUR-KEY-HERE` למפתח ה-API **האמיתי** שלך
- אם רוצה סיסמה לכניסה — שנה את `AUTH_TOKEN`
- שמור: `Ctrl+X` → `Y` → `Enter`

### איך מקבלים מפתח Anthropic API?

1. גלוש ל-[console.anthropic.com](https://console.anthropic.com)
2. הירשם / התחבר
3. לך ל-**API Keys** → **Create Key**
4. העתק את המפתח (מתחיל ב-`sk-ant-`)
5. הדבק ב-`.env`

> ⚠️ שמור את המפתח! לא תוכל לראות אותו שוב אחרי שתסגור את הדף.

---

## שלב 7: הפעלה ראשונה! 🚀

```bash
cd ~/ai-agent/server
npm run dev
```

**אם הכל עובד, תראה:**
```
╔════════════════════════════════════════╗
║  🤖 AI Agent Server                    ║
║  Running on port 3002                  ║
║  Open Chrome on your phone:            ║
║  http://localhost:3002                  ║
╚════════════════════════════════════════╝
[Observer] Starting background observer (every 5 min)
[Reminders] Service started
[Routines] Service started
[Plugins] Loaded 0 plugins
```

**פתח Chrome בטלפון** והקלד:
```
localhost:3002
```

🎉 **אתה אמור לראות את מסך הבית עם ברכה, סוללה, תזכורות!**

---

## שלב 8: הוספה כאפליקציה למסך הבית 📲

1. ב-Chrome, כשאתה בדף `localhost:3002`
2. לחץ על **⋮** (שלוש נקודות למעלה)
3. לחץ **"Add to Home screen"** (הוסף לדף הבית)
4. תן שם (למשל "AI Agent")
5. לחץ **"Add"**

עכשיו יש לך אייקון של האפליקציה על דף הבית כמו אפליקציה רגילה!

---

## שלב 9: הגדרת הרצה ברקע (מומלץ מאוד) 🔄

בלי זה, האפליקציה תיעצר כשתסגור את Termux.

### התקן tmux:
```bash
pkg install -y tmux
```

### הפעל ברקע:
```bash
tmux new -s agent
cd ~/ai-agent/server && npm run dev
```

**לניתוק מהסשן (השרת ממשיך לרוץ):**
> לחץ `Ctrl+B` ואחרי זה `D`

**לחזור לסשן:**
```bash
tmux attach -t agent
```

### הפעלה אוטומטית כש-Termux נפתח:
```bash
echo 'if ! tmux has-session -t agent 2>/dev/null; then tmux new-session -d -s agent "cd ~/ai-agent/server && npm run dev"; fi' >> ~/.bashrc
```

---

## שלב 10: הגדרות אופציונליות (לא חובה) ⚙️

### 🔗 חיבור Google (Gmail, Drive, Calendar, Tasks, Contacts)

1. לך ל-[Google Cloud Console](https://console.cloud.google.com)
2. צור פרויקט חדש
3. הפעל APIs: Gmail, Drive, Calendar, Tasks, People
4. צור OAuth Client ID (Web Application)
5. הוסף redirect URI: `http://localhost:3002/api/google/callback`
6. ערוך `.env`:
   ```
   GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-secret
   ```
7. הפעל מחדש את השרת
8. בצ'אט כתוב "google status" — תקבל לינק לחיבור

### 🧠 LLM מקומי (עבודה אופליין)

1. התקן llama.cpp:
   ```bash
   pkg install -y cmake make
   git clone https://github.com/ggerganov/llama.cpp ~/llama.cpp
   cd ~/llama.cpp && make -j4
   ```

2. הורד מודל GGUF קטן (למשל TinyLlama):
   ```bash
   mkdir -p ~/models
   curl -L -o ~/models/tinyllama.gguf https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
   ```

3. ערוך `.env`:
   ```
   LLAMA_BIN=~/llama.cpp/llama-cli
   LLAMA_MODEL=~/models/tinyllama.gguf
   ```

---

## פתרון בעיות 🔧

| בעיה | פתרון |
|---|---|
| `command not found: node` | `pkg install nodejs-lts` |
| `command not found: git` | `pkg install git` |
| `ANTHROPIC_API_KEY not set` | ערוך `~/ai-agent/server/.env` ושים את המפתח |
| `EADDRINUSE: port 3002` | `pkill -f "node dist/server"` ונסה שוב |
| "Cannot connect" ב-Chrome | ודא שהשרת רץ ב-Termux |
| SMS לא נשלח | ודא ש-Termux:API מותקן + הרשאות SMS |
| מצלמה לא עובדת | הגדרות → Termux:API → הרשאת מצלמה |
| אפליקציה נעצרת ברקע | השתמש ב-tmux (שלב 9) |
| `ENOSPC` error | `cd ~/ai-agent/server && rm -rf node_modules && npm install` |
| `npm install` נתקע | `npm cache clean --force` ונסה שוב |
| `Permission denied` | `chmod +x ~/ai-agent/install.sh ~/ai-agent/start.sh` |
| הכל מת אחרי restart | הגדר tmux + bashrc (שלב 9) |
| מקלדת לא מגיבה ב-Termux | החלק שמאלה מהשפה השמאלית של המסך |

---

## סקריפט התקנה מהירה (One-Liner) 🏃

אם כבר יש לך את הפרויקט ב-GitHub, תריץ ב-Termux:

```bash
pkg update -y && pkg upgrade -y && pkg install -y nodejs-lts git openssh termux-api && git clone https://github.com/or4551-cyber/ai-agent.git ~/ai-agent && cd ~/ai-agent/server && npm install && cd ~/ai-agent/web && npm install && npm run build && echo "✅ Done! Edit ~/ai-agent/server/.env then run: cd ~/ai-agent/server && npm run dev"
```

---

## עדכון גרסה 🔄

כשיש עדכון:
```bash
cd ~/ai-agent
git pull
cd server && npm install && npm run build
cd ../web && npm install && npm run build
cd ../server && npm run dev
```

---

---

# 📋 רשימת יכולות מלאה של הסוכן

## סה"כ: 85 כלי AI + 14 פקודות offline + 15 פלגינים בקטלוג + ∞ פלגינים מותאמים

---

## כלי AI מובנים (85)

### 📁 ניהול קבצים (6)
| כלי | תיאור |
|---|---|
| `read_file` | קריאת קובץ |
| `write_file` | כתיבת קובץ חדש |
| `edit_file` | עריכת קובץ קיים |
| `delete_file` | מחיקת קובץ |
| `list_directory` | הצגת תיקייה |
| `search_files` | חיפוש קבצים |

### 💻 טרמינל (1)
| כלי | תיאור |
|---|---|
| `run_command` | הרצת כל פקודת Linux/Bash |

### 🖼️ גלריה (2)
| כלי | תיאור |
|---|---|
| `gallery_list` | הצגת תמונות מהגלריה |
| `gallery_organize` | ארגון אוטומטי של גלריה |

### 📨 תקשורת (6)
| כלי | תיאור |
|---|---|
| `send_sms` | שליחת SMS |
| `get_contacts` | קריאת אנשי קשר |
| `send_email` | שליחת אימייל |
| `send_telegram` | שליחת הודעת Telegram |
| `make_call` | חיוג טלפוני (דורש אישור) |
| `share_content` | שיתוף לאפליקציה אחרת (WhatsApp, Gmail...) |

### 📱 מכשיר (5)
| כלי | תיאור |
|---|---|
| `get_location` | קריאת GPS |
| `take_photo` | צילום תמונה |
| `get_clipboard` | קריאת לוח |
| `get_battery` | מצב סוללה |
| `get_notifications` | קריאת התראות |

### 💬 WhatsApp (2)
| כלי | תיאור |
|---|---|
| `whatsapp_messages` | קריאת הודעות WhatsApp |
| `whatsapp_reply` | מענה להודעה |

### 🎵 מדיה (4)
| כלי | תיאור |
|---|---|
| `media_control` | play/pause/next/previous |
| `media_volume` | שליטה בווליום |
| `media_now_playing` | מה מנגן עכשיו |
| `record_audio` | הקלטה מהמיקרופון |

### 💬 דיאלוגים וחיישנים (2)
| כלי | תיאור |
|---|---|
| `show_dialog` | הצגת הודעה/toast/input על המסך |
| `get_sensors` | קריאת חיישנים (אקסלרומטר, קרבה, אור...) |

### 📲 אפליקציות (2)
| כלי | תיאור |
|---|---|
| `open_app` | פתיחת אפליקציה (בעברית/אנגלית) |
| `list_apps` | רשימת אפליקציות מותקנות |

### 📅 לוח שנה (2)
| כלי | תיאור |
|---|---|
| `calendar_list` | קריאת אירועים מלוח השנה |
| `calendar_add` | הוספת אירוע |

### 🌐 Git (3)
| כלי | תיאור |
|---|---|
| `git_status` | בדיקת מצב repo |
| `git_commit` | commit + push |
| `git_clone` | שכפול repo |

### 🔍 אינטרנט (2)
| כלי | תיאור |
|---|---|
| `web_search` | חיפוש Google |
| `web_browse` | גלישה לאתר |

### 🧠 זיכרון (4)
| כלי | תיאור |
|---|---|
| `memory_set` | שמירת מידע לטווח ארוך |
| `memory_get` | קריאת זיכרון |
| `memory_list` | רשימת כל הזכרונות |
| `memory_delete` | מחיקת זיכרון |

### ⏰ תזכורות (4)
| כלי | תיאור |
|---|---|
| `reminder_add` | הוספת תזכורת עם זמן + התראה |
| `reminder_list` | רשימת תזכורות |
| `reminder_complete` | סימון כהושלם |
| `reminder_delete` | מחיקת תזכורת |

### 🔁 אוטומציות (4)
| כלי | תיאור |
|---|---|
| `routine_add` | יצירת פעולה מתוזמנת (יומי/שבועי/שעתי) |
| `routine_list` | רשימת אוטומציות |
| `routine_toggle` | הפעלה/השבתה |
| `routine_delete` | מחיקה |

### 🎙️ קול (3)
| כלי | תיאור |
|---|---|
| `speech_to_text` | דיבור → טקסט (מהמיקרופון) |
| `text_to_speech` | טקסט → דיבור (הקראה) |
| `voice_chat` | מצב קולי רציף: STT → Agent → TTS (אומר "עצור" לסיום) |

### 💾 אחסון (5)
| כלי | תיאור |
|---|---|
| `storage_scan` | סריקה עמוקה — קבצים כפולים, cache, זבל, גדולים |
| `storage_last_scan` | תוצאות סריקה אחרונה |
| `storage_delete_files` | מחיקת קבצים שנמצאו |
| `storage_clear_cache` | ניקוי cache |
| `storage_delete_empty_folders` | מחיקת תיקיות ריקות |

### 📊 QR ו-Briefing (2)
| כלי | תיאור |
|---|---|
| `scan_qr_code` | סריקת QR/ברקוד |
| `smart_briefing` | סיכום בוקר חכם (סוללה + יומן + הודעות + אחסון) |

### 💿 גיבוי ושחזור (3)
| כלי | תיאור |
|---|---|
| `backup_create` | גיבוי כל הנתונים (זיכרון, תזכורות, אוטומציות, שיחות) |
| `backup_list` | רשימת גיבויים |
| `backup_restore` | שחזור מגיבוי |

### 🔌 פלגינים (4)
| כלי | תיאור |
|---|---|
| `plugin_catalog` | חיפוש פלגינים זמינים (15 builtin) |
| `plugin_install` | התקנה מקטלוג או יצירת פלגין חדש |
| `plugin_list` | רשימת פלגינים מותקנים |
| `plugin_uninstall` | הסרת פלגין |

### 🔗 Google Services (19) — דורש חיבור OAuth
| כלי | תיאור |
|---|---|
| `google_status` | בדיקת מצב חיבור Google |
| `gmail_list` | רשימת מיילים |
| `gmail_read` | קריאת מייל מלא |
| `gmail_send` | שליחת מייל |
| `gmail_search` | חיפוש Gmail |
| `gmail_mark_read` | סימון כנקרא |
| `drive_list` | הצגת קבצים ב-Drive |
| `drive_search` | חיפוש ב-Drive |
| `drive_get` | קריאת תוכן קובץ |
| `drive_create` | יצירת מסמך/גיליון/קובץ |
| `drive_share` | שיתוף קובץ |
| `google_tasks_list` | רשימת משימות |
| `google_tasks_add` | הוספת משימה |
| `google_tasks_complete` | סימון משימה כהושלמה |
| `google_tasks_delete` | מחיקת משימה |
| `gcal_list` | אירועי Google Calendar |
| `gcal_add` | הוספת אירוע |
| `gcal_delete` | מחיקת אירוע |
| `google_contacts` | חיפוש אנשי קשר Google |

---

## ⚡ פקודות Offline מהירות (14) — עובדות בלי AI

פקודות שעובדות מיד בלי Claude (אפשר לכתוב בעברית):
- **סוללה** / **battery** — מצב סוללה
- **שעה** / **time** — שעה ותאריך נוכחיים
- **התראות** / **notifications** — התראות פעילות
- **לוח** / **clipboard** — תוכן הלוח
- **פנס** / **flashlight** — הדלקת/כיבוי פנס
- **WiFi** — מצב רשת
- **צלם** / **photo** — צילום מהיר
- **הקלט** / **record** — הקלטת אודיו
- **חיישנים** / **sensors** — קריאת חיישנים
- **מיקום** / **location** — GPS
- **אנשי קשר** / **contacts** — רשימת אנשי קשר
- **ווליום** / **volume** — הגברת ווליום
- **אחסון** / **storage** — מצב אחסון
- **זיכרון** / **memory** — שימוש ב-RAM

---

## 🔌 קטלוג פלגינים (15 מוכנים להתקנה)

הסוכן מציע פלגינים אוטומטית כשמבקשים יכולת שאין לו!

| פלגין | תיאור | תלויות |
|---|---|---|
| `weather` | מזג אוויר לכל עיר | curl |
| `translate` | תרגום בין שפות | translate-shell |
| `calculator` | מחשבון מתקדם | bc |
| `crypto_price` | מחיר מטבע קריפטו | curl, jq |
| `ip_info` | כתובת IP ומיקום | curl |
| `speedtest` | מהירות אינטרנט | curl |
| `youtube_download` | הורדת וידאו/אודיו מיוטיוב | python, yt-dlp |
| `pdf_reader` | קריאת טקסט מ-PDF | poppler |
| `ocr` | זיהוי טקסט מתמונות (עברית!) | tesseract |
| `unit_convert` | המרת יחידות | — |
| `password_gen` | יצירת סיסמאות חזקות | — |
| `json_format` | עיצוב ושאילתות JSON | jq |
| `system_info` | מידע מערכת מפורט | — |
| `currency_convert` | המרת מטבעות בזמן אמת | curl, jq |
| `news` | כותרות חדשות | curl |
| `dictionary` | הגדרות מילון אנגלי | curl, jq |

> 💡 **הסוכן יכול גם ליצור פלגינים חדשים מאפס!** פשוט תבקש יכולת שאין — הוא יכתוב פלגין ויתקין לבד.

---

## 🤖 שירותי רקע (פועלים אוטומטית)

| שירות | מה עושה |
|---|---|
| **Observer** | סורק את המכשיר כל 5 דקות ומייצר AI digest יומי |
| **Smart Alerts** | התראות אוטומטיות — סוללה נמוכה, אחסון מלא, ספאם התראות |
| **Proactive Agent** | סיכום בוקר, תזכורת לפגישות (30 דק' לפני), לילה טוב, תזכורות שעבר זמנן |
| **Reminders** | בדיקת תזכורות כל דקה + התראה אוטומטית |
| **Routines** | הרצת פעולות מתוזמנות (יומי/שבועי/שעתי) |

---

## 🌐 מצב Offline (4 שכבות)

| שכבה | מה קורה |
|---|---|
| **פקודות מהירות** | 14 פקודות שעובדות בלי אינטרנט |
| **LLM מקומי** | fallback ל-llama.cpp כש-Claude לא זמין |
| **תור הודעות** | הודעות נשמרות אוטומטית ונשלחות כשחוזר חיבור |
| **PWA** | ממשק המשתמש עובד גם אופליין (Service Worker + cache) |

---

## 🎙️ מצב קולי

- כתוב "**הפעל מצב קולי**" או השתמש בכלי `voice_chat start`
- הסוכן מקשיב → מעבד → מדבר
- לסיום: אמור "**עצור**" או "**stop**"

---

## 💾 גיבוי ושחזור

- **גיבוי**: אמור "תגבה את הנתונים" → שומר זיכרון, תזכורות, אוטומציות, שיחות, פרופיל
- **שמירה** ב-2 מקומות: `~/.ai-agent/backups/` + `/storage/emulated/0/AI-Agent-Backups/`
- **שחזור**: אמור "תשחזר מגיבוי"

---

## 💡 דוגמאות שימוש

| מה לכתוב בצ'אט | מה קורה |
|---|---|
| "כמה סוללה נשארה?" | בודק סוללה |
| "תשלח SMS לאמא שאני מאחר" | שולח הודעה |
| "תזכיר לי בעוד שעה לקנות חלב" | מגדיר תזכורת עם התראה |
| "כל בוקר ב-7 תשלח לי מזג אוויר" | יוצר אוטומציה |
| "תצלם תמונה" | מפעיל מצלמה |
| "תחפש באינטרנט מתי חנויות נפתחות" | חיפוש Google |
| "מה מזג האוויר?" | מתקין פלגין ומציג מזג אוויר |
| "כמה עולה ביטקוין?" | מתקין פלגין קריפטו |
| "תגבה את הנתונים שלי" | גיבוי מלא |
| "הפעל מצב קולי" | מצב שיחה קולית |
| "תראה לי מיילים חדשים" | Gmail (דורש Google) |
| "תמיר 100 דולר לשקלים" | מתקין פלגין המרה |
| 📷 + "מה יש בתמונה?" | ניתוח תמונה |
| 🎤 (כפתור מיקרופון) | דיבור בעברית |

---

> 📄 **מסמך זה נוצר אוטומטית. גרסה אחרונה: April 2026**
