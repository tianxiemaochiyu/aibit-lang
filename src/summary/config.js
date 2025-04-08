module.exports = {
  PLATFORM: {
    ANDROID: {
      DIR: 'android',
      FILE_PATTERN: /strings\.xml$/,
      CLEAN_REGEX: /<!--[\s\S]*?-->/g
    },
    IOS: {
      DIR: 'ios',
      FILE_PATTERN: /\.strings$/,
      CLEAN_REGES: [/\/\*[\s\S]*?\*\//g, /\/\/.*/g]
    },
    WEB: {
      DIR: 'web',
      FILE_PATTERN: /\.(js|ts)$/,
      CLEAN_REGEX: /\/\/.*|\/\*[\s\S]*?\*\//g
    }
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
    cn: 'zh'   // 中文统一使用zh
  },
  // 需要严格匹配的语言
  STRICT_MATCH_LANGUAGES: ['zh', 'en', 'fr'],
  MASTER_LANGUAGE: 'zh',
  OUTPUT_FILE: './merged_translations.xlsx'
};