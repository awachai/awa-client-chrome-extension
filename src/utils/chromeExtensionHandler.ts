
// Chrome Extension Message Handler
export interface ChromeCommand {
  action: 'highlight' | 'click' | 'scroll_to' | 'get_dom' | 'fill_form' | 'scan_elements';
  selector?: string;
  data?: Array<{ selector: string; value: string }>;
}

export class ChromeExtensionHandler {
  private isExtensionContext: boolean;
  private currentTabId: number | null = null;
  private currentWindowId: number | null = null; // เพิ่ม window ID

  constructor() {
    // ตรวจสอบว่าอยู่ใน Chrome Extension context หรือไม่
    this.isExtensionContext = typeof window !== 'undefined' && 
                              typeof (window as any).chrome !== 'undefined' && 
                              (window as any).chrome.runtime && 
                              (window as any).chrome.runtime.id;

    console.log('[CHROME_HANDLER] Extension context check:', this.isExtensionContext);

    // ส่งสัญญาณไปยัง background script ว่า side panel เปิดแล้ว
    if (this.isExtensionContext) {
      this.initializeSidePanel();
    }
  }

  private async initializeSidePanel() {
    try {
      const chrome = (window as any).chrome;
      
      // ขั้นแรก: ดึง tab ID และ window ID ของหน้าต่างปัจจุบัน
      console.log('[CHROME_HANDLER] Getting current tab and window information...');
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
        if (chrome.runtime.lastError) {
          console.log('[CHROME_HANDLER] Error getting current tab:', chrome.runtime.lastError.message);
          this.sendSidePanelSignal(null, null);
          return;
        }
        
        if (tabs && tabs.length > 0) {
          this.currentTabId = tabs[0].id;
          this.currentWindowId = tabs[0].windowId;
          console.log('[CHROME_HANDLER] Found current tab ID:', this.currentTabId);
          console.log('[CHROME_HANDLER] Found current window ID:', this.currentWindowId);
          console.log('[CHROME_HANDLER] Tab URL:', tabs[0].url);
          
          // ส่งสัญญาณพร้อม tab ID และ window ID
          this.sendSidePanelSignal(this.currentTabId, this.currentWindowId);
        } else {
          console.log('[CHROME_HANDLER] No tabs found');
          this.sendSidePanelSignal(null, null);
        }
      });
      
    } catch (error) {
      console.error('[CHROME_HANDLER] Error initializing side panel:', error);
      this.sendSidePanelSignal(null, null);
    }
  }

  private sendSidePanelSignal(tabId: number | null, windowId: number | null) {
    try {
      const chrome = (window as any).chrome;
      console.log('[CHROME_HANDLER] Sending side panel opened signal with tab ID:', tabId, 'window ID:', windowId);
      
      chrome.runtime.sendMessage({
        type: 'SIDE_PANEL_OPENED',
        tabId: tabId,
        windowId: windowId // เพิ่ม window ID ในสัญญาณ
      }, (response: any) => {
        if (chrome.runtime.lastError) {
          console.log('[CHROME_HANDLER] Failed to send side panel opened signal:', chrome.runtime.lastError.message);
        } else {
          console.log('[CHROME_HANDLER] Side panel opened signal sent successfully:', response);
        }
      });
    } catch (error) {
      console.error('[CHROME_HANDLER] Error sending side panel opened signal:', error);
    }
  }

  async executeCommand(command: ChromeCommand, originalCommand?: any): Promise<any> {
    if (!this.isExtensionContext) {
      console.log('[CHROME_HANDLER] Not in extension context, cannot execute command');
      return { 
        success: false, 
        error: 'Not running in Chrome Extension context' 
      };
    }

    try {
      console.log('[CHROME_HANDLER] === COMMAND EXECUTION START ===');
      console.log('[CHROME_HANDLER] Current tab ID:', this.currentTabId);
      console.log('[CHROME_HANDLER] Current window ID:', this.currentWindowId);
      console.log('[CHROME_HANDLER] Sending command to background script:', command);
      console.log('[CHROME_HANDLER] Original command for WebSocket response:', originalCommand);
      
      const chrome = (window as any).chrome;
      
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'EXECUTE_DOM_COMMAND',
          command: command,
          sidePanelTabId: this.currentTabId, // ส่ง tab ID ไปด้วย
          sidePanelWindowId: this.currentWindowId, // ส่ง window ID ไปด้วย
          originalCommand: originalCommand // ส่ง original command เพื่อใช้ใน WebSocket response
        }, (response: any) => {
          if (chrome.runtime.lastError) {
            console.error('[CHROME_HANDLER] Runtime error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            console.log('[CHROME_HANDLER] Command result from background script:', response);
            resolve(response);
          }
        });
      });
      
      console.log('[CHROME_HANDLER] === COMMAND EXECUTION END ===');
      return result;
    } catch (error) {
      console.error('[CHROME_HANDLER] Chrome extension command error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // สแกนหา elements ที่มีอยู่ในหน้าเว็บ
  async scanPageElements(): Promise<any> {
    console.log('[CHROME_HANDLER] Scanning page elements...');
    return this.executeCommand({ action: 'scan_elements' });
  }

  isReady(): boolean {
    return this.isExtensionContext;
  }

  async testConnection(): Promise<any> {
    console.log('[CHROME_HANDLER] Testing connection...');
    return this.executeCommand({ action: 'scan_elements' });
  }

  // ดึง tab ID และ window ID ปัจจุบัน
  getCurrentTabId(): number | null {
    return this.currentTabId;
  }

  getCurrentWindowId(): number | null {
    return this.currentWindowId;
  }

  // ดึงข้อมูลทั้ง tab และ window
  getCurrentTabInfo(): { tabId: number | null; windowId: number | null } {
    return {
      tabId: this.currentTabId,
      windowId: this.currentWindowId
    };
  }
}
