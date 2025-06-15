
import { WebSocketMessage } from './commandHandler';

export interface ParsedCommand {
  success: boolean;
  command?: WebSocketMessage;
  error?: string;
}

export class JsonCommandParser {
  static parse(input: string): ParsedCommand {
    try {
      // ลองแปลง JSON ก่อน
      const parsed = JSON.parse(input);
      
      // ตรวจสอบโครงสร้างพื้นฐาน
      if (!parsed.type) {
        return {
          success: false,
          error: 'Missing required field: type'
        };
      }

      // สร้าง command ตามโครงสร้างใหม่
      const command: WebSocketMessage = {
        type: parsed.type,
        message: parsed.message || '',
        room: parsed.room || '',
        attachments: parsed.attachments || [],
        timestamp: parsed.timestamp || new Date().toISOString()
      };

      return {
        success: true,
        command
      };

    } catch (error) {
      // ถ้าไม่ใช่ JSON ให้ลองแปลงเป็นคำสั่งธรรมดา
      return this.parseNaturalLanguage(input);
    }
  }

  private static parseNaturalLanguage(input: string): ParsedCommand {
    const lowerInput = input.toLowerCase().trim();

    // ถือว่าเป็นข้อความธรรมดา
    return {
      success: true,
      command: {
        type: 'user_message',
        message: input,
        room: '',
        attachments: [],
        timestamp: new Date().toISOString()
      }
    };
  }
}
