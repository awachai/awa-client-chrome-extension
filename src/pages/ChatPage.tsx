import React from 'react';
import { Bot, Send, Wifi, WifiOff, RotateCcw, User, Bug, Paperclip, X, Upload, Eye, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/useWebSocket';
import { CommandHandler } from '@/utils/commandHandler';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { ImageNavigationDialog } from '@/components/ImageNavigationDialog';

interface Message {
  id: string;
  type: 'user' | 'ai' | 'debug';
  content: string;
  timestamp: Date;
  imageUrl?: string;
  attachments?: Array<{
    type: 'image' | 'file';
    content: string;
    name: string;
    url: string;
    fileType?: string;
  }>;
}

interface Attachment {
  type: 'image' | 'file';
  content: string;
  name: string;
}

const ChatPage = () => {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputMessage, setInputMessage] = React.useState('');
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [debugMode, setDebugMode] = React.useState(false);
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [filePreviewUrls, setFilePreviewUrls] = React.useState<{[key: string]: string}>({});
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
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
  const validateFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    return fileArray.filter(file => {
      // รองรับไฟล์หลายประเภท
      if (file.type.startsWith('image/')) {
        return file.size <= 10 * 1024 * 1024; // 10MB limit for images
      }
      // รองรับไฟล์ประเภทอื่นๆ
      if (file.type === 'application/pdf' || 
          file.type.startsWith('text/') ||
          file.type === 'application/msword' ||
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        return file.size <= 50 * 1024 * 1024; // 50MB limit for documents
      }
      return false;
    });
  };

  const createFilePreviewUrl = (file: File): string => {
    return URL.createObjectURL(file);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const validFiles = validateFiles(files);
      
      if (validFiles.length !== files.length) {
        toast({
          title: "ไฟล์บางไฟล์ไม่สามารถแนบได้",
          description: "รองรับรูปภาพ (≤10MB) และเอกสาร (≤50MB)",
          variant: "destructive",
        });
      }
      
      // Create preview URLs for new files
      const newPreviewUrls: {[key: string]: string} = {};
      validFiles.forEach(file => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (file.type.startsWith('image/')) {
          newPreviewUrls[key] = createFilePreviewUrl(file);
        }
      });
      
      setFilePreviewUrls(prev => ({ ...prev, ...newPreviewUrls }));
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
  };

  // Drag and Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only set dragOver to false if we're leaving the entire drop zone
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const validFiles = validateFiles(files);
      
      if (validFiles.length !== files.length) {
        toast({
          title: "ไฟล์บางไฟล์ไม่สามารถแนบได้",
          description: "รองรับรูปภาพ (≤10MB) และเอกสาร (≤50MB)",
          variant: "destructive",
        });
      }
      
      if (validFiles.length > 0) {
        // Create preview URLs for drag & dropped files
        const newPreviewUrls: {[key: string]: string} = {};
        validFiles.forEach(file => {
          const key = `${file.name}-${file.size}-${file.lastModified}`;
          if (file.type.startsWith('image/')) {
            newPreviewUrls[key] = createFilePreviewUrl(file);
          }
        });
        
        setFilePreviewUrls(prev => ({ ...prev, ...newPreviewUrls }));
        setSelectedFiles(prev => [...prev, ...validFiles]);
        
        toast({
          title: "แนบไฟล์สำเร็จ",
          description: `แนบไฟล์ ${validFiles.length} ไฟล์แล้ว`,
        });
      }
    }
  };

  const removeFile = (index: number) => {
    const fileToRemove = selectedFiles[index];
    const key = `${fileToRemove.name}-${fileToRemove.size}-${fileToRemove.lastModified}`;
    
    // Revoke the object URL to free memory
    if (filePreviewUrls[key]) {
      URL.revokeObjectURL(filePreviewUrls[key]);
    }
    
    setFilePreviewUrls(prev => {
      const newUrls = { ...prev };
      delete newUrls[key];
      return newUrls;
    });
    
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
    }
  });

  React.useEffect(() => {
    if (wsMessages.length > 0) {
      const latestMessage = wsMessages[wsMessages.length - 1];
      
      // เฉพาะ debug logs ที่สำคัญ
      if (debugMode) {
        sendConsoleLog(`📨 New WebSocket message: ${JSON.stringify(latestMessage)}`);
      }
      
      // สำหรับข้อความทั่วไป - เซิร์ฟเวอร์จะจัดการ command processing
      if (latestMessage.tranType === 'request' && (latestMessage.type === 'text' || latestMessage.type === 'image')) {
        commandHandler.executeCommand(latestMessage);
      } else if (!latestMessage.tranType) {
        // ข้อความแบบเก่าที่ไม่มี tranType structure
        commandHandler.executeCommand(latestMessage);
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
    
    // Convert files to base64 first
    const attachments: Attachment[] = [];
    for (const file of selectedFiles) {
      try {
        const base64Content = await convertFileToBase64(file);
        attachments.push({
          type: file.type.startsWith('image/') ? 'image' : 'file',
          content: base64Content,
          name: file.name
        });
      } catch (error) {
        console.error('Error converting file to base64:', error);
      }
    }
    
    // Create attachments with base64 content for the message display
    const messageAttachments = attachments.map(attachment => ({
      type: attachment.type,
      content: attachment.content,
      name: attachment.name,
      url: attachment.type === 'image' ? `data:${selectedFiles.find(f => f.name === attachment.name)?.type || 'image/jpeg'};base64,${attachment.content}` : '',
      fileType: selectedFiles.find(f => f.name === attachment.name)?.type
    }));
    
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: inputMessage || (selectedFiles.length > 0 ? `แนบไฟล์ ${selectedFiles.length} ไฟล์` : ''),
      timestamp: new Date(),
      attachments: messageAttachments
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    const parseResult = parseJsonFromText(inputMessage);
    
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

    if (typeof chrome !== 'undefined' && chrome.runtime && tabId) {
      chrome.runtime.sendMessage({
        type: 'USER_INPUT',
        tabId,
        windowId: window?.chrome?.windows ? undefined : undefined // ถ้ามี windowId ให้ใส่, ถ้าไม่มีปล่อยว่าง
      });
    }
    
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
    
    // Clean up file preview URLs
    selectedFiles.forEach(file => {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (filePreviewUrls[key]) {
        URL.revokeObjectURL(filePreviewUrls[key]);
      }
    });
    
    setSelectedFiles([]);
    setFilePreviewUrls({});
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsProcessing(false);
  };

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

  // Function to auto-resize textarea
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = window.innerHeight * 0.5; // 50% of viewport height
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = Math.min(scrollHeight, maxHeight) + 'px';
    }
  };

  // Update the input change handler
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    adjustTextareaHeight();
  };

  // Auto-adjust height when component mounts or input message changes
  React.useEffect(() => {
    adjustTextareaHeight();
  }, [inputMessage]);

  const [imageDialog, setImageDialog] = React.useState<{
    isOpen: boolean;
    imageUrl: string;
    imageName: string;
    messageId: string;
    attachmentIndex?: number;
  }>({
    isOpen: false,
    imageUrl: '',
    imageName: '',
    messageId: '',
    attachmentIndex: undefined
  });

  const openImageDialog = (imageUrl: string, imageName: string, messageId: string, attachmentIndex?: number) => {
    setImageDialog({
      isOpen: true,
      imageUrl,
      imageName,
      messageId,
      attachmentIndex
    });
  };

  const closeImageDialog = () => {
    setImageDialog({
      isOpen: false,
      imageUrl: '',
      imageName: '',
      messageId: '',
      attachmentIndex: undefined
    });
  };

  return (
    <div 
      className="flex flex-col h-screen bg-gray-50"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="fixed inset-0 bg-blue-500 bg-opacity-20 z-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg border-2 border-dashed border-blue-500 text-center">
            <Upload className="h-12 w-12 text-blue-500 mx-auto mb-2" />
            <p className="text-lg font-semibold text-blue-700">ปล่อยไฟล์ที่นี่เพื่อแนบ</p>
            <p className="text-sm text-gray-600">รองรับรูปภาพขนาดไม่เกิน 10MB</p>
          </div>
        </div>
      )}

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
                  {message.content && (
                    <div className="text-sm md:text-base text-gray-900 whitespace-pre-wrap break-words mb-2">
                      {message.content}
                    </div>
                  )}
                  
                  {/* Display message attachments */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                      {message.attachments.map((attachment, index) => {
                        const displayUrl = attachment.url || 
                          (attachment.content ? `data:${attachment.fileType || 'image/jpeg'};base64,${attachment.content}` : '');
                        
                        return (
                          <div key={index}>
                            {attachment.type === 'image' ? (
                              <div 
                                className="relative cursor-pointer group"
                                onClick={() => openImageDialog(displayUrl, attachment.name, message.id, index)}
                              >
                                <img 
                                  src={displayUrl} 
                                  alt={attachment.name}
                                  className="w-full h-20 object-cover rounded-lg border group-hover:opacity-80 transition-opacity"
                                  onError={(e) => {
                                    console.error('Image load error for attachment:', attachment.name);
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const parent = target.parentElement;
                                    if (parent) {
                                      parent.innerHTML = `
                                        <div class="w-full h-20 bg-gray-100 border rounded-lg flex items-center justify-center">
                                          <svg class="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                          </svg>
                                        </div>
                                      `;
                                    }
                                  }}
                                />
                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity rounded-lg flex items-center justify-center">
                                  <Eye className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </div>
                            ) : (
                              <div 
                                className="p-3 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                                onClick={() => {
                                  if (attachment.content) {
                                    try {
                                      const binaryString = atob(attachment.content);
                                      const bytes = new Uint8Array(binaryString.length);
                                      for (let i = 0; i < binaryString.length; i++) {
                                        bytes[i] = binaryString.charCodeAt(i);
                                      }
                                      const blob = new Blob([bytes], { 
                                        type: attachment.fileType || 'application/octet-stream' 
                                      });
                                      const url = URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = url;
                                      a.download = attachment.name;
                                      document.body.appendChild(a);
                                      a.click();
                                      document.body.removeChild(a);
                                      URL.revokeObjectURL(url);
                                    } catch (error) {
                                      console.error('Error downloading file:', error);
                                      toast({
                                        title: "ไม่สามารถดาวน์โหลดไฟล์ได้",
                                        description: "เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์",
                                        variant: "destructive",
                                      });
                                    }
                                  }
                                }}
                              >
                                <div className="flex items-center space-x-2">
                                  {attachment.fileType?.includes('pdf') ? (
                                    <FileText className="h-4 w-4 text-red-600" />
                                  ) : attachment.fileType?.includes('word') ? (
                                    <FileText className="h-4 w-4 text-blue-600" />
                                  ) : (
                                    <Paperclip className="h-4 w-4 text-gray-600" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate" title={attachment.name}>
                                      {attachment.name}
                                    </p>
                                    <p className="text-xs text-gray-500 flex items-center">
                                      {attachment.fileType || 'ไฟล์เอกสาร'}
                                      <Download className="h-3 w-3 ml-1" />
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {message.imageUrl && (
                    <div 
                      className="mt-2 cursor-pointer group relative"
                      onClick={() => openImageDialog(message.imageUrl!, 'Generated content', message.id)}
                    >
                      <img 
                        src={message.imageUrl} 
                        alt="Generated content" 
                        className="max-w-full h-auto rounded-lg border group-hover:opacity-80 transition-opacity"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity rounded-lg flex items-center justify-center">
                        <Eye className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {/* File Preview with Thumbnails */}
      {selectedFiles.length > 0 && (
        <div className="bg-white border-t border-gray-200 p-2 md:p-3">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {selectedFiles.map((file, index) => {
                const key = `${file.name}-${file.size}-${file.lastModified}`;
                const previewUrl = filePreviewUrls[key];
                const isImage = file.type.startsWith('image/');
                
                return (
                  <div key={index} className="relative group">
                    <div className="relative">
                      {isImage && previewUrl ? (
                        <img 
                          src={previewUrl} 
                          alt={file.name}
                          className="w-full h-20 object-cover rounded-lg border"
                        />
                      ) : (
                        <div className="w-full h-20 bg-gray-100 border rounded-lg flex items-center justify-center">
                          <Paperclip className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeFile(index)}
                        className="absolute -top-2 -right-2 p-1 h-6 w-6 rounded-full"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-gray-600 mt-1 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {file.type || 'ไฟล์เอกสาร'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-2 md:p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end space-x-2">
            <Textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={handleInputChange}
              placeholder="พิมพ์ข้อความหรือ JSON command... หรือลากวางไฟล์ลงในหน้าต่าง"
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={!isConnected || isProcessing}
              className="flex-1 text-sm md:text-base resize-none min-h-[2.5rem] max-h-[50vh] overflow-y-auto"
              style={{ height: 'auto' }}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt"
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

      {/* Image Navigation Dialog */}
      <ImageNavigationDialog
        isOpen={imageDialog.isOpen}
        onClose={closeImageDialog}
        currentImageUrl={imageDialog.imageUrl}
        currentImageName={imageDialog.imageName}
        messages={messages}
        currentMessageId={imageDialog.messageId}
        currentAttachmentIndex={imageDialog.attachmentIndex}
      />
    </div>
  );
};

export default ChatPage;
