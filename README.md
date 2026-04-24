# 🤖 AI Agent — עוזר אישי חכם לטלפון

אפליקציה שרצה על הטלפון שלך ומאפשרת ל-Claude AI לשלוט במכשיר: ניהול קבצים, הרצת פקודות, שליחת הודעות, צילום תמונות, תזכורות, אוטומציות ועוד.

---

## מדריך התקנה מלא — שלב אחר שלב

### שלב 0: מה צריך לפני

- ✅ טלפון Android
- ✅ מפתח API של Anthropic (Claude) — מ-[console.anthropic.com](https://console.anthropic.com)
- ✅ חיבור אינטרנט

---

### שלב 1: התקן Termux (הטרמינל של הטלפון)

Termux הוא אפליקציית טרמינל Linux לאנדרואיד. **חובה להוריד מ-F-Droid** (לא מ-Google Play — הגרסה שם ישנה ושבורה).

1. **פתח את Chrome בטלפון** ולך ל:
   ```
   https://f-droid.org/packages/com.termux/
   ```

2. **לחץ "Download APK"** והתקן (אם מבקש הרשאה "Install from unknown sources" — אשר)

3. **פתח את Termux** — תראה מסך טרמינל שחור

---

### שלב 2: התקן Termux:API (גישה לחומרה)

זה נותן גישה ל-SMS, מצלמה, GPS, סוללה, התראות ועוד.

1. **ב-Chrome**, לך ל:
   ```
   https://f-droid.org/packages/com.termux.api/
   ```

2. **לחץ "Download APK"** והתקן

3. **חזור ל-Termux** והרץ:
   ```bash
   pkg install termux-api
   ```

4. **תן הרשאות**: לך להגדרות הטלפון → אפליקציות → Termux:API → הרשאות → תן **הכל** (מיקום, מצלמה, אנשי קשר, SMS, וכו')

---

### שלב 3: התקן Node.js ו-Git

ב-Termux, הרץ:

```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git openssh
```

⏱️ זה לוקח 2-5 דקות.

בדוק שהותקן:
```bash
node --version
# אמור להראות v20.x.x או v22.x.x
```

---

### שלב 4: העתק את הפרויקט לטלפון

יש כמה אפשרויות:

#### אפשרות א — USB (הכי פשוט)

1. **חבר את הטלפון למחשב בכבל USB**
2. **על המחשב**, העתק את תיקיית `phone agent` לאחסון הטלפון:
   - Windows: פתח File Explorer → תראה את הטלפון → העתק ל-Internal Storage
   - ישנה את השם ל-`phone-agent` (בלי רווחים)
3. **ב-Termux**, הרץ:
   ```bash
   termux-setup-storage
   ```
   > לחץ "Allow" כשיבקש הרשאת אחסון

4. **העתק לתיקיית הבית:**
   ```bash
   cp -r /storage/emulated/0/phone-agent ~/ai-agent
   ```

#### אפשרות ב — Git Clone (אם העלית ל-GitHub)

```bash
git clone https://github.com/YOUR_USER/ai-agent.git ~/ai-agent
```

#### אפשרות ג — SCP מהמחשב (אם יש רשת משותפת)

על המחשב (PowerShell):
```powershell
# קודם ב-Termux הרץ: sshd (יפתח SSH server על פורט 8022)
# מצא IP של הטלפון: ifconfig wlan0

scp -P 8022 -r "C:\Users\OR\windprojects\phone agent" user@PHONE_IP:~/ai-agent
```

---

### שלב 5: התקן את תלויות הפרויקט

```bash
# Server
cd ~/ai-agent/server
npm install

# Frontend
cd ~/ai-agent/web
npm install
npm run build
```

⏱️ זה לוקח 3-8 דקות (תלוי בטלפון).

---

### שלב 6: הגדר את מפתח ה-API

```bash
cd ~/ai-agent/server
cp .env.example .env
nano .env
```

**ערוך את השורה הראשונה** — שים את מפתח ה-API שלך:
```
ANTHROPIC_API_KEY=sk-ant-api03-YOUR-REAL-KEY-HERE
```

> 💡 **איפה מקבלים מפתח?**
> 1. לך ל-[console.anthropic.com](https://console.anthropic.com)
> 2. הירשם / התחבר
> 3. לך ל-API Keys → Create Key
> 4. העתק את המפתח

**אופציונלי** — אם רוצה לשנות סיסמה:
```
AUTH_TOKEN=your-secret-password
```

**שמור ב-nano**: לחץ `Ctrl+X`, אז `Y`, אז `Enter`

---

### שלב 7: הפעל את השרת!

```bash
cd ~/ai-agent/server
npm run dev
```

אמור להראות:
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
```

---

### שלב 8: פתח את האפליקציה

1. **פתח Chrome בטלפון**
2. **הקלד בשורת הכתובת:**
   ```
   localhost:3002
   ```
3. **תראה את מסך הבית** עם ברכה, סוללה, תזכורות

4. **💡 טיפ:** הוסף לדף הבית:
   - ב-Chrome, לחץ על ⋮ (שלוש נקודות)
   - "Add to Home screen"
   - עכשיו יש אייקון של האפליקציה על דף הבית!

---

## שימוש יומי

### הפעלה (כל פעם שהטלפון נדלק מחדש)

```bash
# פתח Termux
cd ~/ai-agent/server && npm run dev
```

או:
```bash
bash ~/ai-agent/start.sh
```

### הפעלה ברקע (שימשיך לרוץ גם כש-Termux סגור)

```bash
# התקן tmux (פעם אחת)
pkg install tmux

# הפעל בסשן רקע
tmux new -s agent
cd ~/ai-agent/server && npm run dev
# לחץ Ctrl+B ואז D (ניתוק — השרת ממשיך לרוץ)

# לחזור לסשן:
tmux attach -t agent
```

### שהשרת יתחיל אוטומטית כש-Termux נפתח

```bash
echo 'cd ~/ai-agent/server && npm run dev' >> ~/.bashrc
```

---

## מה אפשר לעשות

| פקודה בצ'אט | מה קורה |
|---|---|
| "כמה סוללה נשארה?" | בודק סוללה |
| "תשלח SMS לאמא שאני מאחר" | שולח הודעה |
| "תזכיר לי בעוד שעה לקנות חלב" | מגדיר תזכורת עם התראה |
| "כל בוקר ב-7 תשלח לי מזג אוויר" | יוצר אוטומציה |
| "תראה לי את הקבצים בתיקייה הנוכחית" | מציג קבצים |
| "תצלם תמונה" | מפעיל מצלמה |
| "תחפש באינטרנט..." | חיפוש גוגל |
| 📷 (כפתור תמונה) + "מה יש בתמונה?" | ניתוח תמונות |
| 🎤 (כפתור מיקרופון) | דיבור בעברית |

---

## פתרון בעיות

| בעיה | פתרון |
|---|---|
| `command not found: node` | `pkg install nodejs-lts` |
| `ANTHROPIC_API_KEY not set` | ערוך את `~/ai-agent/server/.env` |
| "Cannot connect" ב-Chrome | ודא שהשרת רץ ב-Termux |
| SMS לא נשלח | ודא ש-Termux:API מותקן + הרשאות SMS |
| מצלמה לא עובדת | הגדרות → Termux:API → הרשאת מצלמה |
| האפליקציה נעצרת ברקע | השתמש ב-tmux (ראה למעלה) |
| `ENOSPC` error | מחק `node_modules` והרץ `npm install` מחדש |

---

## מבנה הפרויקט

```
ai-agent/
├── server/           ← Backend (Node.js + TypeScript)
│   ├── src/
│   │   ├── server.ts       ← שרת ראשי + WebSocket + REST API
│   │   ├── agent/          ← Claude AI agent + offline commands + local LLM
│   │   ├── tools/          ← 81 כלים (קבצים, SMS, Git, Google, voice...)
│   │   ├── services/       ← תזכורות, אוטומציות, גיבוי, voice mode, proactive agent
│   │   └── observer/       ← ניטור רקע + AI insights
│   └── .env                ← הגדרות (API key)
├── web/              ← Frontend (Next.js + PWA)
│   ├── public/
│   │   ├── sw.js           ← Service Worker (offline)
│   │   └── manifest.json   ← PWA manifest
│   └── src/
│       ├── app/            ← דפים (dashboard, chat, files, gallery, settings)
│       ├── components/     ← קומפוננטות UI + offline indicator
│       └── lib/            ← API + WebSocket + message queue
├── scripts/          ← Termux scripts
│   ├── boot/               ← auto-start on boot
│   ├── tasker/             ← Termux:Tasker integration
│   └── widgets/            ← Termux:Widget shortcuts (Hebrew)
├── install.sh        ← סקריפט התקנה
└── start.sh          ← סקריפט הפעלה
```

---

## רשימת יכולות מלאה (81 כלים + 14 פקודות offline)

### כלי AI (81)

| קטגוריה | כלים | כמות |
|---|---|---|
| **קבצים** | read_file, write_file, edit_file, delete_file, list_directory, search_files | 6 |
| **טרמינל** | run_command | 1 |
| **גלריה** | gallery_list, gallery_organize | 2 |
| **תקשורת** | send_sms, get_contacts, send_email, send_telegram, make_call, share_content | 6 |
| **מכשיר** | get_location, take_photo, get_clipboard, get_battery, get_notifications | 5 |
| **WhatsApp** | whatsapp_messages, whatsapp_reply | 2 |
| **מדיה** | media_control, media_volume, media_now_playing, record_audio | 4 |
| **דיאלוג/חיישנים** | show_dialog, get_sensors | 2 |
| **אפליקציות** | open_app, list_apps | 2 |
| **לוח שנה** | calendar_list, calendar_add | 2 |
| **Git** | git_status, git_commit, git_clone | 3 |
| **אינטרנט** | web_search, web_browse | 2 |
| **זיכרון** | memory_set, memory_get, memory_list, memory_delete | 4 |
| **תזכורות** | reminder_add, reminder_list, reminder_complete, reminder_delete | 4 |
| **אוטומציות** | routine_add, routine_list, routine_toggle, routine_delete | 4 |
| **קול** | speech_to_text, text_to_speech, voice_chat | 3 |
| **אחסון** | storage_scan, storage_last_scan, storage_delete_files, storage_clear_cache, storage_delete_empty_folders | 5 |
| **QR/Briefing** | scan_qr_code, smart_briefing | 2 |
| **גיבוי** | backup_create, backup_list, backup_restore | 3 |
| **Google** | google_status, gmail_list, gmail_read, gmail_send, gmail_search, gmail_mark_read, drive_list, drive_search, drive_get, drive_create, drive_share, google_tasks_list, google_tasks_add, google_tasks_complete, google_tasks_delete, gcal_list, gcal_add, gcal_delete, google_contacts | 19 |

### פקודות Offline מהירות (14 — בלי AI)
סוללה, שעה, התראות, clipboard, פנס, WiFi, צלם, הקלט, חיישנים, מיקום, אנשי קשר, ווליום, אחסון, זיכרון

### שירותי רקע
- **Observer** — ניטור מכשיר כל 5 דקות + AI digest יומי
- **Smart Alerts** — סוללה נמוכה, אחסון, ספאם התראות, זיכרון RAM
- **Proactive Agent** — סיכום בוקר אוטומטי, תזכורת לפגישות קרובות, לילה טוב, תזכורות שעבר זמנן
- **Reminders** — תזכורות עם התראות אוטומטיות
- **Routines** — פעולות מתוזמנות (יומי/שבועי/שעתי)

### מצב Offline
- **פקודות מהירות** — 14 פקודות שעובדות בלי AI
- **LLM מקומי** — fallback ל-llama.cpp כש-Claude לא זמין
- **תור הודעות** — הודעות נשמרות ונשלחות אוטומטית כשהחיבור חוזר
- **PWA** — Service Worker + manifest = UI עובד גם offline

### מצב קולי
- **voice_chat start** — לולאה רציפה: הקשבה → עיבוד → דיבור
- **voice_chat stop** / אמירת "עצור" — סיום

### גיבוי ושחזור
- **backup_create** — גיבוי כל הנתונים (זיכרון, תזכורות, אוטומציות, שיחות, פרופיל)
- **backup_list** — רשימת גיבויים
- **backup_restore** — שחזור מגיבוי
- שמירה פנימית (`~/.ai-agent/backups/`) + חיצונית (`/storage/emulated/0/AI-Agent-Backups/`)
