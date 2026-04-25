'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, Mic, MicOff, Volume2, VolumeX, Sparkles, Phone } from 'lucide-react';
import { AgentWebSocket, WSEvent } from '@/lib/websocket';

type LiveState = 'idle' | 'listening' | 'thinking' | 'speaking';

function getWsUrl() {
  if (typeof window === 'undefined') return 'ws://localhost:3002/ws';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return process.env.NEXT_PUBLIC_WS_URL || `${proto}//${window.location.host}/ws`;
}
const AUTH_TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'dev-token';

// ===== PULSING ORB =====
function PulsingOrb({ state }: { state: LiveState }) {
  const colors: Record<LiveState, string> = {
    idle: 'from-zinc-700 to-zinc-800',
    listening: 'from-violet-500 to-purple-600',
    thinking: 'from-cyan-500 to-blue-600',
    speaking: 'from-emerald-500 to-green-600',
  };

  const shadows: Record<LiveState, string> = {
    idle: 'shadow-zinc-700/20',
    listening: 'shadow-violet-500/40',
    thinking: 'shadow-cyan-500/40',
    speaking: 'shadow-emerald-500/40',
  };

  const scales: Record<LiveState, string> = {
    idle: 'scale-100',
    listening: 'scale-110',
    thinking: 'scale-105',
    speaking: 'scale-115',
  };

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer ring pulse */}
      {state !== 'idle' && (
        <>
          <div className={`absolute w-48 h-48 rounded-full bg-gradient-to-br ${colors[state]} opacity-10 animate-ping`} />
          <div className={`absolute w-40 h-40 rounded-full bg-gradient-to-br ${colors[state]} opacity-15 animate-pulse`} />
        </>
      )}
      {/* Main orb */}
      <div
        className={`w-32 h-32 rounded-full bg-gradient-to-br ${colors[state]} ${shadows[state]} shadow-2xl flex items-center justify-center transition-all duration-500 ${scales[state]}`}
      >
        {state === 'listening' && <Mic size={40} className="text-white animate-pulse" />}
        {state === 'thinking' && <Sparkles size={40} className="text-white animate-spin" style={{ animationDuration: '3s' }} />}
        {state === 'speaking' && <Volume2 size={40} className="text-white animate-pulse" />}
        {state === 'idle' && <Mic size={40} className="text-zinc-400" />}
      </div>
    </div>
  );
}

// ===== TRANSCRIPT DISPLAY =====
function TranscriptDisplay({ lines }: { lines: { role: 'user' | 'assistant'; text: string }[] }) {
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
              : 'text-white font-medium text-right'
          }`}
        >
          <span className="text-[10px] text-zinc-500 block mb-0.5">
            {line.role === 'user' ? 'אתה' : 'Merlin'}
          </span>
          {line.text}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

// ===== STATUS TEXT =====
function StatusText({ state }: { state: LiveState }) {
  const labels: Record<LiveState, string> = {
    idle: 'לחץ על המיקרופון להתחיל',
    listening: 'מקשיב...',
    thinking: 'חושב...',
    speaking: 'מדבר...',
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
  const [transcript, setTranscript] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [currentText, setCurrentText] = useState('');

  const wsRef = useRef<AgentWebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activeRef = useRef(false);
  const assistantBufferRef = useRef('');

  const hasSpeechAPI = typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  // Connect WebSocket
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
    });

    ws.on('message_done', () => {
      const fullResponse = assistantBufferRef.current;
      if (fullResponse.trim()) {
        setTranscript(prev => [...prev, { role: 'assistant', text: fullResponse.trim() }]);
        // Speak the response
        speakText(fullResponse.trim());
      }
      assistantBufferRef.current = '';
      setCurrentText('');
    });

    ws.on('error', () => {
      setState('idle');
    });

    ws.connect();
    wsRef.current = ws;

    return () => {
      ws.disconnect();
    };
  }, []);

  // ===== TTS =====
  const speakText = useCallback((text: string) => {
    if (muted) {
      // Skip TTS, go back to listening
      if (activeRef.current) startListening();
      return;
    }

    setState('speaking');

    // Clean text for TTS
    const clean = text
      .replace(/[#*_`~\[\]()]/g, '')
      .replace(/\n+/g, '. ')
      .replace(/https?:\/\/\S+/g, 'קישור')
      .substring(0, 600);

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'he-IL';
    utterance.rate = 1.05;
    utterance.pitch = 1;

    // Pick Hebrew voice if available
    const voices = speechSynthesis.getVoices();
    const heVoice = voices.find(v => v.lang.startsWith('he'));
    if (heVoice) utterance.voice = heVoice;

    utterance.onend = () => {
      setState(activeRef.current ? 'listening' : 'idle');
      if (activeRef.current) {
        setTimeout(() => startListening(), 300);
      }
    };

    utterance.onerror = () => {
      setState(activeRef.current ? 'listening' : 'idle');
      if (activeRef.current) startListening();
    };

    synthRef.current = utterance;
    speechSynthesis.cancel(); // Clear queue
    speechSynthesis.speak(utterance);
  }, [muted]);

  // ===== STT =====
  const startListening = useCallback(() => {
    if (!hasSpeechAPI || !activeRef.current) return;

    setState('listening');

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

      if (!text || !hasResult) {
        // No speech, retry
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

      // Add to transcript and send to agent
      setTranscript(prev => [...prev, { role: 'user', text }]);
      setState('thinking');
      wsRef.current?.sendMessage(text);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' && activeRef.current) {
        setTimeout(() => startListening(), 500);
      } else if (event.error === 'aborted') {
        // Intentional abort, do nothing
      } else {
        if (activeRef.current) {
          setTimeout(() => startListening(), 1000);
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [hasSpeechAPI]);

  // ===== SESSION CONTROL =====
  const startSession = useCallback(() => {
    setActive(true);
    activeRef.current = true;
    setTranscript([]);
    assistantBufferRef.current = '';

    // Clear WS history for fresh context
    wsRef.current?.clearHistory();

    // Small delay then start listening
    setTimeout(() => startListening(), 300);
  }, [startListening]);

  const endSession = useCallback(() => {
    setActive(false);
    activeRef.current = false;
    setState('idle');

    // Stop recognition
    recognitionRef.current?.abort();
    recognitionRef.current = null;

    // Stop TTS
    speechSynthesis.cancel();
  }, []);

  const toggleSession = () => {
    if (active) {
      endSession();
    } else {
      startSession();
    }
  };

  // Interrupt — stop TTS and re-listen
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
      recognitionRef.current?.abort();
      speechSynthesis.cancel();
    };
  }, []);

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
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--primary)]" />
          <span className="text-sm font-semibold text-white">Merlin Live</span>
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

      {/* Transcript */}
      <TranscriptDisplay lines={transcript} />

      {/* Current streaming text */}
      {currentText && (
        <div className="px-6 py-2 text-sm text-zinc-500 text-right animate-fade-in truncate">
          {currentText.substring(0, 100)}...
        </div>
      )}

      {/* Orb + Controls */}
      <div className="flex flex-col items-center gap-6 pb-12 pt-6 shrink-0">
        <StatusText state={state} />

        {/* Tap orb to interrupt when speaking */}
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
