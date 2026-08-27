declare module '@univerjs/core/facade' {
  export const FUniver: any;
}

declare module '@univerjs/preset-sheets-core' {
  export const UniverSheetsCorePreset: (config?: Record<string, unknown>) => {
    plugins: unknown[];
  };
}

declare module '@univerjs/preset-sheets-core/locales/zh-CN' {
  const locale: Record<string, unknown>;
  export default locale;
}

declare module '@univerjs/preset-sheets-core/lib/index.css' {
  const css: unknown;
  export default css;
}
