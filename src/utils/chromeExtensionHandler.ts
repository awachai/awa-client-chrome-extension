
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

    // ส่งสัญญาณไปยัง background script ว่า side panel เปิดแล้ว
    if (this.isExtensionContext) {
      this.notifySidePanelOpened();
    }
  }

  private debugLog(message: string, data: any = null) {
    const timestamp = new Date().toISOString();
    console.log(`[CHROME_EXT_DEBUG ${timestamp}] ${message}`, data ? data : '');
  }

  private async notifySidePanelOpened() {
    try {
      const chrome = (window as any).chrome;
      this.debugLog('📤 Sending side panel opened signal');
      
      chrome.runtime.sendMessage({
        type: 'SIDE_PANEL_OPENED'
      }, (response: any) => {
        if (chrome.runtime.lastError) {
          this.debugLog('❌ Failed to send side panel opened signal:', chrome.runtime.lastError.message);
        } else {
          this.debugLog('✅ Side panel opened signal sent successfully:', response);
        }
      });
    } catch (error) {
      this.debugLog('❌ Error sending side panel opened signal:', error);
    }
  }

  async executeCommand(command: ChromeCommand): Promise<any> {
    if (!this.isExtensionContext) {
      this.debugLog('❌ Not running in Chrome Extension context');
      return { 
        success: false, 
        error: 'Not running in Chrome Extension context' 
      };
    }

    try {
      this.debugLog('🚀 Sending command to background script:', command);
      
      const chrome = (window as any).chrome;
      
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'EXECUTE_DOM_COMMAND',
          command: command
        }, (response: any) => {
          if (chrome.runtime.lastError) {
            this.debugLog('❌ Background script error:', chrome.runtime.lastError.message);
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            this.debugLog('✅ Background script response:', response);
            resolve(response);
          }
        });
      });
      
      this.debugLog('📨 Final command result:', result);
      return result;
    } catch (error) {
      this.debugLog('❌ Chrome extension command error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
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
