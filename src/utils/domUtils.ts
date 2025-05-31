
export interface ElementInfo {
  selector: string;
  element: Element;
  tagName: string;
  id?: string;
  className?: string;
  textContent?: string;
}

export class DOMUtils {
  // รอให้ element ปรากฏ
  static async waitForElement(selector: string, timeout = 5000): Promise<Element | null> {
    return new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
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

  // หา element ด้วยหลายวิธี
  static findElement(selector: string): Element | null {
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

    return null;
  }

  // หา element ที่คล้ายกัน
  static findSimilarElements(selector: string): ElementInfo[] {
    const allElements = document.querySelectorAll('*');
    const similar: ElementInfo[] = [];
    
    const searchTerm = selector.replace(/[#.]/g, '').toLowerCase();
    
    allElements.forEach(el => {
      const id = el.id?.toLowerCase();
      const className = el.className?.toString().toLowerCase();
      const textContent = el.textContent?.toLowerCase().trim();
      
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
          className: el.className?.toString(),
          textContent: el.textContent?.substring(0, 50)
        });
      }
    });
    
    return similar.slice(0, 10); // จำกัดผลลัพธ์
  }

  // สร้าง CSS selector สำหรับ element
  static generateSelector(element: Element): string {
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

  // ตรวจสอบว่า element สามารถ interact ได้หรือไม่
  static isInteractable(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;
    const isClickable = element.matches('button, input, select, textarea, a, [onclick], [role="button"]');
    const style = window.getComputedStyle(element);
    const isNotHidden = style.display !== 'none' && style.visibility !== 'hidden';
    
    return isVisible && isNotHidden && (isClickable || element.hasAttribute('onclick'));
  }

  // สแกนหา interactive elements ในหน้า
  static scanInteractiveElements(): ElementInfo[] {
    const interactive = document.querySelectorAll('button, input, select, textarea, a, [onclick], [role="button"]');
    
    return Array.from(interactive)
      .filter(el => this.isInteractable(el))
      .map(el => ({
        selector: this.generateSelector(el),
        element: el,
        tagName: el.tagName.toLowerCase(),
        id: el.id,
        className: el.className?.toString(),
        textContent: el.textContent?.substring(0, 50)
      }));
  }
}
