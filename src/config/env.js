
// Environment configuration
const environments = {
  local: {
    WEBSOCKET_URL: 'ws://localhost:8080/ws',
    API_BASE_URL: 'http://localhost:8080',
  },
  uat: {
    WEBSOCKET_URL: 'wss://uat-api.example.com/ws',
    API_BASE_URL: 'https://uat-api.example.com',
  },
  production: {
    WEBSOCKET_URL: 'wss://api.example.com/ws',
    API_BASE_URL: 'https://api.example.com',
  }
};

// Determine current environment (default to local)
const getCurrentEnvironment = () => {
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'local';
  } else if (hostname.includes('uat') || hostname.includes('staging')) {
    return 'uat';
  } else {
    return 'production';
  }
};

//const currentEnv = getCurrentEnvironment();
const currentEnv = "local"; // fix
const config = environments[currentEnv];
const debug_mode = true;

// WebSocket URL with user parameter
export const getWebSocketUrl = (user = 'nueng') => {
  return `${config.WEBSOCKET_URL}?user=${encodeURIComponent(user)}`;
};

export const API_BASE_URL = config.API_BASE_URL;
export const CURRENT_ENV = currentEnv;

export default config;
