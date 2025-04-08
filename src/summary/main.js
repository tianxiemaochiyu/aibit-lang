const path = require('path');
const XLSX = require('xlsx');
const Parser = require('./parsers.js');
const FileCollector = require('./fileCollector');
const ExcelGenerator = require('./excelGenerator');
const { OUTPUT_FILE } = require('./config');

async function mergeLocalization(baseDir, outputPath = OUTPUT_FILE) {
  try {
    // 1. 收集所有本地化文件
    const files = await FileCollector.collectFiles(baseDir);
    
    // 2. 解析并合并数据
    const { langData, allKeys, keyToClientType } = await processFiles(files);
    
    // 3. 生成Excel文件
    const languages = Object.keys(langData).sort();
    const workbook = ExcelGenerator.generate(langData, languages, keyToClientType);
    
    // 4. 保存文件
    XLSX.writeFile(workbook, outputPath);
    console.log('合并完成，输出文件:', path.resolve(outputPath));
  } catch (error) {
    console.error('合并过程中出错:', error);
    throw error;
  }
}

// 确保processFiles函数能正确处理web类型
async function processFiles(files) {
  const langData = {};
  const allKeys = new Set();
  const keyToClientType = {};
  
  await Promise.all(files.map(async (file) => {
    try {
      const entries = Parser[file.type === 'web' ? 'web' : file.type](file);
      
      if (!langData[file.lang]) {
        langData[file.lang] = {};
      }
      
      Object.assign(langData[file.lang], entries);
      
      Object.keys(entries).forEach(key => {
        allKeys.add(key);
        keyToClientType[key] = file.type;
      });
    } catch (error) {
      console.warn(`[${file.path}] 解析失败:`, error.message);
    }
  }));
  
  return { langData, allKeys, keyToClientType };
}


const baseDir = './summary/base';
mergeLocalization(baseDir)
  .catch(() => process.exit(1));