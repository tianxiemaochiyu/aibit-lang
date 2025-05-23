import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { MASTER_LANGUAGE, STRICT_MATCH_LANGUAGES, LANGUAGE_NORMALIZATION, PLATFORM, OUTPUT_LANGUAGES, FileType } from './config';

// 语言数据接口
interface LangData {
  [lang: string]: {
    [key: string]: string;
  };
}

// 客户端类型映射
interface KeyToClientType {
  [key: string]: string;
}

// 分组项接口
interface GroupEntry {
  translations: {
    [lang: string]: string;
  };
  [platformKey: string]: Set<string> | Record<string, string>;
}

// 分组结果接口
interface GroupResult {
  groupedEntries: GroupEntry[];
  allLanguages: string[];
}

class ExcelGenerator {
  static generate(langData: LangData, languages: string[], keyToClientType: KeyToClientType): XLSX.WorkBook {
    const { groupedEntries, allLanguages } = this._groupEntries(langData, keyToClientType, [
      ...STRICT_MATCH_LANGUAGES,
      ...languages.filter((l) => !STRICT_MATCH_LANGUAGES.includes(l))
    ]);

    const worksheetData = this._createWorksheetData(groupedEntries, allLanguages);
    const workbook = this._createWorkbook(worksheetData, languages);

    return workbook;
  }

  static _groupEntries(langData: LangData, keyToClientType: KeyToClientType, allLanguages: string[]): GroupResult {
    // 标准化所有语言代码
    const normalizedLangData: LangData = {};
    Object.entries(langData).forEach(([lang, translations]) => {
      const normalizedLang = LANGUAGE_NORMALIZATION[lang] || lang;
      normalizedLangData[normalizedLang] = translations;
    });

    const groupedMap = new Map<string, GroupEntry>();
    const zhData = normalizedLangData[MASTER_LANGUAGE] || {};

    // 获取所有平台类型
    const platformTypes = Object.keys(PLATFORM);

    // 创建平台类型到平台名称的映射
    const typeToNames: Record<string, string[]> = {};
    Object.entries(PLATFORM).forEach(([name, config]) => {
      if (!typeToNames[config.KEY]) {
        typeToNames[config.KEY] = [];
      }
      typeToNames[config.KEY].push(name);
    });

    Object.entries(zhData).forEach(([key, zhValue]) => {
      if (!zhValue || zhValue.trim() === '') return;

      // 使用标准化后的语言检查
      const matchValues = STRICT_MATCH_LANGUAGES.map((lang) => normalizedLangData[lang]?.[key]);
      const signature = STRICT_MATCH_LANGUAGES.map(
        (lang, i) => `${lang}:${matchValues[i] || ''}`
      ).join('|');

      if (!groupedMap.has(signature)) {
        const group: GroupEntry = { translations: {} };
        
        // 为每个平台创建一个空的 Set
        platformTypes.forEach(platform => {
          const platformKeySet = `${platform.toLowerCase()}Keys`;
          group[platformKeySet] = new Set<string>();
        });

        // 初始化所有语言的翻译
        allLanguages.forEach(lang => {
          group.translations[lang] = '';
        });
        
        groupedMap.set(signature, group);
      }

      const group = groupedMap.get(signature)!;
      
      // 根据 keyToClientType 将 key 添加到对应平台的 Set 中
      const clientType = keyToClientType[key];
      if (clientType) {
        // 获取原始的平台名称（不转小写）
        const platformNames = typeToNames[clientType] || [];
        
        // 只将 key 添加到确切匹配的平台
        platformNames.forEach(platformName => {
          const platformKeySet = `${platformName.toLowerCase()}Keys`;
          if (platformKeySet in group) {
            (group[platformKeySet] as Set<string>).add(key);
          }
        });
      }

      // 保存所有语言翻译
      allLanguages.forEach((lang) => {
        const translation = normalizedLangData[lang]?.[key] || '';
        if (translation) {
          group.translations[lang] = translation;
        }
      });
    });

    return {
      groupedEntries: Array.from(groupedMap.values()),
      allLanguages
    };
  }

  static _createWorksheetData(groupedEntries: GroupEntry[], allLanguages: string[]): string[][] {
    // 获取所有平台类型并创建表头
    const platformTypes = Object.keys(PLATFORM);
    const platformHeaders = platformTypes.map(platform => `${PLATFORM[platform].KEY?.toUpperCase()}-KEY`);
    
    const header = [
      ...platformHeaders,
      ...allLanguages
    ];
    const worksheetData: string[][] = [header];

    groupedEntries.forEach((group) => {
      // 为每个平台获取排序后的 keys
      const platformKeyArrays = platformTypes.map(platform => {
        const platformKeySet = `${platform.toLowerCase()}Keys`;
        return Array.from(group[platformKeySet] as Set<string> || new Set()).sort();
      });
      
      // 找出最大行数
      const maxRows = Math.max(...platformKeyArrays.map(arr => arr.length), 0);

      for (let i = 0; i < maxRows; i++) {
        const row: string[] = [];
        
        // 添加每个平台的 key
        platformKeyArrays.forEach(keys => {
          row.push(keys[i] || '');
        });

        // 添加每种语言的翻译
        allLanguages.forEach((lang) => {
          const translation = group.translations[lang] || '';
          let text = translation;
          // 对超过32767字符的文本进行截断
          if (translation.length > 3276) {
            text = translation.substring(0, 32760) + '...';
            console.log(translation)
          }
          row.push(text);
        });

        worksheetData.push(row);
      }
    });

    return worksheetData;
  }

  static _createWorkbook(worksheetData: string[][], languages: string[]): XLSX.WorkBook {
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Translations');

    // 获取平台数量
    const platformCount = Object.keys(PLATFORM).length;

    // 设置更合理的列宽
    worksheet['!cols'] = [
      // 为每个平台设置列宽
      ...Array(platformCount).fill({ wch: 40 }),
      // 为每种语言设置列宽
      ...languages.map(() => ({ wch: 30 }))
    ];

    // 添加冻结首行功能
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2' };

    return workbook;
  }

  // 生成各平台的词条内容
  static generatePlatformFiles(langData: LangData, keyToClientType: KeyToClientType)
    : Record<string, Record<string, string>> {

    // 根据输出语言配置获取所有需要生成的语言数据
    const outputLangData = OUTPUT_LANGUAGES.reduce((acc, lang) => {
      acc[lang] = langData[lang] || {};
      return acc;
    }, {} as Record<string, Record<string, string>>);

    // 按平台分组词条
    const platformEntries: Record<string, Record<string, Record<string, string>>> = {};
    Object.keys(PLATFORM).forEach(platform => {
      platformEntries[platform] = {};
    });

    // 遍历所有输出语言，将词条分配到对应平台
    Object.entries(outputLangData).forEach(([lang, langEntries]) => {
      Object.entries(langEntries).forEach(([key, value]) => {
        const clientType = keyToClientType[key]?.toUpperCase();

        if (clientType && platformEntries[clientType]) {
          if (!platformEntries[clientType][lang]) {
            platformEntries[clientType][lang] = {};
          }
          platformEntries[clientType][lang][key] = value;
        }
      });
    });

    const result: Record<string, Record<string, string>> = {};

    // 为每个平台生成文件
    Object.entries(PLATFORM).forEach(([platformName, config]) => {
      const entries = platformEntries[platformName];
      if (!entries || Object.keys(entries).length === 0) return;
      if (!result[platformName]) {
        result[platformName] = {};
      }
      try {
        if (config.TYPE === FileType.ANDROID) {
          
          Object.entries(entries).forEach(([lang, langEntries]) => {
            // 生成Android strings.xml格式
            let xmlContent = '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n';
            Object.entries(langEntries).forEach(([key, value]) => {
              xmlContent += `  <string name="${key}">${this._escapeXml(value)}</string>\n`;
            });
            xmlContent += '</resources>';
            result[platformName][lang] = xmlContent;
          });
        } else if (config.TYPE === FileType.IOS) {
          Object.entries(entries).forEach(([lang, langEntries]) => {
            // 生成iOS .strings格式
            let stringsContent = '';
            Object.entries(langEntries).forEach(([key, value]) => {
              stringsContent += `"${key}" = "${this._escapeStrings(value)}";\n`;
            });
            result[platformName][lang] = stringsContent;
          });
        } else {
          Object.entries(entries).forEach(([lang, langEntries]) => {
            // Web平台直接输出JSON格式
            result[platformName][lang] = JSON.stringify(langEntries, null, 2);
          })
        }
      } catch (error) {
        console.error(`生成 ${platformName} 词条数据失败:`, error);
      }
    });

    return result;
  }

  private static _escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&apos;');
  }

  private static _escapeStrings(str: string): string {
    return str.replace(/"/g, '\\"')
              .replace(/\n/g, '\\n');
  }
}

export default ExcelGenerator;
