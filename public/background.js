
// Background Script - จัดการการสื่อสาร
console.log('AI Web Agent Background Script loaded');

// เก็บข้อมูล tabs ที่มี content script พร้อมใช้งาน
const readyTabs = new Map();

// เก็บ tab ID ที่มี side panel เปิดอยู่
let sidePanelTabId = null;

// Listen for messages from content scripts and extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type, message);
  console.log('Sender tab info:', sender.tab ? `Tab ID: ${sender.tab.id}, Window ID: ${sender.tab.windowId}, URL: ${sender.tab.url}` : 'No tab info');
  
  // Content script ready signal
  if (message.type === 'CONTENT_SCRIPT_READY') {
    if (sender.tab) {
      readyTabs.set(sender.tab.id, {
        ready: true,
        url: message.url,
        title: message.title,
        timestamp: message.timestamp,
        windowId: sender.tab.windowId
      });
      console.log(`Content script ready on tab ${sender.tab.id} (window ${sender.tab.windowId}): ${message.url}`);
    }
    sendResponse({ success: true, message: 'Ready signal received' });
    return;
  }
  
  // Side panel opened signal
  if (message.type === 'SIDE_PANEL_OPENED') {
    if (sender.tab) {
      sidePanelTabId = sender.tab.id;
      console.log(`[DEBUG] Side panel opened on tab ${sidePanelTabId} (window ${sender.tab.windowId})`);
    }
    sendResponse({ success: true });
    return;
  }
  
  // Execute DOM command
  if (message.type === 'EXECUTE_DOM_COMMAND') {
    console.log(`[DEBUG] Command execution request - Current side panel tab: ${sidePanelTabId}`);
    console.log(`[DEBUG] Ready tabs: ${Array.from(readyTabs.keys()).join(', ')}`);
    executeCommandOnTargetTab(message.command)
      .then(result => {
        console.log('[DEBUG] Command execution result:', result);
        sendResponse(result);
      })
      .catch(error => {
        console.error('[DEBUG] Command execution error:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Async response
  }

  // Health check
  if (message.type === 'HEALTH_CHECK') {
    sendResponse({ success: true, message: 'Background script is healthy' });
    return;
  }
});

// Execute command on target tab (side panel tab เป็นหลัก)
async function executeCommandOnTargetTab(command) {
  try {
    console.log('[DEBUG] === EXECUTE COMMAND DEBUG ===');
    console.log('[DEBUG] Command:', command);
    console.log(`[DEBUG] Current side panel tab ID: ${sidePanelTabId}`);
    console.log(`[DEBUG] Available ready tabs: ${Array.from(readyTabs.keys()).join(', ')}`);
    
    let targetTab = null;
    
    // ใช้ side panel tab เป็นหลัก
    if (sidePanelTabId) {
      try {
        targetTab = await chrome.tabs.get(sidePanelTabId);
        console.log(`[DEBUG] ✓ Side panel tab found - ID: ${targetTab.id}, Window: ${targetTab.windowId}, URL: ${targetTab.url}`);
        
        // ตรวจสอบว่า tab ยังมีอยู่และเข้าถึงได้
        if (!targetTab.url || targetTab.url.startsWith('chrome://') || targetTab.url.startsWith('chrome-extension://')) {
          console.log(`[DEBUG] ✗ Side panel tab ${sidePanelTabId} is not accessible, will try active tab`);
          targetTab = null;
          sidePanelTabId = null;
        }
      } catch (error) {
        console.log(`[DEBUG] ✗ Side panel tab ${sidePanelTabId} no longer exists:`, error);
        sidePanelTabId = null;
        targetTab = null;
      }
    } else {
      console.log('[DEBUG] No side panel tab ID stored');
    }
    
    // ถ้าไม่มี side panel tab หรือไม่สามารถใช้ได้ ใช้ active tab
    if (!targetTab) {
      try {
        console.log('[DEBUG] Trying to get active tab...');
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id) {
          targetTab = activeTab;
          console.log(`[DEBUG] ✓ Using active tab - ID: ${targetTab.id}, Window: ${targetTab.windowId}, URL: ${targetTab.url}`);
        } else {
          console.log('[DEBUG] ✗ No active tab found');
        }
      } catch (error) {
        console.log('[DEBUG] ✗ Failed to get active tab:', error);
      }
    }
    
    if (!targetTab || !targetTab.id) {
      console.log('[DEBUG] ✗ No target tab found');
      return { success: false, error: 'No target tab found' };
    }

    console.log(`[DEBUG] Final target tab: ID ${targetTab.id}, Window ${targetTab.windowId}, URL: ${targetTab.url}`);
    
    // Check if URL is accessible
    if (!targetTab.url || targetTab.url.startsWith('chrome://') || targetTab.url.startsWith('chrome-extension://')) {
      console.log('[DEBUG] ✗ Target tab URL is not accessible');
      return { success: false, error: 'Cannot access this type of page' };
    }
    
    // Check if content script is ready
    const tabInfo = readyTabs.get(targetTab.id);
    console.log(`[DEBUG] Tab ${targetTab.id} ready status:`, tabInfo);
    
    // If not ready, inject content script
    if (!tabInfo || !tabInfo.ready) {
      console.log(`[DEBUG] Injecting content script on tab ${targetTab.id}...`);
      
      try {
        // Clear any existing ready state
        readyTabs.delete(targetTab.id);
        
        // First, try to check if content script is already there
        try {
          const response = await new Promise((resolve, reject) => {
            console.log(`[DEBUG] Sending PING to tab ${targetTab.id}`);
            chrome.tabs.sendMessage(targetTab.id, { type: 'PING' }, (response) => {
              if (chrome.runtime.lastError) {
                console.log(`[DEBUG] PING failed for tab ${targetTab.id}:`, chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
              } else {
                console.log(`[DEBUG] PING response from tab ${targetTab.id}:`, response);
                resolve(response);
              }
            });
          });
          
          if (response && response.pong) {
            console.log(`[DEBUG] ✓ Content script already exists on tab ${targetTab.id}, marking as ready`);
            readyTabs.set(targetTab.id, {
              ready: true,
              url: targetTab.url,
              title: targetTab.title,
              timestamp: new Date().toISOString(),
              windowId: targetTab.windowId
            });
          }
        } catch (pingError) {
          // Content script not responding, need to inject
          console.log(`[DEBUG] Content script not responding on tab ${targetTab.id}, injecting...`);
          
          await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            files: ['content.js']
          });
          
          // Wait for content script to initialize
          console.log(`[DEBUG] Waiting for content script to initialize on tab ${targetTab.id}...`);
          let initAttempts = 0;
          while (initAttempts < 30) { // 3 seconds total
            await new Promise(resolve => setTimeout(resolve, 100));
            const updatedTabInfo = readyTabs.get(targetTab.id);
            if (updatedTabInfo && updatedTabInfo.ready) {
              console.log(`[DEBUG] ✓ Content script initialized successfully on tab ${targetTab.id}`);
              break;
            }
            initAttempts++;
          }
        }
        
        // Check if it's ready now
        const finalTabInfo = readyTabs.get(targetTab.id);
        if (!finalTabInfo || !finalTabInfo.ready) {
          console.log(`[DEBUG] ✗ Content script failed to initialize after injection on tab ${targetTab.id}`);
          return { success: false, error: 'Content script failed to initialize after injection' };
        }
      } catch (injectError) {
        console.error(`[DEBUG] ✗ Failed to inject content script on tab ${targetTab.id}:`, injectError);
        return { success: false, error: `Failed to inject content script: ${injectError.message}` };
      }
    }
    
    // Send command to content script
    console.log(`[DEBUG] Sending command to tab ${targetTab.id} (window ${targetTab.windowId}):`, command);
    
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(targetTab.id, {
        type: 'DOM_COMMAND',
        command: command
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(`[DEBUG] ✗ Message sending error to tab ${targetTab.id}:`, chrome.runtime.lastError);
          console.log(`[DEBUG] Available tabs: ${Array.from(readyTabs.keys()).join(', ')}`);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log(`[DEBUG] ✓ Received response from content script on tab ${targetTab.id}:`, response);
          resolve(response || { success: false, error: 'No response from content script' });
        }
      });
    });
    
  } catch (error) {
    console.error('[DEBUG] ✗ Background script error:', error);
    return { success: false, error: error.message };
  }
}

// Handle tab updates - clear ready state when page changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    console.log(`[DEBUG] Tab ${tabId} (window ${tab.windowId}) updated: ${tab.url}`);
    
    // Clear ready state since page reloaded
    readyTabs.delete(tabId);
    
    console.log(`[DEBUG] Tab ${tabId} marked for content script injection when needed`);
  }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`[DEBUG] Tab ${tabId} removed`);
  readyTabs.delete(tabId);
  
  // Clear side panel tab ID if it's the one being removed
  if (sidePanelTabId === tabId) {
    console.log(`[DEBUG] Side panel tab ${tabId} removed, clearing sidePanelTabId`);
    sidePanelTabId = null;
  }
  
  console.log(`[DEBUG] Tab ${tabId} removed from ready list`);
});

// เปิด side panel เมื่อคลิก extension icon
chrome.action.onClicked.addListener(async (tab) => {
  try {
    console.log(`[DEBUG] Opening side panel on tab ${tab.id} (window ${tab.windowId})`);
    await chrome.sidePanel.open({ windowId: tab.windowId });
    sidePanelTabId = tab.id;
    console.log(`[DEBUG] ✓ Side panel opened on tab ${tab.id} (window ${tab.windowId})`);
  } catch (error) {
    console.error('[DEBUG] ✗ Failed to open side panel:', error);
  }
});

// Initialize on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[DEBUG] Extension startup - clearing ready tabs and side panel tab');
  readyTabs.clear();
  sidePanelTabId = null;
});

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[DEBUG] Extension installed/updated - clearing ready tabs and side panel tab');
  readyTabs.clear();
  sidePanelTabId = null;
});

console.log('[DEBUG] Background script initialization complete');
