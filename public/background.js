
// Background Script - จัดการการสื่อสาร
console.log('AI Web Agent Background Script loaded');

// เก็บข้อมูล tabs ที่มี content script
const contentScriptTabs = new Set();

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  if (message.type === 'CONTENT_SCRIPT_READY') {
    if (sender.tab) {
      contentScriptTabs.add(sender.tab.id);
      console.log(`Content script ready on tab ${sender.tab.id}: ${message.url}`);
    }
    sendResponse({ success: true });
    return;
  }
  
  // Forward messages from side panel to content script
  if (message.type === 'EXECUTE_DOM_COMMAND') {
    executeCommandOnActiveTab(message.command)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true; // Async response
  }
});

// Execute command on active tab
async function executeCommandOnActiveTab(command) {
  try {
    // Get active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab) {
      return { success: false, error: 'No active tab found' };
    }
    
    console.log(`Checking tab ${activeTab.id}, content script ready:`, contentScriptTabs.has(activeTab.id));
    
    // If content script is not ready, try to inject it
    if (!contentScriptTabs.has(activeTab.id)) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['content.js']
        });
        
        // Wait a bit for content script to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (!contentScriptTabs.has(activeTab.id)) {
          return { success: false, error: 'Content script failed to initialize' };
        }
      } catch (injectError) {
        return { success: false, error: `Failed to inject content script: ${injectError.message}` };
      }
    }
    
    // Send command to content script
    const result = await chrome.tabs.sendMessage(activeTab.id, {
      type: 'DOM_COMMAND',
      command: command
    });
    
    return result;
  } catch (error) {
    console.error('Background script error:', error);
    return { success: false, error: error.message };
  }
}

// Handle tab updates - reinject content script when page reloads
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    try {
      // Remove from ready set
      contentScriptTabs.delete(tabId);
      
      // Try to inject content script
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      
      console.log(`Content script injected on tab ${tabId}: ${tab.url}`);
    } catch (error) {
      console.log(`Failed to inject content script on tab ${tabId}:`, error.message);
    }
  }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  contentScriptTabs.delete(tabId);
});

// เปิด side panel เมื่อคลิก extension icon
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Initialize content script on current tabs when extension starts
chrome.runtime.onStartup.addListener(async () => {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
        } catch (error) {
          console.log(`Failed to inject content script on startup for tab ${tab.id}`);
        }
      }
    }
  } catch (error) {
    console.error('Failed to initialize content scripts on startup:', error);
  }
});
