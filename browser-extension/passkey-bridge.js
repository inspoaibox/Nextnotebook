/**
 * Isolated-world bridge for passkey requests.
 * The page-world script cannot access chrome.runtime, so it talks to this
 * bridge with window.postMessage.
 */
(function installMuchengPasskeyBridge() {
  if (window.__muchengPasskeyBridgeInstalled) {
    return;
  }
  window.__muchengPasskeyBridgeInstalled = true;

  const PAGE_SOURCE = 'mucheng-passkey-page';
  const CONTENT_SOURCE = 'mucheng-passkey-content';
  const PASSKEY_ENABLED_STORAGE_KEY = 'muchengPasskeyEnabled';

  function readPasskeyEnabled() {
    return new Promise((resolve) => {
      chrome.storage.local.get([PASSKEY_ENABLED_STORAGE_KEY], (result) => {
        resolve(result[PASSKEY_ENABLED_STORAGE_KEY] === true);
      });
    });
  }

  function postPasskeyConfig(enabled) {
    window.postMessage({
      source: CONTENT_SOURCE,
      action: 'passkeyConfig',
      enabled: enabled === true,
    }, '*');
  }

  readPasskeyEnabled().then(postPasskeyConfig);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[PASSKEY_ENABLED_STORAGE_KEY]) {
      return;
    }
    postPasskeyConfig(changes[PASSKEY_ENABLED_STORAGE_KEY].newValue === true);
  });

  chrome.runtime.onMessage.addListener((request) => {
    if (request?.action === 'passkeyConfigChanged') {
      postPasskeyConfig(request.enabled === true);
    }
  });

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.source !== PAGE_SOURCE) {
      return;
    }

    const { requestId, action, request } = event.data;
    if (!requestId || !['passkeyCreate', 'passkeyGet'].includes(action)) {
      return;
    }

    try {
      const enabled = await readPasskeyEnabled();
      if (!enabled) {
        window.postMessage({
          source: CONTENT_SOURCE,
          requestId,
          response: {
            success: false,
            fallbackToNative: true,
            error: '暮城笔记通行密钥功能已关闭',
          },
        }, '*');
        return;
      }

      const response = await chrome.runtime.sendMessage({ action, request });
      window.postMessage({ source: CONTENT_SOURCE, requestId, response }, '*');
    } catch (error) {
      window.postMessage({
        source: CONTENT_SOURCE,
        requestId,
        response: {
          success: false,
          fallbackToNative: true,
          error: error?.message || '通行密钥请求失败',
        },
      }, '*');
    }
  });
})();
