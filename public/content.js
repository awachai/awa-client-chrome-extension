// Content Script - ทำงานบนหน้าเว็บจริง
(function() {
  'use strict';
  
  console.log('AI Web Agent Content Script loading on:', window.location.href);
  console.log('[AUTH_LOG] Content script initializing...');

  // ป้องกันการ inject ซ้ำโดยใช้ unique identifier
  const SCRIPT_ID = 'ai-web-agent-content-script-v4';
  
  // ตรวจสอบว่า script ถูกโหลดแล้วหรือไม่
  if (window[SCRIPT_ID]) {
    console.log('Content script already loaded, skipping initialization...');
    return;
  }
  
  // ทำเครื่องหมายว่า script ถูกโหลดแล้ว
  window[SCRIPT_ID] = true;
  console.log('Initializing content script...');
  console.log('[AUTH_LOG] Content script marked as initialized');

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
      console.log('Content Script executing command:', command);
      console.log('[AUTH_LOG] Command execution initiated:', {
        action: command.action,
        timestamp: new Date().toISOString(),
        url: window.location.href
      });

      try {
        switch (command.action) {
          case 'highlight':
            return await this.highlightElement(command.selector);
          
          case 'click':
            return await this.clickElement(command.selector);
          
          case 'scroll_to':
            return await this.scrollToElement(command.selector);
          
          case 'get_dom':
            return this.getPageDOM();
          
          case 'fill_form':
            return this.fillForm(command.data);

          case 'scan_elements':
            return this.scanElements();

          case 'open_url':
            return this.openUrl(command.data?.url, command.data?.newTab);
          
          default:
            console.log('[AUTH_LOG] Unknown command action:', command.action);
            return { success: false, error: `Unknown action: ${command.action}` };
        }
      } catch (error) {
        console.error('Command execution error:', error);
        console.error('[AUTH_LOG] Command execution failed:', {
          error: error.message,
          action: command.action,
          timestamp: new Date().toISOString()
        });
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

    static openUrl(url, newTab = true) {
      try {
        if (!url) {
          return { success: false, error: 'URL is required' };
        }

        // Validate URL format
        try {
          new URL(url);
        } catch (error) {
          return { success: false, error: 'Invalid URL format' };
        }

        console.log(`[AUTH_LOG] Opening URL: ${url} (newTab: ${newTab})`);

        if (newTab) {
          // เปิดใน window ใหม่
          window.open(url, '_blank', 'noopener,noreferrer');
          return { 
            success: true, 
            action: 'open_url', 
            url,
            opened: 'new_window',
            message: `เปิด URL ในหน้าต่างใหม่: ${url}`
          };
        } else {
          // เปิดใน window ปัจจุบัน
          window.location.href = url;
          return { 
            success: true, 
            action: 'open_url', 
            url,
            opened: 'current_window',
            message: `เปิด URL ในหน้าต่างปัจจุบัน: ${url}`
          };
        }
      } catch (error) {
        return { success: false, error: `Failed to open URL: ${error.message}` };
      }
    }
  };

  // Chrome Runtime Message Listener
  function handleMessage(message, sender, sendResponse) {
    console.log('Content script received message:', message);
    console.log('[AUTH_LOG] Message received in content script:', {
      type: message.type,
      timestamp: new Date().toISOString(),
      sender: sender.tab ? `Tab ${sender.tab.id}` : 'Unknown'
    });
    
    // Handle console log messages from background script
    if (message.type === 'CONSOLE_LOG') {
      const logMessage = `[BACKGROUND → CONTENT] ${message.message}`;
      console.log('[AUTH_LOG] Console log from background:', logMessage);
      switch (message.level) {
        case 'error':
          console.error(logMessage);
          break;
        case 'warn':
          console.warn(logMessage);
          break;
        case 'info':
          console.info(logMessage);
          break;
        default:
          console.log(logMessage);
      }
      return;
    }
    
    // Handle ping/pong for checking if script is alive
    if (message.type === 'PING') {
      console.log('[AUTH_LOG] PING received, sending PONG');
      sendResponse({ pong: true });
      return;
    }
    
    if (message.type === 'DOM_COMMAND') {
      console.log('[AUTH_LOG] DOM command received:', message.command);
      window.ContentCommandHandler.executeCommand(message.command)
        .then(result => {
          console.log('Content script command result:', result);
          console.log('[AUTH_LOG] Command execution completed:', {
            success: result.success,
            action: result.action,
            timestamp: new Date().toISOString()
          });
          sendResponse(result);
        })
        .catch(error => {
          console.error('Content script command error:', error);
          console.error('[AUTH_LOG] Command execution error:', {
            error: error.message,
            timestamp: new Date().toISOString()
          });
          sendResponse({ success: false, error: error.message });
        });
      
      return true; // Async response
    }
  }

  // Remove existing listener if it exists
  if (chrome.runtime && chrome.runtime.onMessage) {
    try {
      chrome.runtime.onMessage.removeListener(handleMessage);
    } catch (e) {
      // Ignore error if listener doesn't exist
    }
    chrome.runtime.onMessage.addListener(handleMessage);
    console.log('[AUTH_LOG] Message listener added successfully');
  }

  // Send ready signal when DOM is fully loaded
  function sendReadySignal() {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      console.log('Chrome runtime not available, skipping ready signal');
      console.log('[AUTH_LOG] Chrome runtime not available for ready signal');
      return;
    }

    try {
      console.log('[AUTH_LOG] Sending ready signal to background script');
      chrome.runtime.sendMessage({
        type: 'CONTENT_SCRIPT_READY',
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString()
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Failed to send ready signal:', chrome.runtime.lastError.message);
          console.log('[AUTH_LOG] Ready signal failed:', chrome.runtime.lastError.message);
        } else {
          console.log('Content script ready signal sent successfully');
          console.log('[AUTH_LOG] Ready signal sent successfully:', response);
        }
      });
    } catch (error) {
      console.error('Error sending ready signal:', error);
      console.error('[AUTH_LOG] Error sending ready signal:', error.message);
    }
  }

  // Initialize when ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOM loaded, sending ready signal');
      console.log('[AUTH_LOG] DOM loaded, initializing ready signal');
      setTimeout(sendReadySignal, 100);
    });
  } else {
    console.log('DOM already loaded, sending ready signal immediately');
    console.log('[AUTH_LOG] DOM already loaded, sending immediate ready signal');
    setTimeout(sendReadySignal, 100);
  }

  console.log('Content script initialization complete');
  console.log('[AUTH_LOG] Content script initialization completed successfully');

})(); // End of IIFE
