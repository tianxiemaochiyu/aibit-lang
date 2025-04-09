// 平台配置接口
export interface PlatformConfig {
  DIR: string;
  KEY: string;
  TYPE: string;  // 添加 TYPE 字段，用于标识平台类型
  FILE_PATTERN: RegExp;
  CLEAN_REGEX?: RegExp;
  CLEAN_REGES?: RegExp[];
}

// 语言标准化映射接口
interface LanguageNormalization {
  [key: string]: string;
}

export enum FileType {
  WEB = 'web',
  IOS = 'ios',
  ANDROID = 'android'
}

// 配置接口
interface Config {
  PLATFORM: {
    [key: string]: PlatformConfig;
  };
  LANGUAGE_NORMALIZATION: LanguageNormalization;
  STRICT_MATCH_LANGUAGES: string[];
  MASTER_LANGUAGE: string;
  OUTPUT_FILE: string;
}

const config: Config = {
  PLATFORM: {
    ANDROID: {
      DIR: "android",
      KEY: "android",
      TYPE: FileType.ANDROID, 
      FILE_PATTERN: /strings\.xml$/,
      CLEAN_REGEX: /<!--[\s\S]*?-->/g
    },
    IOS: {
      DIR: "ios",
      KEY: "ios",
      TYPE: FileType.IOS,
      FILE_PATTERN: /\.strings$/,
      CLEAN_REGES: [/\/\*[\s\S]*?\*\//g, /\/\/.*/g]
    },
    CO: {
      DIR: "co",
      KEY: "co",
      TYPE: FileType.WEB, 
      FILE_PATTERN: /\.(js|ts)$/,
      CLEAN_REGEX: /\/\/.*|\/\*[\s\S]*?\*\//g
    },
    UC: {
      DIR: "uc",
      KEY: "uc",
      TYPE: FileType.WEB, 
      FILE_PATTERN: /\.(js|ts)$/,
      CLEAN_REGEX: /\/\/.*|\/\*[\s\S]*?\*\//g
    },
    APP_M: {
      DIR: "app-m",
      KEY: "app-m",
      TYPE: FileType.WEB, 
      FILE_PATTERN: /\.(js|ts)$/,
      CLEAN_REGEX: /\/\/.*|\/\*[\s\S]*?\*\//g
    },
    WEB_M: {
      DIR: "web-m",
      KEY: "web-m",
      TYPE: FileType.WEB, 
      FILE_PATTERN: /\.(js|ts)$/,
      CLEAN_REGEX: /\/\/.*|\/\*[\s\S]*?\*\//g
    },
    APP_DOWNLOAD: {
      DIR: "app-download",
      KEY: "app-download",
      TYPE: FileType.WEB, 
      FILE_PATTERN: /\.(js|ts)$/,
      CLEAN_REGEX: /\/\/.*|\/\*[\s\S]*?\*\//g
    },
  },
  // VARIABLE_PATTERNS: [
  //   { regex: /%(\d+\$)?[sdf]/g, replacement: '{var}' },
  //   { regex: /\$[a-zA-Z0-9_]+/g, replacement: '{var}' },
  //   { regex: /\{\w+\}/g, replacement: '{var}' },
  //   { regex: /<#[\w\s]+#>/g, replacement: '{var}' }
  // ],
  // 语言代码标准化映射
  LANGUAGE_NORMALIZATION: {
    ko: 'kr',  // 韩语统一使用kr
    cn: 'zh',  // 中文统一使用zh
    tc: 'hk'   // 繁体中文统一使用hk
  },
  // 需要严格匹配的语言
  STRICT_MATCH_LANGUAGES: ['zh', 'en', 'fr'],
  MASTER_LANGUAGE: 'zh',
  OUTPUT_FILE: './merged_translations.xlsx'
};

export default config;
export const { PLATFORM, LANGUAGE_NORMALIZATION, STRICT_MATCH_LANGUAGES, MASTER_LANGUAGE, OUTPUT_FILE } = config;