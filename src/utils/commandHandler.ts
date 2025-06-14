
import { toast } from "@/hooks/use-toast";

export interface BaseCommand {
  tranType: 'request' | 'response';
  type: 'text' | 'image' | 'connection' | string;
  action: string;
  message?: string;
  data?: any;
}

export interface TextCommand extends BaseCommand {
  tranType: 'request';
  type: 'text';
  action: 'say';
  message: string;
}

export interface ImageCommand extends BaseCommand {
  tranType: 'request';
  type: 'image';
  action: 'show_image';
  message: string; // URL or base64
}

export type WebSocketCommand = TextCommand | ImageCommand;

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

  async executeCommand(command: WebSocketCommand): Promise<void> {
    console.log('Processing message:', command);

    switch (command.type) {
      case 'text':
        this.handleTextCommand(command);
        break;
      
      case 'image':
        this.handleImageCommand(command);
        break;
      
      default:
        console.log('Unknown message type:', command.type);
        break;
    }
  }

  private handleTextCommand(command: TextCommand) {
    console.log('AI says:', command.message);
    if (this.onTextMessage) {
      this.onTextMessage(command.message);
    }
  }

  private handleImageCommand(command: ImageCommand) {
    console.log('Showing image:', command.message);
    if (this.onImageReceived) {
      this.onImageReceived(command.message);
    }
  }
}
