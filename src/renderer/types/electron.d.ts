export interface ItemsAPI {
  create: (type: string, payload: object) => Promise<any>;
  getById: (id: string) => Promise<any>;
  getByIdIncludeDeleted: (id: string) => Promise<any>;
  getByType: (type: string) => Promise<any[]>;
  update: (id: string, payload: object) => Promise<any>;
  delete: (id: string) => Promise<boolean>;
  hardDelete: (id: string) => Promise<boolean>;
  restore: (id: string) => Promise<boolean>;
  search: (query: string, type?: string) => Promise<any[]>;
  getNotesByFolder: (folderId: string | null) => Promise<any[]>;
  getPinnedNotes: () => Promise<any[]>;
  getDeleted: (type?: string) => Promise<any[]>;
  getStats: () => Promise<{ total: number; byType: Record<string, number> }>;
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  space: string;
  channels: number;
  depth: string;
  density?: number;
  hasAlpha: boolean;
  size: number;
  exif?: Record<string, any>;
  icc?: {
    name: string;
    description?: string;
  };
}

export interface ProcessResult {
  buffer: string;
  info: {
    format: string;
    width: number;
    height: number;
    size: number;
  };
}

export interface ImageAPI {
  getMetadata: (input: string) => Promise<ImageMetadata>;
  process: (input: string, options: object) => Promise<ProcessResult>;
  generatePreview: (input: string, maxSize: number) => Promise<string>;
  saveFile: (buffer: string, defaultName: string) => Promise<boolean>;
}

export interface SyncAPI {
  initialize: (config: object) => Promise<any>;
  start: () => Promise<any>;
  stop: () => Promise<any>;
  trigger: () => Promise<any>;
  getState: () => Promise<any>;
  notifyChange: () => Promise<any>;
  testConnection: (config: object) => Promise<any>;
}

export interface PDFAPI {
  getInfo: (file: string) => Promise<any>;
  merge: (options: object) => Promise<string>;
  split: (options: object) => Promise<string[]>;
  toImage: (options: object) => Promise<string[]>;
  compress: (options: object) => Promise<any>;
  addWatermark: (options: object) => Promise<string>;
  rotate: (options: object) => Promise<string>;
  reorder: (options: object) => Promise<string>;
  deletePages: (options: object) => Promise<string>;
  extractPages: (options: object) => Promise<string>;
  setSecurity: (options: object) => Promise<string>;
  removeSecurity: (file: string, password: string) => Promise<string>;
  getMetadata: (file: string) => Promise<any>;
  setMetadata: (options: object) => Promise<string>;
  imagesToPdf: (options: object) => Promise<string>;
  getFormFields: (file: string) => Promise<any[]>;
  fillForm: (file: string, values: object) => Promise<string>;
  checkGhostscript: () => Promise<any>;
  toGrayscale: (file: string) => Promise<any>;
  toPDFA: (options: object) => Promise<any>;
  repair: (file: string) => Promise<any>;
  convertVersion: (options: object) => Promise<any>;
  linearize: (file: string) => Promise<any>;
  saveFile: (buffer: string, defaultName: string) => Promise<boolean>;
}

export interface ElectronAPI {
  getAppPath: () => Promise<string>;
  getAppPaths: () => Promise<{
    installPath: string;
    exePath: string;
    userDataPath: string;
    logsPath: string;
    tempPath: string;
    appVersion: string;
    isDev: boolean;
  }>;
  openExternal: (url: string) => Promise<void>;
  setAutoLaunch: (enabled: boolean) => Promise<boolean>;
  getAutoLaunch: () => Promise<boolean>;
  saveThemeSettings: (settings: { theme: string }) => Promise<boolean>;
  minimizeToTray: () => void;
  quitApp: () => void;
  onWindowCloseRequest: (callback: () => void) => void;
  onMenuAction: (callback: (action: string) => void) => void;
  items: ItemsAPI;
  sync: SyncAPI;
  fs: {
    readFile: (path: string) => Promise<Buffer>;
    writeFile: (path: string, data: string | Buffer) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
  };
  image: ImageAPI;
  pdf: PDFAPI;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
