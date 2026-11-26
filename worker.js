(() => {
  const RESTRICTED_SCHEME_RE = /^(?:chrome|edge|about|devtools|view-source|chrome-extension|extension|chrome-search|brave|vivaldi|opera):/i;
  const WEBSTORE_RE = /^https?:\/\/(?:chrome\.google\.com\/webstore|chromewebstore\.google\.com|microsoftedge\.microsoft\.com\/addons)(?:\/|$)/i;

  function errorMessage(error) {
    if (error && typeof error.message === 'string' && error.message.trim()) {
      return error.message.trim();
    }
    const text = String(error ?? '').trim();
    return text || 'Unable to access this page.';
  }

  async function restrictedReason(url) {
    if (!url || typeof url !== 'string') return '';
    if (RESTRICTED_SCHEME_RE.test(url)) {
      return 'Browser settings, internal, and extension pages cannot be extracted. Open a normal website tab first.';
    }
    if (WEBSTORE_RE.test(url)) {
      return 'Browser extension store pages cannot be extracted. Open a normal website tab first.';
    }
    if (/^file:/i.test(url) && typeof chrome !== 'undefined' && chrome.extension?.isAllowedFileSchemeAccess) {
      const allowed = await new Promise(resolve => {
        try {
          chrome.extension.isAllowedFileSchemeAccess(ok => resolve(Boolean(ok)));
        } catch {
          resolve(true);
        }
      });
      if (!allowed) {
        return 'Local HTML files require "Allow access to file URLs" to be enabled in the extension’s Details page.';
      }
    }
    return '';
  }

  async function openErrorPage(message) {
    const base = chrome.runtime.getURL('error.html');
    const url = base + '#' + encodeURIComponent(errorMessage(message));
    try {
      if (chrome.tabs?.query) {
        const existing = await chrome.tabs.query({ url: base + '*' });
        if (existing && existing.length && existing[0].id != null) {
          await chrome.tabs.update(existing[0].id, { url, active: true });
          if (existing[0].windowId != null && chrome.windows?.update) {
            await chrome.windows.update(existing[0].windowId, { focused: true }).catch(() => {});
          }
          return;
        }
      }
    } catch {}
    try {
      await chrome.tabs.create({ url });
    } catch {}
  }

  async function handleActionClick(tab) {
    try {
      if (!tab?.id) throw new Error('Open a website tab first.');
      const blocked = await restrictedReason(tab.url);
      if (blocked) throw new Error(blocked);
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['extractor.js', 'xlsx.js', 'panel.js']
      });
    } catch (error) {
      await openErrorPage(error);
    }
  }

  if (typeof chrome !== 'undefined' && chrome.action?.onClicked?.addListener) {
    chrome.action.onClicked.addListener(handleActionClick);
  }

  globalThis.HarvestWorker = { errorMessage, restrictedReason, openErrorPage, handleActionClick };
})();
