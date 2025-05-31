
// Background Script - จัดการการสื่อสาร
console.log('AI Web Agent Background Script loading...');

// ข้อมูล tabs ที่มี content script พร้อมใช้งาน
const readyTabs = new Map();
// tab ID ที่มี side panel เปิดอยู่
let sidePanelTabId = null;

// เพิ่ม tab ที่พร้อมใช้งาน
function addReadyTab(tabId, info) {
  readyTabs.set(tabId, {
    ready: true,
    url: info.url,
    title: info.title,
    timestamp: info.timestamp,
    windowId: info.windowId
  });
  console.log(`[BACKGROUND] Content script ready on tab ${tabId} (window ${info.windowId}): ${info.url}`);
}

// ตั้งค่า side panel tab
function setSidePanelTab(tabId, windowId) {
  sidePanelTabId = tabId;
  console.log(`[BACKGROUND] Side panel opened on tab ${tabId} (window ${windowId})`);
}

// ลบ tab ออกจากรายการ
function removeTab(tabId) {
  console.log(`[BACKGROUND] Tab ${tabId} removed`);
  readyTabs.delete(tabId);
  
  // Clear side panel tab ID if it's the one being removed
  if (sidePanelTabId === tabId) {
    console.log(`[BACKGROUND] Side panel tab ${tabId} removed, clearing sidePanelTabId`);
    sidePanelTabId = null;
  }
}

// Execute command on target tab (side panel tab เป็นหลัก)
async function executeCommandOnTargetTab(command) {
  try {
    console.log('[BACKGROUND] === EXECUTE COMMAND DEBUG ===');
    console.log('[BACKGROUND] Command:', command);
    console.log(`[BACKGROUND] Current side panel tab ID: ${sidePanelTabId}`);
    console.log(`[BACKGROUND] Available ready tabs: ${Array.from(readyTabs.keys()).join(', ')}`);
    
    let targetTab = null;
    
    // ใช้ side panel tab เป็นหลัก
    if (sidePanelTabId) {
      try {
        targetTab = await chrome.tabs.get(sidePanelTabId);
        console.log(`[BACKGROUND] ✓ Side panel tab found - ID: ${targetTab.id}, Window: ${targetTab.windowId}, URL: ${targetTab.url}`);
        
        // ตรวจสอบว่า tab ยังมีอยู่และเข้าถึงได้
        if (!targetTab.url || targetTab.url.startsWith('chrome://') || targetTab.url.startsWith('chrome-extension://')) {
          console.log(`[BACKGROUND] ✗ Side panel tab ${sidePanelTabId} is not accessible, will try active tab`);
          targetTab = null;
          sidePanelTabId = null;
        }
      } catch (error) {
        console.log(`[BACKGROUND] ✗ Side panel tab ${sidePanelTabId} no longer exists:`, error);
        sidePanelTabId = null;
        targetTab = null;
      }
    } else {
      console.log('[BACKGROUND] No side panel tab ID stored');
    }
    
    // ถ้าไม่มี side panel tab หรือไม่สามารถใช้ได้ ใช้ active tab
    if (!targetTab) {
      try {
        console.log('[BACKGROUND] Trying to get active tab...');
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id) {
          targetTab = activeTab;
          console.log(`[BACKGROUND] ✓ Using active tab - ID: ${targetTab.id}, Window: ${targetTab.windowId}, URL: ${targetTab.url}`);
        } else {
          console.log('[BACKGROUND] ✗ No active tab found');
        }
      } catch (error) {
        console.log('[BACKGROUND] ✗ Failed to get active tab:', error);
      }
    }
    
    if (!targetTab || !targetTab.id) {
      console.log('[BACKGROUND] ✗ No target tab found');
      return { success: false, error: 'No target tab found' };
    }

    console.log(`[BACKGROUND] Final target tab: ID ${targetTab.id}, Window ${targetTab.windowId}, URL: ${targetTab.url}`);
    
    // Check if URL is accessible
    if (!targetTab.url || targetTab.url.startsWith('chrome://') || targetTab.url.startsWith('chrome-extension://')) {
      console.log('[BACKGROUND] ✗ Target tab URL is not accessible');
      return { success: false, error: 'Cannot access this type of page' };
    }
    
    // Check if content script is ready
    const tabInfo = readyTabs.get(targetTab.id);
    console.log(`[BACKGROUND] Tab ${targetTab.id} ready status:`, tabInfo);
    
    // If not ready, inject content script
    if (!tabInfo || !tabInfo.ready) {
      console.log(`[BACKGROUND] Injecting content script on tab ${targetTab.id}...`);
      
      try {
        // Clear any existing ready state
        readyTabs.delete(targetTab.id);
        
        // First, try to check if content script is already there
        try {
          const response = await new Promise((resolve, reject) => {
            console.log(`[BACKGROUND] Sending PING to tab ${targetTab.id}`);
            chrome.tabs.sendMessage(targetTab.id, { type: 'PING' }, (response) => {
              if (chrome.runtime.lastError) {
                console.log(`[BACKGROUND] PING failed for tab ${targetTab.id}:`, chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
              } else {
                console.log(`[BACKGROUND] PING response from tab ${targetTab.id}:`, response);
                resolve(response);
              }
            });
          });
          
          if (response && response.pong) {
            console.log(`[BACKGROUND] ✓ Content script already exists on tab ${targetTab.id}, marking as ready`);
            addReadyTab(targetTab.id, {
              url: targetTab.url,
              title: targetTab.title,
              timestamp: new Date().toISOString(),
              windowId: targetTab.windowId
            });
          }
        } catch (pingError) {
          // Content script not responding, need to inject
          console.log(`[BACKGROUND] Content script not responding on tab ${targetTab.id}, injecting...`);
          
          await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            files: ['content.js']
          });
          
          // Wait for content script to initialize
          console.log(`[BACKGROUND] Waiting for content script to initialize on tab ${targetTab.id}...`);
          let initAttempts = 0;
          while (initAttempts < 30) { // 3 seconds total
            await new Promise(resolve => setTimeout(resolve, 100));
            const updatedTabInfo = readyTabs.get(targetTab.id);
            if (updatedTabInfo && updatedTabInfo.ready) {
              console.log(`[BACKGROUND] ✓ Content script initialized successfully on tab ${targetTab.id}`);
              break;
            }
            initAttempts++;
          }
        }
        
        // Check if it's ready now
        const finalTabInfo = readyTabs.get(targetTab.id);
        if (!finalTabInfo || !finalTabInfo.ready) {
          console.log(`[BACKGROUND] ✗ Content script failed to initialize after injection on tab ${targetTab.id}`);
          return { success: false, error: 'Content script failed to initialize after injection' };
        }
      } catch (injectError) {
        console.error(`[BACKGROUND] ✗ Failed to inject content script on tab ${targetTab.id}:`, injectError);
        return { success: false, error: `Failed to inject content script: ${injectError.message}` };
      }
    }
    
    // Send command to content script
    console.log(`[BACKGROUND] Sending command to tab ${targetTab.id} (window ${targetTab.windowId}):`, command);
    
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(targetTab.id, {
        type: 'DOM_COMMAND',
        command: command
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(`[BACKGROUND] ✗ Message sending error to tab ${targetTab.id}:`, chrome.runtime.lastError);
          console.log(`[BACKGROUND] Available tabs: ${Array.from(readyTabs.keys()).join(', ')}`);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log(`[BACKGROUND] ✓ Received response from content script on tab ${targetTab.id}:`, response);
          resolve(response || { success: false, error: 'No response from content script' });
        }
      });
    });
    
  } catch (error) {
    console.error('[BACKGROUND] ✗ Background script error:', error);
    return { success: false, error: error.message };
  }
}

// Handle Chrome runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BACKGROUND] Background received message:', message.type, message);
  console.log('[BACKGROUND] Sender tab info:', sender.tab ? `Tab ID: ${sender.tab.id}, Window ID: ${sender.tab.windowId}, URL: ${sender.tab.url}` : 'No tab info');
  
  // Content script ready signal
  if (message.type === 'CONTENT_SCRIPT_READY') {
    if (sender.tab) {
      addReadyTab(sender.tab.id, {
        url: message.url,
        title: message.title,
        timestamp: message.timestamp,
        windowId: sender.tab.windowId
      });
    }
    sendResponse({ success: true, message: 'Ready signal received' });
    return;
  }
  
  // Side panel opened signal
  if (message.type === 'SIDE_PANEL_OPENED') {
    if (sender.tab) {
      setSidePanelTab(sender.tab.id, sender.tab.windowId);
    }
    sendResponse({ success: true });
    return;
  }
  
  // Execute DOM command
  if (message.type === 'EXECUTE_DOM_COMMAND') {
    console.log(`[BACKGROUND] Command execution request - Current side panel tab: ${sidePanelTabId}`);
    console.log(`[BACKGROUND] Ready tabs: ${Array.from(readyTabs.keys()).join(', ')}`);
    executeCommandOnTargetTab(message.command)
      .then(result => {
        console.log('[BACKGROUND] Command execution result:', result);
        sendResponse(result);
      })
      .catch(error => {
        console.error('[BACKGROUND] Command execution error:', error);
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

// Handle tab updates - clear ready state when page changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    console.log(`[BACKGROUND] Tab ${tabId} (window ${tab.windowId}) updated: ${tab.url}`);
    
    // Clear ready state since page reloaded
    readyTabs.delete(tabId);
    
    console.log(`[BACKGROUND] Tab ${tabId} marked for content script injection when needed`);
  }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  removeTab(tabId);
});

// เปิด side panel เมื่อคลิก extension icon
chrome.action.onClicked.addListener(async (tab) => {
  try {
    console.log(`[BACKGROUND] Opening side panel on tab ${tab.id} (window ${tab.windowId})`);
    await chrome.sidePanel.open({ windowId: tab.windowId });
    setSidePanelTab(tab.id, tab.windowId);
    console.log(`[BACKGROUND] ✓ Side panel opened on tab ${tab.id} (window ${tab.windowId})`);
  } catch (error) {
    console.error('[BACKGROUND] ✗ Failed to open side panel:', error);
  }
});

// Initialize on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[BACKGROUND] Extension startup - clearing ready tabs and side panel tab');
  readyTabs.clear();
  sidePanelTabId = null;
});

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[BACKGROUND] Extension installed/updated - clearing ready tabs and side panel tab');
  readyTabs.clear();
  sidePanelTabId = null;
});

console.log('[BACKGROUND] Background script initialization complete');
