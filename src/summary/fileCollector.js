const fs = require('fs').promises;
const path = require('path');
const { PLATFORM, LANGUAGE_NORMALIZATION } = require('./config');

class FileCollector {
  static async collectFiles(basePath) {
    const results = [];
    await Promise.all([
      this._processPlatform(basePath, PLATFORM.ANDROID, results),
      this._processPlatform(basePath, PLATFORM.IOS, results),
      this._processPlatform(basePath, PLATFORM.WEB, results)  // 新增Web平台处理
    ]);
    return results;
  }

  static async _processPlatform(basePath, platform, results) {
    try {
      const platformPath = path.join(basePath, platform.DIR);
      const langs = await fs.readdir(platformPath);
      
      await Promise.all(langs.map(async (lang) => {
        const langPath = path.join(platformPath, lang);
        const stat = await fs.stat(langPath);
        
        if (stat.isDirectory()) {
          await this._processLanguageFiles(langPath, lang, platform, results);
        }
      }));
    } catch (error) {
      console.warn(`[${platform.DIR.toUpperCase()}] 目录处理跳过:`, error.message);
    }
  }

  static async _processLanguageFiles(langPath, lang, platform, results) {
    // 标准化语言代码
    const normalizedLang = LANGUAGE_NORMALIZATION[lang] || lang;
    
    const files = platform.FILE_PATTERN 
      ? (await fs.readdir(langPath)).filter(f => platform.FILE_PATTERN.test(f))
      : await fs.readdir(langPath);

    await Promise.all(files.map(async (file) => {
      const filePath = path.join(langPath, file);
      try {
        let content = await fs.readFile(filePath, 'utf8');
        
        // 清理注释内容
        if (Array.isArray(platform.CLEAN_REGES)) {
          platform.CLEAN_REGES.forEach(regex => {
            content = content.replace(regex, '');
          });
        } else if (platform.CLEAN_REGEX) {
          content = content.replace(platform.CLEAN_REGEX, '');
        }

        // 获取文件后缀名
        const ext = path.extname(file);

        results.push({
          path: filePath,
          type: platform.DIR,
          lang: normalizedLang,  // 使用标准化后的语言代码
          content: content,
          ext: ext  // 添加文件后缀属性
        });
      } catch (error) {
        console.warn(`[${filePath}] 文件读取跳过:`, error.message);
      }
    }));
  }
}

module.exports = FileCollector;