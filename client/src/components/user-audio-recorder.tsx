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
  // Estado interno do gravador
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

  // Detectar se é mobile
  const isMobile = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );

  // Sincronizar estado externo com interno
  useEffect(() => {
    if (recorderState === 'recording' || recorderState === 'paused') {
      setIsRecording(true);
    } else {
      setIsRecording(false);
    }
  }, [recorderState, setIsRecording]);

  // Limpar recursos ao desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [audioUrl]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      console.log('[AudioRecorder] 🎤 Requesting microphone access...');
      
      // Limpar estado anterior
      audioChunksRef.current = [];
      setAudioBlob(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setRecordingTime(0);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      console.log('[AudioRecorder] ✅ Microphone access granted');
      streamRef.current = stream;
      
      // Detectar formato suportado
      let mimeType = 'audio/webm';
      const formats = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus', 
        'audio/webm',
        'audio/mp4',
      ];
      
      for (const format of formats) {
        if (MediaRecorder.isTypeSupported(format)) {
          mimeType = format;
          break;
        }
      }
      
      console.log('[AudioRecorder] 📼 Using mimeType:', mimeType);
      setActualMimeType(mimeType);
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        console.log('[AudioRecorder] 📦 Data chunk:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('[AudioRecorder] ⏹️ MediaRecorder stopped, chunks:', audioChunksRef.current.length);
        
        // Parar stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          console.log('[AudioRecorder] 🎵 Created blob:', blob.size, 'bytes');
          setAudioBlob(blob);
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
          setRecorderState('preview');
        } else {
          console.error('[AudioRecorder] ❌ No audio chunks recorded!');
          setRecorderState('idle');
        }
      };

      mediaRecorder.onerror = (event: any) => {
        console.error('[AudioRecorder] ❌ MediaRecorder error:', event.error);
        setRecorderState('idle');
      };

      // Iniciar gravação - timeslice de 500ms para capturar dados frequentemente
      mediaRecorder.start(500);
      console.log('[AudioRecorder] 🔴 Recording started');
      
      setRecorderState('recording');
      startTimer();

    } catch (error: any) {
      console.error("[AudioRecorder] ❌ Erro ao acessar microfone:", error);
      alert("Não foi possível acessar o microfone. Verifique as permissões do navegador.\n\nErro: " + error.message);
      setRecorderState('idle');
    }
  }, [audioUrl, startTimer]);

  const stopRecording = useCallback(() => {
    console.log('[AudioRecorder] ⏹️ Stop button clicked, state:', mediaRecorderRef.current?.state);
    stopTimer();
    
    if (mediaRecorderRef.current) {
      const state = mediaRecorderRef.current.state;
      if (state === 'recording' || state === 'paused') {
        // Requisitar dados pendentes
        try {
          mediaRecorderRef.current.requestData();
        } catch (e) {
          console.log('[AudioRecorder] requestData not supported');
        }
        mediaRecorderRef.current.stop();
      }
    }
  }, [stopTimer]);

  const pauseRecording = useCallback(() => {
    console.log('[AudioRecorder] ⏸️ Pause/Resume clicked, current state:', recorderState);
    
    if (!mediaRecorderRef.current) return;
    
    if (recorderState === 'paused') {
      // Resume
      mediaRecorderRef.current.resume();
      setRecorderState('recording');
      startTimer();
      console.log('[AudioRecorder] ▶️ Resumed');
    } else if (recorderState === 'recording') {
      // Pause
      mediaRecorderRef.current.pause();
      setRecorderState('paused');
      stopTimer();
      console.log('[AudioRecorder] ⏸️ Paused');
    }
  }, [recorderState, startTimer, stopTimer]);

  const cancelRecording = useCallback(() => {
    console.log('[AudioRecorder] 🗑️ Cancel clicked');
    stopTimer();
    
    // Parar MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    // Parar stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Limpar URL
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    
    // Reset estado
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setRecorderState('idle');
    setIsPlaying(false);
    
    onCancel();
  }, [audioUrl, stopTimer, onCancel]);

  const playPreview = useCallback(() => {
    console.log('[AudioRecorder] 🔊 Play preview clicked, audioRef:', !!audioRef.current, 'audioUrl:', !!audioUrl);
    
    if (!audioRef.current || !audioUrl) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(err => {
        console.error('[AudioRecorder] Error playing audio:', err);
      });
      setIsPlaying(true);
    }
  }, [audioUrl, isPlaying]);

  const sendAudio = useCallback(() => {
    if (!audioBlob) {
      console.error('[AudioRecorder] ❌ No audio blob to send!');
      return;
    }
    
    console.log('[AudioRecorder] 📤 Sending audio:', audioBlob.size, 'bytes, duration:', recordingTime, 'mimeType:', actualMimeType);
    
    onSend(audioBlob, recordingTime, actualMimeType);
    
    // Reset
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setRecorderState('idle');
    setIsPlaying(false);
  }, [audioBlob, recordingTime, audioUrl, actualMimeType, onSend]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // === RENDER ===

  // Estado IDLE - Mostrar botão de microfone
  if (recorderState === 'idle') {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={startRecording}
        disabled={disabled}
        className={cn(
          "text-muted-foreground hover:text-primary touch-manipulation",
          isMobile && "h-11 w-11"
        )}
        title="Gravar áudio"
        type="button"
      >
        <Mic className={cn("w-5 h-5", isMobile && "w-6 h-6")} />
      </Button>
    );
  }

  // Estado RECORDING ou PAUSED - Interface de gravação
  if (recorderState === 'recording' || recorderState === 'paused') {
    return (
      <div className={cn(
        "flex items-center gap-2 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2 border border-red-200 dark:border-red-900",
        isMobile && "gap-3 px-2"
      )}>
        {/* Indicador de gravação */}
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-3 h-3 rounded-full bg-red-500",
            recorderState === 'recording' && "animate-pulse"
          )} />
          <span className="text-sm font-mono text-red-600 dark:text-red-400 min-w-[45px]">
            {formatTime(recordingTime)}
          </span>
        </div>

        {/* Waveform visual */}
        {recorderState === 'recording' && (
          <div className="flex items-center gap-0.5 h-6">
            {[1,2,3,4,5].map((i) => (
              <div
                key={i}
                className="w-1 bg-red-400 rounded-full animate-pulse"
                style={{
                  height: `${8 + (i * 3)}px`,
                  animationDelay: `${i * 0.1}s`
                }}
              />
            ))}
          </div>
        )}
        
        {recorderState === 'paused' && (
          <span className="text-xs text-red-500 font-medium">PAUSADO</span>
        )}

        {/* Controles */}
        <div className="flex items-center gap-1 ml-auto">
          {/* Pausar/Continuar */}
          <Button
            variant="ghost"
            size="icon"
            onClick={pauseRecording}
            className={cn("h-8 w-8", isMobile && "h-10 w-10")}
            title={recorderState === 'paused' ? "Continuar" : "Pausar"}
            type="button"
          >
            {recorderState === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </Button>
          
          {/* Cancelar */}
          <Button
            variant="ghost"
            size="icon"
            onClick={cancelRecording}
            className={cn("h-8 w-8 text-red-500 hover:text-red-600", isMobile && "h-10 w-10")}
            title="Cancelar"
            type="button"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          
          {/* Parar e ir para preview */}
          <Button
            variant="default"
            size="icon"
            onClick={stopRecording}
            className={cn("h-8 w-8 bg-red-500 hover:bg-red-600", isMobile && "h-10 w-10")}
            title="Parar gravação"
            type="button"
          >
            <Square className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Estado PREVIEW - Mostrar áudio gravado
  if (recorderState === 'preview' && audioBlob && audioUrl) {
    return (
      <div className={cn(
        "flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 border",
        isMobile && "gap-3 px-2"
      )}>
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
          preload="auto"
        />
        
        {/* Play/Pause preview */}
        <Button
          variant="ghost"
          size="icon"
          onClick={playPreview}
          className={cn("h-8 w-8", isMobile && "h-10 w-10")}
          title={isPlaying ? "Pausar" : "Ouvir"}
          type="button"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>

        {/* Duração */}
        <span className="text-sm font-mono text-muted-foreground min-w-[45px]">
          {formatTime(recordingTime)}
        </span>

        {/* Indicador visual */}
        <div className="flex items-center gap-0.5 h-6 flex-1 max-w-[80px]">
          {[1,2,3,4,5,6,7,8,9,10].map((i) => (
            <div
              key={i}
              className="w-1 bg-primary/40 rounded-full"
              style={{ height: `${4 + (i % 5) * 3}px` }}
            />
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          {/* Cancelar/Descartar */}
          <Button
            variant="ghost"
            size="icon"
            onClick={cancelRecording}
            className={cn("h-8 w-8 text-muted-foreground hover:text-destructive", isMobile && "h-10 w-10")}
            title="Descartar"
            type="button"
          >
            <X className="w-4 h-4" />
          </Button>
          
          {/* Enviar */}
          <Button
            variant="default"
            size="icon"
            onClick={sendAudio}
            className={cn("h-8 w-8 bg-primary hover:bg-primary/90", isMobile && "h-10 w-10")}
            title="Enviar áudio"
            type="button"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
