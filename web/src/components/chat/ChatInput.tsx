'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Square, ImagePlus, X, Mic, MicOff } from 'lucide-react';

export interface ImageAttachment {
  base64: string;
  mediaType: string;
  name: string;
}

interface ChatInputProps {
  onSend: (message: string, images?: ImageAttachment[]) => void;
  onAbort?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

export default function ChatInput({ onSend, onAbort, disabled, isStreaming }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const hasSpeechAPI = typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  const toggleVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'he-IL';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);

  const handleSend = () => {
    const trimmed = input.trim();
    if ((!trimmed && images.length === 0) || disabled) return;
    onSend(trimmed || 'מה אתה רואה בתמונה?', images.length > 0 ? images : undefined);
    setInput('');
    setImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        setImages((prev) => [...prev, {
          base64,
          mediaType: file.type,
          name: file.name,
        }]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t border-[var(--border)] bg-[var(--background)] p-3">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 mb-2 max-w-3xl mx-auto overflow-x-auto pb-1">
          {images.map((img, i) => (
            <div key={i} className="relative shrink-0">
              <img
                src={`data:${img.mediaType};base64,${img.base64}`}
                alt={img.name}
                className="w-16 h-16 rounded-lg object-cover border border-[var(--border)]"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="flex items-center justify-center w-11 h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--muted-foreground)] transition-colors disabled:opacity-30 shrink-0"
          title="Attach image"
        >
          <ImagePlus size={18} />
        </button>
        {hasSpeechAPI && (
          <button
            onClick={toggleVoice}
            disabled={disabled}
            className={`flex items-center justify-center w-11 h-11 rounded-xl border transition-colors disabled:opacity-30 shrink-0 ${
              isListening
                ? 'bg-red-600 border-red-600 text-white animate-pulse'
                : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--muted-foreground)]'
            }`}
            title={isListening ? 'Stop recording' : 'Voice input'}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition-colors disabled:opacity-50"
        />
        {isStreaming ? (
          <button
            onClick={onAbort}
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-colors shrink-0"
          >
            <Square size={18} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={(!input.trim() && images.length === 0) || disabled}
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-[var(--primary)] hover:opacity-90 text-white transition-colors disabled:opacity-30 shrink-0"
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
