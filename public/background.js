// Background Script - จัดการการสื่อสาร
console.log('AI Web Agent Background Script loading...');

// ข้อมูล tabs ที่มี content script พร้อมใช้งาน
const readyTabs = new Map();
// tab ID และ window ID ที่มี side panel เปิดอยู่
let sidePanelTabId = null;
let sidePanelWindowId = null; // เพิ่มการจดจำ window ID

// ✅ ฟังก์ชันสำหรับโฟกัสแท็บและวินโดว์ที่ extension ทำงานอยู่
function focusTargetTab(callback) {
  if (sidePanelTabId && sidePanelWindowId) {
    chrome.windows.update(sidePanelWindowId, { focused: true }, () => {
      chrome.tabs.update(sidePanelTabId, { active: true }, () => {
        if (callback) callback();
      });
    });
  } else {
    console.warn('[BACKGROUND] Cannot focus tab: sidePanelTabId or windowId missing');
    if (callback) callback(); // fallback
  }
}


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
    if (sidePanelTabId && sidePanelWindowId) {
      // เพิ่มการตรวจสอบ window ID ด้วย
      chrome.tabs.get(sidePanelTabId, (tab) => {
        if (chrome.runtime.lastError || !tab || tab.windowId !== sidePanelWindowId) {
          console.log('[BACKGROUND] Side panel tab/window mismatch or not found');
          return;
        }

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
      });
    } else {
      console.log('[BACKGROUND] No side panel tab/window available to send WebSocket response');
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

// ตั้งค่า side panel tab และ window
function setSidePanelTab(tabId, windowId) {
  sidePanelTabId = tabId;
  sidePanelWindowId = windowId;
  logToContent(tabId, `Side panel opened on tab ${tabId} (window ${windowId})`);
}

// ลบ tab ออกจากรายการ
function removeTab(tabId) {
  logToContent(tabId, `Tab ${tabId} removed`);
  readyTabs.delete(tabId);
  
  // Clear side panel tab ID if it's the one being removed
  if (sidePanelTabId === tabId) {
    logToContent(tabId, `Side panel tab ${tabId} removed, clearing sidePanelTabId and sidePanelWindowId`);
    sidePanelTabId = null;
    sidePanelWindowId = null;
  }
}

// Execute command on target tab (ONLY side panel tab with matching window, no fallback)
async function executeCommandOnTargetTab(command, requestSidePanelTabId = null, requestSidePanelWindowId = null, originalCommand = null) {
  try {
    // Handle open_url command specially - it can work without a target tab
    if (command.action === 'open_url') {
      return await handleOpenUrlCommand(command, originalCommand);
    }

    // ใช้ tab ID และ window ID ที่ส่งมาจาก request ก่อน
    let targetTabId = requestSidePanelTabId || sidePanelTabId;
    let targetWindowId = requestSidePanelWindowId || sidePanelWindowId;

    // Fallback: ถ้าไม่มีหรือไม่ตรง ให้หา active tab ปัจจุบัน
    if (!targetTabId || !targetWindowId) {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (activeTab && activeTab.id && activeTab.windowId) {
        targetTabId = activeTab.id;
        targetWindowId = activeTab.windowId;
        logToContent(targetTabId, '[FALLBACK] Using active tab as target');
      }
    }
    
    logToContent(targetTabId, '=== EXECUTE COMMAND DEBUG ===');
    logToContent(targetTabId, `Command: ${JSON.stringify(command)}`);
    logToContent(targetTabId, `Request side panel tab ID: ${requestSidePanelTabId}`);
    logToContent(targetTabId, `Request side panel window ID: ${requestSidePanelWindowId}`);
    logToContent(targetTabId, `Stored side panel tab ID: ${sidePanelTabId}`);
    logToContent(targetTabId, `Stored side panel window ID: ${sidePanelWindowId}`);
    logToContent(targetTabId, `Final target tab ID: ${targetTabId}`);
    logToContent(targetTabId, `Final target window ID: ${targetWindowId}`);
    logToContent(targetTabId, `Available ready tabs: ${Array.from(readyTabs.keys()).join(', ')}`);
    
    // ตรวจสอบว่ามี side panel tab และ window หรือไม่
    if (!targetTabId || !targetWindowId) {
      logToContent(null, '✗ No side panel tab/window ID available');
      const errorResponse = { 
        success: false, 
        error: 'No side panel tab/window active. User may have closed the panel or switched window.' 
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
          window_id: targetWindowId,
          room: originalCommand.room,
          timestamp: new Date().toISOString()
        });
      }
      
      return errorResponse;
    }
    
    let targetTab = null;
    
    // ตรวจสอบว่า tab ยังมีอยู่และ window ตรงกัน
    try {
      targetTab = await chrome.tabs.get(targetTabId);
      
      // ตรวจสอบว่า window ID ตรงกันหรือไม่
      if (targetTab.windowId !== targetWindowId) {
        logToContent(targetTabId, `✗ Side panel tab ${targetTabId} window mismatch - expected: ${targetWindowId}, actual: ${targetTab.windowId}`);
        const errorResponse = { 
          success: false, 
          error: 'Side panel tab window mismatch. User may have moved tab to different window.' 
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
            window_id: targetWindowId,
            room: originalCommand.room,
            timestamp: new Date().toISOString()
          });
        }
        
        return errorResponse;
      }
      
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
            window_id: targetWindowId,
            room: originalCommand.room,
            timestamp: new Date().toISOString()
          });
        }
        
        return errorResponse;
      }
    } catch (error) {
      logToContent(targetTabId, `✗ Side panel tab ${targetTabId} no longer exists: ${error.message}`);
      
      // เคลียร์ stored tab ID และ window ID ถ้าเป็น tab เดียวกัน
      if (sidePanelTabId === targetTabId) {
        sidePanelTabId = null;
        sidePanelWindowId = null;
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
          window_id: targetWindowId,
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
              window_id: targetWindowId,
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
            window_id: targetWindowId,
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
              window_id: targetWindowId,
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
              window_id: targetWindowId,
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
        window_id: 'unknown',
        room: originalCommand.room,
        timestamp: new Date().toISOString()
      });
    }
    
    return errorResponse;
  }
}

// Handle open_url command
async function handleOpenUrlCommand(command, originalCommand = null) {
  try {
    const url = command.data?.url;
    const newTab = command.data?.newTab !== false; // default to true

    if (!url) {
      // ...error handling...
      return { success: false, error: 'URL is required' };
    }

    // ใช้ tab เดิมถ้ามี (sidePanelTabId/sidePanelWindowId)
    if (!newTab && sidePanelTabId && sidePanelWindowId) {
      try {
        await chrome.tabs.update(sidePanelTabId, { url });
        return {
          success: true,
          action: 'open_url',
          url,
          opened: 'current_tab',
          tabId: sidePanelTabId,
          message: `เปิด URL ใน tab ปัจจุบัน: ${url}`
        };
      } catch (err) {
        // ถ้า update ไม่ได้ fallback ไปเปิด tab ใหม่
      }
    }

    // ถ้า newTab หรือไม่มี tab เดิม ให้เปิด tab ใหม่
    const newTabObj = await chrome.tabs.create({ url });
    return {
      success: true,
      action: 'open_url',
      url,
      opened: 'new_tab',
      tabId: newTabObj.id,
      message: `เปิด URL ใน tab ใหม่: ${url}`
    };
  } catch (error) {
    return { success: false, error: `Failed to open URL: ${error.message}` };
  }
}

// Handle Chrome runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BACKGROUND] Background received message:', message.type, message);
  console.log('[BACKGROUND] Sender tab info:', sender.tab ? `Tab ID: ${sender.tab.id}, Window ID: ${sender.tab.windowId}, URL: ${sender.tab.url}` : 'No tab info');
  
  if (message.type === 'USER_INPUT') {
    const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
    const windowId = message.windowId || (sender.tab ? sender.tab.windowId : null);
    if (tabId) {
      sidePanelTabId = tabId;
      sidePanelWindowId = windowId;
      console.log(`[BACKGROUND] USER_INPUT: Set sidePanelTabId=${tabId}, sidePanelWindowId=${windowId}`);
    }
    sendResponse({ success: true });
    return;
  }

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
    sendResponse({ success: true });
    return;
  }
  
  // Execute DOM command
  if (message.type === 'EXECUTE_DOM_COMMAND') {
    console.log(`[BACKGROUND] Command execution request`);
    console.log(`[BACKGROUND] Request side panel tab ID: ${message.sidePanelTabId}`);
    console.log(`[BACKGROUND] Request side panel window ID: ${message.sidePanelWindowId}`);
    console.log(`[BACKGROUND] Stored side panel tab ID: ${sidePanelTabId}`);
    console.log(`[BACKGROUND] Stored side panel window ID: ${sidePanelWindowId}`);
    console.log(`[BACKGROUND] Ready tabs: ${Array.from(readyTabs.keys()).join(', ')}`);
    
    // ส่ง originalCommand ไปด้วยเพื่อใช้ในการส่ง WebSocket response
    executeCommandOnTargetTab(
      message.command, 
      message.sidePanelTabId, 
      message.sidePanelWindowId, // เพิ่ม window ID parameter
      message.originalCommand
    )
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
  console.log('[BACKGROUND] Extension startup - clearing ready tabs and side panel tab/window');
  readyTabs.clear();
  sidePanelTabId = null;
  sidePanelWindowId = null;
});

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[BACKGROUND] Extension installed/updated - clearing ready tabs and side panel tab/window');
  readyTabs.clear();
  sidePanelTabId = null;
  sidePanelWindowId = null;
});

console.log('[BACKGROUND] Background script initialization complete');
