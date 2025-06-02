import React from 'react';
import { Bot, Send, Wifi, WifiOff, RotateCcw, User, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/useWebSocket';
import { CommandHandler } from '@/utils/commandHandler';
import { useAuth } from '@/hooks/useAuth';

interface Message {
  id: string;
  type: 'user' | 'ai' | 'debug';
  content: string;
  timestamp: Date;
  imageUrl?: string;
}

interface Attachment {
  type: 'image';
  content: string;
  name: string;
}

const ChatPage = () => {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputMessage, setInputMessage] = React.useState('');
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [debugMode, setDebugMode] = React.useState(false);
  const { toast } = useToast();
  const { authData, logout } = useAuth();

  const parseJsonFromText = (text: string) => {
    try {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const jsonText = jsonMatch[1].trim();
        const parsed = JSON.parse(jsonText);
        return { isJson: true, data: parsed };
      }
      
      const parsed = JSON.parse(text);
      return { isJson: true, data: parsed };
    } catch {
      return { isJson: false };
    }
  };

  // WebSocket connection with auth data
  const { isConnected, messages: wsMessages, error: wsError, sendMessage, retry, clearError, tabId, room } = useWebSocket('nueng', authData);

  const commandHandler = new CommandHandler({
    onTextMessage: (message: string) => {
      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: message,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
    },
    onImageReceived: (imageUrl: string) => {
      const imageMessage: Message = {
        id: `ai-image-${Date.now()}`,
        type: 'ai',
        content: 'รูปภาพถูกส่งมาแล้ว',
        timestamp: new Date(),
        imageUrl
      };
      setMessages(prev => [...prev, imageMessage]);
    },
    onConfirmRequest: async (message: string) => {
      return window.confirm(message);
    },
    onDebugMessage: (message: string) => {
      if (message) {
        const debugMessage: Message = {
          id: `debug-${Date.now()}`,
          type: 'debug',
          content: message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, debugMessage]);
      }
    },
    sendWebSocketMessage: sendMessage
  });

  React.useEffect(() => {
    console.log('=== WEBSOCKET MESSAGES DEBUG ===');
    console.log('Total WebSocket messages:', wsMessages.length);
    console.log('All WebSocket messages:', wsMessages);
    
    if (wsMessages.length > 0) {
      const latestMessage = wsMessages[wsMessages.length - 1];
      console.log('=== PROCESSING LATEST MESSAGE ===');
      console.log('Latest message:', latestMessage);
      console.log('Message type:', typeof latestMessage);
      console.log('tranType:', latestMessage.tranType);
      console.log('type:', latestMessage.type);
      console.log('action:', latestMessage.action);
      
      // ตรวจสอบว่าเป็น JSON command structure หรือไม่
      if (latestMessage.tranType === 'request' && latestMessage.type === 'command') {
        console.log('🎯 DETECTED JSON COMMAND - Processing...');
        console.log('Command details:', {
          action: latestMessage.action,
          selector: latestMessage.selector,
          message: latestMessage.message
        });
        
        // แสดง debug message
        if (debugMode) {
          const debugMessage: Message = {
            id: `debug-${Date.now()}`,
            type: 'debug',
            content: `Received command: ${latestMessage.action} on ${latestMessage.selector}`,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, debugMessage]);
        }
        
        // ตรวจสอบว่ามี Chrome Extension หรือไม่
        console.log('🔍 CHECKING CHROME EXTENSION...');
        console.log('Chrome object:', typeof chrome);
        console.log('Chrome runtime:', typeof chrome?.runtime);
        console.log('Chrome runtime ID:', chrome?.runtime?.id);
        
        // ส่งคำสั่งไปยัง Chrome Extension
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          console.log('📤 SENDING TO CHROME EXTENSION...');
          console.log('Tab ID:', tabId);
          console.log('Room:', room);
          
          const commandPayload = {
            type: 'EXECUTE_DOM_COMMAND',
            command: latestMessage,
            sidePanelTabId: tabId,
            originalCommand: latestMessage
          };
          
          console.log('Command payload:', commandPayload);
          
          chrome.runtime.sendMessage(commandPayload, (response) => {
            console.log('📥 CHROME EXTENSION RESPONSE:', response);
            
            if (chrome.runtime.lastError) {
              console.error('❌ Chrome extension error:', chrome.runtime.lastError);
              
              // ส่ง error response กลับ
              const errorResponse = {
                tranType: 'response',
                type: 'command',
                action: latestMessage.action,
                message: `error: ${chrome.runtime.lastError.message}`,
                selector: latestMessage.selector || '',
                tab_id: tabId,
                room: room,
                timestamp: new Date().toISOString()
              };
              
              console.log('📤 SENDING ERROR RESPONSE:', errorResponse);
              sendMessage(errorResponse);
              
              if (debugMode) {
                const debugMessage: Message = {
                  id: `debug-${Date.now()}`,
                  type: 'debug',
                  content: `❌ Command failed: ${chrome.runtime.lastError.message}`,
                  timestamp: new Date()
                };
                setMessages(prev => [...prev, debugMessage]);
              }
            } else {
              console.log('✅ Command executed successfully:', response);
              
              // ตรวจสอบ response และสร้าง message ที่เหมาะสม
              const isSuccess = response && (response.success === true || response.message === 'success');
              const responseMessage = isSuccess ? 'success' : (response?.error || response?.message || 'unknown error');
              
              // ส่ง success response กลับ
              const successResponse = {
                tranType: 'response',
                type: 'command',
                action: latestMessage.action,
                message: responseMessage,
                selector: latestMessage.selector || '',
                tab_id: tabId,
                room: room,
                timestamp: new Date().toISOString()
              };
              
              console.log('📤 SENDING SUCCESS RESPONSE:', successResponse);
              sendMessage(successResponse);
              
              if (debugMode) {
                const debugMessage: Message = {
                  id: `debug-${Date.now()}`,
                  type: 'debug',
                  content: `✅ Command completed: ${responseMessage}`,
                  timestamp: new Date()
                };
                setMessages(prev => [...prev, debugMessage]);
              }
            }
          });
        } else {
          console.warn('⚠️ Chrome extension not available, using fallback command handler');
          
          // Fallback ไปใช้ CommandHandler แบบเดิม
          commandHandler.executeCommand(latestMessage).then(result => {
            console.log('📥 FALLBACK COMMAND RESULT:', result);
            
            if (result) {
              const response = {
                tranType: 'response',
                type: 'command',
                action: latestMessage.action,
                message: result.message || 'completed',
                selector: latestMessage.selector || '',
                tab_id: tabId,
                room: room,
                timestamp: new Date().toISOString()
              };
              
              console.log('📤 SENDING FALLBACK RESPONSE:', response);
              sendMessage(response);
              
              if (debugMode) {
                const debugMessage: Message = {
                  id: `debug-${Date.now()}`,
                  type: 'debug',
                  content: `Fallback command completed: ${response.message}`,
                  timestamp: new Date()
                };
                setMessages(prev => [...prev, debugMessage]);
              }
            }
          });
        }
      } else {
        console.log('ℹ️ Not a command message, processing as regular message');
        // สำหรับคำสั่งแบบอื่นๆ ที่ไม่ใช่ command
        if (latestMessage.tranType === 'request') {
          console.log('Processing non-command request:', latestMessage);
          commandHandler.executeCommand(latestMessage);
        }
      }
    } else {
      console.log('ℹ️ No WebSocket messages yet');
    }
  }, [wsMessages, debugMode, tabId, room, sendMessage]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    if (!isConnected) {
      toast({
        title: "ไม่ได้เชื่อมต่อ",
        description: "กรุณารอการเชื่อมต่อ WebSocket",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    const parseResult = parseJsonFromText(inputMessage);
    const attachments: Attachment[] = [];
    
    const wsMessage = {
      type: 'user_message',
      content: inputMessage,
      attachments,
      timestamp: new Date().toISOString(),
      isJsonCommand: parseResult.isJson,
      jsonData: parseResult.isJson ? parseResult.data : null,
      room: authData?.room || null,
      token: authData?.token || null
    };
    
    const sent = sendMessage(wsMessage);
    
    if (sent) {
      console.log('Message sent successfully via WebSocket');
    } else {
      toast({
        title: "ส่งข้อความไม่สำเร็จ",
        description: "ไม่สามารถส่งข้อความได้",
        variant: "destructive",
      });
    }
    
    setInputMessage('');
    setIsProcessing(false);
  };

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Bot className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-xl font-kanit font-semibold">AI Web Agent</h1>
              <div className="flex items-center space-x-2">
                {isConnected ? (
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    <Wifi className="h-3 w-3 mr-1" />
                    เชื่อมต่อแล้ว
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <WifiOff className="h-3 w-3 mr-1" />
                    ไม่ได้เชื่อมต่อ
                  </Badge>
                )}
                {authData && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700">
                    <User className="h-3 w-3 mr-1" />
                    {authData.room}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant={debugMode ? "default" : "outline"} 
              size="sm" 
              onClick={() => setDebugMode(!debugMode)}
              className={debugMode ? "bg-orange-500 hover:bg-orange-600" : ""}
            >
              <Bug className="h-4 w-4 mr-1" />
              Debug
            </Button>
            {wsError && (
              <Button variant="outline" size="sm" onClick={retry}>
                <RotateCcw className="h-4 w-4 mr-1" />
                ลองใหม่
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout}>
              ออกจากระบบ
            </Button>
          </div>
        </div>
        
        {/* Debug Panel */}
        {debugMode && (
          <div className="mt-4 p-3 bg-gray-100 rounded-lg">
            <h3 className="text-sm font-semibold mb-2">Debug Information</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <strong>Connection Status:</strong> {isConnected ? 'Connected' : 'Disconnected'}
              </div>
              <div>
                <strong>Tab ID:</strong> {tabId || 'N/A'}
              </div>
              <div>
                <strong>Room:</strong> {room || 'N/A'}
              </div>
              <div>
                <strong>WebSocket Messages:</strong> {wsMessages.length}
              </div>
              <div>
                <strong>Auth Token:</strong> {authData?.token ? 'Present' : 'None'}
              </div>
              <div>
                <strong>User:</strong> {authData?.room || 'nueng'}
              </div>
              <div>
                <strong>Chrome Extension:</strong> {typeof chrome !== 'undefined' && chrome.runtime ? 'Available' : 'Not Available'}
              </div>
              <div>
                <strong>Chrome Runtime ID:</strong> {chrome?.runtime?.id || 'N/A'}
              </div>
            </div>
            
            {wsMessages.length > 0 && (
              <div className="mt-3">
                <strong className="text-sm">Latest WebSocket Messages:</strong>
                <div className="max-h-32 overflow-y-auto mt-1 bg-white p-2 rounded text-xs">
                  {wsMessages.slice(-5).map((msg, index) => (
                    <div key={index} className="mb-1 p-1 border-b border-gray-200 last:border-b-0">
                      <div className="font-mono">{JSON.stringify(msg, null, 2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.map((message) => (
            <Card key={message.id} className={`p-4 ${
              message.type === 'user' 
                ? 'bg-blue-50 border-blue-200 ml-auto max-w-md' 
                : message.type === 'debug'
                ? 'bg-yellow-50 border-yellow-200'
                : 'bg-white border-gray-200 mr-auto max-w-md'
            }`}>
              <div className="flex items-start space-x-3">
                {message.type === 'user' ? (
                  <User className="h-5 w-5 text-blue-600 mt-1" />
                ) : (
                  <Bot className="h-5 w-5 text-gray-600 mt-1" />
                )}
                <div className="flex-1">
                  <div className="text-sm text-gray-500 mb-1">
                    {message.type === 'user' ? 'คุณ' : message.type === 'debug' ? 'Debug' : 'AI'}
                    <span className="ml-2">
                      {message.timestamp.toLocaleTimeString('th-TH')}
                    </span>
                  </div>
                  <div className="text-gray-900 whitespace-pre-wrap">
                    {message.content}
                  </div>
                  {message.imageUrl && (
                    <div className="mt-2">
                      <img 
                        src={message.imageUrl} 
                        alt="Generated content" 
                        className="max-w-full h-auto rounded-lg border"
                      />
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex space-x-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="พิมพ์ข้อความหรือ JSON command..."
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              disabled={!isConnected || isProcessing}
              className="flex-1"
            />
            <Button 
              onClick={handleSendMessage}
              disabled={!isConnected || isProcessing || !inputMessage.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {wsError && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
              {wsError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
