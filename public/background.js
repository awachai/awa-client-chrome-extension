
// Background Script - จัดการการสื่อสาร
console.log('AI Web Agent Background Script loaded');

// เก็บข้อมูล tabs ที่มี content script พร้อมใช้งาน
const readyTabs = new Map();

// เก็บ tab ID ที่มี side panel เปิดอยู่
let sidePanelTabId = null;

// Listen for messages from content scripts and extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type, message);
  
  // Content script ready signal
  if (message.type === 'CONTENT_SCRIPT_READY') {
    if (sender.tab) {
      readyTabs.set(sender.tab.id, {
        ready: true,
        url: message.url,
        title: message.title,
        timestamp: message.timestamp
      });
      console.log(`Content script ready on tab ${sender.tab.id}: ${message.url}`);
    }
    sendResponse({ success: true, message: 'Ready signal received' });
    return;
  }
  
  // Side panel opened signal
  if (message.type === 'SIDE_PANEL_OPENED') {
    if (sender.tab) {
      sidePanelTabId = sender.tab.id;
      console.log(`Side panel opened on tab ${sidePanelTabId}`);
    }
    sendResponse({ success: true });
    return;
  }
  
  // Execute DOM command
  if (message.type === 'EXECUTE_DOM_COMMAND') {
    executeCommandOnTargetTab(message.command)
      .then(result => {
        console.log('Command execution result:', result);
        sendResponse(result);
      })
      .catch(error => {
        console.error('Command execution error:', error);
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
    console.log('Executing command on target tab:', command);
    
    let targetTab = null;
    
    // ใช้ side panel tab เป็นหลัก
    if (sidePanelTabId) {
      try {
        targetTab = await chrome.tabs.get(sidePanelTabId);
        console.log(`Using side panel tab: ${targetTab.id}, URL: ${targetTab.url}`);
        
        // ตรวจสอบว่า tab ยังมีอยู่และเข้าถึงได้
        if (!targetTab.url || targetTab.url.startsWith('chrome://') || targetTab.url.startsWith('chrome-extension://')) {
          console.log(`Side panel tab ${sidePanelTabId} is not accessible, will try active tab`);
          targetTab = null;
          sidePanelTabId = null;
        }
      } catch (error) {
        console.log(`Side panel tab ${sidePanelTabId} no longer exists:`, error);
        sidePanelTabId = null;
        targetTab = null;
      }
    }
    
    // ถ้าไม่มี side panel tab หรือไม่สามารถใช้ได้ ใช้ active tab
    if (!targetTab) {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id) {
          targetTab = activeTab;
          console.log(`Using active tab: ${targetTab.id}, URL: ${targetTab.url}`);
        }
      } catch (error) {
        console.log('Failed to get active tab:', error);
      }
    }
    
    if (!targetTab || !targetTab.id) {
      return { success: false, error: 'No target tab found' };
    }

    console.log(`Target tab: ${targetTab.id}, URL: ${targetTab.url}`);
    
    // Check if URL is accessible
    if (!targetTab.url || targetTab.url.startsWith('chrome://') || targetTab.url.startsWith('chrome-extension://')) {
      return { success: false, error: 'Cannot access this type of page' };
    }
    
    // Check if content script is ready
    const tabInfo = readyTabs.get(targetTab.id);
    console.log(`Tab ${targetTab.id} ready status:`, tabInfo);
    
    // If not ready, inject content script
    if (!tabInfo || !tabInfo.ready) {
      console.log(`Injecting content script on tab ${targetTab.id}`);
      
      try {
        // Clear any existing ready state
        readyTabs.delete(targetTab.id);
        
        // First, try to check if content script is already there
        try {
          const response = await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(targetTab.id, { type: 'PING' }, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
          
          if (response && response.pong) {
            console.log('Content script already exists, marking as ready');
            readyTabs.set(targetTab.id, {
              ready: true,
              url: targetTab.url,
              title: targetTab.title,
              timestamp: new Date().toISOString()
            });
          }
        } catch (pingError) {
          // Content script not responding, need to inject
          console.log('Content script not responding, injecting...');
          
          await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            files: ['content.js']
          });
          
          // Wait for content script to initialize
          console.log('Waiting for content script to initialize...');
          let initAttempts = 0;
          while (initAttempts < 30) { // 3 seconds total
            await new Promise(resolve => setTimeout(resolve, 100));
            const updatedTabInfo = readyTabs.get(targetTab.id);
            if (updatedTabInfo && updatedTabInfo.ready) {
              console.log('Content script initialized successfully');
              break;
            }
            initAttempts++;
          }
        }
        
        // Check if it's ready now
        const finalTabInfo = readyTabs.get(targetTab.id);
        if (!finalTabInfo || !finalTabInfo.ready) {
          return { success: false, error: 'Content script failed to initialize after injection' };
        }
      } catch (injectError) {
        console.error('Failed to inject content script:', injectError);
        return { success: false, error: `Failed to inject content script: ${injectError.message}` };
      }
    }
    
    // Send command to content script
    console.log(`Sending command to tab ${targetTab.id}:`, command);
    
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(targetTab.id, {
        type: 'DOM_COMMAND',
        command: command
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Message sending error:', chrome.runtime.lastError);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('Received response from content script:', response);
          resolve(response || { success: false, error: 'No response from content script' });
        }
      });
    });
    
  } catch (error) {
    console.error('Background script error:', error);
    return { success: false, error: error.message };
  }
}

// Handle tab updates - clear ready state when page changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    console.log(`Tab ${tabId} updated: ${tab.url}`);
    
    // Clear ready state since page reloaded
    readyTabs.delete(tabId);
    
    console.log(`Tab ${tabId} marked for content script injection when needed`);
  }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  readyTabs.delete(tabId);
  
  // Clear side panel tab ID if it's the one being removed
  if (sidePanelTabId === tabId) {
    sidePanelTabId = null;
    console.log('Side panel tab removed, clearing sidePanelTabId');
  }
  
  console.log(`Tab ${tabId} removed from ready list`);
});

// เปิด side panel เมื่อคลิก extension icon
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    sidePanelTabId = tab.id;
    console.log(`Side panel opened on tab ${tab.id}`);
  } catch (error) {
    console.error('Failed to open side panel:', error);
  }
});

// Initialize on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension startup - clearing ready tabs and side panel tab');
  readyTabs.clear();
  sidePanelTabId = null;
});

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed/updated - clearing ready tabs and side panel tab');
  readyTabs.clear();
  sidePanelTabId = null;
});

console.log('Background script initialization complete');
