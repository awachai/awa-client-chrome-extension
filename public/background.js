
// Background Script - จัดการการสื่อสาร
console.log('AI Web Agent Background Script loading...');

// ข้อมูล tabs ที่มี content script พร้อมใช้งาน
const readyTabs = new Map();
// tab ID ที่มี side panel เปิดอยู่
let sidePanelTabId = null;
// WebSocket connection for sending responses back
let websocketConnection = null;

// ส่ง console log ไปยัง content script
function logToContent(tabId, message, level = 'log') {
  if (tabId && readyTabs.has(tabId)) {
    try {
      chrome.tabs.sendMessage(tabId, {
        type: 'CONSOLE_LOG',
        message: message,
        level: level
      });
    } catch (error) {
      // Fallback to background console
      console.log(`[BACKGROUND] ${message}`);
    }
  } else {
    console.log(`[BACKGROUND] ${message}`);
  }
}

// ส่ง WebSocket response กลับไปยัง server
function sendWebSocketResponse(response) {
  try {
    // ส่งข้อมูลไปยัง side panel เพื่อให้ส่งผ่าน WebSocket
    if (sidePanelTabId) {
      chrome.tabs.sendMessage(sidePanelTabId, {
        type: 'SEND_WEBSOCKET_RESPONSE',
        response: response
      }, (sendResponse) => {
        if (chrome.runtime.lastError) {
          console.log('[BACKGROUND] Could not send WebSocket response to side panel:', chrome.runtime.lastError.message);
        } else {
          console.log('[BACKGROUND] WebSocket response sent via side panel:', response);
        }
      });
    } else {
      console.log('[BACKGROUND] No side panel available to send WebSocket response');
    }
  } catch (error) {
    console.error('[BACKGROUND] Error sending WebSocket response:', error);
  }
}

// เพิ่ม tab ที่พร้อมใช้งาน
function addReadyTab(tabId, info) {
  readyTabs.set(tabId, {
    ready: true,
    url: info.url,
    title: info.title,
    timestamp: info.timestamp,
    windowId: info.windowId
  });
  logToContent(tabId, `Content script ready on tab ${tabId} (window ${info.windowId}): ${info.url}`);
}

// ตั้งค่า side panel tab
function setSidePanelTab(tabId, windowId) {
  sidePanelTabId = tabId;
  logToContent(tabId, `Side panel opened on tab ${tabId} (window ${windowId})`);
}

// ลบ tab ออกจากรายการ
function removeTab(tabId) {
  logToContent(tabId, `Tab ${tabId} removed`);
  readyTabs.delete(tabId);
  
  // Clear side panel tab ID if it's the one being removed
  if (sidePanelTabId === tabId) {
    logToContent(tabId, `Side panel tab ${tabId} removed, clearing sidePanelTabId`);
    sidePanelTabId = null;
  }
}

// Execute command on target tab (ONLY side panel tab, no fallback)
async function executeCommandOnTargetTab(command, requestSidePanelTabId = null, originalCommand = null) {
  try {
    // ใช้ tab ID ที่ส่งมาจาก request ก่อน
    const targetTabId = requestSidePanelTabId || sidePanelTabId;
    
    logToContent(targetTabId, '=== EXECUTE COMMAND DEBUG ===');
    logToContent(targetTabId, `Command: ${JSON.stringify(command)}`);
    logToContent(targetTabId, `Request side panel tab ID: ${requestSidePanelTabId}`);
    logToContent(targetTabId, `Stored side panel tab ID: ${sidePanelTabId}`);
    logToContent(targetTabId, `Final target tab ID: ${targetTabId}`);
    logToContent(targetTabId, `Available ready tabs: ${Array.from(readyTabs.keys()).join(', ')}`);
    
    // ตรวจสอบว่ามี side panel tab หรือไม่
    if (!targetTabId) {
      logToContent(null, '✗ No side panel tab ID available');
      const errorResponse = { 
        success: false, 
        error: 'No side panel tab active. User may have closed the panel or switched window.' 
      };
      
      // ส่ง WebSocket response สำหรับ error
      if (originalCommand) {
        sendWebSocketResponse({
          tranType: 'response',
          type: originalCommand.type,
          action: originalCommand.action,
          message: errorResponse.error,
          selector: originalCommand.selector || '',
          data: { error: errorResponse.error },
          tab_id: targetTabId,
          room: originalCommand.room,
          timestamp: new Date().toISOString()
        });
      }
      
      return errorResponse;
    }
    
    let targetTab = null;
    
    // ตรวจสอบว่า tab ยังมีอยู่และเข้าถึงได้
    try {
      targetTab = await chrome.tabs.get(targetTabId);
      logToContent(targetTabId, `✓ Side panel tab found - ID: ${targetTab.id}, Window: ${targetTab.windowId}, URL: ${targetTab.url}`);
      
      // ตรวจสอบว่า tab ยังมีอยู่และเข้าถึงได้
      if (!targetTab.url || targetTab.url.startsWith('chrome://') || targetTab.url.startsWith('chrome-extension://')) {
        logToContent(targetTabId, `✗ Side panel tab ${targetTabId} is not accessible`);
        const errorResponse = { 
          success: false, 
          error: 'Side panel tab is not accessible (chrome:// or extension page)' 
        };
        
        // ส่ง WebSocket response สำหรับ error
        if (originalCommand) {
          sendWebSocketResponse({
            tranType: 'response',
            type: originalCommand.type,
            action: originalCommand.action,
            message: errorResponse.error,
            selector: originalCommand.selector || '',
            data: { error: errorResponse.error },
            tab_id: targetTabId,
            room: originalCommand.room,
            timestamp: new Date().toISOString()
          });
        }
        
        return errorResponse;
      }
    } catch (error) {
      logToContent(targetTabId, `✗ Side panel tab ${targetTabId} no longer exists: ${error.message}`);
      
      // เคลียร์ stored tab ID ถ้าเป็น tab เดียวกัน
      if (sidePanelTabId === targetTabId) {
        sidePanelTabId = null;
      }
      
      const errorResponse = { 
        success: false, 
        error: `Side panel tab no longer exists: ${error.message}` 
      };
      
      // ส่ง WebSocket response สำหรับ error
      if (originalCommand) {
        sendWebSocketResponse({
          tranType: 'response',
          type: originalCommand.type,
          action: originalCommand.action,
          message: errorResponse.error,
          selector: originalCommand.selector || '',
          data: { error: errorResponse.error },
          tab_id: targetTabId,
          room: originalCommand.room,
          timestamp: new Date().toISOString()
        });
      }
      
      return errorResponse;
    }
    
    if (!targetTab || !targetTab.id) {
      logToContent(targetTabId, '✗ No valid target tab found');
      const errorResponse = { success: false, error: 'No valid target tab found' };
      
      // ส่ง WebSocket response สำหรับ error
      if (originalCommand) {
        sendWebSocketResponse({
          tranType: 'response',
          type: originalCommand.type,
          action: originalCommand.action,
          message: errorResponse.error,
          selector: originalCommand.selector || '',
          data: { error: errorResponse.error },
          tab_id: targetTabId,
          room: originalCommand.room,
          timestamp: new Date().toISOString()
        });
      }
      
      return errorResponse;
    }

    logToContent(targetTab.id, `Final target tab: ID ${targetTab.id}, Window ${targetTab.windowId}, URL: ${targetTab.url}`);
    
    // Check if content script is ready
    const tabInfo = readyTabs.get(targetTab.id);
    logToContent(targetTab.id, `Tab ${targetTab.id} ready status: ${JSON.stringify(tabInfo)}`);
    
    // If not ready, inject content script
    if (!tabInfo || !tabInfo.ready) {
      logToContent(targetTab.id, `Injecting content script on tab ${targetTab.id}...`);
      
      try {
        // Clear any existing ready state
        readyTabs.delete(targetTab.id);
        
        // First, try to check if content script is already there
        try {
          const response = await new Promise((resolve, reject) => {
            logToContent(targetTab.id, `Sending PING to tab ${targetTab.id}`);
            chrome.tabs.sendMessage(targetTab.id, { type: 'PING' }, (response) => {
              if (chrome.runtime.lastError) {
                logToContent(targetTab.id, `PING failed for tab ${targetTab.id}: ${chrome.runtime.lastError.message}`);
                reject(chrome.runtime.lastError);
              } else {
                logToContent(targetTab.id, `PING response from tab ${targetTab.id}: ${JSON.stringify(response)}`);
                resolve(response);
              }
            });
          });
          
          if (response && response.pong) {
            logToContent(targetTab.id, `✓ Content script already exists on tab ${targetTab.id}, marking as ready`);
            addReadyTab(targetTab.id, {
              url: targetTab.url,
              title: targetTab.title,
              timestamp: new Date().toISOString(),
              windowId: targetTab.windowId
            });
          }
        } catch (pingError) {
          // Content script not responding, need to inject
          logToContent(targetTab.id, `Content script not responding on tab ${targetTab.id}, injecting...`);
          
          await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            files: ['content.js']
          });
          
          // Wait for content script to initialize
          logToContent(targetTab.id, `Waiting for content script to initialize on tab ${targetTab.id}...`);
          let initAttempts = 0;
          while (initAttempts < 30) { // 3 seconds total
            await new Promise(resolve => setTimeout(resolve, 100));
            const updatedTabInfo = readyTabs.get(targetTab.id);
            if (updatedTabInfo && updatedTabInfo.ready) {
              logToContent(targetTab.id, `✓ Content script initialized successfully on tab ${targetTab.id}`);
              break;
            }
            initAttempts++;
          }
        }
        
        // Check if it's ready now
        const finalTabInfo = readyTabs.get(targetTab.id);
        if (!finalTabInfo || !finalTabInfo.ready) {
          logToContent(targetTab.id, `✗ Content script failed to initialize after injection on tab ${targetTab.id}`);
          const errorResponse = { success: false, error: 'Content script failed to initialize after injection' };
          
          // ส่ง WebSocket response สำหรับ error
          if (originalCommand) {
            sendWebSocketResponse({
              tranType: 'response',
              type: originalCommand.type,
              action: originalCommand.action,
              message: errorResponse.error,
              selector: originalCommand.selector || '',
              data: { error: errorResponse.error },
              tab_id: targetTab.id,
              room: originalCommand.room,
              timestamp: new Date().toISOString()
            });
          }
          
          return errorResponse;
        }
      } catch (injectError) {
        logToContent(targetTab.id, `✗ Failed to inject content script on tab ${targetTab.id}: ${injectError.message}`);
        const errorResponse = { success: false, error: `Failed to inject content script: ${injectError.message}` };
        
        // ส่ง WebSocket response สำหรับ error
        if (originalCommand) {
          sendWebSocketResponse({
            tranType: 'response',
            type: originalCommand.type,
            action: originalCommand.action,
            message: errorResponse.error,
            selector: originalCommand.selector || '',
            data: { error: errorResponse.error },
            tab_id: targetTab.id,
            room: originalCommand.room,
            timestamp: new Date().toISOString()
          });
        }
        
        return errorResponse;
      }
    }
    
    // Send command to content script
    logToContent(targetTab.id, `Sending command to tab ${targetTab.id} (window ${targetTab.windowId}): ${JSON.stringify(command)}`);
    
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(targetTab.id, {
        type: 'DOM_COMMAND',
        command: command
      }, (response) => {
        if (chrome.runtime.lastError) {
          logToContent(targetTab.id, `✗ Message sending error to tab ${targetTab.id}: ${chrome.runtime.lastError.message}`);
          logToContent(targetTab.id, `Available tabs: ${Array.from(readyTabs.keys()).join(', ')}`);
          const errorResponse = { success: false, error: chrome.runtime.lastError.message };
          
          // ส่ง WebSocket response สำหรับ error
          if (originalCommand) {
            sendWebSocketResponse({
              tranType: 'response',
              type: originalCommand.type,
              action: originalCommand.action,
              message: errorResponse.error,
              selector: originalCommand.selector || '',
              data: { error: errorResponse.error },
              tab_id: targetTab.id,
              room: originalCommand.room,
              timestamp: new Date().toISOString()
            });
          }
          
          resolve(errorResponse);
        } else {
          logToContent(targetTab.id, `✓ Received response from content script on tab ${targetTab.id}: ${JSON.stringify(response)}`);
          const result = response || { success: false, error: 'No response from content script' };
          
          // ส่ง WebSocket response สำหรับ success
          if (originalCommand) {
            sendWebSocketResponse({
              tranType: 'response',
              type: originalCommand.type,
              action: originalCommand.action,
              message: result.success ? 'success' : (result.error || 'Unknown error'),
              selector: originalCommand.selector || '',
              data: result.success ? result : { error: result.error },
              tab_id: targetTab.id,
              room: originalCommand.room,
              timestamp: new Date().toISOString()
            });
          }
          
          resolve(result);
        }
      });
    });
    
  } catch (error) {
    console.error('[BACKGROUND] ✗ Background script error:', error);
    const errorResponse = { success: false, error: error.message };
    
    // ส่ง WebSocket response สำหรับ error
    if (originalCommand) {
      sendWebSocketResponse({
        tranType: 'response',
        type: originalCommand.type,
        action: originalCommand.action,
        message: errorResponse.error,
        selector: originalCommand.selector || '',
        data: { error: errorResponse.error },
        tab_id: 'unknown',
        room: originalCommand.room,
        timestamp: new Date().toISOString()
      });
    }
    
    return errorResponse;
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
    // ใช้ tab ID ที่ส่งมาจาก message หรือ sender tab
    const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
    const windowId = sender.tab ? sender.tab.windowId : null;
    
    if (tabId) {
      setSidePanelTab(tabId, windowId);
    }
    sendResponse({ success: true });
    return;
  }
  
  // Execute DOM command
  if (message.type === 'EXECUTE_DOM_COMMAND') {
    console.log(`[BACKGROUND] Command execution request`);
    console.log(`[BACKGROUND] Request side panel tab ID: ${message.sidePanelTabId}`);
    console.log(`[BACKGROUND] Stored side panel tab ID: ${sidePanelTabId}`);
    console.log(`[BACKGROUND] Ready tabs: ${Array.from(readyTabs.keys()).join(', ')}`);
    
    // ส่ง originalCommand ไปด้วยเพื่อใช้ในการส่ง WebSocket response
    executeCommandOnTargetTab(message.command, message.sidePanelTabId, message.originalCommand)
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
