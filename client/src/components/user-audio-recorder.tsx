import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Play, Pause, Trash2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserAudioRecorderProps {
  onSend: (audioBlob: Blob, duration: number) => void;
  onCancel: () => void;
  isRecording: boolean;
  setIsRecording: (value: boolean) => void;
  disabled?: boolean;
}

export function UserAudioRecorder({ 
  onSend, 
  onCancel, 
  isRecording, 
  setIsRecording,
  disabled 
}: UserAudioRecorderProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Detectar se é mobile
  const isMobile = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );

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

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      streamRef.current = stream;
      
      // Detectar formato suportado
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Parar todas as tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error("Erro ao acessar microfone:", error);
      alert("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  }, [setIsRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording, setIsRecording]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        timerRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);
      } else {
        mediaRecorderRef.current.pause();
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
      setIsPaused(!isPaused);
    }
  }, [isRecording, isPaused]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setAudioBlob(null);
    setAudioUrl(null);
    onCancel();
  }, [isRecording, audioUrl, setIsRecording, onCancel]);

  const playPreview = useCallback(() => {
    if (audioUrl && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  }, [audioUrl, isPlaying]);

  const sendAudio = useCallback(() => {
    if (audioBlob) {
      onSend(audioBlob, recordingTime);
      // Reset
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingTime(0);
    }
  }, [audioBlob, recordingTime, audioUrl, onSend]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Botão inicial para começar a gravar
  if (!isRecording && !audioBlob) {
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
      >
        <Mic className={cn("w-5 h-5", isMobile && "w-6 h-6")} />
      </Button>
    );
  }

  // Interface de gravação em andamento
  if (isRecording) {
    return (
      <div className={cn(
        "flex items-center gap-2 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2 border border-red-200 dark:border-red-900",
        isMobile && "gap-3 px-2"
      )}>
        {/* Indicador de gravação */}
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-3 h-3 rounded-full bg-red-500",
            !isPaused && "animate-pulse"
          )} />
          <span className="text-sm font-mono text-red-600 dark:text-red-400 min-w-[45px]">
            {formatTime(recordingTime)}
          </span>
        </div>

        {/* Waveform visual simples */}
        {!isPaused && (
          <div className="flex items-center gap-0.5 h-6">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-red-400 rounded-full animate-pulse"
                style={{
                  height: `${Math.random() * 16 + 8}px`,
                  animationDelay: `${i * 0.1}s`
                }}
              />
            ))}
          </div>
        )}

        {/* Controles */}
        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={pauseRecording}
            className={cn("h-8 w-8", isMobile && "h-10 w-10")}
            title={isPaused ? "Continuar" : "Pausar"}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={cancelRecording}
            className={cn("h-8 w-8 text-red-500 hover:text-red-600", isMobile && "h-10 w-10")}
            title="Cancelar"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          
          <Button
            variant="default"
            size="icon"
            onClick={stopRecording}
            className={cn("h-8 w-8 bg-red-500 hover:bg-red-600", isMobile && "h-10 w-10")}
            title="Parar e revisar"
          >
            <Square className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Interface de preview do áudio gravado
  if (audioBlob && audioUrl) {
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
        />
        
        {/* Play/Pause preview */}
        <Button
          variant="ghost"
          size="icon"
          onClick={playPreview}
          className={cn("h-8 w-8", isMobile && "h-10 w-10")}
          title={isPlaying ? "Pausar" : "Ouvir"}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>

        {/* Duração */}
        <span className="text-sm font-mono text-muted-foreground min-w-[45px]">
          {formatTime(recordingTime)}
        </span>

        {/* Waveform estático */}
        <div className="flex items-center gap-0.5 h-6 flex-1 max-w-[100px]">
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-primary/40 rounded-full"
              style={{ height: `${Math.random() * 16 + 4}px` }}
            />
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          {/* Cancelar */}
          <Button
            variant="ghost"
            size="icon"
            onClick={cancelRecording}
            className={cn("h-8 w-8 text-muted-foreground", isMobile && "h-10 w-10")}
            title="Descartar"
          >
            <X className="w-4 h-4" />
          </Button>
          
          {/* Enviar */}
          <Button
            variant="default"
            size="icon"
            onClick={sendAudio}
            className={cn("h-8 w-8", isMobile && "h-10 w-10")}
            title="Enviar áudio"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
