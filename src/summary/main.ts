import * as path from 'path';
import * as XLSX from 'xlsx';
import Parser, { ParseResult } from './parsers';
import FileCollector, { FileInfo } from './fileCollector';
import ExcelGenerator from './excelGenerator';
import { OUTPUT_FILE, FileType } from './config';


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
    }
  }));
  
  return { langData, allKeys, keyToClientType };
}

const baseDir = './summary';
mergeLocalization(baseDir)
  .catch(() => process.exit(1));