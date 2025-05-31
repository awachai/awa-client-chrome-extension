
import { WebSocketCommand } from './commandHandler';

export interface JSONCommandResult {
  isValid: boolean;
  command?: WebSocketCommand;
  error?: string;
}

export class JSONCommandParser {
  static parse(input: string): JSONCommandResult {
    try {
      const trimmed = input.trim();
      
      // Check if it looks like JSON
      if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
            (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
        return { isValid: false };
      }

      const parsed = JSON.parse(trimmed);
      
      // Validate command structure
      const validationResult = this.validateCommand(parsed);
      if (!validationResult.isValid) {
        return validationResult;
      }

      return { isValid: true, command: parsed as WebSocketCommand };
    } catch (error) {
      return { 
        isValid: false, 
        error: `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  private static validateCommand(obj: any): JSONCommandResult {
    if (!obj || typeof obj !== 'object') {
      return { isValid: false, error: 'Command must be an object' };
    }

    if (!obj.type) {
      return { isValid: false, error: 'Command must have a "type" field' };
    }

    const validTypes = ['text', 'command', 'image', 'confirm'];
    if (!validTypes.includes(obj.type)) {
      return { isValid: false, error: `Invalid type "${obj.type}". Valid types: ${validTypes.join(', ')}` };
    }

    // Validate based on type
    switch (obj.type) {
      case 'text':
        if (!obj.action || obj.action !== 'say') {
          return { isValid: false, error: 'Text command must have action "say"' };
        }
        if (!obj.message || typeof obj.message !== 'string') {
          return { isValid: false, error: 'Text command must have a "message" string' };
        }
        break;

      case 'command':
        const validActions = ['highlight', 'click', 'scroll_to', 'get_dom', 'popup', 'fill_form'];
        if (!obj.action || !validActions.includes(obj.action)) {
          return { isValid: false, error: `Command action must be one of: ${validActions.join(', ')}` };
        }
        
        // Some actions require a selector
        if (['highlight', 'click', 'scroll_to'].includes(obj.action) && !obj.selector) {
          return { isValid: false, error: `Action "${obj.action}" requires a "selector" field` };
        }
        
        // Popup requires a message
        if (obj.action === 'popup' && !obj.message) {
          return { isValid: false, error: 'Popup action requires a "message" field' };
        }
        
        // Fill form requires data array
        if (obj.action === 'fill_form' && (!obj.data || !Array.isArray(obj.data))) {
          return { isValid: false, error: 'Fill form action requires a "data" array' };
        }
        break;

      case 'image':
        if (!obj.action || obj.action !== 'show_image') {
          return { isValid: false, error: 'Image command must have action "show_image"' };
        }
        if (!obj.message || typeof obj.message !== 'string') {
          return { isValid: false, error: 'Image command must have a "message" string (URL or base64)' };
        }
        break;

      case 'confirm':
        if (!obj.action || obj.action !== 'ask_user') {
          return { isValid: false, error: 'Confirm command must have action "ask_user"' };
        }
        if (!obj.message || typeof obj.message !== 'string') {
          return { isValid: false, error: 'Confirm command must have a "message" string' };
        }
        break;
    }

    return { isValid: true };
  }

  static getExampleCommands(): Array<{ name: string; description: string; command: WebSocketCommand }> {
    return [
      {
        name: 'Highlight Element',
        description: 'เน้นสี element ที่ระบุ',
        command: { type: 'command', action: 'highlight', selector: '#button' }
      },
      {
        name: 'Click Element',
        description: 'คลิก element ที่ระบุ',
        command: { type: 'command', action: 'click', selector: '.submit-btn' }
      },
      {
        name: 'Show Message',
        description: 'แสดงข้อความ',
        command: { type: 'text', action: 'say', message: 'Hello from JSON command!' }
      },
      {
        name: 'Show Popup',
        description: 'แสดง popup แจ้งเตือน',
        command: { type: 'command', action: 'popup', message: 'This is a popup notification' }
      },
      {
        name: 'Get DOM',
        description: 'ดึงข้อมูล DOM ของหน้าเว็บ',
        command: { type: 'command', action: 'get_dom' }
      },
      {
        name: 'Fill Form',
        description: 'กรอกข้อมูลในฟอร์ม',
        command: { 
          type: 'command', 
          action: 'fill_form', 
          data: [
            { selector: '#name', value: 'John Doe' },
            { selector: '#email', value: 'john@example.com' }
          ]
        }
      }
    ];
  }
}
