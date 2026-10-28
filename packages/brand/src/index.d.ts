export declare const COLORS: Record<'midnight' | 'surface' | 'lavender' | 'lavenderSoft' | 'lavenderMist' | 'lavenderDeep' | 'mint' | 'sand' | 'slate' | 'peach', string>;
export declare function symbolSvg(opts?: { theme?: 'dark' | 'light'; id?: string; simple?: boolean }): string;
export declare function wordmarkPaths(opts?: { height?: number; x?: number; y?: number; color?: string; stroke?: number }): { width: number; svg: string };
export declare const WORDMARK_LETTERS: Record<string, { w: number; d: string }>;
export declare const WORDMARK_GAP: number;
