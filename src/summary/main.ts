import * as path from 'path';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import Parser, { ParseResult } from './parsers';
import FileCollector, { FileInfo } from './fileCollector';
import ExcelGenerator from './excelGenerator';
import { OUTPUT_FILE, OUTPUT_LANGUAGES, MASTER_LANGUAGE, FileType, XLSX_ROW_LANG_INDEX_MAP, XLSX_FILE, PLATFORM } from './config';


// 处理结果接口
interface ProcessResult {
  langData: Record<string, Record<string, string>>;
  allKeys: Set<string>;
  keyToClientType: Record<string, string>;
}

async function mergeLocalization(baseDir: string, outputPath: string = OUTPUT_FILE): Promise<void> {
  try {
    // 1. 收集所有本地化文件
    const files: FileInfo[] = await FileCollector.collectFiles(baseDir);
    
    // 2. 解析并合并数据
    const { langData, allKeys, keyToClientType } = await processFiles(files);
    
    // 3. 生成Excel文件
    const languages: string[] = Object.keys(langData).sort();
    const workbook = ExcelGenerator.generate(langData, languages, keyToClientType);
    
    // 4. 保存文件
    XLSX.writeFile(workbook, outputPath);
    console.log('合并完成，输出文件:', path.resolve(outputPath));
  } catch (error) {
    console.error('合并过程中出错:', error);
    throw error;
  }
}

async function generateLcoalizationWithXlsx(baseDir: string): Promise<void> {
  try {
    // 1. 收集所有本地化文件
    const files: FileInfo[] = await FileCollector.collectFiles(baseDir);
    
    // 2. 解析本地词条数据
    const { langData, keyToClientType } = await processFiles(files);

    // 3. 读取传入的xlsx文件，并将其与传入的扁平化后的Object的value进行匹配
    const jsonData = matchXlsxWithObject(langData[MASTER_LANGUAGE]);

    // 4. 生成对应平台词条内容
    const result = ExcelGenerator.generatePlatformFiles(jsonData, keyToClientType);

    // 5. 写入文件
    writePlatformFiles(result);
  } catch (error) {
    console.error('生成过程中出错:', error);
    throw error;
  }
}

// 写入平台文件
function writePlatformFiles(result: Record<string, Record<string, string>>): void {
  Object.entries(result).forEach(([platform, langData]) => {
    const platformConfig = PLATFORM[platform];
    if (!platformConfig) return;

    Object.entries(langData).forEach(([lang, content]) => {
      try {
        // 解析JSON内容
        const translations = JSON.parse(content);
        
        // 创建目录结构
        const langDir = path.join('./target', platformConfig.DIR, lang);
        fs.mkdirSync(langDir, { recursive: true });

        // 按模块分组写入文件
        const moduleMap: Record<string, Record<string, string>> = {};
        Object.entries(translations).forEach(([fullKey, value]) => {
          const [module, ...rest] = fullKey.split('.');
          const key = rest.join('.');
          
          if (!moduleMap[module]) {
            moduleMap[module] = {};
          }
          moduleMap[module][key] = value as string;
        });

        // 写入每个模块文件
        Object.entries(moduleMap).forEach(([module, moduleTranslations]) => {
          const ext = platformConfig.FILE_TYPE?.toString();
          const filePath = `${path.join(langDir, module)}.${ext}`;
          
          // 处理嵌套的key
          const processedTranslations: Record<string, any> = {};
          Object.entries(moduleTranslations).forEach(([key, value]) => {
            const keys = key.split('.');
            let current = processedTranslations;
            
            // 遍历key的每一层，构建嵌套对象
            keys.slice(0, -1).forEach((k) => {
              if (!current[k]) {
                current[k] = {};
              }
              current = current[k];
            });
            // 设置最终的值
            current[keys[keys.length - 1]] = value;
          });

          let fileContent = '';
          if (ext === 'js') {
            fileContent = `module.exports = ${JSON.stringify(processedTranslations, null, 2)};`;
          } else if (ext === 'ts') {
            fileContent = `export default ${JSON.stringify(processedTranslations, null, 2)};`;
          } else {
            fileContent = JSON.stringify(processedTranslations, null, 2);
          }
          fs.writeFileSync(filePath, fileContent);
          console.log(`生成文件: ${path.resolve(filePath)}`);
        });
      } catch (error) {
        console.error(`写入 ${platform}/${lang} 翻译失败:`, error);
      }
    });
  });
}

async function processFiles(files: FileInfo[]): Promise<ProcessResult> {
  const langData: Record<string, Record<string, string>> = {};
  const allKeys: Set<string> = new Set();
  const keyToClientType: Record<string, string> = {};
  
  await Promise.all(files.map(async (file) => {
    try {
      let entries: ParseResult;

      // 根据文件类型选择对应的解析方法
      switch (file.type) {
        case FileType.WEB:
          entries = Parser.web(file);
          break;
        case FileType.IOS:
          entries = Parser.ios(file);
          break;
        case FileType.ANDROID:
          entries = Parser.android(file);
          break;
        default:
          throw new Error(`不支持的文件类型: ${file.type}`);
      }
      
      // 根据平台类型处理key前缀
      const needPrefixTypes = [FileType.WEB]; // 需要添加文件名前缀的平台类型列表，可扩展
      if (needPrefixTypes.includes(file.type) && file.ext) {
        const fileName = path.basename(file.path, file.ext);
        const prefixedEntries: ParseResult = {};
        
        // 为每个key添加文件名前缀
        Object.entries(entries).forEach(([key, value]) => {
          prefixedEntries[`${fileName}.${key}`] = value;
        });
        
        entries = prefixedEntries;
      }

      if (!langData[file.lang]) {
        langData[file.lang] = {};
      }
      Object.assign(langData[file.lang], entries);

      Object.keys(entries).forEach(key => {
        allKeys.add(key);
        // 使用project字段(如果存在)，否则回退到type
        keyToClientType[key] = file.project || file.type;
      });
    } catch (error) {
      console.warn(`[${file.path}] 解析失败:`, (error as Error).message);
      throw error;
    }
  }));
  
  return { langData, allKeys, keyToClientType };
}

// 读取传入的xlsx文件，并将其与传入的扁平化后的Object的value进行匹配，当Object中的value被xlsx匹配到时，获取xlsx中对应行的其他翻译（通过XLSX_ROW_LANG_INDEX_MAP映射的列数获取），并将其存储为新的Object的value，key为旧的Object的key
function matchXlsxWithObject(
  flattenedObject: Record<string, string>,
  targetLanguages: string[] = OUTPUT_LANGUAGES
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  
  try {
    // 从配置路径读取xlsx文件
    const workbook = XLSX.readFile(XLSX_FILE);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // 初始化结果对象，为每种目标语言创建空对象
    targetLanguages.forEach(lang => {
      result[lang] = {};
    });

    // 遍历扁平化对象
    Object.entries(flattenedObject).forEach(([key, value]) => {
      // 在Excel数据中查找匹配的行
      const matchedRow = jsonData.find((row: any[]) => 
        row.some(cell => cell?.toString().trim() === value?.toString().trim())
      );

      if (matchedRow) {
        // 为每种目标语言添加翻译
        targetLanguages.forEach(lang => {
          const colIndex = XLSX_ROW_LANG_INDEX_MAP[lang];
          if (colIndex !== undefined) {
            const translation = matchedRow[colIndex]?.toString().trim();
            if (translation) {
              result[lang][key] = translation;
            }
          }
        });
      }
    });
  } catch (error) {
    console.error('读取xlsx文件失败:', error);
    throw error;
  }

  return result;
}

const baseDir = './target';
mergeLocalization(baseDir)
  .catch(() => process.exit(1));

// generateLcoalizationWithXlsx(baseDir)
//   .catch(() => process.exit(1));