import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Play, Pause, Trash2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserAudioRecorderProps {
  onSend: (audioBlob: Blob, duration: number, mimeType: string) => void;
  onCancel: () => void;
  isRecording: boolean;
  setIsRecording: (value: boolean) => void;
  disabled?: boolean;
}

type RecorderState = 'idle' | 'recording' | 'paused' | 'preview';

export function UserAudioRecorder({ 
  onSend, 
  onCancel, 
  isRecording, 
  setIsRecording,
  disabled 
}: UserAudioRecorderProps) {
  const [recorderState, setRecorderState] = useState<RecorderState>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [actualMimeType, setActualMimeType] = useState<string>('audio/webm');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');

  const isMobile = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );

  // Sync external state
  useEffect(() => {
    setIsRecording(recorderState === 'recording' || recorderState === 'paused');
  }, [recorderState, setIsRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      console.log('[AudioRecorder] 🎤 Starting...');
      
      // Reset state
      audioChunksRef.current = [];
      setAudioBlob(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setRecordingTime(0);
      
      // Request microphone
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true
      });
      
      console.log('[AudioRecorder] ✅ Got stream, tracks:', stream.getAudioTracks().length);
      
      // Verify we have audio tracks
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks in stream');
      }
      
      console.log('[AudioRecorder] 🎙️ Audio track:', audioTracks[0].label, 'enabled:', audioTracks[0].enabled);
      
      streamRef.current = stream;
      
      // Find supported format
      let mimeType = '';
      const formats = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/mpeg',
        ''  // Let browser choose default
      ];
      
      for (const format of formats) {
        if (format === '' || MediaRecorder.isTypeSupported(format)) {
          mimeType = format;
          console.log('[AudioRecorder] ✅ Format supported:', format || '(default)');
          break;
        }
      }
      
      mimeTypeRef.current = mimeType || 'audio/webm';
      setActualMimeType(mimeTypeRef.current);
      
      // Create MediaRecorder
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      console.log('[AudioRecorder] 📼 MediaRecorder created, mimeType:', mediaRecorder.mimeType);

      // Handle data - collect chunks
      mediaRecorder.ondataavailable = (event) => {
        console.log('[AudioRecorder] 📦 Chunk received:', event.data.size, 'bytes, type:', event.data.type);
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log('[AudioRecorder] 📊 Total chunks:', audioChunksRef.current.length);
        }
      };

      // Handle stop
      mediaRecorder.onstop = () => {
        console.log('[AudioRecorder] ⏹️ Stopped, total chunks:', audioChunksRef.current.length);
        
        // Stop stream tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => {
            track.stop();
            console.log('[AudioRecorder] 🔇 Track stopped:', track.label);
          });
          streamRef.current = null;
        }
        
        if (audioChunksRef.current.length > 0) {
          const finalMimeType = mimeTypeRef.current || 'audio/webm';
          const blob = new Blob(audioChunksRef.current, { type: finalMimeType });
          console.log('[AudioRecorder] 🎵 Blob created:', blob.size, 'bytes, type:', blob.type);
          
          setAudioBlob(blob);
          setAudioUrl(URL.createObjectURL(blob));
          setRecorderState('preview');
        } else {
          console.error('[AudioRecorder] ❌ No chunks recorded!');
          alert('Não foi possível gravar o áudio. Tente novamente.');
          setRecorderState('idle');
        }
      };

      mediaRecorder.onerror = (event: any) => {
        console.error('[AudioRecorder] ❌ Error:', event.error);
        setRecorderState('idle');
      };

      // Start recording WITHOUT timeslice - data available on stop
      mediaRecorder.start();
      console.log('[AudioRecorder] 🔴 Recording started (state:', mediaRecorder.state, ')');
      
      setRecorderState('recording');
      
      // Start timer
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error: any) {
      console.error("[AudioRecorder] ❌ Error:", error);
      alert("Não foi possível acessar o microfone: " + error.message);
      setRecorderState('idle');
    }
  }, [audioUrl]);

  const stopRecording = useCallback(() => {
    console.log('[AudioRecorder] ⏹️ Stop clicked');
    
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('[AudioRecorder] Stopping MediaRecorder (state:', mediaRecorderRef.current.state, ')');
      mediaRecorderRef.current.stop();
    }
  }, []);

  const pauseRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    
    if (recorderState === 'paused') {
      mediaRecorderRef.current.resume();
      setRecorderState('recording');
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } else if (recorderState === 'recording') {
      mediaRecorderRef.current.pause();
      setRecorderState('paused');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [recorderState]);

  const cancelRecording = useCallback(() => {
    console.log('[AudioRecorder] 🗑️ Cancel');
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setRecorderState('idle');
    setIsPlaying(false);
    
    onCancel();
  }, [audioUrl, onCancel]);

  const playPreview = useCallback(() => {
    if (!audioRef.current || !audioUrl) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  }, [audioUrl, isPlaying]);

  const sendAudio = useCallback(() => {
    if (!audioBlob) {
      console.error('[AudioRecorder] ❌ No blob to send');
      return;
    }
    
    console.log('[AudioRecorder] 📤 Sending:', audioBlob.size, 'bytes, duration:', recordingTime);
    onSend(audioBlob, recordingTime, actualMimeType);
    
    // Reset
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioChunksRef.current = [];
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setRecorderState('idle');
    setIsPlaying(false);
  }, [audioBlob, recordingTime, audioUrl, actualMimeType, onSend]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // === RENDER ===

  if (recorderState === 'idle') {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={startRecording}
        disabled={disabled}
        className={cn("text-muted-foreground hover:text-primary", isMobile && "h-11 w-11")}
        title="Gravar áudio"
        type="button"
      >
        <Mic className={cn("w-5 h-5", isMobile && "w-6 h-6")} />
      </Button>
    );
  }

  if (recorderState === 'recording' || recorderState === 'paused') {
    return (
      <div className={cn(
        "flex items-center gap-2 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2 border border-red-200 dark:border-red-900",
        isMobile && "gap-3 px-2"
      )}>
        <div className="flex items-center gap-2">
          <div className={cn("w-3 h-3 rounded-full bg-red-500", recorderState === 'recording' && "animate-pulse")} />
          <span className="text-sm font-mono text-red-600 dark:text-red-400 min-w-[45px]">
            {formatTime(recordingTime)}
          </span>
        </div>

        {recorderState === 'recording' && (
          <div className="flex items-center gap-0.5 h-6">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="w-1 bg-red-400 rounded-full animate-pulse" style={{ height: `${8 + i * 3}px`, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        )}
        
        {recorderState === 'paused' && <span className="text-xs text-red-500 font-medium">PAUSADO</span>}

        <div className="flex items-center gap-1 ml-auto">
          <Button variant="ghost" size="icon" onClick={pauseRecording} className={cn("h-8 w-8", isMobile && "h-10 w-10")} type="button">
            {recorderState === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={cancelRecording} className={cn("h-8 w-8 text-red-500", isMobile && "h-10 w-10")} type="button">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button variant="default" size="icon" onClick={stopRecording} className={cn("h-8 w-8 bg-red-500 hover:bg-red-600", isMobile && "h-10 w-10")} type="button">
            <Square className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (recorderState === 'preview' && audioBlob && audioUrl) {
    return (
      <div className={cn("flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 border", isMobile && "gap-3 px-2")}>
        <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} className="hidden" preload="auto" />
        
        <Button variant="ghost" size="icon" onClick={playPreview} className={cn("h-8 w-8", isMobile && "h-10 w-10")} type="button">
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>

        <span className="text-sm font-mono text-muted-foreground min-w-[45px]">{formatTime(recordingTime)}</span>

        <div className="flex items-center gap-0.5 h-6 flex-1 max-w-[80px]">
          {[1,2,3,4,5,6,7,8].map(i => (
            <div key={i} className="w-1 bg-primary/40 rounded-full" style={{ height: `${4 + (i % 4) * 4}px` }} />
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <Button variant="ghost" size="icon" onClick={cancelRecording} className={cn("h-8 w-8 text-muted-foreground", isMobile && "h-10 w-10")} type="button">
            <X className="w-4 h-4" />
          </Button>
          <Button variant="default" size="icon" onClick={sendAudio} className={cn("h-8 w-8", isMobile && "h-10 w-10")} type="button">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
