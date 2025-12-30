declare module 'simple-mind-map' {
  export default class MindMap {
    constructor(options: any);
    static usePlugin(plugin: any): void;
    on(event: string, callback: (...args: any[]) => void): void;
    off(event: string, callback?: (...args: any[]) => void): void;
    getData(withConfig?: boolean): any;
    setData(data: any): void;
    execCommand(command: string, ...args: any[]): void;
    export(type: string, isDownload?: boolean, fileName?: string, callback?: (data: string) => void): void;
    view: {
      enlarge(): void;
      narrow(): void;
      fit(): void;
    };
    destroy(): void;
  }
}

declare module 'simple-mind-map/src/plugins/Export.js' {
  const Export: any;
  export default Export;
}

declare module 'simple-mind-map/src/plugins/RichText.js' {
  const RichText: any;
  export default RichText;
}

declare module 'simple-mind-map/src/plugins/Drag.js' {
  const Drag: any;
  export default Drag;
}

declare module 'simple-mind-map/src/plugins/Select.js' {
  const Select: any;
  export default Select;
}

declare module 'simple-mind-map/src/plugins/AssociativeLine.js' {
  const AssociativeLine: any;
  export default AssociativeLine;
}

declare module 'simple-mind-map/src/plugins/TouchEvent.js' {
  const TouchEvent: any;
  export default TouchEvent;
}

declare module 'simple-mind-map/src/plugins/NodeImgAdjust.js' {
  const NodeImgAdjust: any;
  export default NodeImgAdjust;
}

declare module 'simple-mind-map/src/plugins/KeyboardNavigation.js' {
  const KeyboardNavigation: any;
  export default KeyboardNavigation;
}
