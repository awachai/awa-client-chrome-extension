import React from 'react';
import { Bot, Send, Wifi, WifiOff, RotateCcw, User, Bug, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/useWebSocket';
import { CommandHandler } from '@/utils/commandHandler';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';

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
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { authData, logout } = useAuth();
  const isMobile = useIsMobile();

  // Helper function to send console logs to content script
  const sendConsoleLog = (message: string, level: 'log' | 'info' | 'warn' | 'error' = 'log') => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id!, {
            type: 'CONSOLE_LOG',
            message: message,
            level: level
          });
        }
      });
    }
  };

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

  // File handling functions
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newFiles = Array.from(files).filter(file => {
        if (file.type.startsWith('image/')) {
          return file.size <= 10 * 1024 * 1024; // 10MB limit
        }
        return false;
      });
      
      if (newFiles.length !== files.length) {
        toast({
          title: "ไฟล์บางไฟล์ไม่สามารถแนบได้",
          description: "รองรับเฉพาะรูปภาพที่มีขนาดไม่เกิน 10MB",
          variant: "destructive",
        });
      }
      
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
    if (wsMessages.length > 0) {
      const latestMessage = wsMessages[wsMessages.length - 1];
      
      // เฉพาะ debug logs ที่สำคัญ
      if (debugMode) {
        sendConsoleLog(`📨 New WebSocket message: ${JSON.stringify(latestMessage)}`);
      }
      
      // ตรวจสอบว่าเป็น JSON command structure หรือไม่ - แก้ไขให้ตรวจสอบ tranType ด้วย
      if (latestMessage.tranType === 'request' && latestMessage.type === 'command' && latestMessage.action) {
        sendConsoleLog('🎯 DETECTED JSON COMMAND - Processing...', 'info');
        
        // แสดง debug message
        if (debugMode) {
          const debugMessage: Message = {
            id: `debug-${Date.now()}`,
            type: 'debug',
            content: `🎯 Processing command: ${latestMessage.action} on ${latestMessage.selector || 'no selector'}`,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, debugMessage]);
        }
        
        // ส่งคำสั่งไปยัง Chrome Extension
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          const commandPayload = {
            type: 'EXECUTE_DOM_COMMAND',
            command: latestMessage,
            sidePanelTabId: tabId,
            originalCommand: latestMessage
          };
          
          sendConsoleLog(`📤 Sending command to Chrome Extension: ${latestMessage.action}`, 'info');
          
          chrome.runtime.sendMessage(commandPayload, (response) => {
            if (chrome.runtime.lastError) {
              sendConsoleLog(`❌ Chrome extension error: ${chrome.runtime.lastError.message}`, 'error');
              
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
              sendConsoleLog(`✅ Command executed successfully: ${JSON.stringify(response)}`, 'info');
              
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
          sendConsoleLog('⚠️ Chrome extension not available, using fallback', 'warn');
          
          // Fallback ไปใช้ CommandHandler แบบเดิม
          commandHandler.executeCommand(latestMessage).then(result => {
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
        // สำหรับข้อความทั่วไปที่ไม่ใช่ command
        if (latestMessage.tranType === 'request' && latestMessage.type !== 'command') {
          commandHandler.executeCommand(latestMessage);
        } else if (!latestMessage.tranType) {
          // ข้อความแบบเก่าที่ไม่มี tranType structure
          commandHandler.executeCommand(latestMessage);
        }
      }
    }
  }, [wsMessages, debugMode, tabId, room, sendMessage]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() && selectedFiles.length === 0) return;
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
      content: inputMessage || (selectedFiles.length > 0 ? `แนบไฟล์ ${selectedFiles.length} ไฟล์` : ''),
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    const parseResult = parseJsonFromText(inputMessage);
    const attachments: Attachment[] = [];
    
    // Convert files to base64
    for (const file of selectedFiles) {
      try {
        const base64Content = await convertFileToBase64(file);
        attachments.push({
          type: 'image',
          content: base64Content,
          name: file.name
        });
      } catch (error) {
        console.error('Error converting file to base64:', error);
      }
    }
    
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
      sendConsoleLog('Message sent successfully via WebSocket');
    } else {
      toast({
        title: "ส่งข้อความไม่สำเร็จ",
        description: "ไม่สามารถส่งข้อความได้",
        variant: "destructive",
      });
    }
    
    setInputMessage('');
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsProcessing(false);
  };

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-3 md:p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 md:space-x-3">
            <Bot className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
            <div>
              <h1 className="text-lg md:text-xl font-kanit font-semibold">AI Web Agent</h1>
              <div className="flex items-center space-x-1 md:space-x-2 flex-wrap">
                {isConnected ? (
                  <Badge variant="default" className="bg-green-100 text-green-800 text-xs">
                    <Wifi className="h-2 w-2 md:h-3 md:w-3 mr-1" />
                    เชื่อมต่อแล้ว
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    <WifiOff className="h-2 w-2 md:h-3 md:w-3 mr-1" />
                    ไม่ได้เชื่อมต่อ
                  </Badge>
                )}
                {authData && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 text-xs">
                    <User className="h-2 w-2 md:h-3 md:w-3 mr-1" />
                    {authData.room}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1 md:space-x-2">
            <Button 
              variant={debugMode ? "default" : "outline"} 
              size="sm" 
              onClick={() => setDebugMode(!debugMode)}
              className={`text-xs ${debugMode ? "bg-orange-500 hover:bg-orange-600" : ""}`}
            >
              <Bug className="h-3 w-3 md:h-4 md:w-4 mr-1" />
              {isMobile ? '' : 'Debug'}
            </Button>
            {wsError && (
              <Button variant="outline" size="sm" onClick={retry} className="text-xs">
                <RotateCcw className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                {isMobile ? '' : 'ลองใหม่'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout} className="text-xs">
              {isMobile ? 'ออก' : 'ออกจากระบบ'}
            </Button>
          </div>
        </div>
        
        {/* Debug Panel - Mobile Optimized */}
        {debugMode && (
          <div className="mt-3 p-2 md:p-3 bg-gray-100 rounded-lg">
            <h3 className="text-xs md:text-sm font-semibold mb-2">Debug Information</h3>
            <div className={`grid ${isMobile ? 'grid-cols-1 gap-2' : 'grid-cols-2 gap-4'} text-xs`}>
              <div><strong>Connection:</strong> {isConnected ? 'Connected' : 'Disconnected'}</div>
              <div><strong>Tab ID:</strong> {tabId || 'N/A'}</div>
              <div><strong>Room:</strong> {room || 'N/A'}</div>
              <div><strong>Messages:</strong> {wsMessages.length}</div>
              <div><strong>Token:</strong> {authData?.token ? 'Present' : 'None'}</div>
              <div><strong>Extension:</strong> {typeof chrome !== 'undefined' && chrome.runtime ? 'Available' : 'Not Available'}</div>
            </div>
            
            {wsMessages.length > 0 && (
              <div className="mt-2">
                <strong className="text-xs">Latest Messages:</strong>
                <div className="max-h-24 md:max-h-32 overflow-y-auto mt-1 bg-white p-2 rounded text-xs">
                  {wsMessages.slice(-3).map((msg, index) => (
                    <div key={index} className="mb-1 p-1 border-b border-gray-200 last:border-b-0">
                      <div className="font-mono break-all">{JSON.stringify(msg, null, isMobile ? 0 : 2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-2 md:p-4">
        <div className="space-y-3 md:space-y-4 max-w-4xl mx-auto">
          {messages.map((message) => (
            <Card key={message.id} className={`p-3 md:p-4 ${
              message.type === 'user' 
                ? 'bg-blue-50 border-blue-200 ml-auto max-w-sm md:max-w-md' 
                : message.type === 'debug'
                ? 'bg-yellow-50 border-yellow-200'
                : 'bg-white border-gray-200 mr-auto max-w-sm md:max-w-md'
            }`}>
              <div className="flex items-start space-x-2 md:space-x-3">
                {message.type === 'user' ? (
                  <User className="h-4 w-4 md:h-5 md:w-5 text-blue-600 mt-1 flex-shrink-0" />
                ) : (
                  <Bot className="h-4 w-4 md:h-5 md:w-5 text-gray-600 mt-1 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs md:text-sm text-gray-500 mb-1">
                    {message.type === 'user' ? 'คุณ' : message.type === 'debug' ? 'Debug' : 'AI'}
                    <span className="ml-2">
                      {message.timestamp.toLocaleTimeString('th-TH')}
                    </span>
                  </div>
                  <div className="text-sm md:text-base text-gray-900 whitespace-pre-wrap break-words">
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

      {/* File Preview */}
      {selectedFiles.length > 0 && (
        <div className="bg-white border-t border-gray-200 p-2 md:p-3">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-wrap gap-2">
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center bg-gray-100 rounded-lg p-2 text-xs md:text-sm">
                  <span className="truncate max-w-24 md:max-w-32">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    className="ml-2 p-1 h-auto"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-2 md:p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex space-x-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="พิมพ์ข้อความหรือ JSON command..."
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              disabled={!isConnected || isProcessing}
              className="flex-1 text-sm md:text-base"
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button 
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={!isConnected || isProcessing}
              size="sm"
              className="flex-shrink-0"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button 
              onClick={handleSendMessage}
              disabled={!isConnected || isProcessing || (!inputMessage.trim() && selectedFiles.length === 0)}
              size="sm"
              className="flex-shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {wsError && (
            <div className="mt-2 text-xs md:text-sm text-red-600 bg-red-50 p-2 rounded">
              {wsError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
