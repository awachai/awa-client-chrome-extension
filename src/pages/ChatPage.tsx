import React, { useState, useRef, useEffect } from 'react';
import { Send, Settings, Bug, X, RefreshCw } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useWebSocket } from '../hooks/useWebSocket';
import { CommandHandler } from '../utils/commandHandler';
import { ChromeExtensionHandler } from '../utils/chromeExtensionHandler';
import { debug_mode } from '../config/env';
import { useAuth } from '../hooks/useAuth';

const ChatPage: React.FC = () => {
  const { user, authData, logout } = useAuth();
  const { 
    isConnected, 
    messages, 
    error, 
    tabId, 
    windowId, // เพิ่ม windowId
    room, 
    sendMessage, 
    sendResponse, 
    retry, 
    clearError 
  } = useWebSocket(user || 'guest', authData);
  
  const [inputMessage, setInputMessage] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const chromeHandler = new ChromeExtensionHandler();

  const handleSendMessage = () => {
    if (inputMessage.trim()) {
      const message = {
        id: `user-${Date.now()}`,
        type: 'user',
        content: inputMessage,
        timestamp: new Date(),
        tranType: 'request',
        action: 'send_message'
      };
      sendMessage(message);
      setInputMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    // Scroll to bottom on new messages
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      {/* Debug Panel */}
      {debug_mode && (
        <Card className="mb-4 border-orange-200 bg-orange-50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-orange-800">
                <Bug className="w-4 h-4 inline mr-2" />
                Debug Information
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.location.reload()}
                className="text-orange-600 hover:text-orange-800"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="font-medium text-orange-700">Connection:</span>{' '}
                <Badge variant={isConnected ? "default" : "destructive"} className="ml-1">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
              <div>
                <span className="font-medium text-orange-700">Tab ID:</span>{' '}
                <code className="bg-orange-100 px-1 rounded text-orange-800">
                  {tabId || 'Not Set'}
                </code>
              </div>
              <div>
                <span className="font-medium text-orange-700">Window ID:</span>{' '}
                <code className="bg-orange-100 px-1 rounded text-orange-800">
                  {windowId || 'Not Set'}
                </code>
              </div>
              <div>
                <span className="font-medium text-orange-700">Room:</span>{' '}
                <code className="bg-orange-100 px-1 rounded text-orange-800">
                  {room || 'Not Set'}
                </code>
              </div>
              <div>
                <span className="font-medium text-orange-700">Messages:</span>{' '}
                <Badge variant="outline" className="ml-1">
                  {messages.length}
                </Badge>
              </div>
              <div>
                <span className="font-medium text-orange-700">Token:</span>{' '}
                <Badge variant={authData?.token ? "default" : "secondary"} className="ml-1">
                  {authData?.token ? 'Present' : 'None'}
                </Badge>
              </div>
              <div className="col-span-2">
                <span className="font-medium text-orange-700">Extension:</span>{' '}
                <Badge variant={chromeHandler.isReady() ? "default" : "secondary"} className="ml-1">
                  {chromeHandler.isReady() ? 'Available' : 'Not Available'}
                </Badge>
              </div>
            </div>
            
            {/* Latest Messages Preview */}
            {messages.length > 0 && (
              <div className="mt-3 pt-3 border-t border-orange-200">
                <div className="font-medium text-orange-700 text-xs mb-2">Latest Messages:</div>
                <div className="space-y-1 max-h-20 overflow-y-auto">
                  {messages.slice(-3).map((msg, idx) => (
                    <div key={idx} className="text-xs text-orange-600 truncate">
                      <span className="font-medium">
                        {msg.type === 'user' ? 'You' : 'AI'}:
                      </span>{' '}
                      {typeof msg.content === 'string' 
                        ? msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : '')
                        : JSON.stringify(msg.content).substring(0, 50) + '...'
                      }
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="container mx-auto max-w-2xl">
        <Card className="bg-white shadow-md rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-2xl font-bold">AI Chat</CardTitle>
            <Button variant="ghost" onClick={() => setSettingsOpen(!settingsOpen)}>
              <Settings className="w-5 h-5" />
            </Button>
          </CardHeader>

          <CardContent className="px-4 py-2">
            <div
              ref={chatBoxRef}
              className="space-y-2 h-64 overflow-y-auto mb-2"
            >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col rounded-lg p-3 w-fit max-w-[80%] ${msg.type === 'user' ? 'bg-blue-100 ml-auto items-end' : 'bg-gray-100 mr-auto'
                    }`}
                >
                  <div className="text-sm text-gray-800">{msg.content}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>

            <Separator className="my-2" />

            <div className="flex items-center space-x-2">
              <Input
                placeholder="Send a message..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-grow rounded-full py-2"
              />
              <Button onClick={handleSendMessage} className="rounded-full">
                <Send className="w-4 h-4 mr-2" />
                Send
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ChatPage;
