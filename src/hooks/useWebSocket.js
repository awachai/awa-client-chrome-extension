import { useState, useEffect, useRef, useCallback } from 'react';
import { getWebSocketUrl } from '../config/env';

export const useWebSocket = (user = 'nueng', authData = null) => {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [tabId, setTabId] = useState(null);
  const [room, setRoom] = useState(null);
  const ws = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const isConnecting = useRef(false);

  // Get current tab ID and room information
  const getCurrentTabInfo = useCallback(async () => {
    try {
      // Try to get tab ID from Chrome extension if available
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
          const currentTabId = tabs[0].id;
          setTabId(currentTabId);
          console.log('Got tab ID from Chrome extension:', currentTabId);
          return currentTabId;
        }
      }
      
      // Fallback: generate a unique tab ID based on session
      const fallbackTabId = `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setTabId(fallbackTabId);
      console.log('Generated fallback tab ID:', fallbackTabId);
      return fallbackTabId;
    } catch (error) {
      console.error('Error getting tab info:', error);
      const fallbackTabId = `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setTabId(fallbackTabId);
      return fallbackTabId;
    }
  }, []);

  const connect = useCallback(async () => {
    // Prevent multiple simultaneous connection attempts
    if (isConnecting.current || (ws.current && ws.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      // Get tab info before connecting
      const currentTabId = await getCurrentTabInfo();
      
      // Use room from authData if available, otherwise fallback to user-based room
      const currentRoom = authData?.room || `room_${user}_${currentTabId}`;
      setRoom(currentRoom);

      const wsUrl = getWebSocketUrl(user);
      
      // เพิ่ม Authorization header ถ้ามี token
      const wsUrlWithAuth = authData?.token 
        ? `${wsUrl}?authorization=${encodeURIComponent(`Bearer ${authData.token}`)}`
        : wsUrl;
      
      console.log('Attempting WebSocket connection to:', wsUrlWithAuth);
      console.log('Tab ID:', currentTabId);
      console.log('Room:', currentRoom);
      console.log('Auth Data:', authData);
      console.log('Authorization header will be sent:', authData?.token ? `Bearer ${authData.token}` : 'No token');
      
      isConnecting.current = true;
      ws.current = new WebSocket(wsUrlWithAuth);

      ws.current.onopen = () => {
        console.log('WebSocket connected successfully with authorization');
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
        isConnecting.current = false;

        // Send initial connection info to server
        const connectionInfo = {
          tranType: 'response',
          type: 'connection',
          action: 'connect',
          message: 'Connected successfully with authorization',
          tab_id: currentTabId,
          room: currentRoom,
          token: authData?.token || null,
          data: {
            user: user,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            authenticated: !!authData,
            hasToken: !!authData?.token
          }
        };
        
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify(connectionInfo));
          console.log('Sent connection info to server with auth:', connectionInfo);
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);
          
          // ตรวจสอบว่าเป็น command ที่มี tranType หรือไม่
          if (data.tranType === 'request') {
            console.log('Received command request:', data);
            setMessages(prev => [...prev, data]);
          } else if (data.tranType === 'response') {
            console.log('Received response from server:', data);
            setMessages(prev => [...prev, data]);
          } else {
            // สำหรับข้อความทั่วไปที่ไม่มี tranType
            setMessages(prev => [...prev, data]);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
          // Don't set error for parsing issues, just log them
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

  // ฟังก์ชันสำหรับส่ง response กลับเซิร์ฟเวอร์
  const sendResponse = useCallback((responseCommand) => {
    // เพิ่ม tab_id และ room ใน response
    const enhancedResponse = {
      ...responseCommand,
      tab_id: tabId,
      room: room,
      token: authData?.token || null,
      timestamp: new Date().toISOString()
    };
    
    console.log('Sending enhanced response to server:', enhancedResponse);
    const sent = sendMessage(enhancedResponse);
    
    // แสดง console log ใน content script ด้วย
    if (sent) {
      console.log('✅ Response sent successfully via WebSocket:', enhancedResponse);
      
      // ส่ง console log ไปยัง content script ด้วย
      if (typeof chrome !== 'undefined' && chrome.tabs && tabId) {
        try {
          // ถ้าเป็น Chrome Extension context ให้ส่ง log ไป content script
          chrome.tabs.sendMessage(parseInt(tabId), {
            type: 'CONSOLE_LOG',
            message: `Response sent to server: ${JSON.stringify(enhancedResponse)}`,
            level: 'info'
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.log('Could not send log to content script:', chrome.runtime.lastError.message);
            }
          });
        } catch (error) {
          console.log('Error sending log to content script:', error);
        }
      }
    } else {
      console.error('❌ Failed to send response via WebSocket');
    }
    
    return sent;
  }, [sendMessage, tabId, room, authData]);

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
    room,
    sendMessage,
    sendResponse,
    connect,
    disconnect,
    clearError,
    retry
  };
};
