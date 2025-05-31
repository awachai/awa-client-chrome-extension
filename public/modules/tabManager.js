
// Tab Manager - จัดการสถานะของ tabs
console.log('Tab Manager module loaded');

class TabManager {
  constructor() {
    // เก็บข้อมูล tabs ที่มี content script พร้อมใช้งาน
    this.readyTabs = new Map();
    // เก็บ tab ID ที่มี side panel เปิดอยู่
    this.sidePanelTabId = null;
  }

  // เพิ่ม tab ที่พร้อมใช้งาน
  addReadyTab(tabId, info) {
    this.readyTabs.set(tabId, {
      ready: true,
      url: info.url,
      title: info.title,
      timestamp: info.timestamp,
      windowId: info.windowId
    });
    console.log(`[TAB_MANAGER] Content script ready on tab ${tabId} (window ${info.windowId}): ${info.url}`);
  }

  // ตั้งค่า side panel tab
  setSidePanelTab(tabId, windowId) {
    this.sidePanelTabId = tabId;
    console.log(`[TAB_MANAGER] Side panel opened on tab ${tabId} (window ${windowId})`);
  }

  // ลบ tab ออกจากรายการ
  removeTab(tabId) {
    console.log(`[TAB_MANAGER] Tab ${tabId} removed`);
    this.readyTabs.delete(tabId);
    
    // Clear side panel tab ID if it's the one being removed
    if (this.sidePanelTabId === tabId) {
      console.log(`[TAB_MANAGER] Side panel tab ${tabId} removed, clearing sidePanelTabId`);
      this.sidePanelTabId = null;
    }
  }

  // อัพเดต tab เมื่อมีการเปลี่ยนแปลง
  updateTab(tabId, tab) {
    if (tab.url && !tab.url.startsWith('chrome://')) {
      console.log(`[TAB_MANAGER] Tab ${tabId} (window ${tab.windowId}) updated: ${tab.url}`);
      
      // Clear ready state since page reloaded
      this.readyTabs.delete(tabId);
      
      console.log(`[TAB_MANAGER] Tab ${tabId} marked for content script injection when needed`);
    }
  }

  // รีเซ็ตสถานะทั้งหมด
  reset() {
    console.log('[TAB_MANAGER] Resetting all tab states');
    this.readyTabs.clear();
    this.sidePanelTabId = null;
  }

  // ตรวจสอบว่า tab พร้อมใช้งานหรือไม่
  isTabReady(tabId) {
    const tabInfo = this.readyTabs.get(tabId);
    return tabInfo && tabInfo.ready;
  }

  // ดึงข้อมูล tab ที่พร้อมใช้งาน
  getReadyTabInfo(tabId) {
    return this.readyTabs.get(tabId);
  }

  // ดึงรายการ tab ID ที่พร้อมใช้งานทั้งหมด
  getReadyTabIds() {
    return Array.from(this.readyTabs.keys());
  }

  // ดึง side panel tab ID
  getSidePanelTabId() {
    return this.sidePanelTabId;
  }

  // ล้าง side panel tab ID
  clearSidePanelTab() {
    this.sidePanelTabId = null;
  }
}

// Export singleton instance
window.tabManager = new TabManager();
