'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, Mic, MicOff, Volume2, VolumeX, Sparkles, Phone, Radio, Server, Monitor } from 'lucide-react';
import { AgentWebSocket, WSEvent } from '@/lib/websocket';
import { getVoiceDaemonStatus, startVoiceDaemon, stopVoiceDaemon, activateVoiceDaemon, VoiceDaemonStatus } from '@/lib/api';

type LiveState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'background';

function getWsUrl() {
  if (typeof window === 'undefined') return 'ws://localhost:3002/ws';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return process.env.NEXT_PUBLIC_WS_URL || `${proto}//${window.location.host}/ws`;
}
const AUTH_TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'dev-token';

// ===== KEEPALIVE: silent audio to prevent browser from sleeping =====
function createKeepaliveAudio(): HTMLAudioElement | null {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.001; // Nearly silent
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();

    // Also create a looping silent audio element as fallback
    const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    audio.loop = true;
    audio.volume = 0.01;
    return audio;
  } catch {
    return null;
  }
}

// ===== WAKE LOCK: prevent screen from turning off =====
async function requestWakeLock(): Promise<any> {
  try {
    if ('wakeLock' in navigator) {
      return await (navigator as any).wakeLock.request('screen');
    }
  } catch {}
  return null;
}

// ===== PULSING ORB =====
function PulsingOrb({ state }: { state: LiveState }) {
  const colors: Record<LiveState, string> = {
    idle: 'from-zinc-700 to-zinc-800',
    listening: 'from-violet-500 to-purple-600',
    thinking: 'from-cyan-500 to-blue-600',
    speaking: 'from-emerald-500 to-green-600',
    background: 'from-amber-500 to-orange-600',
  };

  const shadows: Record<LiveState, string> = {
    idle: 'shadow-zinc-700/20',
    listening: 'shadow-violet-500/40',
    thinking: 'shadow-cyan-500/40',
    speaking: 'shadow-emerald-500/40',
    background: 'shadow-amber-500/40',
  };

  const scales: Record<LiveState, string> = {
    idle: 'scale-100',
    listening: 'scale-110',
    thinking: 'scale-105',
    speaking: 'scale-115',
    background: 'scale-100',
  };

  return (
    <div className="relative flex items-center justify-center">
      {state !== 'idle' && (
        <>
          <div className={`absolute w-48 h-48 rounded-full bg-gradient-to-br ${colors[state]} opacity-10 animate-ping`} />
          <div className={`absolute w-40 h-40 rounded-full bg-gradient-to-br ${colors[state]} opacity-15 animate-pulse`} />
        </>
      )}
      <div
        className={`w-32 h-32 rounded-full bg-gradient-to-br ${colors[state]} ${shadows[state]} shadow-2xl flex items-center justify-center transition-all duration-500 ${scales[state]}`}
      >
        {state === 'listening' && <Mic size={40} className="text-white animate-pulse" />}
        {state === 'thinking' && <Sparkles size={40} className="text-white animate-spin" style={{ animationDuration: '3s' }} />}
        {state === 'speaking' && <Volume2 size={40} className="text-white animate-pulse" />}
        {state === 'background' && <Radio size={40} className="text-white animate-pulse" />}
        {state === 'idle' && <Mic size={40} className="text-zinc-400" />}
      </div>
    </div>
  );
}

// ===== TRANSCRIPT DISPLAY =====
function TranscriptDisplay({ lines }: { lines: { role: 'user' | 'assistant' | 'system'; text: string }[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 scrollbar-hide">
      {lines.map((line, i) => (
        <div
          key={i}
          className={`text-sm leading-relaxed animate-fade-in ${
            line.role === 'user'
              ? 'text-zinc-300 text-right'
              : line.role === 'system'
              ? 'text-amber-400/70 text-center text-xs'
              : 'text-white font-medium text-right'
          }`}
        >
          {line.role !== 'system' && (
            <span className="text-[10px] text-zinc-500 block mb-0.5">
              {line.role === 'user' ? 'אתה' : 'Merlin'}
            </span>
          )}
          {line.text}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

// ===== STATUS TEXT =====
function StatusText({ state, backgroundSeconds }: { state: LiveState; backgroundSeconds: number }) {
  const labels: Record<LiveState, string> = {
    idle: 'לחץ על המיקרופון להתחיל',
    listening: 'מקשיב...',
    thinking: 'חושב...',
    speaking: 'מדבר...',
    background: `פעיל ברקע · ${Math.floor(backgroundSeconds / 60)}:${String(backgroundSeconds % 60).padStart(2, '0')}`,
  };
  return (
    <div className="text-center text-sm text-zinc-400 font-medium">
      {labels[state]}
    </div>
  );
}

// ===== MAIN LIVE MODE =====
export default function LiveMode() {
  const router = useRouter();
  const [state, setState] = useState<LiveState>('idle');
  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<{ role: 'user' | 'assistant' | 'system'; text: string }[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [sessionDuration, setSessionDuration] = useState(0);
  const [bgSeconds, setBgSeconds] = useState(0);
  const [daemonMode, setDaemonMode] = useState(false); // true = server-side daemon
  const [daemonStatus, setDaemonStatus] = useState<VoiceDaemonStatus | null>(null);

  const wsRef = useRef<AgentWebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activeRef = useRef(false);
  const assistantBufferRef = useRef('');
  const spokenIndexRef = useRef(0); // tracks how much text we've already spoken
  const wakeLockRef = useRef<any>(null);
  const keepaliveRef = useRef<HTMLAudioElement | null>(null);
  const stateBeforeBgRef = useRef<LiveState>('listening');
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingResumeRef = useRef(false);

  const hasSpeechAPI = typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  // ===== CONNECT WEBSOCKET =====
  useEffect(() => {
    const selectedModel = typeof window !== 'undefined'
      ? localStorage.getItem('ai_model') || 'claude-sonnet-4-20250514'
      : 'claude-sonnet-4-20250514';
    const wsUrl = `${getWsUrl()}?model=${encodeURIComponent(selectedModel)}`;
    const ws = new AgentWebSocket(wsUrl, AUTH_TOKEN);

    ws.on('text_delta', (event: WSEvent) => {
      const text = event.payload.text as string;
      assistantBufferRef.current += text;
      setCurrentText(assistantBufferRef.current);

      // Streaming TTS: speak each sentence as it arrives
      const buf = assistantBufferRef.current;
      const spoken = spokenIndexRef.current;
      const unspoken = buf.substring(spoken);
      // Look for sentence boundaries
      const sentenceEnd = unspoken.search(/[.!?\n]\s|[.!?\n]$/);
      if (sentenceEnd >= 0) {
        const sentence = unspoken.substring(0, sentenceEnd + 1).trim();
        if (sentence.length > 2) {
          spokenIndexRef.current = spoken + sentenceEnd + 1;
          speakChunk(sentence);
        }
      }
    });

    ws.on('message_done', () => {
      const fullResponse = assistantBufferRef.current;
      // Speak any remaining unspoken text
      const remaining = fullResponse.substring(spokenIndexRef.current).trim();
      if (remaining.length > 2) {
        speakChunk(remaining);
      }
      if (fullResponse.trim()) {
        setTranscript(prev => [...prev, { role: 'assistant', text: fullResponse.trim() }]);
      }
      assistantBufferRef.current = '';
      spokenIndexRef.current = 0;
      setCurrentText('');
      // Signal TTS queue that response is complete — resume listening after last chunk
      isDoneRef.current = true;
      // If nothing queued to speak, resume listening now
      if (!ttsSpeakingRef.current && ttsQueueRef.current.length === 0) {
        if (activeRef.current) {
          setState('listening');
          setTimeout(() => startListening(), 300);
        }
      }
    });

    // Auto-approve dangerous tools in live mode
    ws.on('approval_request' as any, (event: WSEvent) => {
      const id = event.payload.id as string;
      ws.send('approval_response', { id, approved: true });
    });

    ws.on('error', () => {
      // Don't stop the session on error — just resume listening
      if (activeRef.current) {
        setState('listening');
        setTimeout(() => startListening(), 500);
      }
    });

    // Listen for daemon events from server
    ws.on('*', (event: WSEvent) => {
      if ((event.type as string) === 'voice_daemon') {
        const data = event.payload as any;
        if (data.event === 'user_speech' && data.text) {
          setTranscript(prev => [...prev, { role: 'user', text: data.text }]);
        } else if (data.event === 'response' && data.text) {
          setTranscript(prev => [...prev, { role: 'assistant', text: data.text }]);
        } else if (data.event === 'mode_changed') {
          setDaemonStatus(prev => prev ? { ...prev, mode: data.mode } : null);
          if (data.mode === 'active') setState('listening');
          else if (data.mode === 'wake_word') setState('idle');
          else if (data.mode === 'sleep') setState('idle');
        } else if (data.event === 'listening') {
          setState('listening');
        } else if (data.event === 'thinking') {
          setState('thinking');
        } else if (data.event === 'speaking') {
          setState('speaking');
        }
      }
    });

    ws.connect();
    wsRef.current = ws;

    // Poll daemon status on mount
    getVoiceDaemonStatus().then(s => setDaemonStatus(s)).catch(() => {});

    return () => {
      ws.disconnect();
    };
  }, []);

  // ===== VISIBILITY CHANGE: auto-resume on return =====
  useEffect(() => {
    const handleVisibility = () => {
      if (!activeRef.current) return;

      if (document.hidden) {
        // Going to background — save state
        stateBeforeBgRef.current = state === 'idle' ? 'listening' : state;
        setState('background');
        // Stop STT (browser will kill it anyway)
        try { recognitionRef.current?.abort(); } catch {}
        recognitionRef.current = null;
      } else {
        // Coming back! Resume immediately
        pendingResumeRef.current = true;
        setTranscript(prev => [...prev, { role: 'system', text: '🔄 חזרתי — ממשיך להקשיב...' }]);

        // Re-acquire wake lock (it gets released on hide)
        requestWakeLock().then(lock => { wakeLockRef.current = lock; });

        // Resume based on what was happening
        const prevState = stateBeforeBgRef.current;
        if (prevState === 'thinking') {
          // Agent was processing — just wait for message_done
          setState('thinking');
        } else {
          // Resume listening
          setState('listening');
          setTimeout(() => startListening(), 400);
        }
        pendingResumeRef.current = false;
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [state]);

  // ===== SESSION TIMER =====
  useEffect(() => {
    if (active) {
      setSessionDuration(0);
      setBgSeconds(0);
      sessionTimerRef.current = setInterval(() => {
        setSessionDuration(prev => prev + 1);
        if (document.hidden) setBgSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
    }
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
  }, [active]);

  // ===== TTS =====
  const ttsQueueRef = useRef<string[]>([]);
  const ttsSpeakingRef = useRef(false);
  const isDoneRef = useRef(false);

  const processNextChunk = useCallback(() => {
    if (ttsQueueRef.current.length === 0) {
      ttsSpeakingRef.current = false;
      // All chunks spoken — resume listening
      if (isDoneRef.current && activeRef.current) {
        isDoneRef.current = false;
        setState('listening');
        setTimeout(() => startListening(), 300);
      }
      return;
    }

    ttsSpeakingRef.current = true;
    const chunk = ttsQueueRef.current.shift()!;
    const clean = chunk
      .replace(/[#*_`~\[\]()]/g, '')
      .replace(/\n+/g, '. ')
      .replace(/https?:\/\/\S+/g, 'קישור')
      .substring(0, 400);

    if (clean.length < 2) { processNextChunk(); return; }

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'he-IL';
    utterance.rate = 1.1;
    utterance.pitch = 1;

    const voices = speechSynthesis.getVoices();
    const heVoice = voices.find(v => v.lang.startsWith('he'));
    if (heVoice) utterance.voice = heVoice;

    utterance.onend = () => processNextChunk();
    utterance.onerror = () => processNextChunk();

    synthRef.current = utterance;
    speechSynthesis.speak(utterance);
  }, []);

  // Streaming TTS: queue a chunk to speak
  const speakChunk = useCallback((text: string) => {
    if (muted) return;
    setState('speaking');
    ttsQueueRef.current.push(text);
    if (!ttsSpeakingRef.current) {
      processNextChunk();
    }
  }, [muted, processNextChunk]);

  // Legacy full-text TTS (used for non-streaming cases)
  const speakText = useCallback((text: string) => {
    if (muted) {
      if (activeRef.current) {
        setState('listening');
        setTimeout(() => startListening(), 200);
      }
      return;
    }

    setState('speaking');
    isDoneRef.current = true;
    ttsQueueRef.current = [];
    speechSynthesis.cancel();

    const clean = text
      .replace(/[#*_`~\[\]()]/g, '')
      .replace(/\n+/g, '. ')
      .replace(/https?:\/\/\S+/g, 'קישור')
      .substring(0, 600);

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'he-IL';
    utterance.rate = 1.1;
    utterance.pitch = 1;

    const voices = speechSynthesis.getVoices();
    const heVoice = voices.find(v => v.lang.startsWith('he'));
    if (heVoice) utterance.voice = heVoice;

    utterance.onend = () => {
      if (activeRef.current) {
        setState('listening');
        setTimeout(() => startListening(), 300);
      } else {
        setState('idle');
      }
    };

    utterance.onerror = () => {
      if (activeRef.current) {
        setState('listening');
        setTimeout(() => startListening(), 300);
      } else {
        setState('idle');
      }
    };

    synthRef.current = utterance;
    speechSynthesis.speak(utterance);
  }, [muted]);

  // ===== STT =====
  const startListening = useCallback(() => {
    if (!hasSpeechAPI || !activeRef.current) return;
    // Don't start if page is hidden
    if (document.hidden) return;

    setState('listening');

    // Abort any existing recognition
    try { recognitionRef.current?.abort(); } catch {}

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'he-IL';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';
    let hasResult = false;

    recognition.onresult = (event: any) => {
      let interim = '';
      finalTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      hasResult = true;
      setCurrentText(finalTranscript || interim);
    };

    recognition.onend = () => {
      const text = finalTranscript.trim();
      setCurrentText('');

      if (!activeRef.current) return;

      // If page went to background during recognition
      if (document.hidden) {
        setState('background');
        return;
      }

      if (!text || !hasResult) {
        if (activeRef.current) {
          setTimeout(() => startListening(), 500);
        }
        return;
      }

      // Check stop words
      const lower = text.toLowerCase();
      const stopWords = ['עצור', 'stop', 'הפסק', 'סטופ', 'ביי', 'סיים'];
      if (stopWords.some(w => lower.includes(w))) {
        endSession();
        return;
      }

      setTranscript(prev => [...prev, { role: 'user', text }]);
      setState('thinking');
      stateBeforeBgRef.current = 'thinking';
      wsRef.current?.sendMessage(text);
    };

    recognition.onerror = (event: any) => {
      if (!activeRef.current) return;

      if (document.hidden) {
        setState('background');
        return;
      }

      if (event.error === 'no-speech') {
        setTimeout(() => startListening(), 500);
      } else if (event.error === 'aborted' || event.error === 'not-allowed') {
        // Page went to background or permission issue — will resume on visibility change
      } else {
        setTimeout(() => startListening(), 1000);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // Already started or other error — retry
      setTimeout(() => startListening(), 500);
    }
  }, [hasSpeechAPI]);

  // ===== SESSION CONTROL =====
  const startSession = useCallback(() => {
    setActive(true);
    activeRef.current = true;
    setTranscript([{ role: 'system', text: '🎙️ מצב Live פעיל — דבר אליי מכל מקום' }]);
    assistantBufferRef.current = '';

    // Acquire Wake Lock
    requestWakeLock().then(lock => { wakeLockRef.current = lock; });

    // Start keepalive audio (prevents browser from sleeping)
    const audio = createKeepaliveAudio();
    if (audio) {
      audio.play().catch(() => {});
      keepaliveRef.current = audio;
    }

    // DON'T clear WS history — keep full context and memory!
    // wsRef.current?.clearHistory();

    // Tell server we're in live mode (auto-approve dangerous tools)
    wsRef.current?.send('set_live_mode', { enabled: true });

    setTimeout(() => startListening(), 300);
  }, [startListening]);

  const endSession = useCallback(() => {
    setActive(false);
    activeRef.current = false;
    setState('idle');

    // Stop recognition
    try { recognitionRef.current?.abort(); } catch {}
    recognitionRef.current = null;

    // Stop TTS
    speechSynthesis.cancel();

    // Tell server we're no longer in live mode
    wsRef.current?.send('set_live_mode', { enabled: false });

    // Release Wake Lock
    try { wakeLockRef.current?.release(); } catch {}
    wakeLockRef.current = null;

    // Stop keepalive
    try {
      keepaliveRef.current?.pause();
      keepaliveRef.current = null;
    } catch {}

    setTranscript(prev => [...prev, {
      role: 'system',
      text: `✅ סיום — ${Math.floor(sessionDuration / 60)} דק', ${transcript.filter(t => t.role === 'user').length} פקודות`
    }]);
  }, [sessionDuration, transcript]);

  const toggleSession = () => {
    if (active) endSession();
    else startSession();
  };

  const interrupt = () => {
    speechSynthesis.cancel();
    assistantBufferRef.current = '';
    setCurrentText('');
    if (active) {
      setState('listening');
      setTimeout(() => startListening(), 200);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      try { recognitionRef.current?.abort(); } catch {}
      speechSynthesis.cancel();
      try { wakeLockRef.current?.release(); } catch {}
      try { keepaliveRef.current?.pause(); } catch {}
    };
  }, []);

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-4 shrink-0">
        <button
          onClick={() => { endSession(); router.back(); }}
          className="w-10 h-10 rounded-full bg-zinc-800/80 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--primary)]" />
            <span className="text-sm font-semibold text-white">Merlin Live</span>
            {active && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
          </div>
          {active && (
            <span className="text-[10px] text-zinc-500 tabular-nums">{formatDuration(sessionDuration)}</span>
          )}
        </div>
        <button
          onClick={() => setMuted(!muted)}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            muted ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
          }`}
        >
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </div>

      {/* Mode toggle: Browser vs Daemon */}
      <div className="mx-5 mb-2 flex gap-2">
        <button
          onClick={() => {
            if (daemonMode) {
              // Switch to browser mode, stop daemon
              stopVoiceDaemon().then(r => setDaemonStatus(r.status)).catch(() => {});
              setDaemonMode(false);
            }
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all ${
            !daemonMode ? 'bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/30' : 'bg-zinc-800/50 text-zinc-500'
          }`}
        >
          <Monitor size={14} /> דפדפן
        </button>
        <button
          onClick={async () => {
            setDaemonMode(true);
            // Stop browser session if active
            if (active) endSession();
            // Start daemon
            try {
              const r = await startVoiceDaemon('active');
              setDaemonStatus(r.status);
              setTranscript(prev => [...prev, { role: 'system', text: '🖥️ עברתי למצב Daemon — עובד ברקע גם ללא דפדפן' }]);
              setActive(true);
              activeRef.current = true;
            } catch { }
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all ${
            daemonMode ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800/50 text-zinc-500'
          }`}
        >
          <Server size={14} /> Daemon (ללא ידיים)
        </button>
      </div>

      {/* Daemon status */}
      {daemonMode && daemonStatus?.active && (
        <div className="mx-5 mb-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs text-center">
          🖥️ Daemon פעיל — {daemonStatus.mode === 'active' ? 'מקשיב' : 'ממתין ל-"היי מרלין"'} · {daemonStatus.totalCommands} פקודות
        </div>
      )}

      {/* Background mode banner */}
      {state === 'background' && !daemonMode && (
        <div className="mx-5 mb-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs text-center animate-pulse">
          ⏳ Merlin פעיל ברקע — חזור לחלון כדי להמשיך לדבר
        </div>
      )}

      {/* Transcript */}
      <TranscriptDisplay lines={transcript} />

      {/* Current streaming text */}
      {currentText && (
        <div className="px-6 py-2 text-sm text-zinc-500 text-right animate-fade-in">
          {currentText.length > 150 ? currentText.substring(0, 150) + '...' : currentText}
        </div>
      )}

      {/* Orb + Controls */}
      <div className="flex flex-col items-center gap-6 pb-12 pt-6 shrink-0">
        <StatusText state={state} backgroundSeconds={bgSeconds} />

        <button
          onClick={state === 'speaking' ? interrupt : toggleSession}
          className="focus:outline-none active:scale-95 transition-transform"
        >
          <PulsingOrb state={state} />
        </button>

        {/* Bottom controls */}
        <div className="flex items-center gap-6">
          {active && (
            <button
              onClick={endSession}
              className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-90 transition-transform"
            >
              <Phone size={22} className="text-white rotate-[135deg]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
