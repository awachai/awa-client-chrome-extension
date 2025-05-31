// Chrome Extension Message Handler
export interface ChromeCommand {
  action: 'highlight' | 'click' | 'scroll_to' | 'get_dom' | 'fill_form' | 'scan_elements';
  selector?: string;
  data?: Array<{ selector: string; value: string }>;
}

export class ChromeExtensionHandler {
  private isExtensionContext: boolean;

  constructor() {
    // ตรวจสอบว่าอยู่ใน Chrome Extension context หรือไม่
    this.isExtensionContext = typeof window !== 'undefined' && 
                              typeof (window as any).chrome !== 'undefined' && 
                              (window as any).chrome.runtime && 
                              (window as any).chrome.runtime.id;
  }

  async executeCommand(command: ChromeCommand): Promise<any> {
    if (!this.isExtensionContext) {
      return { 
        success: false, 
        error: 'Not running in Chrome Extension context' 
      };
    }

    try {
      console.log('Sending command to background script:', command);
      
      const chrome = (window as any).chrome;
      
      // Try to execute command with retry logic
      const result = await this.executeWithRetry(chrome, command, 3);
      
      console.log('Command result from content script:', result);
      return result;
    } catch (error) {
      console.error('Chrome extension command error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private async executeWithRetry(chrome: any, command: ChromeCommand, maxRetries: number): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: 'EXECUTE_DOM_COMMAND',
            command: command
          }, (response: any) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });

        // If successful, return result
        if (result && (result as any).success !== false) {
          return result;
        }

        // If content script not ready, wait and retry
        if (result && (result as any).error && (result as any).error.includes('Content script not ready')) {
          console.log(`Attempt ${attempt}: Content script not ready, waiting...`);
          await this.wait(1000 * attempt); // Exponential backoff
          continue;
        }

        // Other errors, return immediately
        return result;
      } catch (error) {
        console.log(`Attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          throw error;
        }
        await this.wait(1000 * attempt); // Wait before retry
      }
    }

    throw new Error('Max retries exceeded');
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // สแกนหา elements ที่มีอยู่ในหน้าเว็บ
  async scanPageElements(): Promise<any> {
    return this.executeCommand({ action: 'scan_elements' });
  }

  // เช็คว่า extension พร้อมใช้งานหรือไม่
  isReady(): boolean {
    return this.isExtensionContext;
  }

  // ทดสอบการเชื่อมต่อกับ content script
  async testConnection(): Promise<any> {
    return this.executeCommand({ action: 'scan_elements' });
  }
}
