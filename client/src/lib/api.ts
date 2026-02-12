import axios from 'axios';
import { supabase } from './supabase';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true, // ESSENCIAL para cookies de sessão
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor que adiciona Bearer token em TODA requisição
apiClient.interceptors.request.use(async (config) => {
  // Pegar token do Supabase
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  return config;
});
