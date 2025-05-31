
// Background Script - จัดการการสื่อสาร (Refactored)
console.log('AI Web Agent Background Script loading...');

// Import all modules
importScripts(
  'modules/tabManager.js',
  'modules/commandExecutor.js', 
  'modules/messageHandler.js',
  'modules/eventListeners.js'
);

console.log('All modules imported successfully');

// Initialize all components
const tabManager = window.tabManager;
const commandExecutor = window.createCommandExecutor(tabManager);
const messageHandler = window.createMessageHandler(tabManager, commandExecutor);
const eventListeners = window.createEventListeners(tabManager);

// Setup Chrome runtime message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  return messageHandler.handleMessage(message, sender, sendResponse);
});

// Setup all Chrome extension event listeners
eventListeners.setupEventListeners();

console.log('[BACKGROUND] Background script initialization complete');
