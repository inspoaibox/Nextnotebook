(function patchMuchengPageCredentials() {
  if (window.__muchengPasskeyPageController) {
    window.__muchengPasskeyPageController.setEnabled(true);
    return;
  }

  const PAGE_SOURCE = 'mucheng-passkey-page';
  const CONTENT_SOURCE = 'mucheng-passkey-content';
  const REQUEST_TIMEOUT_MS = 20000;
  const originalCredentials = navigator.credentials;
  let passkeyEnabled = true;
  let patchInstalled = false;

  if (
    !originalCredentials ||
    typeof originalCredentials.create !== 'function' ||
    typeof originalCredentials.get !== 'function'
  ) {
    return;
  }

  const nativeCreate = originalCredentials.create;
  const nativeGet = originalCredentials.get;
  const originalCreate = nativeCreate.bind(originalCredentials);
  const originalGet = nativeGet.bind(originalCredentials);

  function bufferToBase64Url(value) {
    if (!value) return '';
    let bytes = null;
    if (value instanceof ArrayBuffer) {
      bytes = new Uint8Array(value);
    } else if (ArrayBuffer.isView(value)) {
      bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (!bytes) return '';

    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      const chunk = bytes.subarray(offset, offset + 0x8000);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlToArrayBuffer(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function cloneAuthenticatorSelection(selection) {
    if (!selection) return undefined;
    return {
      authenticatorAttachment: selection.authenticatorAttachment,
      residentKey: selection.residentKey,
      requireResidentKey: selection.requireResidentKey,
      userVerification: selection.userVerification,
    };
  }

  function serializeCredentialDescriptor(descriptor) {
    if (!descriptor?.id) return null;
    return {
      id: bufferToBase64Url(descriptor.id),
      type: descriptor.type || 'public-key',
      transports: Array.isArray(descriptor.transports) ? descriptor.transports.slice() : undefined,
    };
  }

  function serializeCreationOptions(options) {
    const publicKey = options?.publicKey;
    if (!publicKey?.challenge || !publicKey?.rp || !publicKey?.user?.id) {
      return null;
    }

    return {
      origin: location.origin,
      url: location.href,
      title: document.title || location.hostname,
      challenge: bufferToBase64Url(publicKey.challenge),
      rp: {
        id: publicKey.rp.id || location.hostname,
        name: publicKey.rp.name || publicKey.rp.id || location.hostname,
      },
      user: {
        id: bufferToBase64Url(publicKey.user.id),
        name: publicKey.user.name || '',
        displayName: publicKey.user.displayName || publicKey.user.name || '',
      },
      pubKeyCredParams: Array.isArray(publicKey.pubKeyCredParams)
        ? publicKey.pubKeyCredParams.map(param => ({ type: param.type, alg: param.alg }))
        : [],
      excludeCredentials: Array.isArray(publicKey.excludeCredentials)
        ? publicKey.excludeCredentials.map(serializeCredentialDescriptor).filter(Boolean)
        : [],
      authenticatorSelection: cloneAuthenticatorSelection(publicKey.authenticatorSelection),
      attestation: publicKey.attestation,
      timeout: publicKey.timeout,
    };
  }

  function serializeRequestOptions(options) {
    const publicKey = options?.publicKey;
    if (!publicKey?.challenge) {
      return null;
    }

    return {
      origin: location.origin,
      url: location.href,
      title: document.title || location.hostname,
      challenge: bufferToBase64Url(publicKey.challenge),
      rpId: publicKey.rpId || location.hostname,
      allowCredentials: Array.isArray(publicKey.allowCredentials)
        ? publicKey.allowCredentials.map(serializeCredentialDescriptor).filter(Boolean)
        : [],
      userVerification: publicKey.userVerification,
      timeout: publicKey.timeout,
    };
  }

  function requestExtension(action, request) {
    return new Promise((resolve) => {
      const requestId = `mucheng-passkey-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const timeout = window.setTimeout(() => {
        window.removeEventListener('message', onMessage);
        resolve({ success: false, fallbackToNative: true, error: '通行密钥请求超时' });
      }, REQUEST_TIMEOUT_MS);

      function onMessage(event) {
        if (event.source !== window || event.data?.source !== CONTENT_SOURCE || event.data?.requestId !== requestId) {
          return;
        }

        window.clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        resolve(event.data.response || { success: false, fallbackToNative: true });
      }

      window.addEventListener('message', onMessage);
      window.postMessage({ source: PAGE_SOURCE, requestId, action, request }, '*');
    });
  }

  function attachNativePrototype(object, ctorName) {
    try {
      const ctor = window[ctorName];
      if (ctor && ctor.prototype) {
        Object.setPrototypeOf(object, ctor.prototype);
      }
    } catch {
      // Some pages lock down prototypes. The plain object still satisfies WebAuthn shape checks.
    }
    return object;
  }

  function createCredentialObject(credential) {
    const rawId = base64UrlToArrayBuffer(credential.rawId || credential.id);
    const responseData = credential.response || {};
    const clientDataJSON = base64UrlToArrayBuffer(responseData.clientDataJSON);
    const attestationObject = base64UrlToArrayBuffer(responseData.attestationObject);
    const transports = Array.isArray(responseData.transports) ? responseData.transports : ['internal'];

    const response = attachNativePrototype({
      clientDataJSON,
      attestationObject,
      getTransports: () => transports.slice(),
      getPublicKeyAlgorithm: () => responseData.publicKeyAlgorithm || -7,
      getPublicKey: () => null,
      getAuthenticatorData: () => null,
    }, 'AuthenticatorAttestationResponse');

    const credentialObject = {
      id: credential.id,
      rawId,
      type: 'public-key',
      authenticatorAttachment: credential.authenticatorAttachment || 'platform',
      response,
      getClientExtensionResults: () => credential.clientExtensionResults || {},
      toJSON: () => ({
        id: credential.id,
        rawId: credential.rawId || credential.id,
        type: 'public-key',
        authenticatorAttachment: credential.authenticatorAttachment || 'platform',
        response: {
          clientDataJSON: responseData.clientDataJSON,
          attestationObject: responseData.attestationObject,
          transports,
          publicKeyAlgorithm: responseData.publicKeyAlgorithm || -7,
        },
        clientExtensionResults: credential.clientExtensionResults || {},
      }),
    };
    return attachNativePrototype(credentialObject, 'PublicKeyCredential');
  }

  function createAssertionObject(credential) {
    const rawId = base64UrlToArrayBuffer(credential.rawId || credential.id);
    const responseData = credential.response || {};
    const userHandle = responseData.userHandle ? base64UrlToArrayBuffer(responseData.userHandle) : null;

    const response = attachNativePrototype({
      authenticatorData: base64UrlToArrayBuffer(responseData.authenticatorData),
      clientDataJSON: base64UrlToArrayBuffer(responseData.clientDataJSON),
      signature: base64UrlToArrayBuffer(responseData.signature),
      userHandle,
    }, 'AuthenticatorAssertionResponse');

    const credentialObject = {
      id: credential.id,
      rawId,
      type: 'public-key',
      authenticatorAttachment: credential.authenticatorAttachment || 'platform',
      response,
      getClientExtensionResults: () => credential.clientExtensionResults || {},
      toJSON: () => ({
        id: credential.id,
        rawId: credential.rawId || credential.id,
        type: 'public-key',
        authenticatorAttachment: credential.authenticatorAttachment || 'platform',
        response: {
          authenticatorData: responseData.authenticatorData,
          clientDataJSON: responseData.clientDataJSON,
          signature: responseData.signature,
          userHandle: responseData.userHandle,
        },
        clientExtensionResults: credential.clientExtensionResults || {},
      }),
    };
    return attachNativePrototype(credentialObject, 'PublicKeyCredential');
  }

  function createDomException(message, name) {
    try {
      return new DOMException(message, name);
    } catch {
      const error = new Error(message);
      error.name = name;
      return error;
    }
  }

  async function muchengCreateCredential(options) {
    if (!passkeyEnabled || !options?.publicKey) {
      return originalCreate(options);
    }

    const request = serializeCreationOptions(options);
    if (!request) {
      return originalCreate(options);
    }

    const result = await requestExtension('passkeyCreate', request);
    if (result?.success && result.credential) {
      return createCredentialObject(result.credential);
    }
    if (result?.fallbackToNative) {
      return originalCreate(options);
    }
    throw createDomException(result?.error || '通行密钥创建失败', 'NotAllowedError');
  }

  async function muchengGetCredential(options) {
    if (!passkeyEnabled || !options?.publicKey) {
      return originalGet(options);
    }

    const request = serializeRequestOptions(options);
    if (!request) {
      return originalGet(options);
    }

    const result = await requestExtension('passkeyGet', request);
    if (result?.success && result.credential) {
      return createAssertionObject(result.credential);
    }
    if (result?.fallbackToNative) {
      return originalGet(options);
    }
    throw createDomException(result?.error || '通行密钥验证失败', 'NotAllowedError');
  }

  function installPatch() {
    if (patchInstalled) {
      return;
    }
    navigator.credentials.create = muchengCreateCredential;
    navigator.credentials.get = muchengGetCredential;
    patchInstalled = true;
  }

  function uninstallPatch() {
    if (!patchInstalled) {
      return;
    }
    if (navigator.credentials.create === muchengCreateCredential) {
      navigator.credentials.create = nativeCreate;
    }
    if (navigator.credentials.get === muchengGetCredential) {
      navigator.credentials.get = nativeGet;
    }
    patchInstalled = false;
  }

  function setPasskeyEnabled(enabled) {
    passkeyEnabled = enabled === true;
    if (passkeyEnabled) {
      installPatch();
    } else {
      uninstallPatch();
    }
  }

  window.__muchengPasskeyPageController = {
    setEnabled: setPasskeyEnabled,
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== CONTENT_SOURCE) {
      return;
    }
    if (event.data?.action === 'passkeyConfig') {
      setPasskeyEnabled(event.data.enabled === true);
    }
  });

  setPasskeyEnabled(true);
})();
