import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Bot, User, Send, Paperclip, Image, FileText, LogOut, X, Download, Eye, Wifi, WifiOff, CheckCircle, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../hooks/useWebSocket";
import { CommandHandler, WebSocketCommand } from "../utils/commandHandler";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  attachments?: { type: 'image' | 'file'; name: string; url: string }[];
  commandResult?: any;
}

interface PendingFile {
  file: File;
  type: 'image' | 'file';
  preview?: string;
}

// Mock user data - in real app this would come from authentication
const mockUser = {
  name: "สมชาย ใจดี",
  email: "somchai@example.com",
  avatar: null // No avatar image for now
};

const ChatPage = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'ai',
      content: 'สวัสดีครับ! ผมคือ AI Web Agent ของคุณ ผมสามารถช่วยคุณควบคุมและทำงานกับบราวเซอร์ได้ คุณต้องการให้ผมช่วยอะไรครับ?',
      timestamp: new Date(),
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; resolve: (confirmed: boolean) => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Command handler for processing WebSocket commands
  const commandHandler = new CommandHandler({
    onTextMessage: (message: string) => {
      const aiMessage: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: message,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
    },
    onImageReceived: (imageUrl: string) => {
      const aiMessage: Message = {
        id: Date.now().toString(),
        type: 'ai',
        content: 'ได้รับรูปภาพจาก AI',
        timestamp: new Date(),
        attachments: [{ type: 'image', name: 'AI Image', url: imageUrl }]
      };
      setMessages(prev => [...prev, aiMessage]);
    },
    onConfirmRequest: (message: string) => {
      return new Promise<boolean>((resolve) => {
        setConfirmDialog({ message, resolve });
      });
    }
  });

  // WebSocket connection with message handling
  const { isConnected, messages: wsMessages, error: wsError, sendMessage, retry, clearError } = useWebSocket('nueng');

  // Process WebSocket messages
  React.useEffect(() => {
    if (wsMessages.length > 0) {
      const latestMessage = wsMessages[wsMessages.length - 1];
      console.log('Processing WebSocket message:', latestMessage);
      
      try {
        // Try to parse as command
        if (typeof latestMessage === 'object' && latestMessage !== null) {
          commandHandler.executeCommand(latestMessage as WebSocketCommand).then(result => {
            console.log('Command execution result:', result);
            
            // Add command result to the last AI message if it exists
            if (result && result.success !== undefined) {
              setMessages(prev => {
                const lastMessage = prev[prev.length - 1];
                if (lastMessage && lastMessage.type === 'ai') {
                  return [
                    ...prev.slice(0, -1),
                    { ...lastMessage, commandResult: result }
                  ];
                }
                return prev;
              });
            }
          });
        }
      } catch (error) {
        console.error('Error processing WebSocket command:', error);
        toast({
          title: "Command Error",
          description: "Failed to process command from server",
          variant: "destructive",
        });
      }
    }
  }, [wsMessages]);

  // Helper function to get user initials
  const getUserInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  // Helper function to determine file type
  const getFileType = (file: File): 'image' | 'file' => {
    return file.type.startsWith('image/') ? 'image' : 'file';
  };

  // Helper function to create file preview
  const createFilePreview = (file: File): Promise<string | undefined> => {
    return new Promise((resolve) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      } else {
        resolve(undefined);
      }
    });
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim() && pendingFiles.length === 0) return;

    // Create blob URLs for file attachments to make them viewable
    const attachments = pendingFiles.map(pf => ({
      type: pf.type,
      name: pf.file.name,
      url: URL.createObjectURL(pf.file) // Create blob URL for viewing
    }));

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage || (pendingFiles.length > 0 ? `ส่งไฟล์ ${pendingFiles.length} ไฟล์` : ''),
      timestamp: new Date(),
      attachments
    };

    setMessages(prev => [...prev, userMessage]);
    
    // Send message via WebSocket only if connected
    if (isConnected) {
      const wsMessage = {
        type: 'user_message',
        content: inputMessage,
        attachments: attachments.map(att => ({
          type: att.type,
          name: att.name
        })),
        timestamp: new Date().toISOString()
      };
      
      const sent = sendMessage(wsMessage);
      if (!sent) {
        console.warn('Failed to send message via WebSocket');
      }
    }

    setInputMessage("");
    setPendingFiles([]);
    setIsLoading(true);

    // Simulate AI response (remove this when real WebSocket responses are implemented)
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: `ได้รับคำสั่ง: "${inputMessage}" ${attachments.length > 0 ? `และไฟล์ ${attachments.length} ไฟล์` : ''} ${isConnected ? 'ส่งผ่าน WebSocket แล้ว' : '(WebSocket ไม่เชื่อมต่อ)'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1500);
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (files) {
      console.log('Files selected:', files);
      const newPendingFiles: PendingFile[] = [];
      
      for (const file of Array.from(files)) {
        console.log(`File: ${file.name}, Size: ${file.size}, Type: ${file.type}`);
        const fileType = getFileType(file);
        const preview = await createFilePreview(file);
        
        newPendingFiles.push({
          file,
          type: fileType,
          preview
        });
      }
      
      setPendingFiles(prev => [...prev, ...newPendingFiles]);
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFileUpload(event.target.files);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    const files = event.dataTransfer.files;
    handleFileUpload(files);
  };

  const handleLogout = () => {
    navigate('/login');
  };

  const handleViewFile = (attachment: { type: 'image' | 'file'; name: string; url: string }) => {
    console.log('handleViewFile called:', attachment);
    if (attachment.type === 'image') {
      console.log('Setting selected image:', attachment);
      setSelectedImage({ url: attachment.url, name: attachment.name });
    } else {
      const link = document.createElement('a');
      link.href = attachment.url;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const closeImageModal = () => {
    console.log('Closing image modal');
    setSelectedImage(null);
  };

  const handleConfirmResponse = (confirmed: boolean) => {
    if (confirmDialog) {
      confirmDialog.resolve(confirmed);
      setConfirmDialog(null);
    }
  };

  return (
    <div 
      className="h-screen bg-gray-50 flex flex-col max-w-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Confirmation Dialog */}
      {confirmDialog && (
        <Dialog open={true} onOpenChange={() => handleConfirmResponse(false)}>
          <DialogContent className="max-w-md">
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-4">ยืนยันการทำงาน</h3>
              <p className="text-gray-700 mb-6">{confirmDialog.message}</p>
              <div className="flex space-x-3 justify-end">
                <Button variant="outline" onClick={() => handleConfirmResponse(false)}>
                  ยกเลิก
                </Button>
                <Button onClick={() => handleConfirmResponse(true)}>
                  ยืนยัน
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <Dialog open={true} onOpenChange={closeImageModal}>
          <DialogContent className="max-w-sm w-full p-0 border-0">
            <div className="relative bg-black rounded-lg overflow-hidden">
              <img 
                src={selectedImage.url} 
                alt={selectedImage.name}
                className="w-full h-auto max-h-[60vh] object-contain"
              />
              <button
                onClick={closeImageModal}
                className="absolute top-2 right-2 bg-black/70 hover:bg-black/90 text-white rounded-full p-1 transition-colors z-10"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2">
                <p className="text-xs font-medium truncate">{selectedImage.name}</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Drag overlay */}
      {isDragOver && (
        <div className="fixed inset-0 bg-blue-500/20 border-2 border-dashed border-blue-500 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 shadow-xl text-center mx-2">
            <FileText className="h-12 w-12 text-blue-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1 font-kanit">วางไฟล์ที่นี่</h3>
            <p className="text-sm text-gray-600">รองรับรูปภาพและเอกสาร</p>
          </div>
        </div>
      )}

      {/* Compact Header */}
      <div className="bg-white border-b px-3 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Bot className="h-6 w-6 text-blue-600" />
          <h1 className="text-lg font-semibold font-kanit">AI Agent</h1>
          {/* WebSocket Status Indicator */}
          <div className="flex items-center space-x-1">
            {isConnected ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
            <span className={`text-xs ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={mockUser.avatar || undefined} />
            <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">
              <User className="h-3 w-3" />
            </AvatarFallback>
          </Avatar>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="px-2">
            <LogOut className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* WebSocket Error Display with Retry */}
      {wsError && (
        <div className="bg-red-50 border-b border-red-200 px-3 py-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-red-600 flex-1">{wsError}</p>
            <div className="flex space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={retry}
                className="text-xs px-2 py-1 h-auto"
              >
                Retry
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearError}
                className="text-xs px-2 py-1 h-auto"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex space-x-2 max-w-[85%] ${message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
              <div className="flex-shrink-0">
                {message.type === 'user' ? (
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={mockUser.avatar || undefined} />
                    <AvatarFallback className="bg-blue-600 text-white text-xs">
                      <User className="h-3 w-3" />
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center">
                    <Bot className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
              <Card className={`${message.type === 'user' ? 'bg-blue-600 text-white' : 'bg-white'}`}>
                <CardContent className="p-2">
                  <p className="text-sm leading-relaxed">{message.content}</p>
                  
                  {/* Command Result Display */}
                  {message.commandResult && (
                    <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                      <div className="flex items-center space-x-1 mb-1">
                        {message.commandResult.success ? (
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-500" />
                        )}
                        <span className={`font-medium ${message.commandResult.success ? 'text-green-700' : 'text-red-700'}`}>
                          {message.commandResult.action}
                        </span>
                      </div>
                      {message.commandResult.error && (
                        <p className="text-red-600">{message.commandResult.error}</p>
                      )}
                      {message.commandResult.selector && (
                        <p className="text-gray-600">Target: {message.commandResult.selector}</p>
                      )}
                    </div>
                  )}

                  {/* Images with compact size */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-2">
                      {message.attachments.filter(att => att.type === 'image').length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {message.attachments
                            .filter(att => att.type === 'image')
                            .map((attachment, index) => (
                              <div key={index} className="relative group">
                                <div 
                                  className="cursor-pointer w-16 h-16"
                                  onClick={() => {
                                    console.log('Image clicked:', attachment);
                                    handleViewFile(attachment);
                                  }}
                                >
                                  <img 
                                    src={attachment.url} 
                                    alt={attachment.name}
                                    className="w-16 h-16 object-cover rounded hover:opacity-90 transition-opacity"
                                  />
                                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded flex items-center justify-center">
                                    <Eye className="h-3 w-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                      
                      {/* Files (non-images) */}
                      {message.attachments.filter(att => att.type === 'file').length > 0 && (
                        <div className="space-y-1">
                          {message.attachments
                            .filter(att => att.type === 'file')
                            .map((attachment, index) => (
                              <div 
                                key={index}
                                className={`flex items-center space-x-2 p-1 rounded border cursor-pointer hover:bg-opacity-80 transition-colors ${
                                  message.type === 'user' ? 'bg-blue-500 border-blue-400' : 'bg-gray-50 border-gray-200'
                                }`}
                                onClick={() => handleViewFile(attachment)}
                              >
                                <FileText className="h-3 w-3" />
                                <span className="text-xs flex-1 truncate">{attachment.name}</span>
                                <Download className="h-3 w-3 opacity-60" />
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <p className={`text-xs mt-1 ${message.type === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                    {message.timestamp.toLocaleTimeString('th-TH', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex space-x-2 max-w-[85%]">
              <div className="flex-shrink-0">
                <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center">
                  <Bot className="h-3 w-3 text-white" />
                </div>
              </div>
              <Card className="bg-white">
                <CardContent className="p-2">
                  <p className="text-sm text-gray-500">กำลังพิมพ์...</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Compact Input Area */}
      <div className="bg-white border-t p-3">
        {/* Pending Files Preview */}
        {pendingFiles.length > 0 && (
          <div className="mb-3 p-2 bg-gray-50 rounded border">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-medium text-gray-700">ไฟล์ ({pendingFiles.length})</h4>
            </div>
            <div className="grid grid-cols-1 gap-1">
              {pendingFiles.map((pendingFile, index) => (
                <div key={index} className="relative group">
                  <div className="flex items-center space-x-2 bg-white p-1 rounded border">
                    {pendingFile.type === 'image' ? (
                      pendingFile.preview ? (
                        <img 
                          src={pendingFile.preview} 
                          alt={pendingFile.file.name}
                          className="w-6 h-6 object-cover rounded"
                        />
                      ) : (
                        <Image className="h-3 w-3 text-blue-500" />
                      )
                    ) : (
                      <FileText className="h-3 w-3 text-gray-500" />
                    )}
                    <span className="text-xs text-gray-700 flex-1 truncate">
                      {pendingFile.file.name}
                    </span>
                    <button
                      onClick={() => removePendingFile(index)}
                      className="text-red-500 hover:text-red-700 flex-shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex space-x-2">
          <div className="flex-1">
            <Textarea
              placeholder="พิมพ์คำสั่ง..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="min-h-[40px] resize-none text-sm"
              rows={2}
            />
          </div>
          <div className="flex flex-col space-y-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="px-2"
            >
              <Paperclip className="h-3 w-3" />
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={(!inputMessage.trim() && pendingFiles.length === 0) || isLoading}
              size="sm"
              className="px-2"
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt"
          onChange={handleFileInputChange}
          className="hidden"
        />
        
        <div className="flex items-center space-x-2 mt-2 text-xs text-gray-500">
          <div className="flex items-center space-x-1">
            <Image className="h-3 w-3" />
            <span>รูป</span>
          </div>
          <div className="flex items-center space-x-1">
            <FileText className="h-3 w-3" />
            <span>ไฟล์</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
