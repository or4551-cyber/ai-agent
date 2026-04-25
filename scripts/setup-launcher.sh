#!/data/data/com.termux/files/usr/bin/bash
# Setup Merlin as Android Home Screen (PWA Launcher)
# Run this once after installation

PORT="${AI_AGENT_PORT:-3002}"
URL="http://localhost:${PORT}"

echo "🧙 Merlin Launcher Setup"
echo "========================"
echo ""
echo "שלב 1: פותח את Merlin בדפדפן..."
termux-open-url "$URL"
echo ""
echo "שלב 2: בצע את הפעולות הבאות ב-Chrome:"
echo "  1. לחץ על ⋮ (תפריט שלוש נקודות)"
echo "  2. בחר 'Add to Home Screen' או 'Install app'"
echo "  3. לחץ 'Install'"
echo ""
echo "שלב 3: הגדר כמסך בית:"
echo "  1. לחץ על כפתור Home"
echo "  2. בחר 'Merlin' מהרשימה"
echo "  3. סמן 'Always' (תמיד)"
echo ""
echo "✅ מעכשיו Merlin הוא מסך הבית שלך!"
echo ""
echo "💡 טיפ: אם רוצה לחזור ל-Launcher הרגיל:"
echo "   הגדרות → אפליקציות → ברירת מחדל → Home → בחר אחר"
