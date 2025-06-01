
import { WebSocketCommand } from './commandHandler';

export interface ParsedCommand {
  success: boolean;
  command?: WebSocketCommand;
  error?: string;
}

export class JsonCommandParser {
  static parse(input: string): ParsedCommand {
    try {
      // ลองแปลง JSON ก่อน
      const parsed = JSON.parse(input);
      
      // ตรวจสอบโครงสร้างพื้นฐาน
      if (!parsed.tranType || !parsed.type || !parsed.action) {
        return {
          success: false,
          error: 'Missing required fields: tranType, type, or action'
        };
      }

      // ตรวจสอบว่าเป็น request เท่านั้น
      if (parsed.tranType !== 'request') {
        return {
          success: false,
          error: 'Only tranType "request" is supported for incoming commands'
        };
      }

      // สร้าง command ตามโครงสร้างใหม่
      const command: WebSocketCommand = {
        tranType: 'request',
        type: parsed.type,
        action: parsed.action,
        message: parsed.message || '',
        selector: parsed.selector || '',
        data: parsed.data || null
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

    // Pattern สำหรับคำสั่งต่างๆ
    if (lowerInput.includes('highlight') || lowerInput.includes('เน้น')) {
      const selectorMatch = lowerInput.match(/["']([^"']+)["']|#\w+|\.\w+/);
      const selector = selectorMatch ? selectorMatch[0].replace(/["']/g, '') : '';
      
      if (selector) {
        return {
          success: true,
          command: {
            tranType: 'request',
            type: 'command',
            action: 'highlight',
            selector: selector,
            message: '',
            data: null
          }
        };
      }
    }

    if (lowerInput.includes('click') || lowerInput.includes('คลิก')) {
      const selectorMatch = lowerInput.match(/["']([^"']+)["']|#\w+|\.\w+/);
      const selector = selectorMatch ? selectorMatch[0].replace(/["']/g, '') : '';
      
      if (selector) {
        return {
          success: true,
          command: {
            tranType: 'request',
            type: 'command',
            action: 'click',
            selector: selector,
            message: '',
            data: null
          }
        };
      }
    }

    if (lowerInput.includes('say') || lowerInput.includes('พูด') || lowerInput.includes('บอก')) {
      const messageMatch = lowerInput.match(/["']([^"']+)["']/);
      const message = messageMatch ? messageMatch[1] : input;
      
      return {
        success: true,
        command: {
          tranType: 'request',
          type: 'text',
          action: 'say',
          message: message,
          selector: '',
          data: null
        }
      };
    }

    if (lowerInput.includes('popup') || lowerInput.includes('แจ้งเตือน')) {
      const messageMatch = lowerInput.match(/["']([^"']+)["']/);
      const message = messageMatch ? messageMatch[1] : 'Notification';
      
      return {
        success: true,
        command: {
          tranType: 'request',
          type: 'command',
          action: 'popup',
          message: message,
          selector: '',
          data: null
        }
      };
    }

    if (lowerInput.includes('get_dom') || lowerInput.includes('ดึง dom')) {
      return {
        success: true,
        command: {
          tranType: 'request',
          type: 'command',
          action: 'get_dom',
          message: '',
          selector: '',
          data: null
        }
      };
    }

    // Default: ถือว่าเป็นข้อความธรรมดา
    return {
      success: true,
      command: {
        tranType: 'request',
        type: 'text',
        action: 'say',
        message: input,
        selector: '',
        data: null
      }
    };
  }
}
