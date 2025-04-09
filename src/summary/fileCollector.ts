import { promises as fs } from 'fs';
import * as path from 'path';
import { PLATFORM, LANGUAGE_NORMALIZATION, PlatformConfig } from './config';


// 文件信息接口
export interface FileInfo {
  path: string;
  type: string;
  lang: string;
  content: string;
  ext?: string;
  project: string; // 新增字段，表示文件所属项目
}

class FileCollector {
  static async collectFiles(basePath: string): Promise<FileInfo[]> {
    const results: FileInfo[] = [];
    // 获取 PLATFORM 对象的所有值
    const platformValues = Object.values(PLATFORM);
    // 使用动态生成的 Promise 数组进行并行处理
    await Promise.all(
      platformValues.map(platform => 
        this._processPlatform(basePath, platform, results)
      )
    );
    return results;
  }

  static async _processPlatform(basePath: string, platform: PlatformConfig, results: FileInfo[]): Promise<void> {
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
      console.warn(`[${platform.DIR.toUpperCase()}] 目录处理跳过:`, (error as Error).message);
    }
  }

  static async _processLanguageFiles(langPath: string, lang: string, platform: PlatformConfig, results: FileInfo[]): Promise<void> {
    // 标准化语言代码
    const normalizedLang = LANGUAGE_NORMALIZATION[lang] || lang;
    
    const files = platform.FILE_PATTERN 
      ? (await fs.readdir(langPath)).filter(f => platform.FILE_PATTERN!.test(f))
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

        // 检查内容是否有效
        content = content.trim();
        if (!content || content === 'module.exports = undefined;' || content === 'module.exports={};') {
          console.warn(`[${filePath}] 文件内容为空或无效，跳过处理`);
          return;
        }

        // 获取文件后缀名
        const ext = path.extname(file);

        results.push({
          path: filePath,
          type: platform.TYPE,
          lang: normalizedLang,
          content: content,
          ext: ext,
          project: platform.KEY 
        });
      } catch (error) {
        console.warn(`[${filePath}] 文件读取跳过:`, (error as Error).message);
      }
    }));
  }
}

export default FileCollector;