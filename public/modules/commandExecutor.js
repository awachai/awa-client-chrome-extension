
// Command Executor - จัดการการประมวลผลคำสั่ง
console.log('Command Executor module loaded');

class CommandExecutor {
  constructor(tabManager) {
    this.tabManager = tabManager;
  }

  // Execute command on target tab (side panel tab เป็นหลัก)
  async executeCommandOnTargetTab(command) {
    try {
      console.log('[CMD_EXECUTOR] === EXECUTE COMMAND DEBUG ===');
      console.log('[CMD_EXECUTOR] Command:', command);
      console.log(`[CMD_EXECUTOR] Current side panel tab ID: ${this.tabManager.getSidePanelTabId()}`);
      console.log(`[CMD_EXECUTOR] Available ready tabs: ${this.tabManager.getReadyTabIds().join(', ')}`);
      
      let targetTab = null;
      const sidePanelTabId = this.tabManager.getSidePanelTabId();
      
      // ใช้ side panel tab เป็นหลัก
      if (sidePanelTabId) {
        try {
          targetTab = await chrome.tabs.get(sidePanelTabId);
          console.log(`[CMD_EXECUTOR] ✓ Side panel tab found - ID: ${targetTab.id}, Window: ${targetTab.windowId}, URL: ${targetTab.url}`);
          
          // ตรวจสอบว่า tab ยังมีอยู่และเข้าถึงได้
          if (!targetTab.url || targetTab.url.startsWith('chrome://') || targetTab.url.startsWith('chrome-extension://')) {
            console.log(`[CMD_EXECUTOR] ✗ Side panel tab ${sidePanelTabId} is not accessible, will try active tab`);
            targetTab = null;
            this.tabManager.clearSidePanelTab();
          }
        } catch (error) {
          console.log(`[CMD_EXECUTOR] ✗ Side panel tab ${sidePanelTabId} no longer exists:`, error);
          this.tabManager.clearSidePanelTab();
          targetTab = null;
        }
      } else {
        console.log('[CMD_EXECUTOR] No side panel tab ID stored');
      }
      
      // ถ้าไม่มี side panel tab หรือไม่สามารถใช้ได้ ใช้ active tab
      if (!targetTab) {
        try {
          console.log('[CMD_EXECUTOR] Trying to get active tab...');
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab && activeTab.id) {
            targetTab = activeTab;
            console.log(`[CMD_EXECUTOR] ✓ Using active tab - ID: ${targetTab.id}, Window: ${targetTab.windowId}, URL: ${targetTab.url}`);
          } else {
            console.log('[CMD_EXECUTOR] ✗ No active tab found');
          }
        } catch (error) {
          console.log('[CMD_EXECUTOR] ✗ Failed to get active tab:', error);
        }
      }
      
      if (!targetTab || !targetTab.id) {
        console.log('[CMD_EXECUTOR] ✗ No target tab found');
        return { success: false, error: 'No target tab found' };
      }

      console.log(`[CMD_EXECUTOR] Final target tab: ID ${targetTab.id}, Window ${targetTab.windowId}, URL: ${targetTab.url}`);
      
      // Check if URL is accessible
      if (!targetTab.url || targetTab.url.startsWith('chrome://') || targetTab.url.startsWith('chrome-extension://')) {
        console.log('[CMD_EXECUTOR] ✗ Target tab URL is not accessible');
        return { success: false, error: 'Cannot access this type of page' };
      }
      
      // Check if content script is ready
      const tabInfo = this.tabManager.getReadyTabInfo(targetTab.id);
      console.log(`[CMD_EXECUTOR] Tab ${targetTab.id} ready status:`, tabInfo);
      
      // If not ready, inject content script
      if (!tabInfo || !tabInfo.ready) {
        console.log(`[CMD_EXECUTOR] Injecting content script on tab ${targetTab.id}...`);
        
        try {
          // Clear any existing ready state
          this.tabManager.removeTab(targetTab.id);
          
          // First, try to check if content script is already there
          try {
            const response = await new Promise((resolve, reject) => {
              console.log(`[CMD_EXECUTOR] Sending PING to tab ${targetTab.id}`);
              chrome.tabs.sendMessage(targetTab.id, { type: 'PING' }, (response) => {
                if (chrome.runtime.lastError) {
                  console.log(`[CMD_EXECUTOR] PING failed for tab ${targetTab.id}:`, chrome.runtime.lastError);
                  reject(chrome.runtime.lastError);
                } else {
                  console.log(`[CMD_EXECUTOR] PING response from tab ${targetTab.id}:`, response);
                  resolve(response);
                }
              });
            });
            
            if (response && response.pong) {
              console.log(`[CMD_EXECUTOR] ✓ Content script already exists on tab ${targetTab.id}, marking as ready`);
              this.tabManager.addReadyTab(targetTab.id, {
                url: targetTab.url,
                title: targetTab.title,
                timestamp: new Date().toISOString(),
                windowId: targetTab.windowId
              });
            }
          } catch (pingError) {
            // Content script not responding, need to inject
            console.log(`[CMD_EXECUTOR] Content script not responding on tab ${targetTab.id}, injecting...`);
            
            await chrome.scripting.executeScript({
              target: { tabId: targetTab.id },
              files: ['content.js']
            });
            
            // Wait for content script to initialize
            console.log(`[CMD_EXECUTOR] Waiting for content script to initialize on tab ${targetTab.id}...`);
            let initAttempts = 0;
            while (initAttempts < 30) { // 3 seconds total
              await new Promise(resolve => setTimeout(resolve, 100));
              const updatedTabInfo = this.tabManager.getReadyTabInfo(targetTab.id);
              if (updatedTabInfo && updatedTabInfo.ready) {
                console.log(`[CMD_EXECUTOR] ✓ Content script initialized successfully on tab ${targetTab.id}`);
                break;
              }
              initAttempts++;
            }
          }
          
          // Check if it's ready now
          const finalTabInfo = this.tabManager.getReadyTabInfo(targetTab.id);
          if (!finalTabInfo || !finalTabInfo.ready) {
            console.log(`[CMD_EXECUTOR] ✗ Content script failed to initialize after injection on tab ${targetTab.id}`);
            return { success: false, error: 'Content script failed to initialize after injection' };
          }
        } catch (injectError) {
          console.error(`[CMD_EXECUTOR] ✗ Failed to inject content script on tab ${targetTab.id}:`, injectError);
          return { success: false, error: `Failed to inject content script: ${injectError.message}` };
        }
      }
      
      // Send command to content script
      console.log(`[CMD_EXECUTOR] Sending command to tab ${targetTab.id} (window ${targetTab.windowId}):`, command);
      
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(targetTab.id, {
          type: 'DOM_COMMAND',
          command: command
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error(`[CMD_EXECUTOR] ✗ Message sending error to tab ${targetTab.id}:`, chrome.runtime.lastError);
            console.log(`[CMD_EXECUTOR] Available tabs: ${this.tabManager.getReadyTabIds().join(', ')}`);
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            console.log(`[CMD_EXECUTOR] ✓ Received response from content script on tab ${targetTab.id}:`, response);
            resolve(response || { success: false, error: 'No response from content script' });
          }
        });
      });
      
    } catch (error) {
      console.error('[CMD_EXECUTOR] ✗ Background script error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export factory function
window.createCommandExecutor = (tabManager) => new CommandExecutor(tabManager);
