'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, FolderOpen, Camera, MessageSquare, Battery, Globe,
  Mail, GitBranch, Clock, Brain, HardDrive, Mic, Bell,
  Smartphone, Calendar, MessageCircle, ChevronDown, ChevronUp,
  ArrowRight, Copy, Check, Music, QrCode, Volume2,
} from 'lucide-react';

interface Category {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  examples: { text: string; description: string }[];
}

const CATEGORIES: Category[] = [
  {
    icon: <FolderOpen size={20} />,
    title: 'קבצים ותיקיות',
    description: 'קריאה, כתיבה, עריכה, מחיקה, חיפוש וניהול קבצים',
    color: 'text-blue-400',
    examples: [
      { text: 'תראה לי מה יש בתיקיית ההורדות', description: 'רשימת קבצים בתיקייה' },
      { text: 'חפש קבצי PDF בטלפון', description: 'חיפוש לפי סוג קובץ' },
      { text: 'תיצור קובץ חדש בשם notes.txt עם הטקסט: רשימת קניות', description: 'יצירת קובץ' },
    ],
  },
  {
    icon: <Camera size={20} />,
    title: 'מצלמה וגלריה',
    description: 'צילום תמונות, צפייה בגלריה וארגון תמונות',
    color: 'text-emerald-400',
    examples: [
      { text: 'תצלם תמונה', description: 'מפעיל את המצלמה' },
      { text: 'תראה לי את התמונות האחרונות', description: 'גלריה ממוינת לפי תאריך' },
      { text: 'תארגן את התמונות לפי חודש', description: 'ארגון אוטומטי' },
    ],
  },
  {
    icon: <MessageSquare size={20} />,
    title: 'הודעות ושיחות',
    description: 'שליחת SMS, צפייה באנשי קשר, בדיקת שיחות',
    color: 'text-green-400',
    examples: [
      { text: 'תראה לי את אנשי הקשר שלי', description: 'רשימת אנשי קשר' },
      { text: 'תשלח SMS ליוסי: אני מאחר 10 דקות', description: 'שליחת הודעה' },
      { text: 'מי התקשר אלי היום?', description: 'בדיקת שיחות אחרונות' },
    ],
  },
  {
    icon: <MessageCircle size={20} />,
    title: 'WhatsApp',
    description: 'קריאת הודעות ווטסאפ ומענה ישיר',
    color: 'text-green-500',
    examples: [
      { text: 'מה כתבו לי בווטסאפ?', description: 'הודעות ווטסאפ אחרונות' },
      { text: 'תענה ליוסי בווטסאפ: אני בדרך', description: 'מענה להודעה' },
    ],
  },
  {
    icon: <Smartphone size={20} />,
    title: 'אפליקציות',
    description: 'פתיחת אפליקציות וניהול',
    color: 'text-pink-400',
    examples: [
      { text: 'תפתח ווטסאפ', description: 'פתיחת אפליקציה' },
      { text: 'תפתח ספוטיפיי', description: 'מוזיקה' },
      { text: 'תראה לי אילו אפליקציות מותקנות', description: 'רשימת אפליקציות' },
    ],
  },
  {
    icon: <Calendar size={20} />,
    title: 'לוח שנה',
    description: 'צפייה באירועים ויצירת אירועים חדשים',
    color: 'text-orange-400',
    examples: [
      { text: 'מה יש לי היום ביומן?', description: 'אירועים להיום' },
      { text: 'תוסיף לי פגישה מחר ב-10:00 עם דני', description: 'יצירת אירוע' },
    ],
  },
  {
    icon: <Battery size={20} />,
    title: 'מידע מכשיר',
    description: 'סוללה, מיקום, התראות, clipboard',
    color: 'text-amber-400',
    examples: [
      { text: 'כמה סוללה נשארה?', description: 'מצב סוללה' },
      { text: 'איפה אני נמצא?', description: 'מיקום GPS' },
      { text: 'מה ההתראות האחרונות?', description: 'התראות מכל האפליקציות' },
    ],
  },
  {
    icon: <Globe size={20} />,
    title: 'אינטרנט',
    description: 'חיפוש באינטרנט וגלישה באתרים',
    color: 'text-cyan-400',
    examples: [
      { text: 'חפש באינטרנט: מזג אוויר תל אביב', description: 'חיפוש גוגל' },
      { text: 'תקרא את האתר ynet.co.il', description: 'קריאת תוכן אתר' },
    ],
  },
  {
    icon: <Mail size={20} />,
    title: 'תקשורת',
    description: 'שליחת מיילים והודעות טלגרם',
    color: 'text-violet-400',
    examples: [
      { text: 'תשלח מייל לboss@company.com עם הנושא: דו"ח שבועי', description: 'שליחת אימייל' },
      { text: 'תשלח בטלגרם: הפגישה הוזזה לשעה 3', description: 'הודעת טלגרם' },
    ],
  },
  {
    icon: <GitBranch size={20} />,
    title: 'Git',
    description: 'ניהול קוד — clone, commit, push, status',
    color: 'text-red-400',
    examples: [
      { text: 'תראה לי את הסטטוס של ~/project', description: 'Git status' },
      { text: 'תעשה commit עם ההודעה: fix login bug', description: 'Git commit + push' },
    ],
  },
  {
    icon: <Clock size={20} />,
    title: 'תזכורות ואוטומציות',
    description: 'תזכורות עם התראות ופעולות מתוזמנות',
    color: 'text-teal-400',
    examples: [
      { text: 'תזכיר לי לקנות חלב מחר ב-18:00', description: 'תזכורת עתידית' },
      { text: 'תיצור אוטומציה: כל יום ב-8 בוקר תגיד לי בוקר טוב עם מזג אוויר', description: 'פעולה מתוזמנת' },
      { text: 'מה התזכורות שלי?', description: 'רשימת תזכורות' },
    ],
  },
  {
    icon: <Brain size={20} />,
    title: 'זיכרון ולמידה',
    description: 'שמירת מידע לטווח ארוך, זכירת העדפות',
    color: 'text-purple-400',
    examples: [
      { text: 'תזכור שהמייל שלי הוא or@gmail.com', description: 'שמירה לזיכרון' },
      { text: 'מה אתה זוכר עליי?', description: 'הצגת זיכרונות' },
    ],
  },
  {
    icon: <HardDrive size={20} />,
    title: 'ניהול אחסון',
    description: 'סריקה עמוקה, ניקוי cache, מחיקת כפולים',
    color: 'text-amber-500',
    examples: [
      { text: 'תסרוק את האחסון ותגיד לי מה אפשר למחוק', description: 'סריקה מלאה' },
      { text: 'תנקה את כל ה-cache', description: 'ניקוי מהיר' },
    ],
  },
  {
    icon: <Music size={20} />,
    title: 'שליטה במדיה',
    description: 'play/pause, שיר הבא/קודם, ווליום, מה מנגן',
    color: 'text-indigo-400',
    examples: [
      { text: 'תעצור את המוזיקה', description: 'pause' },
      { text: 'שיר הבא', description: 'next track' },
      { text: 'תעלה ווליום', description: 'volume up' },
      { text: 'מה מנגן עכשיו?', description: 'now playing' },
    ],
  },
  {
    icon: <QrCode size={20} />,
    title: 'סריקת QR',
    description: 'סריקת ברקודים ו-QR codes',
    color: 'text-lime-400',
    examples: [
      { text: 'תסרוק QR code', description: 'צילום + סריקה' },
      { text: 'תסרוק את הברקוד בתמונה הזו', description: 'סריקה מתמונה קיימת' },
    ],
  },
  {
    icon: <Mic size={20} />,
    title: 'קול',
    description: 'דיבור לטקסט והקראה בקול',
    color: 'text-rose-400',
    examples: [
      { text: 'תקשיב למה שאני אומר', description: 'הפעלת מיקרופון' },
      { text: 'תקריא: שלום, מה שלומך היום?', description: 'הקראה בקול' },
    ],
  },
  {
    icon: <Bell size={20} />,
    title: 'התראות חכמות',
    description: 'סוללה נמוכה, אחסון מלא, ספאם התראות',
    color: 'text-yellow-400',
    examples: [
      { text: 'מה ההתראות החכמות?', description: 'התראות שזוהו אוטומטית' },
    ],
  },
  {
    icon: <Sparkles size={20} />,
    title: 'סיכום חכם',
    description: 'סוללה + יומן + הודעות + אחסון + תזכורות במכה אחת',
    color: 'text-cyan-400',
    examples: [
      { text: 'תן לי סיכום של המצב', description: 'סיכום בוקר מלא' },
      { text: 'מה המצב היום?', description: 'סטטוס מהיר' },
    ],
  },
  {
    icon: <Smartphone size={20} />,
    title: 'שלט רחוק',
    description: 'שליטה בטלפון: WiFi, פנס, ווליום, בהירות, מדיה',
    color: 'text-teal-400',
    examples: [
      { text: 'תדליק את הפנס', description: 'פנס' },
      { text: 'תכבה WiFi', description: 'מתג WiFi' },
      { text: 'תצלם מסך', description: 'צילום מסך' },
    ],
  },
];

export default function CapabilitiesPage() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const router = useRouter();

  const sendToChat = (text: string) => {
    // Store the command and navigate to chat
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pending_command', text);
    }
    router.push('/chat');
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 bg-gradient-to-b from-purple-500/10 to-transparent">
        <h1 className="text-xl font-bold flex items-center gap-2 tracking-tight">
          <Sparkles size={22} className="text-purple-400" /> מה אני יכול לעשות?
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          לחץ על קטגוריה כדי לראות דוגמאות. לחץ על דוגמה כדי לשלוח לצ'אט.
        </p>
      </div>

      {/* Categories */}
      <div className="p-4 space-y-2.5 pb-8">
        {CATEGORIES.map((cat, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden transition-all"
          >
            {/* Category header */}
            <button
              onClick={() => setExpanded(expanded === i ? null : i)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--muted)] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className={cat.color}>{cat.icon}</div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{cat.title}</div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">{cat.description}</div>
                </div>
              </div>
              {expanded === i ? <ChevronUp size={16} className="text-[var(--muted-foreground)] shrink-0" /> : <ChevronDown size={16} className="text-[var(--muted-foreground)] shrink-0" />}
            </button>

            {/* Examples */}
            {expanded === i && (
              <div className="px-3 pb-3 space-y-1.5 animate-fade-in">
                {cat.examples.map((ex, j) => (
                  <div
                    key={j}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--muted)] group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{ex.text}</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">{ex.description}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => copyText(ex.text)}
                        className="p-1.5 rounded-lg hover:bg-[var(--border)] text-[var(--muted-foreground)] transition-all"
                        title="העתק"
                      >
                        {copied === ex.text ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                      </button>
                      <button
                        onClick={() => sendToChat(ex.text)}
                        className="p-1.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-all"
                        title="שלח לצ'אט"
                      >
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
