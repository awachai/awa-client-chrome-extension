
import { useState, useEffect, useRef, useCallback } from 'react';
import { getWebSocketUrl } from '../config/env';

export const useWebSocket = (user = 'nueng', authData = null) => {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [tabId, setTabId] = useState(null);
  const [windowId, setWindowId] = useState(null);
  const [room, setRoom] = useState(null);
  const ws = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const isConnecting = useRef(false);

  // Get current tab ID and window ID information
  const getCurrentTabInfo = useCallback(async () => {
    try {
      // Try to get tab ID from Chrome extension if available
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
          const currentTabId = tabs[0].id;
          const currentWindowId = tabs[0].windowId;
          setTabId(currentTabId);
          setWindowId(currentWindowId);
          console.log('Got tab info from Chrome extension - Tab ID:', currentTabId, 'Window ID:', currentWindowId);
          return { tabId: currentTabId, windowId: currentWindowId };
        }
      }
      
      // Fallback: generate a unique tab ID based on session
      const fallbackTabId = `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const fallbackWindowId = `window_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setTabId(fallbackTabId);
      setWindowId(fallbackWindowId);
      console.log('Generated fallback tab info - Tab ID:', fallbackTabId, 'Window ID:', fallbackWindowId);
      return { tabId: fallbackTabId, windowId: fallbackWindowId };
    } catch (error) {
      console.error('Error getting tab info:', error);
      const fallbackTabId = `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const fallbackWindowId = `window_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setTabId(fallbackTabId);
      setWindowId(fallbackWindowId);
      return { tabId: fallbackTabId, windowId: fallbackWindowId };
    }
  }, []);

  const connect = useCallback(async () => {
    // Prevent multiple simultaneous connection attempts
    if (isConnecting.current || (ws.current && ws.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      // Get tab info before connecting
      const tabInfo = await getCurrentTabInfo();
      const currentTabId = tabInfo.tabId;
      const currentWindowId = tabInfo.windowId;
      
      // Use room from authData if available, otherwise fallback to user-based room
      const currentRoom = authData?.room || `room_${user}_${currentTabId}`;
      setRoom(currentRoom);

      const baseWsUrl = getWebSocketUrl(user);
      
      // เพิ่ม token ใน query parameter ถ้ามี
      let wsUrl = baseWsUrl;
      if (authData?.token) {
        const urlObj = new URL(wsUrl.replace('ws://', 'http://'));
        urlObj.searchParams.append('authorization', authData.token);
        wsUrl = urlObj.toString().replace('http://', 'ws://');
      }
      
      console.log('Attempting WebSocket connection to:', wsUrl);
      console.log('Tab ID:', currentTabId);
      console.log('Window ID:', currentWindowId);
      console.log('Room:', currentRoom);
      console.log('Auth Data:', authData);
      console.log('Token in URL:', authData?.token ? 'Yes' : 'No');
      
      isConnecting.current = true;
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected successfully');
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
        isConnecting.current = false;

        // Send initial connection info with new structure including http_tunnel
        const connectionInfo = {
          type: 'connection',
          message: 'Connected successfully',
          room: currentRoom,
          attachments: [],
          timestamp: new Date().toISOString(),
          http_tunnel: authData?.http_tunnel || ""
        };
        
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify(connectionInfo));
          console.log('Sent connection info to server:', connectionInfo);
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);
          
          // รับข้อความทุกประเภท
          setMessages(prev => [...prev, data]);
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        isConnecting.current = false;
        
        // Only auto-reconnect if it's not a normal closure
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const timeout = Math.pow(2, reconnectAttempts.current) * 1000; // Exponential backoff
          console.log(`Reconnecting in ${timeout}ms... (attempt ${reconnectAttempts.current + 1})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, timeout);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setError('WebSocket server is not available. Please check if the server is running on localhost:8080');
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        isConnecting.current = false;
        
        // More descriptive error message
        if (reconnectAttempts.current === 0) {
          setError('Cannot connect to WebSocket server. Make sure the server is running on localhost:8080');
        }
      };

    } catch (err) {
      console.error('Error creating WebSocket connection:', err);
      isConnecting.current = false;
      setError('Failed to create WebSocket connection');
    }
  }, [user, authData, getCurrentTabInfo]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting WebSocket...');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (ws.current) {
      // Set readyState to prevent reconnection
      ws.current.onclose = null;
      ws.current.close(1000, 'User disconnected');
      ws.current = null;
    }
    
    setIsConnected(false);
    setError(null);
    isConnecting.current = false;
    reconnectAttempts.current = 0;
  }, []);

  const sendMessage = useCallback((message) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      try {
        const messageData = typeof message === 'string' ? message : JSON.stringify(message);
        ws.current.send(messageData);
        console.log('WebSocket message sent:', messageData);
        return true;
      } catch (err) {
        console.error('Error sending WebSocket message:', err);
        setError('Failed to send message');
        return false;
      }
    } else {
      console.warn('WebSocket is not connected, current state:', ws.current?.readyState);
      setError('WebSocket is not connected');
      return false;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const retry = useCallback(() => {
    setError(null);
    reconnectAttempts.current = 0;
    disconnect();
    setTimeout(() => connect(), 1000);
  }, [connect, disconnect]);

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    messages,
    error,
    tabId,
    windowId,
    room,
    sendMessage,
    connect,
    disconnect,
    clearError,
    retry
  };
};
