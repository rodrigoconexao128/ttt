import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true, // ESSENCIAL para cookies de sessão
  headers: {
    'Content-Type': 'application/json',
  },
});
