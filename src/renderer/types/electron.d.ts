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

export interface ElectronAPI {
  getAppPath: () => Promise<string>;
  onMenuAction: (callback: (action: string) => void) => void;
  items: ItemsAPI;
  fs: {
    readFile: (path: string) => Promise<Buffer>;
    writeFile: (path: string, data: string | Buffer) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
