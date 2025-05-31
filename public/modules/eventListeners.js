
// Event Listeners - จัดการ Chrome extension events
console.log('Event Listeners module loaded');

class EventListeners {
  constructor(tabManager) {
    this.tabManager = tabManager;
  }

  // Setup all Chrome extension event listeners
  setupEventListeners() {
    // Handle tab updates - clear ready state when page changes
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
        this.tabManager.updateTab(tabId, tab);
      }
    });

    // Handle tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.tabManager.removeTab(tabId);
    });

    // เปิด side panel เมื่อคลิก extension icon
    chrome.action.onClicked.addListener(async (tab) => {
      try {
        console.log(`[EVENT_LISTENERS] Opening side panel on tab ${tab.id} (window ${tab.windowId})`);
        await chrome.sidePanel.open({ windowId: tab.windowId });
        this.tabManager.setSidePanelTab(tab.id, tab.windowId);
        console.log(`[EVENT_LISTENERS] ✓ Side panel opened on tab ${tab.id} (window ${tab.windowId})`);
      } catch (error) {
        console.error('[EVENT_LISTENERS] ✗ Failed to open side panel:', error);
      }
    });

    // Initialize on startup
    chrome.runtime.onStartup.addListener(async () => {
      console.log('[EVENT_LISTENERS] Extension startup - clearing ready tabs and side panel tab');
      this.tabManager.reset();
    });

    // Initialize on install
    chrome.runtime.onInstalled.addListener(async () => {
      console.log('[EVENT_LISTENERS] Extension installed/updated - clearing ready tabs and side panel tab');
      this.tabManager.reset();
    });

    console.log('[EVENT_LISTENERS] All event listeners setup complete');
  }
}

// Export factory function
window.createEventListeners = (tabManager) => new EventListeners(tabManager);
