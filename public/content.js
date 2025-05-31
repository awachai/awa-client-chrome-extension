
// Content Script - ทำงานบนหน้าเว็บจริง
(function() {
  'use strict';
  
  console.log('AI Web Agent Content Script loading on:', window.location.href);

  // ป้องกันการ inject ซ้ำโดยใช้ unique identifier
  const SCRIPT_ID = 'ai-web-agent-content-script-v5';
  
  // ตรวจสอบว่า script ถูกโหลดแล้วหรือไม่
  if (window[SCRIPT_ID]) {
    console.log('Content script already loaded, skipping initialization...');
    return;
  }
  
  // ทำเครื่องหมายว่า script ถูกโหลดแล้ว
  window[SCRIPT_ID] = true;
  console.log('[CONTENT_DEBUG] Initializing content script...');

  // เพิ่ม debug function
  function debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[CONTENT_DEBUG ${timestamp}] ${message}`, data ? data : '');
  }

  // ContentDOMUtils Class
  window.ContentDOMUtils = class ContentDOMUtils {
    // หา element ด้วยหลายวิธี
    static findElement(selector) {
      // ลอง CSS selector ก่อน
      let element = document.querySelector(selector);
      if (element) return element;

      // ลองหาจาก ID โดยไม่ต้องมี #
      if (!selector.startsWith('#') && !selector.includes(' ')) {
        element = document.getElementById(selector);
        if (element) return element;
      }

      // ลองหาจาก name attribute
      element = document.querySelector(`[name="${selector}"]`);
      if (element) return element;

      // ลองหาจาก data attributes
      element = document.querySelector(`[data-id="${selector}"]`);
      if (element) return element;

      // ลองหาจาก text content
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.textContent && el.textContent.trim().includes(selector)) {
          return el;
        }
      }

      return null;
    }

    // รอให้ element ปรากฏ
    static async waitForElement(selector, timeout = 5000) {
      return new Promise((resolve) => {
        const element = this.findElement(selector);
        if (element) {
          resolve(element);
          return;
        }

        const observer = new MutationObserver(() => {
          const element = this.findElement(selector);
          if (element) {
            observer.disconnect();
            resolve(element);
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });

        setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, timeout);
      });
    }

    // ตรวจสอบว่า element สามารถ interact ได้หรือไม่
    static isInteractable(element) {
      const rect = element.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;
      const isClickable = element.matches('button, input, select, textarea, a, [onclick], [role="button"]');
      const style = window.getComputedStyle(element);
      const isNotHidden = style.display !== 'none' && style.visibility !== 'hidden';
      
      return isVisible && isNotHidden && (isClickable || element.hasAttribute('onclick'));
    }

    // สร้าง CSS selector สำหรับ element
    static generateSelector(element) {
      if (element.id) {
        return `#${element.id}`;
      }
      
      let selector = element.tagName.toLowerCase();
      
      if (element.className) {
        const classes = element.className.toString().split(' ').filter(c => c);
        if (classes.length > 0) {
          selector += '.' + classes.join('.');
        }
      }
      
      // เพิ่ม nth-child ถ้าจำเป็น
      const parent = element.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(element);
        if (siblings.length > 1) {
          selector += `:nth-child(${index + 1})`;
        }
      }
      
      return selector;
    }

    // หา elements ที่คล้ายกัน
    static findSimilarElements(selector) {
      const allElements = document.querySelectorAll('*');
      const similar = [];
      
      const searchTerm = selector.replace(/[#.]/g, '').toLowerCase();
      
      allElements.forEach(el => {
        const id = el.id ? el.id.toLowerCase() : '';
        const className = el.className ? el.className.toString().toLowerCase() : '';
        const textContent = el.textContent ? el.textContent.toLowerCase().trim() : '';
        
        if (
          (id && id.includes(searchTerm)) ||
          (className && className.includes(searchTerm)) ||
          (textContent && textContent.includes(searchTerm))
        ) {
          similar.push({
            selector: this.generateSelector(el),
            element: el,
            tagName: el.tagName.toLowerCase(),
            id: el.id,
            className: el.className ? el.className.toString() : '',
            textContent: el.textContent ? el.textContent.substring(0, 50) : ''
          });
        }
      });
      
      return similar.slice(0, 10);
    }

    // สแกนหา interactive elements ในหน้า
    static scanInteractiveElements() {
      const interactive = document.querySelectorAll('button, input, select, textarea, a, [onclick], [role="button"]');
      
      return Array.from(interactive)
        .filter(el => this.isInteractable(el))
        .map(el => ({
          selector: this.generateSelector(el),
          element: el,
          tagName: el.tagName.toLowerCase(),
          id: el.id,
          className: el.className ? el.className.toString() : '',
          textContent: el.textContent ? el.textContent.substring(0, 50) : ''
        }));
    }
  };

  // ContentCommandHandler Class
  window.ContentCommandHandler = class ContentCommandHandler {
    static async executeCommand(command) {
      debugLog('🔧 Executing command:', command);

      try {
        let result;
        switch (command.action) {
          case 'highlight':
            result = await this.highlightElement(command.selector);
            break;
          
          case 'click':
            result = await this.clickElement(command.selector);
            break;
          
          case 'scroll_to':
            result = await this.scrollToElement(command.selector);
            break;
          
          case 'get_dom':
            result = this.getPageDOM();
            break;
          
          case 'fill_form':
            result = this.fillForm(command.data);
            break;

          case 'scan_elements':
            result = this.scanElements();
            break;
          
          default:
            result = { success: false, error: `Unknown action: ${command.action}` };
        }
        
        debugLog('✅ Command result:', result);
        return result;
      } catch (error) {
        debugLog('❌ Command execution error:', error);
        return { success: false, error: error.message };
      }
    }

    static async highlightElement(selector) {
      try {
        let element = window.ContentDOMUtils.findElement(selector);
        
        if (!element) {
          element = await window.ContentDOMUtils.waitForElement(selector, 2000);
        }
        
        if (!element) {
          const similar = window.ContentDOMUtils.findSimilarElements(selector);
          
          return { 
            success: false, 
            error: `Element not found: ${selector}`,
            suggestions: similar.length > 0 ? {
              message: `พบ elements ที่คล้ายกัน:`,
              elements: similar.map(el => ({
                selector: el.selector,
                text: el.textContent,
                tag: el.tagName
              }))
            } : {
              message: `ไม่พบ element ใดๆ ที่คล้ายกับ "${selector}"`,
              availableElements: window.ContentDOMUtils.scanInteractiveElements().slice(0, 5).map(el => ({
                selector: el.selector,
                text: el.textContent,
                tag: el.tagName
              }))
            }
          };
        }

        // Remove existing highlights
        document.querySelectorAll('.ai-highlight').forEach(el => {
          el.classList.remove('ai-highlight');
        });

        // Add highlight style
        element.classList.add('ai-highlight');
        
        // Add CSS if not already added
        if (!document.getElementById('ai-highlight-styles')) {
          const style = document.createElement('style');
          style.id = 'ai-highlight-styles';
          style.textContent = `
            .ai-highlight {
              outline: 3px solid #ff6b6b !important;
              outline-offset: 2px !important;
              animation: ai-pulse 2s infinite !important;
              z-index: 9999 !important;
            }
            @keyframes ai-pulse {
              0%, 100% { outline-color: #ff6b6b; }
              50% { outline-color: #ff9999; }
            }
          `;
          document.head.appendChild(style);
        }

        // Remove highlight after 5 seconds
        setTimeout(() => {
          element.classList.remove('ai-highlight');
        }, 5000);

        return { 
          success: true, 
          action: 'highlight', 
          selector: window.ContentDOMUtils.generateSelector(element), 
          found: true,
          elementInfo: {
            tag: element.tagName.toLowerCase(),
            text: element.textContent ? element.textContent.substring(0, 100) : '',
            isInteractable: window.ContentDOMUtils.isInteractable(element)
          }
        };
      } catch (error) {
        return { success: false, error: `Failed to highlight ${selector}: ${error.message}` };
      }
    }

    static async clickElement(selector) {
      try {
        let element = window.ContentDOMUtils.findElement(selector);
        
        if (!element) {
          element = await window.ContentDOMUtils.waitForElement(selector, 2000);
        }

        if (!element) {
          const similar = window.ContentDOMUtils.findSimilarElements(selector);
          
          return { 
            success: false, 
            error: `Element not found: ${selector}`,
            suggestions: similar.length > 0 ? {
              message: `พบ elements ที่คล้ายกัน:`,
              elements: similar.map(el => ({
                selector: el.selector,
                text: el.textContent,
                tag: el.tagName
              }))
            } : {
              message: `ไม่พบ element ใดๆ ที่คล้ายกับ "${selector}"`,
              availableElements: window.ContentDOMUtils.scanInteractiveElements().slice(0, 5).map(el => ({
                selector: el.selector,
                text: el.textContent,
                tag: el.tagName
              }))
            }
          };
        }

        if (!window.ContentDOMUtils.isInteractable(element)) {
          return { 
            success: false, 
            error: `Element "${selector}" is not interactable`,
            elementInfo: {
              tag: element.tagName.toLowerCase(),
              text: element.textContent ? element.textContent.substring(0, 100) : '',
              isVisible: element.getBoundingClientRect().width > 0
            }
          };
        }

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 300));
        element.click();
        
        return { 
          success: true, 
          action: 'click', 
          selector: window.ContentDOMUtils.generateSelector(element), 
          clicked: true,
          elementInfo: {
            tag: element.tagName.toLowerCase(),
            text: element.textContent ? element.textContent.substring(0, 100) : ''
          }
        };
      } catch (error) {
        return { success: false, error: `Failed to click ${selector}: ${error.message}` };
      }
    }

    static async scrollToElement(selector) {
      try {
        let element = window.ContentDOMUtils.findElement(selector);
        
        if (!element) {
          element = await window.ContentDOMUtils.waitForElement(selector, 2000);
        }
        
        if (!element) {
          return { success: false, error: `Element not found: ${selector}` };
        }

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { 
          success: true, 
          action: 'scroll_to', 
          selector: window.ContentDOMUtils.generateSelector(element), 
          scrolled: true 
        };
      } catch (error) {
        return { success: false, error: `Failed to scroll to ${selector}: ${error.message}` };
      }
    }

    static getPageDOM() {
      try {
        const dom = document.documentElement.outerHTML;
        return { 
          success: true, 
          action: 'get_dom', 
          dom: dom.substring(0, 10000),
          fullSize: dom.length,
          url: window.location.href,
          title: document.title
        };
      } catch (error) {
        return { success: false, error: `Failed to get DOM: ${error.message}` };
      }
    }

    static fillForm(data) {
      const results = [];
      
      data.forEach(({ selector, value }) => {
        try {
          const element = window.ContentDOMUtils.findElement(selector);
          if (!element) {
            results.push({ selector, success: false, error: 'Element not found' });
            return;
          }

          if (element.type === 'checkbox' || element.type === 'radio') {
            element.checked = value === 'true' || value === '1';
          } else {
            element.value = value;
          }

          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new Event('input', { bubbles: true }));
          
          results.push({ selector, success: true });
        } catch (error) {
          results.push({ selector, success: false, error: String(error) });
        }
      });

      return { success: true, action: 'fill_form', results };
    }

    static scanElements() {
      try {
        const interactive = window.ContentDOMUtils.scanInteractiveElements();
        return {
          success: true,
          action: 'scan_elements',
          elements: interactive.slice(0, 20),
          totalFound: interactive.length,
          url: window.location.href,
          title: document.title
        };
      } catch (error) {
        return { success: false, error: `Failed to scan elements: ${error.message}` };
      }
    }
  };

  // Chrome Runtime Message Listener
  function handleMessage(message, sender, sendResponse) {
    debugLog('📨 Content script received message:', message);
    debugLog('📨 Message sender:', sender);
    
    // Handle ping/pong for checking if script is alive
    if (message.type === 'PING') {
      debugLog('🏓 Responding to PING');
      sendResponse({ pong: true, timestamp: new Date().toISOString() });
      return;
    }
    
    if (message.type === 'DOM_COMMAND') {
      debugLog('🎯 Processing DOM command:', message.command);
      
      window.ContentCommandHandler.executeCommand(message.command)
        .then(result => {
          debugLog('✅ Command completed:', result);
          sendResponse(result);
        })
        .catch(error => {
          debugLog('❌ Command failed:', error);
          sendResponse({ success: false, error: error.message });
        });
      
      return true; // Async response
    }

    debugLog('❓ Unknown message type:', message.type);
  }

  // Remove existing listener if it exists
  if (chrome.runtime && chrome.runtime.onMessage) {
    try {
      chrome.runtime.onMessage.removeListener(handleMessage);
      debugLog('🗑️ Removed existing message listener');
    } catch (e) {
      debugLog('⚠️ No existing listener to remove');
    }
    chrome.runtime.onMessage.addListener(handleMessage);
    debugLog('✅ Added new message listener');
  }

  // Send ready signal when DOM is fully loaded
  function sendReadySignal() {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      debugLog('❌ Chrome runtime not available, skipping ready signal');
      return;
    }

    try {
      const readyData = {
        type: 'CONTENT_SCRIPT_READY',
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString()
      };
      
      debugLog('📤 Sending ready signal:', readyData);
      
      chrome.runtime.sendMessage(readyData, (response) => {
        if (chrome.runtime.lastError) {
          debugLog('❌ Failed to send ready signal:', chrome.runtime.lastError.message);
        } else {
          debugLog('✅ Ready signal sent successfully:', response);
        }
      });
    } catch (error) {
      debugLog('❌ Error sending ready signal:', error);
    }
  }

  // Initialize when ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      debugLog('📄 DOM loaded, sending ready signal');
      setTimeout(sendReadySignal, 100);
    });
  } else {
    debugLog('📄 DOM already loaded, sending ready signal immediately');
    setTimeout(sendReadySignal, 100);
  }

  debugLog('🚀 Content script initialization complete');

})(); // End of IIFE
