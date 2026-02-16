import axios from 'axios';
import { supabase } from './supabase';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true, // ESSENCIAL para cookies de sessão
  // NAO colocar Content-Type aqui — Axios auto-detecta multipart/form-data para FormData
});

// Interceptor que adiciona Bearer token em TODA requisição
apiClient.interceptors.request.use(async (config) => {
  config.headers = config.headers ?? {};

  // Tentar getSession primeiro
  const { data } = await supabase.auth.getSession();
  let token = data.session?.access_token;

  // Fallback: ler do localStorage se getSession falhar
  if (!token) {
    try {
      // Busca qualquer chave do Supabase que contenha o access_token
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('supabase') && key.includes('auth')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            const candidate = parsed?.access_token || parsed?.session?.access_token;
            if (candidate) {
              token = candidate;
              break;
            }
          }
        }
      }
    } catch {
      // Fallback silencioso — sem token
    }
  }

  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  return config;
});
