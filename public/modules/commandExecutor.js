
// Command Executor - จัดการการประมวลผลคำสั่ง
console.log('Command Executor module loaded');

class CommandExecutor {
  constructor(tabManager) {
    this.tabManager = tabManager;
  }

  // เพิ่ม debug function
  debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[CMD_EXECUTOR_DEBUG ${timestamp}] ${message}`, data ? data : '');
  }

  // Execute command on target tab (side panel tab เป็นหลัก)
  async executeCommandOnTargetTab(command) {
    try {
      this.debugLog('🔥 === EXECUTE COMMAND START ===');
      this.debugLog('📋 Command received:', command);
      this.debugLog(`🎯 Current side panel tab ID: ${this.tabManager.getSidePanelTabId()}`);
      this.debugLog(`📋 Available ready tabs: [${this.tabManager.getReadyTabIds().join(', ')}]`);
      
      let targetTab = null;
      const sidePanelTabId = this.tabManager.getSidePanelTabId();
      
      // ใช้ side panel tab เป็นหลัก
      if (sidePanelTabId) {
        try {
          targetTab = await chrome.tabs.get(sidePanelTabId);
          this.debugLog(`✅ Side panel tab found - ID: ${targetTab.id}, Window: ${targetTab.windowId}, URL: ${targetTab.url}`);
          
          // ตรวจสอบว่า tab ยังมีอยู่และเข้าถึงได้
          if (!targetTab.url || targetTab.url.startsWith('chrome://') || targetTab.url.startsWith('chrome-extension://')) {
            this.debugLog(`❌ Side panel tab ${sidePanelTabId} is not accessible, will try active tab`);
            targetTab = null;
            this.tabManager.clearSidePanelTab();
          }
        } catch (error) {
          this.debugLog(`❌ Side panel tab ${sidePanelTabId} no longer exists:`, error);
          this.tabManager.clearSidePanelTab();
          targetTab = null;
        }
      } else {
        this.debugLog('⚠️ No side panel tab ID stored');
      }
      
      // ถ้าไม่มี side panel tab หรือไม่สามารถใช้ได้ ใช้ active tab
      if (!targetTab) {
        try {
          this.debugLog('🔍 Trying to get active tab...');
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab && activeTab.id) {
            targetTab = activeTab;
            this.debugLog(`✅ Using active tab - ID: ${targetTab.id}, Window: ${targetTab.windowId}, URL: ${targetTab.url}`);
          } else {
            this.debugLog('❌ No active tab found');
          }
        } catch (error) {
          this.debugLog('❌ Failed to get active tab:', error);
        }
      }
      
      if (!targetTab || !targetTab.id) {
        this.debugLog('❌ No target tab found');
        return { success: false, error: 'No target tab found' };
      }

      this.debugLog(`🎯 Final target tab: ID ${targetTab.id}, Window ${targetTab.windowId}, URL: ${targetTab.url}`);
      
      // Check if URL is accessible
      if (!targetTab.url || targetTab.url.startsWith('chrome://') || targetTab.url.startsWith('chrome-extension://')) {
        this.debugLog('❌ Target tab URL is not accessible');
        return { success: false, error: 'Cannot access this type of page' };
      }
      
      // Check if content script is ready
      const tabInfo = this.tabManager.getReadyTabInfo(targetTab.id);
      this.debugLog(`📋 Tab ${targetTab.id} ready status:`, tabInfo);
      
      // If not ready, inject content script
      if (!tabInfo || !tabInfo.ready) {
        this.debugLog(`💉 Injecting content script on tab ${targetTab.id}...`);
        
        try {
          // Clear any existing ready state
          this.tabManager.removeTab(targetTab.id);
          
          // First, try to check if content script is already there
          try {
            const response = await new Promise((resolve, reject) => {
              this.debugLog(`🏓 Sending PING to tab ${targetTab.id}`);
              chrome.tabs.sendMessage(targetTab.id, { type: 'PING' }, (response) => {
                if (chrome.runtime.lastError) {
                  this.debugLog(`❌ PING failed for tab ${targetTab.id}:`, chrome.runtime.lastError);
                  reject(chrome.runtime.lastError);
                } else {
                  this.debugLog(`✅ PING response from tab ${targetTab.id}:`, response);
                  resolve(response);
                }
              });
            });
            
            if (response && response.pong) {
              this.debugLog(`✅ Content script already exists on tab ${targetTab.id}, marking as ready`);
              this.tabManager.addReadyTab(targetTab.id, {
                url: targetTab.url,
                title: targetTab.title,
                timestamp: new Date().toISOString(),
                windowId: targetTab.windowId
              });
            }
          } catch (pingError) {
            // Content script not responding, need to inject
            this.debugLog(`💉 Content script not responding on tab ${targetTab.id}, injecting...`);
            
            await chrome.scripting.executeScript({
              target: { tabId: targetTab.id },
              files: ['content.js']
            });
            
            // Wait for content script to initialize
            this.debugLog(`⏳ Waiting for content script to initialize on tab ${targetTab.id}...`);
            let initAttempts = 0;
            while (initAttempts < 30) { // 3 seconds total
              await new Promise(resolve => setTimeout(resolve, 100));
              const updatedTabInfo = this.tabManager.getReadyTabInfo(targetTab.id);
              if (updatedTabInfo && updatedTabInfo.ready) {
                this.debugLog(`✅ Content script initialized successfully on tab ${targetTab.id}`);
                break;
              }
              initAttempts++;
            }
          }
          
          // Check if it's ready now
          const finalTabInfo = this.tabManager.getReadyTabInfo(targetTab.id);
          if (!finalTabInfo || !finalTabInfo.ready) {
            this.debugLog(`❌ Content script failed to initialize after injection on tab ${targetTab.id}`);
            return { success: false, error: 'Content script failed to initialize after injection' };
          }
        } catch (injectError) {
          this.debugLog(`❌ Failed to inject content script on tab ${targetTab.id}:`, injectError);
          return { success: false, error: `Failed to inject content script: ${injectError.message}` };
        }
      }
      
      // Send command to content script
      this.debugLog(`📤 Sending command to tab ${targetTab.id} (window ${targetTab.windowId}):`, command);
      
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(targetTab.id, {
          type: 'DOM_COMMAND',
          command: command
        }, (response) => {
          if (chrome.runtime.lastError) {
            this.debugLog(`❌ Message sending error to tab ${targetTab.id}:`, chrome.runtime.lastError);
            this.debugLog(`📋 Available tabs: [${this.tabManager.getReadyTabIds().join(', ')}]`);
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            this.debugLog(`✅ Received response from content script on tab ${targetTab.id}:`, response);
            resolve(response || { success: false, error: 'No response from content script' });
          }
        });
      });
      
    } catch (error) {
      this.debugLog('❌ Background script error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export factory function
window.createCommandExecutor = (tabManager) => new CommandExecutor(tabManager);
