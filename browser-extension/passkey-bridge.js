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

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.source !== PAGE_SOURCE) {
      return;
    }

    const { requestId, action, request } = event.data;
    if (!requestId || !['passkeyCreate', 'passkeyGet'].includes(action)) {
      return;
    }

    try {
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
