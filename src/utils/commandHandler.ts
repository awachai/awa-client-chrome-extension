import { toast } from "@/hooks/use-toast";
import { debug_mode } from "../config/env";
import { DOMUtils, ElementInfo } from "./domUtils";
import { ChromeExtensionHandler } from "./chromeExtensionHandler";

export interface BaseCommand {
  tranType: 'request' | 'response';
  type: 'command' | 'text' | 'image' | 'confirm';
  action: string;
  message?: string;
  selector?: string;
  data?: any;
}

export interface TextCommand extends BaseCommand {
  tranType: 'request';
  type: 'text';
  action: 'say';
  message: string;
}

export interface CommandAction extends BaseCommand {
  tranType: 'request';
  type: 'command';
  action: 'highlight' | 'click' | 'scroll_to' | 'get_dom' | 'popup' | 'fill_form' | 'scan_elements';
  selector?: string;
  message?: string;
  data?: any;
}

export interface ImageCommand extends BaseCommand {
  tranType: 'request';
  type: 'image';
  action: 'show_image';
  message: string; // URL or base64
}

export interface ConfirmCommand extends BaseCommand {
  tranType: 'request';
  type: 'confirm';
  action: 'ask_user';
  message: string;
}

export interface ResponseCommand extends BaseCommand {
  tranType: 'response';
  type: 'command' | 'text' | 'image' | 'confirm';
  action: string;
  message: string; // success message or error message
  data?: any; // response data
}

export type WebSocketCommand = TextCommand | CommandAction | ImageCommand | ConfirmCommand;

export class CommandHandler {
  private onTextMessage?: (message: string) => void;
  private onImageReceived?: (imageUrl: string) => void;
  private onConfirmRequest?: (message: string) => Promise<boolean>;
  private onDebugMessage?: (message: string) => void;
  private onResponseReady?: (response: ResponseCommand) => void;
  private chromeHandler: ChromeExtensionHandler;

  constructor(callbacks: {
    onTextMessage?: (message: string) => void;
    onImageReceived?: (imageUrl: string) => void;
    onConfirmRequest?: (message: string) => Promise<boolean>;
    onDebugMessage?: (message: string) => void;
    onResponseReady?: (response: ResponseCommand) => void;
  }) {
    this.onTextMessage = callbacks.onTextMessage;
    this.onImageReceived = callbacks.onImageReceived;
    this.onConfirmRequest = callbacks.onConfirmRequest;
    this.onDebugMessage = callbacks.onDebugMessage;
    this.onResponseReady = callbacks.onResponseReady;
    this.chromeHandler = new ChromeExtensionHandler();
  }

  async executeCommand(command: WebSocketCommand): Promise<ResponseCommand> {
    console.log('Executing command:', command);

    const result = await this._executeCommandInternal(command);
    
    // สร้าง response command
    const response: ResponseCommand = {
      tranType: 'response',
      type: command.type,
      action: command.action,
      message: result.success ? 'success' : (result.error || 'Unknown error'),
      data: result.success ? result : { error: result.error }
    };

    // ส่ง response กลับผ่าน callback
    if (this.onResponseReady) {
      this.onResponseReady(response);
    }
    
    // Send debug message if debug mode is enabled
    if (debug_mode && this.onDebugMessage) {
      const debugMessage = this.formatDebugMessage(command, result);
      this.onDebugMessage(debugMessage);
    }

    return response;
  }

  private async _executeCommandInternal(command: WebSocketCommand): Promise<any> {
    switch (command.type) {
      case 'text':
        return this.handleTextCommand(command);
      
      case 'command':
        return this.handleCommandAction(command);
      
      case 'image':
        return this.handleImageCommand(command);
      
      case 'confirm':
        return this.handleConfirmCommand(command);
      
      default:
        console.warn('Unknown command type:', command);
        return { success: false, error: 'Unknown command type' };
    }
  }

  private formatDebugMessage(command: WebSocketCommand, result: any): string {
    const timestamp = new Date().toLocaleTimeString('th-TH');
    let message = `[DEBUG ${timestamp}] `;
    
    if (command.type === 'text') {
      message += `ส่งข้อความ: "${command.message}"`;
    } else if (command.type === 'command') {
      message += `คำสั่ง: ${command.action}`;
      if (command.selector) {
        message += ` (${command.selector})`;
      }
    } else if (command.type === 'image') {
      message += `แสดงรูปภาพ`;
    } else if (command.type === 'confirm') {
      message += `ถามผู้ใช้: "${command.message}"`;
    }
    
    if (result.success) {
      message += ` ✅ สำเร็จ`;
    } else {
      message += ` ❌ ผิดพลาด: ${result.error}`;
    }
    
    return message;
  }

  private handleTextCommand(command: TextCommand) {
    console.log('AI says:', command.message);
    if (this.onTextMessage) {
      this.onTextMessage(command.message);
    }
    return { success: true, action: 'say', message: command.message };
  }

  private async handleCommandAction(command: CommandAction) {
    // ใช้ Chrome Extension หากพร้อมใช้งาน
    if (this.chromeHandler.isReady()) {
      return this.executeCommandViaExtension(command);
    }
    
    // Fallback ไปใช้ DOM Utils แบบเดิม
    return this.executeCommandViaDOMUtils(command);
  }

  private async executeCommandViaExtension(command: CommandAction) {
    switch (command.action) {
      case 'highlight':
        return this.chromeHandler.executeCommand({
          action: 'highlight',
          selector: command.selector!
        });
      
      case 'click':
        return this.chromeHandler.executeCommand({
          action: 'click',
          selector: command.selector!
        });
      
      case 'scroll_to':
        return this.chromeHandler.executeCommand({
          action: 'scroll_to',
          selector: command.selector!
        });
      
      case 'get_dom':
        return this.chromeHandler.executeCommand({
          action: 'get_dom'
        });
      
      case 'fill_form':
        return this.chromeHandler.executeCommand({
          action: 'fill_form',
          data: command.data!
        });

      case 'scan_elements':
        return this.chromeHandler.executeCommand({
          action: 'scan_elements'
        });
      
      case 'popup':
        return this.showPopup(command.message!);
      
      default:
        return { success: false, error: `Unknown action: ${command.action}` };
    }
  }

  private async executeCommandViaDOMUtils(command: CommandAction) {
    switch (command.action) {
      case 'highlight':
        return this.highlightElement(command.selector!);
      
      case 'click':
        return this.clickElement(command.selector!);
      
      case 'scroll_to':
        return this.scrollToElement(command.selector!);
      
      case 'get_dom':
        return this.getPageDOM();
      
      case 'popup':
        return this.showPopup(command.message!);
      
      case 'fill_form':
        return this.fillForm(command.data!);
      
      default:
        return { success: false, error: `Unknown action: ${command.action}` };
    }
  }

  private handleImageCommand(command: ImageCommand) {
    console.log('Showing image:', command.message);
    if (this.onImageReceived) {
      this.onImageReceived(command.message);
    }
    return { success: true, action: 'show_image', imageUrl: command.message };
  }

  private async handleConfirmCommand(command: ConfirmCommand) {
    console.log('Asking user confirmation:', command.message);
    
    if (this.onConfirmRequest) {
      const confirmed = await this.onConfirmRequest(command.message);
      return { success: true, action: 'ask_user', confirmed, message: command.message };
    }
    
    // Fallback to browser confirm if no custom handler
    const confirmed = window.confirm(command.message);
    return { success: true, action: 'ask_user', confirmed, message: command.message };
  }

  private async highlightElement(selector: string) {
    try {
      // ลองหา element ด้วยวิธีต่างๆ
      let element = DOMUtils.findElement(selector);
      
      // ถ้าไม่เจอ ลองรอสักครู่
      if (!element) {
        element = await DOMUtils.waitForElement(selector, 2000);
      }
      
      if (!element) {
        // หา elements ที่คล้ายกัน
        const similar = DOMUtils.findSimilarElements(selector);
        
        return { 
          success: false, 
          error: `Element not found: ${selector}`,
          suggestions: similar.length > 0 ? {
            message: `พบ elements ที่คล้ายกัน:`,
            elements: similar.map(el => ({
              selector: el.selector,
              text: el.textContent,
              tag: el.tagName
            }))
          } : {
            message: `ไม่พบ element ใดๆ ที่คล้ายกับ "${selector}"`,
            availableElements: DOMUtils.scanInteractiveElements().slice(0, 5).map(el => ({
              selector: el.selector,
              text: el.textContent,
              tag: el.tagName
            }))
          }
        };
      }

      // Remove existing highlights
      document.querySelectorAll('.ai-highlight').forEach(el => {
        el.classList.remove('ai-highlight');
      });

      // Add highlight style
      element.classList.add('ai-highlight');
      
      // Add CSS if not already added
      if (!document.getElementById('ai-highlight-styles')) {
        const style = document.createElement('style');
        style.id = 'ai-highlight-styles';
        style.textContent = `
          .ai-highlight {
            outline: 3px solid #ff6b6b !important;
            outline-offset: 2px !important;
            animation: ai-pulse 2s infinite !important;
            z-index: 9999 !important;
          }
          @keyframes ai-pulse {
            0%, 100% { outline-color: #ff6b6b; }
            50% { outline-color: #ff9999; }
          }
        `;
        document.head.appendChild(style);
      }

      // Remove highlight after 5 seconds
      setTimeout(() => {
        element.classList.remove('ai-highlight');
      }, 5000);

      return { 
        success: true, 
        action: 'highlight', 
        selector: DOMUtils.generateSelector(element), 
        found: true,
        elementInfo: {
          tag: element.tagName.toLowerCase(),
          text: element.textContent?.substring(0, 100),
          isInteractable: DOMUtils.isInteractable(element)
        }
      };
    } catch (error) {
      return { success: false, error: `Failed to highlight ${selector}: ${error}` };
    }
  }

  private async clickElement(selector: string) {
    try {
      // ลองหา element ด้วยวิธีต่างๆ
      let element = DOMUtils.findElement(selector);
      
      // ถ้าไม่เจอ ลองรอสักครู่
      if (!element) {
        element = await DOMUtils.waitForElement(selector, 2000);
      }

      if (!element) {
        // หา elements ที่คล้ายกัน
        const similar = DOMUtils.findSimilarElements(selector);
        
        return { 
          success: false, 
          error: `Element not found: ${selector}`,
          suggestions: similar.length > 0 ? {
            message: `พบ elements ที่คล้ายกัน:`,
            elements: similar.map(el => ({
              selector: el.selector,
              text: el.textContent,
              tag: el.tagName
            }))
          } : {
            message: `ไม่พบ element ใดๆ ที่คล้ายกับ "${selector}"`,
            availableElements: DOMUtils.scanInteractiveElements().slice(0, 5).map(el => ({
              selector: el.selector,
              text: el.textContent,
              tag: el.tagName
            }))
          }
        };
      }

      // ตรวจสอบว่า element สามารถคลิกได้หรือไม่
      if (!DOMUtils.isInteractable(element)) {
        return { 
          success: false, 
          error: `Element "${selector}" is not interactable`,
          elementInfo: {
            tag: element.tagName.toLowerCase(),
            text: element.textContent?.substring(0, 100),
            isVisible: element.getBoundingClientRect().width > 0
          }
        };
      }

      // Scroll to element ก่อนคลิก
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // รอให้ scroll เสร็จ
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // คลิก element
      (element as HTMLElement).click();
      
      return { 
        success: true, 
        action: 'click', 
        selector: DOMUtils.generateSelector(element), 
        clicked: true,
        elementInfo: {
          tag: element.tagName.toLowerCase(),
          text: element.textContent?.substring(0, 100)
        }
      };
    } catch (error) {
      return { success: false, error: `Failed to click ${selector}: ${error}` };
    }
  }

  private async scrollToElement(selector: string) {
    try {
      let element = DOMUtils.findElement(selector);
      
      if (!element) {
        element = await DOMUtils.waitForElement(selector, 2000);
      }
      
      if (!element) {
        return { success: false, error: `Element not found: ${selector}` };
      }

      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return { 
        success: true, 
        action: 'scroll_to', 
        selector: DOMUtils.generateSelector(element), 
        scrolled: true 
      };
    } catch (error) {
      return { success: false, error: `Failed to scroll to ${selector}: ${error}` };
    }
  }

  private getPageDOM() {
    try {
      const dom = document.documentElement.outerHTML;
      return { 
        success: true, 
        action: 'get_dom', 
        dom: dom.substring(0, 10000), // Limit size
        fullSize: dom.length 
      };
    } catch (error) {
      return { success: false, error: `Failed to get DOM: ${error}` };
    }
  }

  private showPopup(message: string) {
    toast({
      title: "แจ้งเตือนจาก AI",
      description: message,
      duration: 5000,
    });
    
    return { success: true, action: 'popup', message };
  }

  private fillForm(data: Array<{ selector: string; value: string }>) {
    const results: Array<{ selector: string; success: boolean; error?: string }> = [];
    
    data.forEach(({ selector, value }) => {
      try {
        const element = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        if (!element) {
          results.push({ selector, success: false, error: 'Element not found' });
          return;
        }

        // Handle different input types
        if (element.type === 'checkbox' || element.type === 'radio') {
          (element as HTMLInputElement).checked = value === 'true' || value === '1';
        } else {
          element.value = value;
        }

        // Trigger change event
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('input', { bubbles: true }));
        
        results.push({ selector, success: true });
      } catch (error) {
        results.push({ selector, success: false, error: String(error) });
      }
    });

    return { success: true, action: 'fill_form', results };
  }
}
