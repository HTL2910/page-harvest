chrome.action.onClicked.addListener(async tab => {
  try {
    if(!tab.id)throw new Error('Open a website tab first.');
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['extractor.js','xlsx.js','panel.js']});
  } catch(error) {
    await chrome.tabs.create({url:chrome.runtime.getURL('error.html')+'#'+encodeURIComponent(error.message)});
  }
});
