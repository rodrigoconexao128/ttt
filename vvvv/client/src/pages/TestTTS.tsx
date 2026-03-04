import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Volume2, Loader2, Play, Pause, Download, CheckCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TTSResult {
  provider: string;
  format: string;
  audioUrl: string;
}

export default function TestTTSPage() {
  const [text, setText] = useState("Olá! Eu sou um assistente virtual. Estou testando a conversão de texto em fala em português brasileiro. Como você está hoje?");
  const [speed, setSpeed] = useState([1.0]);
  const [provider, setProvider] = useState("auto");
  const [voice, setVoice] = useState("francisca");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TTSResult[]>([]);
  const [activeAudio, setActiveAudio] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();

  // Vozes Edge TTS disponíveis
  const edgeVoices = [
    { id: "francisca", name: "Francisca (Feminina)", code: "pt-BR-FranciscaNeural" },
    { id: "antonio", name: "Antonio (Masculina)", code: "pt-BR-AntonioNeural" },
    { id: "thalita", name: "Thalita (Feminina Jovem)", code: "pt-BR-ThalitaNeural" },
    { id: "julio", name: "Julio (Masculina)", code: "pt-BR-JulioNeural" },
  ];

  const handleGenerate = async (specificProvider?: string) => {
    if (!text.trim()) {
      toast({
        title: "Erro",
        description: "Digite um texto para gerar o áudio",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const selectedVoice = edgeVoices.find(v => v.id === voice)?.code || "pt-BR-FranciscaNeural";
      
      const response = await fetch("/api/test-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          text,
          provider: specificProvider || provider,
          voice: selectedVoice,
          speed: speed[0],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || "Erro ao gerar áudio");
      }

      const usedProvider = response.headers.get('X-TTS-Provider') || specificProvider || provider;
      const format = response.headers.get('X-TTS-Format') || 'mp3';
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const newResult: TTSResult = { provider: usedProvider, format, audioUrl: url };
      setResults(prev => [newResult, ...prev.slice(0, 4)]);
      setActiveAudio(url);

      toast({
        title: "✅ Áudio gerado!",
        description: `Usando ${usedProvider}. Clique em Play para ouvir.`,
      });
    } catch (error: any) {
      console.error("Erro ao gerar áudio:", error);
      toast({
        title: "❌ Erro",
        description: error.message || "Não foi possível gerar o áudio",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAll = async () => {
    setLoading(true);
    setResults([]);
    for (const prov of ["google", "edge"]) {
      try {
        await handleGenerate(prov);
        await new Promise(r => setTimeout(r, 500));
      } catch (e) { console.warn(`Provider ${prov} falhou`); }
    }
    setLoading(false);
  };

  const handlePlayPause = (audioUrl: string) => {
    if (!audioRef.current) return;
    if (activeAudio !== audioUrl) {
      setActiveAudio(audioUrl);
      audioRef.current.src = audioUrl;
      audioRef.current.play();
      setIsPlaying(true);
    } else if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleDownload = (url: string, prov: string, fmt: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `audio-${prov.toLowerCase().replace(/\s/g, '-')}.${fmt}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast({ title: "✅ Download iniciado" });
  };

  const handleAudioEnded = () => setIsPlaying(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            🎙️ Teste de TTS - Múltiplos Providers
          </h1>
          <p className="text-gray-600">Compare diferentes engines de Text-to-Speech em português brasileiro</p>
        </div>

        {/* Provider Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-purple-200 bg-purple-50 ring-2 ring-purple-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-purple-700 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> Edge TTS ⭐
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-purple-800">🆓 GRATUITO</p>
              <p className="text-xs text-purple-600">Microsoft Neural HD</p>
              <p className="text-xs text-gray-500 mt-1">Melhor qualidade! Francisca/Antonio</p>
            </CardContent>
          </Card>

          <Card className="border-green-200 bg-green-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-700 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> Google TTS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-green-800">🆓 GRATUITO</p>
              <p className="text-xs text-green-600">Via Google Translate API</p>
              <p className="text-xs text-gray-500 mt-1">Funciona sempre, qualidade boa</p>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> Windows TTS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-blue-800">🆓 GRATUITO</p>
              <p className="text-xs text-blue-600">SAPI Nativo (say.js)</p>
              <p className="text-xs text-gray-500 mt-1">Funciona OFFLINE!</p>
            </CardContent>
          </Card>

          <Card className="border-purple-200 bg-purple-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-purple-700 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-purple-800">✅ ATIVO</p>
              <p className="text-xs text-purple-600">Todos providers funcionando</p>
              <p className="text-xs text-gray-500 mt-1">Fallback automático</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Card */}
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" /> Gerador de Áudio
            </CardTitle>
            <CardDescription>Digite um texto em português e teste diferentes engines de TTS</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Text Input */}
            <div className="space-y-2">
              <Label htmlFor="text">Texto para converter em áudio</Label>
              <Textarea
                id="text"
                placeholder="Digite aqui o texto..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-gray-500">{text.length} caracteres</p>
            </div>

            {/* Options Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">🔄 Automático (Edge → Google → Windows)</SelectItem>
                    <SelectItem value="edge">⭐ Edge TTS (Francisca Neural - Feminina)</SelectItem>
                    <SelectItem value="edge-antonio">⭐ Edge TTS (Antonio Neural - Masculina)</SelectItem>
                    <SelectItem value="google">🌐 Google TTS</SelectItem>
                    <SelectItem value="windows">🪟 Windows TTS (Offline)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Voz (Edge TTS)</Label>
                <Select value={voice} onValueChange={setVoice}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {edgeVoices.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Velocidade: {speed[0].toFixed(1)}x</Label>
                <Slider min={0.5} max={2.0} step={0.1} value={speed} onValueChange={setSpeed} className="mt-2" />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={() => handleGenerate()}
                disabled={loading || !text.trim()}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600"
                size="lg"
              >
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...</> : <><Volume2 className="mr-2 h-4 w-4" /> Gerar Áudio</>}
              </Button>
              <Button onClick={handleGenerateAll} disabled={loading || !text.trim()} variant="outline" size="lg">
                <RefreshCw className="mr-2 h-4 w-4" /> Testar Todos
              </Button>
            </div>

            <audio ref={audioRef} onEnded={handleAudioEnded} className="hidden" />

            {/* Results */}
            {results.length > 0 && (
              <div className="space-y-4">
                <Label className="text-lg font-semibold">Resultados:</Label>
                <div className="space-y-3">
                  {results.map((result, index) => (
                    <div key={index} className={`p-4 rounded-lg border-2 ${activeAudio === result.audioUrl && isPlaying ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{result.provider}</span>
                          <span className="ml-2 text-xs text-gray-500 uppercase">{result.format}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={() => handlePlayPause(result.audioUrl)} variant="outline" size="sm">
                            {activeAudio === result.audioUrl && isPlaying ? <><Pause className="mr-1 h-3 w-3" /> Pausar</> : <><Play className="mr-1 h-3 w-3" /> Play</>}
                          </Button>
                          <Button onClick={() => handleDownload(result.audioUrl, result.provider, result.format)} variant="ghost" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {activeAudio === result.audioUrl && (
                        <div className="flex items-center justify-center gap-0.5 h-8 mt-3">
                          {[...Array(50)].map((_, i) => (
                            <div key={i} className="w-1 bg-gradient-to-t from-indigo-600 to-purple-600 rounded-full" style={{ height: isPlaying ? `${Math.random() * 100}%` : '20%', animationDelay: `${i * 30}ms` }} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Test Phrases */}
            <div className="bg-gray-50 rounded-lg p-4">
              <Label className="text-sm mb-2 block">🎯 Frases de Teste Rápido:</Label>
              <div className="flex flex-wrap gap-2">
                {["Olá, como posso ajudar?", "Bom dia! Seja bem-vindo.", "O preço é cem reais.", "Posso agendar para amanhã.", "Obrigado pelo contato!"].map((phrase, i) => (
                  <Button key={i} variant="outline" size="sm" onClick={() => setText(phrase)} className="text-xs">{phrase}</Button>
                ))}
              </div>
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 text-sm mb-2">ℹ️ Como funciona</h3>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>• <strong>Google TTS</strong> - Usa API do Google Translate (sempre funciona)</li>
                <li>• <strong>Edge TTS</strong> - Melhor qualidade, requer: <code className="bg-blue-100 px-1 rounded">pip install edge-tts</code></li>
                <li>• Todos são 100% gratuitos e funcionam com português brasileiro!</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
