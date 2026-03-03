/**
 * useNotifications — sistema de notificações de mensagem
 * 
 * - Toca som quando chega nova mensagem (se habilitado)
 * - Exibe push notification do navegador (se habilitado e permissão concedida)
 * - Persiste preferências no localStorage
 * - Anti-spam: debounce de 3s entre sons; throttle de 5s entre push notifications
 */

import { useState, useEffect, useCallback, useRef } from "react";

const LS_SOUND_KEY = "notif_sound_enabled";
const LS_PUSH_KEY = "notif_push_enabled";
const SOUND_DEBOUNCE_MS = 3000;
const PUSH_THROTTLE_MS = 5000;

/** Gera um bip simples via Web Audio API — sem arquivo externo */
function playBeepSound(volume = 0.4) {
  try {
    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime); // Lá5 — tom suave
    oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.35);

    // Fechar contexto após reprodução para não vazar recursos
    oscillator.onended = () => {
      ctx.close();
    };
  } catch (err) {
    // Silenciar erros de AudioContext em ambientes sem suporte
    console.warn("[Notif] Erro ao tocar som:", err);
  }
}

export interface NotificationPrefs {
  soundEnabled: boolean;
  pushEnabled: boolean;
  pushPermission: NotificationPermission | "unsupported";
}

export interface UseNotificationsReturn extends NotificationPrefs {
  setSoundEnabled: (v: boolean) => void;
  setPushEnabled: (v: boolean) => void;
  requestPushPermission: () => Promise<NotificationPermission | "unsupported">;
  notify: (opts: NotifyOptions) => void;
}

export interface NotifyOptions {
  title: string;
  body?: string;
  tag?: string;
  icon?: string;
  /** Se false, ignora som mas ainda pode mostrar push */
  playSound?: boolean;
}

function readBool(key: string, defaultVal: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultVal;
    return raw === "true";
  } catch {
    return defaultVal;
  }
}

function writeBool(key: string, val: boolean) {
  try {
    localStorage.setItem(key, val ? "true" : "false");
  } catch {
    // quota exceeded / private mode — ignorar
  }
}

function getPushSupport(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export function useNotifications(): UseNotificationsReturn {
  const [soundEnabled, setSoundEnabledState] = useState(() =>
    readBool(LS_SOUND_KEY, true)
  );
  const [pushEnabled, setPushEnabledState] = useState(() =>
    readBool(LS_PUSH_KEY, false)
  );
  const [pushPermission, setPushPermission] = useState<
    NotificationPermission | "unsupported"
  >(getPushSupport);

  // Timestamps para throttle/debounce
  const lastSoundAt = useRef<number>(0);
  const lastPushAt = useRef<number>(0);

  // Sincronizar permissão quando janela ganha foco
  useEffect(() => {
    const sync = () => setPushPermission(getPushSupport());
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  const setSoundEnabled = useCallback((v: boolean) => {
    setSoundEnabledState(v);
    writeBool(LS_SOUND_KEY, v);
  }, []);

  const setPushEnabled = useCallback(
    async (v: boolean) => {
      if (v && pushPermission === "default") {
        // Solicitar permissão automaticamente ao ativar
        const result = await requestPushPermission();
        if (result !== "granted") {
          // Não ativar se usuário negou
          return;
        }
      }
      setPushEnabledState(v);
      writeBool(LS_PUSH_KEY, v);
    },
    [pushPermission]
  );

  const requestPushPermission =
    useCallback(async (): Promise<
      NotificationPermission | "unsupported"
    > => {
      if (!("Notification" in window)) return "unsupported";
      if (Notification.permission === "granted") {
        setPushPermission("granted");
        return "granted";
      }
      try {
        const result = await Notification.requestPermission();
        setPushPermission(result);
        return result;
      } catch (err) {
        console.warn("[Notif] requestPermission error:", err);
        return "denied";
      }
    }, []);

  const notify = useCallback(
    (opts: NotifyOptions) => {
      const now = Date.now();
      const { title, body, tag, icon, playSound = true } = opts;

      // --- Som ---
      if (soundEnabled && playSound) {
        if (now - lastSoundAt.current >= SOUND_DEBOUNCE_MS) {
          lastSoundAt.current = now;
          playBeepSound();
        }
      }

      // --- Push notification ---
      if (
        pushEnabled &&
        pushPermission === "granted" &&
        typeof Notification !== "undefined"
      ) {
        if (now - lastPushAt.current >= PUSH_THROTTLE_MS) {
          lastPushAt.current = now;
          try {
            const n = new Notification(title, {
              body,
              tag: tag || "agentezap-msg",
              icon: icon || "/favicon.png",
              silent: true, // Som já é gerenciado por nós
            });
            // Clicar na notificação foca a janela
            n.onclick = () => {
              window.focus();
              n.close();
            };
            // Auto-fechar após 5s
            setTimeout(() => n.close(), 5000);
          } catch (err) {
            console.warn("[Notif] Erro ao criar Notification:", err);
          }
        }
      }
    },
    [soundEnabled, pushEnabled, pushPermission]
  );

  return {
    soundEnabled,
    pushEnabled,
    pushPermission,
    setSoundEnabled,
    setPushEnabled,
    requestPushPermission,
    notify,
  };
}
