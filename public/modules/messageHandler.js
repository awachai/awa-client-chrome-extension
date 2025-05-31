
// Message Handler - จัดการข้อความจาก Chrome runtime
console.log('Message Handler module loaded');

class MessageHandler {
  constructor(tabManager, commandExecutor) {
    this.tabManager = tabManager;
    this.commandExecutor = commandExecutor;
  }

  // Handle Chrome runtime messages
  handleMessage(message, sender, sendResponse) {
    console.log('[MSG_HANDLER] Background received message:', message.type, message);
    console.log('[MSG_HANDLER] Sender tab info:', sender.tab ? `Tab ID: ${sender.tab.id}, Window ID: ${sender.tab.windowId}, URL: ${sender.tab.url}` : 'No tab info');
    
    // Content script ready signal
    if (message.type === 'CONTENT_SCRIPT_READY') {
      if (sender.tab) {
        this.tabManager.addReadyTab(sender.tab.id, {
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
        this.tabManager.setSidePanelTab(sender.tab.id, sender.tab.windowId);
      }
      sendResponse({ success: true });
      return;
    }
    
    // Execute DOM command
    if (message.type === 'EXECUTE_DOM_COMMAND') {
      console.log(`[MSG_HANDLER] Command execution request - Current side panel tab: ${this.tabManager.getSidePanelTabId()}`);
      console.log(`[MSG_HANDLER] Ready tabs: ${this.tabManager.getReadyTabIds().join(', ')}`);
      this.commandExecutor.executeCommandOnTargetTab(message.command)
        .then(result => {
          console.log('[MSG_HANDLER] Command execution result:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('[MSG_HANDLER] Command execution error:', error);
          sendResponse({ success: false, error: error.message });
        });
      
      return true; // Async response
    }

    // Health check
    if (message.type === 'HEALTH_CHECK') {
      sendResponse({ success: true, message: 'Background script is healthy' });
      return;
    }
  }
}

// Export factory function
window.createMessageHandler = (tabManager, commandExecutor) => new MessageHandler(tabManager, commandExecutor);
