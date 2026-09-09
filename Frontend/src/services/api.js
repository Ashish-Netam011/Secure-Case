import axios from "axios";

// In dev the Vite proxy forwards /api to localhost:5000. In production set
// VITE_API_URL (e.g. https://secure-case-api.onrender.com/api) at build time.
// A bare origin is accepted too: the required /api prefix is added automatically,
// so VITE_API_URL=https://secure-case-api.onrender.com still works correctly.
const configuredBaseUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
const baseURL = configuredBaseUrl.endsWith("/api") ? configuredBaseUrl : `${configuredBaseUrl}/api`;

const API = axios.create({ baseURL });

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.dispatchEvent(new Event("secure-case-session-expired"));
    }
    return Promise.reject(error);
  },
);

export default API;
