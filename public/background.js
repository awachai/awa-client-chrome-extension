
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
    
    // Check if content script is ready
    if (!contentScriptTabs.has(activeTab.id)) {
      return { success: false, error: 'Content script not ready on this tab' };
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

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // Remove from set when tab is reloaded
    contentScriptTabs.delete(tabId);
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
