
// Background Script - จัดการการสื่อสาร
console.log('AI Web Agent Background Script loaded');

// เก็บข้อมูล tabs ที่มี content script พร้อมใช้งาน
const readyTabs = new Map();

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
  
  // Execute DOM command
  if (message.type === 'EXECUTE_DOM_COMMAND') {
    executeCommandOnActiveTab(message.command)
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

// Execute command on active tab with improved error handling
async function executeCommandOnActiveTab(command) {
  try {
    console.log('Executing command on active tab:', command);
    
    // Get active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab || !activeTab.id) {
      return { success: false, error: 'No active tab found' };
    }

    console.log(`Active tab: ${activeTab.id}, URL: ${activeTab.url}`);
    
    // Check if URL is accessible
    if (!activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://')) {
      return { success: false, error: 'Cannot access this type of page' };
    }
    
    // Check if content script is ready
    const tabInfo = readyTabs.get(activeTab.id);
    console.log(`Tab ${activeTab.id} ready status:`, tabInfo);
    
    // If not ready, inject content script
    if (!tabInfo || !tabInfo.ready) {
      console.log(`Injecting content script on tab ${activeTab.id}`);
      
      try {
        // Clear any existing ready state
        readyTabs.delete(activeTab.id);
        
        // First, try to check if content script is already there
        try {
          const response = await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(activeTab.id, { type: 'PING' }, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
          
          if (response && response.pong) {
            console.log('Content script already exists, marking as ready');
            readyTabs.set(activeTab.id, {
              ready: true,
              url: activeTab.url,
              title: activeTab.title,
              timestamp: new Date().toISOString()
            });
          }
        } catch (pingError) {
          // Content script not responding, need to inject
          console.log('Content script not responding, injecting...');
          
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content.js']
          });
          
          // Wait for content script to initialize
          console.log('Waiting for content script to initialize...');
          let initAttempts = 0;
          while (initAttempts < 30) { // 3 seconds total
            await new Promise(resolve => setTimeout(resolve, 100));
            const updatedTabInfo = readyTabs.get(activeTab.id);
            if (updatedTabInfo && updatedTabInfo.ready) {
              console.log('Content script initialized successfully');
              break;
            }
            initAttempts++;
          }
        }
        
        // Check if it's ready now
        const finalTabInfo = readyTabs.get(activeTab.id);
        if (!finalTabInfo || !finalTabInfo.ready) {
          return { success: false, error: 'Content script failed to initialize after injection' };
        }
      } catch (injectError) {
        console.error('Failed to inject content script:', injectError);
        return { success: false, error: `Failed to inject content script: ${injectError.message}` };
      }
    }
    
    // Send command to content script
    console.log(`Sending command to tab ${activeTab.id}:`, command);
    
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(activeTab.id, {
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
  console.log(`Tab ${tabId} removed from ready list`);
});

// เปิด side panel เมื่อคลิก extension icon
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    console.log('Side panel opened');
  } catch (error) {
    console.error('Failed to open side panel:', error);
  }
});

// Initialize on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension startup - clearing ready tabs');
  readyTabs.clear();
});

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed/updated - clearing ready tabs');
  readyTabs.clear();
});

console.log('Background script initialization complete');
