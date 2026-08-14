// Injects the bundled editor into the active tab when the toolbar icon is clicked.
// A second click tells the running instance to tear itself down.

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['inspect.js'],
    });
  } catch (e) {
    console.error('InspectCSS injection failed:', e);
  }
});
