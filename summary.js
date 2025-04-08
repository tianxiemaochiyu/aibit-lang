const fs = require('fs').promises;
const path = require('path');
const XLSX = require('xlsx');

const parsers = {
  android: (content) => {
    const entries = {};
    const regex = /<string\s+name="(.+?)"[^>]*>([\s\S]*?)<\/string>/gm;
    let match;
    while ((match = regex.exec(content)) !== null) {
      entries[match[1]] = match[2]
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/%(\d+\$)?[sdf]/g, '{var}')
        .replace(/\$[a-zA-Z0-9_]+/g, '{var}');
    }
    return entries;
  },

  ios: (content) => {
    const entries = {};
    const regex = /"((?:\\"|.)*?)"\s*=\s*"((?:\\"|.)*?)"\s*;/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const parse = str => str.replace(/\\"/g, '"')
                            .replace(/\\n/g, '\n')
                            .replace(/\{\}/g, '{var}')
                            .replace(/\{\w+\}/g, '{var}')
                            .replace(/%(\d+\$)?[@sd]/g, '{var}')
                            .replace(/<#[\w\s]+#>/g, '{var}');
      entries[parse(match[1])] = parse(match[2]);
    }
    return entries;
  }
};

async function collectFiles(basePath) {
  const result = [];
  
  const androidPath = path.join(basePath, 'android');
  try {
    const langs = await fs.readdir(androidPath);
    for (const lang of langs) {
      const xmlPath = path.join(androidPath, lang, 'strings.xml');
      try {
        await fs.access(xmlPath);
        let content = await fs.readFile(xmlPath, 'utf8');
        content = content.replace(/<!--[\s\S]*?-->/g, '');
        result.push({ 
          path: xmlPath, 
          type: 'android',
          lang: lang,
          content: content
        });
      } catch {}
    }
  } catch (err) {
    console.error('Android目录读取错误:', err);
  }

  const iosPath = path.join(basePath, 'ios');
  try {
    const langs = await fs.readdir(iosPath);
    for (const lang of langs) {
      const langPath = path.join(iosPath, lang);
      const files = await fs.readdir(langPath);
      for (const file of files) {
        if (file.endsWith('.strings')) {
          let content = await fs.readFile(path.join(langPath, file), 'utf8');
          content = content.replace(/\/\*[\s\S]*?\*\//g, '');
          content = content.replace(/\/\/.*/g, '');
          result.push({ 
            path: path.join(langPath, file), 
            type: 'ios',
            lang: lang,
            content: content
          });
        }
      }
    }
  } catch (err) {
    console.error('iOS目录读取错误:', err);
  }

  return result;
}

async function mergeLocalization(baseDir, outputPath) {
  const files = await collectFiles(baseDir);

  const langData = {};
  const allKeys = new Set();
  const keyToClientType = {};
  
  await Promise.all(files.map(async ({ path: filePath, type, lang, content }) => {
    const entries = parsers[type](content);
    
    if (!langData[lang]) {
      langData[lang] = {};
    }
    
    Object.assign(langData[lang], entries);
    
    Object.keys(entries).forEach(key => {
      allKeys.add(key);
      keyToClientType[key] = type;
    });
  }))
  const zhData = langData['zh'] || {};
  const valueToKeys = {};
  
  Object.entries(zhData).forEach(([key, value]) => {
    if (!value || value.trim() === '') return;
    
    if (!valueToKeys[value]) {
      valueToKeys[value] = {
        android: new Set(),
        ios: new Set()
      };
    }
    valueToKeys[value][keyToClientType[key]].add(key);
  });

  const keyToZhValue = {};
  Object.entries(zhData).forEach(([key, value]) => {
    if (!value || value.trim() === '') return;
    keyToZhValue[key] = value;
  });

  const languages = Object.keys(langData).sort();
  const wsData = [
    ['Android Keys', 'iOS Keys', 'Common Keys', '中文', ...languages.filter(lang => lang !== 'zh')]
  ];

  Object.entries(valueToKeys).forEach(([zhValue, { android, ios }]) => {
    const androidKeys = Array.from(android).sort();
    const iosKeys = Array.from(ios).sort();

    const commonKeys = androidKeys.filter(key => ios.has(key));
    const uniqueAndroidKeys = androidKeys.filter(key => !ios.has(key));
    const uniqueIosKeys = iosKeys.filter(key => !android.has(key));

    const row = [
      uniqueAndroidKeys.join(', '),
      uniqueIosKeys.join(', '),
      commonKeys.join(', '),
      zhValue
    ];

    languages.forEach(lang => {
      if (lang === 'zh') return;
      
      const langValues = new Set();
      [...androidKeys, ...iosKeys].forEach(key => {
        if (langData[lang][key]) {
          langValues.add(langData[lang][key]);
        }
      });
      
      row.push(Array.from(langValues).join(', ') || '');
    });

    wsData.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Translations');
  
  ws['!cols'] = [
    { wch: 30 },
    { wch: 30 },
    { wch: 30 },
    { wch: 40 },
    ...languages.filter(lang => lang !== 'zh').map(() => ({ wch: 30 }))
  ];
  
  XLSX.writeFile(wb, outputPath);
}

const baseDir = './summary/base';
const outputFile = './merged_translations.xlsx';

mergeLocalization(baseDir, outputFile)
  .then(() => console.log('合并完成，输出文件:', outputFile))
  .catch(console.error);
