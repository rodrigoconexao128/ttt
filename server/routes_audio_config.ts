/**
 * Rotas da API para Configuração de Áudio TTS (Falar por Áudio)
 * Permite usuários configurar geração automática de áudio nas respostas da IA
 */

import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { isAuthenticated, getSession } from "./supabaseAuth";
import { generateTTS, generateWithEdgeTTS } from "./ttsService";
import fs from "fs";
import path from "path";

// Mapeamento de vozes Edge TTS
const VOICE_MAP = {
  female: "pt-BR-FranciscaNeural",
  male: "pt-BR-AntonioNeural",
};

export function registerAudioConfigRoutes(app: Express): void {
  console.log("🎤 [AUDIO-CONFIG] Registrando rotas de configuração de áudio TTS...");

  /**
   * GET /api/audio-config
   * Busca configuração de áudio do usuário logado
   */
  app.get("/api/audio-config", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const session = await getSession(req);
      if (!session?.user?.id) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      let config = await storage.getAudioConfig(session.user.id);
      
      // Se não existe, criar configuração padrão
      if (!config) {
        config = await storage.createAudioConfig(session.user.id);
      }

      // Buscar uso do dia
      const usage = await storage.canSendAudio(session.user.id);

      res.json({
        config: {
          isEnabled: config.isEnabled,
          voiceType: config.voiceType,
          speed: parseFloat(config.speed as unknown as string),
        },
        usage: {
          used: usage.limit - usage.remaining,
          remaining: usage.remaining,
          limit: usage.limit,
          canSend: usage.canSend,
        },
      });
    } catch (error: any) {
      console.error("[AUDIO-CONFIG] Erro ao buscar config:", error);
      res.status(500).json({ message: "Erro ao buscar configuração de áudio" });
    }
  });

  /**
   * PUT /api/audio-config
   * Atualiza configuração de áudio do usuário
   */
  app.put("/api/audio-config", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const session = await getSession(req);
      if (!session?.user?.id) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { isEnabled, voiceType, speed } = req.body;

      // Validar speed
      if (speed !== undefined) {
        const speedNum = parseFloat(speed);
        if (isNaN(speedNum) || speedNum < 0.5 || speedNum > 2.0) {
          return res.status(400).json({ message: "Velocidade deve ser entre 0.5 e 2.0" });
        }
      }

      // Validar voiceType
      if (voiceType && !["female", "male"].includes(voiceType)) {
        return res.status(400).json({ message: "Tipo de voz inválido. Use 'female' ou 'male'" });
      }

      const config = await storage.updateAudioConfig(session.user.id, {
        isEnabled: isEnabled !== undefined ? isEnabled : undefined,
        voiceType: voiceType || undefined,
        speed: speed !== undefined ? String(speed) : undefined,
      });

      res.json({
        success: true,
        config: {
          isEnabled: config.isEnabled,
          voiceType: config.voiceType,
          speed: parseFloat(config.speed as unknown as string),
        },
      });
    } catch (error: any) {
      console.error("[AUDIO-CONFIG] Erro ao atualizar config:", error);
      res.status(500).json({ message: "Erro ao atualizar configuração de áudio" });
    }
  });

  /**
   * GET /api/audio-config/usage
   * Retorna estatísticas de uso de áudio do usuário
   */
  app.get("/api/audio-config/usage", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const session = await getSession(req);
      if (!session?.user?.id) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const usage = await storage.canSendAudio(session.user.id);

      res.json({
        used: usage.limit - usage.remaining,
        remaining: usage.remaining,
        limit: usage.limit,
        canSend: usage.canSend,
      });
    } catch (error: any) {
      console.error("[AUDIO-CONFIG] Erro ao buscar uso:", error);
      res.status(500).json({ message: "Erro ao buscar uso de áudio" });
    }
  });

  /**
   * POST /api/audio-config/test
   * Gera um áudio de teste com a configuração atual
   * Body: { text?: string, speed?: number }
   */
  app.post("/api/audio-config/test", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const session = await getSession(req);
      if (!session?.user?.id) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { text, speed: overrideSpeed } = req.body;
      const testText = text || "Olá! Este é um teste da configuração de voz para o seu agente de atendimento.";

      // Buscar config do usuário
      let config = await storage.getAudioConfig(session.user.id);
      if (!config) {
        config = await storage.createAudioConfig(session.user.id);
      }

      // Determinar velocidade (pode ser sobrescrita para teste)
      const speedToUse = overrideSpeed !== undefined 
        ? parseFloat(overrideSpeed) 
        : parseFloat(config.speed as unknown as string);

      // Mapear voz
      const voice = VOICE_MAP[config.voiceType as keyof typeof VOICE_MAP] || VOICE_MAP.female;

      // Converter speed para rate string (-50% a +100%)
      const ratePercent = Math.round((speedToUse - 1) * 100);
      const rate = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

      console.log(`[AUDIO-CONFIG] Gerando áudio de teste - Voice: ${voice}, Rate: ${rate}`);

      // Gerar áudio usando Edge TTS
      const audioBuffer = await generateWithEdgeTTS(testText, voice, rate);

      if (!audioBuffer || audioBuffer.length < 1000) {
        return res.status(500).json({ message: "Falha ao gerar áudio de teste" });
      }

      // Enviar buffer de áudio
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", `attachment; filename="test_audio.mp3"`);
      res.send(audioBuffer);

    } catch (error: any) {
      console.error("[AUDIO-CONFIG] Erro ao gerar teste:", error);
      res.status(500).json({ message: "Erro ao gerar áudio de teste", error: error.message });
    }
  });

  /**
   * POST /api/audio-config/preview
   * Gera preview de áudio com velocidade específica (sem usar config do usuário)
   * Body: { speed: number, voiceType?: 'female' | 'male' }
   */
  app.post("/api/audio-config/preview", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const session = await getSession(req);
      if (!session?.user?.id) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { speed, voiceType } = req.body;

      if (speed === undefined || isNaN(parseFloat(speed))) {
        return res.status(400).json({ message: "Velocidade é obrigatória" });
      }

      const speedNum = parseFloat(speed);
      if (speedNum < 0.5 || speedNum > 2.0) {
        return res.status(400).json({ message: "Velocidade deve ser entre 0.5 e 2.0" });
      }

      // Texto de preview
      const previewText = "Este é um exemplo de como a voz do seu assistente vai soar com esta configuração.";

      // Determinar voz
      const voice = voiceType === "male" ? VOICE_MAP.male : VOICE_MAP.female;

      // Converter speed para rate
      const ratePercent = Math.round((speedNum - 1) * 100);
      const rate = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

      console.log(`[AUDIO-CONFIG] Preview - Voice: ${voice}, Speed: ${speedNum}, Rate: ${rate}`);

      // Gerar áudio
      const audioBuffer = await generateWithEdgeTTS(previewText, voice, rate);

      if (!audioBuffer || audioBuffer.length < 1000) {
        return res.status(500).json({ message: "Falha ao gerar preview" });
      }

      // Enviar buffer de áudio
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", `attachment; filename="preview_audio.mp3"`);
      res.send(audioBuffer);

    } catch (error: any) {
      console.error("[AUDIO-CONFIG] Erro ao gerar preview:", error);
      res.status(500).json({ message: "Erro ao gerar preview", error: error.message });
    }
  });

  console.log("✅ [AUDIO-CONFIG] Rotas de áudio TTS registradas!");
}
