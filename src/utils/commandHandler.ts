
import { toast } from "@/hooks/use-toast";

// โครงสร้างข้อความใหม่ที่ง่ายขึ้น
export interface WebSocketMessage {
  type: string;
  message: string;
  room: string;
  attachments: Array<{
    type: 'image' | 'file';
    content: string; // base64
    name: string;
  }>;
  timestamp: string;
}

export class CommandHandler {
  private onTextMessage?: (message: string) => void;
  private onImageReceived?: (imageUrl: string) => void;

  constructor(callbacks: {
    onTextMessage?: (message: string) => void;
    onImageReceived?: (imageUrl: string) => void;
  }) {
    this.onTextMessage = callbacks.onTextMessage;
    this.onImageReceived = callbacks.onImageReceived;
  }

  async executeCommand(command: WebSocketMessage): Promise<void> {
    console.log('Processing message:', command);

    // ตรวจสอบว่าเป็นข้อความที่มีรูปภาพหรือไม่
    if (command.attachments && command.attachments.length > 0) {
      // ถ้ามีรูปภาพในแนบไฟล์
      const imageAttachment = command.attachments.find(att => att.type === 'image');
      if (imageAttachment && this.onImageReceived) {
        const imageUrl = `data:image/jpeg;base64,${imageAttachment.content}`;
        this.onImageReceived(imageUrl);
      }
    }

    // แสดงข้อความหลัก
    if (command.message && this.onTextMessage) {
      this.onTextMessage(command.message);
    }
  }
}
