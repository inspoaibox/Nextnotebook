export interface ItemsAPI {
  create: (type: string, payload: object) => Promise<any>;
  getById: (id: string) => Promise<any>;
  getByType: (type: string) => Promise<any[]>;
  update: (id: string, payload: object) => Promise<any>;
  delete: (id: string) => Promise<boolean>;
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

export interface ElectronAPI {
  getAppPath: () => Promise<string>;
  onMenuAction: (callback: (action: string) => void) => void;
  items: ItemsAPI;
  fs: {
    readFile: (path: string) => Promise<Buffer>;
    writeFile: (path: string, data: string | Buffer) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
  };
  image: ImageAPI;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
