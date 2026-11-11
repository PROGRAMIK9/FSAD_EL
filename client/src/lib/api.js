import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Unwrap the server's { ok, data } envelope; reject with the server's error message.
api.interceptors.response.use(
  (r) => r.data.data,
  (err) => Promise.reject(err.response?.data?.error || err.message),
);
