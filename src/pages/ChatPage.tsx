import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Bot, User, Send, Paperclip, Image, FileText, LogOut, X, Download, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  attachments?: { type: 'image' | 'file'; name: string; url: string }[];
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

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
    setInputMessage("");
    setPendingFiles([]);
    setIsLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: `ได้รับคำสั่ง: "${inputMessage}" ${attachments.length > 0 ? `และไฟล์ ${attachments.length} ไฟล์` : ''} กำลังดำเนินการ... ผมจะช่วยคุณทำงานนี้ในบราวเซอร์`,
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

  // Helper function to handle file viewing
  const handleViewFile = (attachment: { type: 'image' | 'file'; name: string; url: string }) => {
    console.log('handleViewFile called:', attachment);
    if (attachment.type === 'image') {
      // For images, open in modal
      console.log('Setting selected image:', attachment);
      setSelectedImage({ url: attachment.url, name: attachment.name });
    } else {
      // For other files, download them
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

  return (
    <div 
      className="min-h-screen bg-gray-50 flex flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Image Modal */}
      {selectedImage && (
        <Dialog open={true} onOpenChange={closeImageModal}>
          <DialogContent className="max-w-4xl w-full p-0 border-0">
            <div className="relative bg-black rounded-lg overflow-hidden">
              <img 
                src={selectedImage.url} 
                alt={selectedImage.name}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
              <button
                onClick={closeImageModal}
                className="absolute top-4 right-4 bg-black/70 hover:bg-black/90 text-white rounded-full p-2 transition-colors z-10"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-4">
                <p className="text-sm font-medium">{selectedImage.name}</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Drag overlay */}
      {isDragOver && (
        <div className="fixed inset-0 bg-blue-500/20 border-4 border-dashed border-blue-500 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-8 shadow-xl text-center">
            <FileText className="h-16 w-16 text-blue-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2 font-kanit">วางไฟล์ที่นี่</h3>
            <p className="text-gray-600">รองรับรูปภาพและเอกสาร</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Bot className="h-8 w-8 text-blue-600" />
          <h1 className="text-xl font-semibold font-kanit">AI Web Agent</h1>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={mockUser.avatar || undefined} />
              <AvatarFallback className="bg-blue-100 text-blue-600 text-sm font-medium">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-gray-700">{mockUser.name}</span>
          </div>
          <Button variant="ghost" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            ออกจากระบบ
          </Button>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex space-x-3 max-w-3xl ${message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
              <div className="flex-shrink-0 flex flex-col items-center">
                {message.type === 'user' ? (
                  <>
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={mockUser.avatar || undefined} />
                      <AvatarFallback className="bg-blue-600 text-white text-xs">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-gray-500 mt-1 text-center">{mockUser.name}</span>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-xs text-gray-500 mt-1 text-center">AI Agent</span>
                  </>
                )}
              </div>
              <Card className={`${message.type === 'user' ? 'bg-blue-600 text-white' : 'bg-white'}`}>
                <CardContent className="p-3">
                  <p className="text-sm">{message.content}</p>
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-3">
                      {/* Images in grid layout (2 columns) */}
                      {message.attachments.filter(att => att.type === 'image').length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {message.attachments
                            .filter(att => att.type === 'image')
                            .map((attachment, index) => (
                              <div key={index} className="relative group">
                                <div 
                                  className="cursor-pointer"
                                  onClick={() => {
                                    console.log('Image clicked:', attachment);
                                    handleViewFile(attachment);
                                  }}
                                >
                                  <img 
                                    src={attachment.url} 
                                    alt={attachment.name}
                                    className="w-full h-24 object-cover rounded-lg hover:opacity-90 transition-opacity"
                                  />
                                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded-lg flex items-center justify-center">
                                    <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                </div>
                                <p className="text-xs mt-1 opacity-75 truncate">{attachment.name}</p>
                              </div>
                            ))}
                        </div>
                      )}
                      
                      {/* Files (non-images) */}
                      {message.attachments.filter(att => att.type === 'file').length > 0 && (
                        <div className="space-y-2">
                          {message.attachments
                            .filter(att => att.type === 'file')
                            .map((attachment, index) => (
                              <div 
                                key={index}
                                className={`flex items-center space-x-2 p-2 rounded border cursor-pointer hover:bg-opacity-80 transition-colors ${
                                  message.type === 'user' ? 'bg-blue-500 border-blue-400' : 'bg-gray-50 border-gray-200'
                                }`}
                                onClick={() => handleViewFile(attachment)}
                              >
                                <FileText className="h-4 w-4" />
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
            <div className="flex space-x-3 max-w-3xl">
              <div className="flex-shrink-0 flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <span className="text-xs text-gray-500 mt-1 text-center">AI Agent</span>
              </div>
              <Card className="bg-white">
                <CardContent className="p-3">
                  <p className="text-sm text-gray-500">กำลังพิมพ์...</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="bg-white border-t p-6">
        <div className="max-w-4xl mx-auto">
          {/* Pending Files Preview */}
          {pendingFiles.length > 0 && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-700">ไฟล์ที่เลือก ({pendingFiles.length})</h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {pendingFiles.map((pendingFile, index) => (
                  <div key={index} className="relative group">
                    <div className="flex items-center space-x-2 bg-white p-2 rounded border">
                      {pendingFile.type === 'image' ? (
                        pendingFile.preview ? (
                          <img 
                            src={pendingFile.preview} 
                            alt={pendingFile.file.name}
                            className="w-8 h-8 object-cover rounded"
                          />
                        ) : (
                          <Image className="h-4 w-4 text-blue-500" />
                        )
                      ) : (
                        <FileText className="h-4 w-4 text-gray-500" />
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

          <div className="flex space-x-3">
            <div className="flex-1">
              <Textarea
                placeholder="พิมพ์คำสั่งที่ต้องการให้ AI ช่วยงาน หรือลากไฟล์มาวางที่หน้าจอ..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="min-h-[50px] resize-none"
              />
            </div>
            <div className="flex flex-col space-y-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleSendMessage}
                disabled={(!inputMessage.trim() && pendingFiles.length === 0) || isLoading}
                size="icon"
              >
                <Send className="h-4 w-4" />
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
          
          <div className="flex items-center space-x-4 mt-3 text-sm text-gray-500">
            <div className="flex items-center space-x-1">
              <Image className="h-4 w-4" />
              <span>รูปภาพ</span>
            </div>
            <div className="flex items-center space-x-1">
              <FileText className="h-4 w-4" />
              <span>เอกสาร</span>
            </div>
            <span>หรือ Enter เพื่อส่งข้อความ | ลากไฟล์มาวาง</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
