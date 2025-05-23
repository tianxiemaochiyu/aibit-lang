// const { VARIABLE_PATTERNS } = require('./config');

/**
 * 解析器选项接口
 */
interface ParserOptions {
  content?: string;
  ext?: string;
  [key: string]: any;
}

/**
 * 解析结果类型
 */
type ParseResult = Record<string, string>;

/**
 * 基础解析器类，提供通用功能和接口
 */
class BaseParser {
  /**
   * 解析内容的主方法，子类必须实现
   * @param options 解析选项 // 假设 ParserOptions 和 ParseResult 在别处定义
   * @returns 解析结果
   */
  static parse(options: any): any {
    throw new Error('子类必须实现parse方法');
  }

  /**
   * 标准化字符串值
   * @param value 需要标准化的值
   * @returns 标准化后的值
   */
  static normalizeValue(value: string): string {
    if (!value || typeof value !== 'string') {
      return '';
    }
    
    // 使用唯一标识符作为占位符前缀，避免冲突
    const templatePrefix = `__TEMPLATE_VAR_${Date.now()}_`;
    const htmlPrefix = `__HTML_TAG_${Date.now()}_`;
    
    // 存储替换的映射
    const replacements: Record<string, string> = {};
    let counter = 0;
    
    // 第一步：保护{}内容（先于其他处理）
    let normalized = value.replace(/\{([^{}]+)\}/g, (match) => {
      const placeholder = `${templatePrefix}${counter++}`;
      replacements[placeholder] = match;
      return placeholder;
    });
    
    // 第二步：保护HTML标记
    normalized = normalized.replace(/<[^>]+>/g, (match) => {
      const placeholder = `${htmlPrefix}${counter++}`;
      replacements[placeholder] = match;
      return placeholder;
    });
    
    // 第三步：处理特殊字符和转义
    normalized = normalized
      .replace(/(?<!\\)'/g, "\\'") // 将未被转义的单引号转义
      .replace(/&apos;/g, "'")      // HTML实体：单引号
      .replace(/&quot;|\\"/g, '"') // HTML实体：双引号 或 已转义的双引号，统一为 "
      .replace(/\\n/g, '\n')       // 换行符
      .replace(/&lt;/g, '<')        // HTML实体：小于号
      .replace(/&gt;/g, '>')        // HTML实体：大于号
      .replace(/&amp;/g, '&');       // HTML实体：和号 (应最后处理以避免错误转换)
    
    // 恢复所有替换的内容
    Object.keys(replacements).forEach(placeholder => {
      // 确保占位符本身未被先前的替换更改（如果它包含特殊字符）
      // 考虑到占位符的格式，这种基本替换应该是可以的。
      normalized = normalized.replace(placeholder, replacements[placeholder]);
    });
    
    return normalized.trim();
  }

  /**
   * 扁平化对象
   * @param obj 需要扁平化的对象
   * @param prefix 前缀
   * @param result 结果对象
   * @returns 扁平化后的对象
   */
  static _flattenObject(obj: Record<string, any>, prefix: string = '', result: Record<string, string> = {}): Record<string, string> {
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) { // 检查是否为普通对象，而非数组
        this._flattenObject(value, newKey, result);
      } else {
        result[newKey] = this.normalizeValue(String(value)); // 注意数组在此处如何被字符串化
      }
    }
    return result;
  }

  /**
   * 解析自定义字符串为JSON
   * @param str 自定义格式的字符串
   * @returns JSON字符串
   */
  static parseCustomString(str: string): string {
    str = str.trim();
    const result: string[] = [];
    let i = 0; // 主索引，在各解析函数间共享

    const parseValue = (): string => {
      let value = '';
      let braceCount = 0;
      let inQuote = false;
      let quoteChar = '';

      const startIndex = i; // 用于调试或复杂的恢复逻辑

      while (i < str.length) {
        const char = str[i];
        // console.log(`parseValue char: '${char}', i: ${i}, inQuote: ${inQuote}, quoteChar: '${quoteChar}', braceCount: ${braceCount}, current_value: '${value}'`);

        // 处理引号（包括双引号、单引号和反引号）
        // 检查 str[i-1] !== '\\' 以确保它不是一个转义的引号。
        // 如果值解析可以独立地从字符串中间开始，(i === startIndex || str[i-1] !== '\\') 会更安全。
        // 考虑到当前的结构，str[i-1] 通常是没问题的。
        if ((char === '"' || char === "'" || char === '`') && (i === startIndex || str[i-1] !== '\\')) {
          if (!inQuote) {
            inQuote = true;
            quoteChar = char;
          } else if (char === quoteChar) { // 只有匹配的引号字符才会关闭它
            inQuote = false;
          }
          value += char;
          i++;
          continue;
        }

        // 仅当不在引号内时才处理结构分隔符
        if (!inQuote) {
          if (char === '{') braceCount++;
          else if (char === '}') braceCount--;
          else if (char === '[') braceCount++;
          else if (char === ']') braceCount--;
          
          if (braceCount < 0) { // 不匹配的右花括号/方括号
            // 这意味着当前值在此处结束，可能出乎意料。
            break;
          }
          if (char === ',' && braceCount === 0) { // 键值对或数组成员的分隔符
            break;
          }
        }

        value += char;
        i++;
      }

      let cleanValue = value.trim();

      if (cleanValue.startsWith('{') && cleanValue.endsWith('}')) {
        // 递归地解析对象内容。
        // 注意：静态方法中的 `this` 指向类本身。
        return BaseParser.parseCustomString(cleanValue.slice(1, -1));
      } else if (cleanValue.startsWith('[') && cleanValue.endsWith(']')) {
        // 处理数组。
        return parseArray(cleanValue);
      } else if (
        (cleanValue.startsWith('"') && cleanValue.endsWith('"')) ||
        (cleanValue.startsWith("'") && cleanValue.endsWith("'")) ||
        (cleanValue.startsWith('`') && cleanValue.endsWith('`'))
      ) {
        // 处理带引号的字符串
        let actualValue = cleanValue.slice(1, -1);
        const firstQuote = cleanValue[0];

        // 对原始字符串字面量中的字符进行反转义
        if (firstQuote === '"') {
          actualValue = actualValue.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        } else if (firstQuote === "'") {
          actualValue = actualValue.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        } else if (firstQuote === '`') { // 反引号字符串可能包含 ${} 表达式；当前解析器将其视为字面量
          actualValue = actualValue.replace(/\\`/g, '`').replace(/\\\\/g, '\\');
        }
        return JSON.stringify(actualValue);
      } else {
        // 处理未加引号的值：数字、布尔值、null 或裸字符串
        if (cleanValue === 'null') return 'null';
        if (cleanValue === 'true') return 'true';
        if (cleanValue === 'false') return 'false';
        // 检查是否为数值
        const num = Number(cleanValue);
        if (!isNaN(num) && isFinite(num) && String(num) === cleanValue) {
          return cleanValue; // 作为数字字符串返回，JSON.stringify 会处理它
        }
        // 否则，视为字符串并确保其被 JSON 转义
        return JSON.stringify(cleanValue);
      }
    };
    
    const parseArray = (arrayStr: string): string => {
      const content = arrayStr.slice(1, -1).trim();
      if (!content) return '[]';

      const items: string[] = [];
      let start = 0;
      let arr_inQuote = false; // 重命名以避免与 parseValue 的 inQuote混淆
      let arr_quoteChar = '';
      let arr_braceCount = 0; // 用于处理数组成员内部的嵌套结构

      for (let j = 0; j < content.length; j++) { // 重命名索引为 j
        const char = content[j];

        if ((char === '"' || char === "'" || char === '`') && (j === 0 || content[j - 1] !== '\\')) {
          if (!arr_inQuote) {
            arr_inQuote = true;
            arr_quoteChar = char;
          } else if (char === arr_quoteChar) {
            arr_inQuote = false;
          }
        } else if (!arr_inQuote) {
          if (char === '{' || char === '[') arr_braceCount++;
          if (char === '}' || char === ']') arr_braceCount--;
        }

        if (char === ',' && !arr_inQuote && arr_braceCount === 0) {
          const itemStr = content.slice(start, j).trim();
          // 关键：每个 itemStr 都需要作为值进行解析，而不仅仅是作为原始字符串推送。
          // 这需要为 itemStr 调用一个类似 parseValue 的函数。
          // 例如：items.push(parseValueForItem(itemStr));
          // 原始的 `items.push(item)` 对于复杂项通常是不正确的。
          // 为了更健壮的解决方案，每个项都应该被解析：
          // let temp_i = i; i = 0; let val = parseValue(itemStr_as_main_str_for_parseValue); i = temp_i; items.push(val);
          // 这是该复杂逻辑的占位符：
          const parsedItem = BaseParser.parseCustomString(`{ "temp": ${itemStr} }`); // 解析项的取巧方法
          try {
            const tempObj = JSON.parse(parsedItem);
            items.push(JSON.stringify(tempObj.temp));
          } catch (e) {
            items.push(JSON.stringify(itemStr)); // 如果取巧的解析失败，则回退
          }
          start = j + 1;
        }
      }

      const lastItemStr = content.slice(start).trim();
      if (lastItemStr) {
        // 最后一个项需要类似的解析逻辑
        const parsedItem = BaseParser.parseCustomString(`{ "temp": ${lastItemStr} }`);  // 取巧方法
         try {
            const tempObj = JSON.parse(parsedItem);
            items.push(JSON.stringify(tempObj.temp));
          } catch (e) {
            items.push(JSON.stringify(lastItemStr)); // 回退
          }
      }

      return `[${items.join(',')}]`;
    };

    while (i < str.length) {
      while (i < str.length && /\s/.test(str[i])) i++; // 跳过键值对的行首空白
      if (i >= str.length) break;

      let key = '';
      const keyStartIndex = i;
      // 更健壮的键解析（允许带引号的键包含冒号）
      let keyInQuote = false;
      let keyQuoteChar = '';
      while(i < str.length) {
        const char = str[i];
        if (!keyInQuote && (char === '"' || char === "'" || char === "`") && i === keyStartIndex) { // 键的起始引号
            keyInQuote = true;
            keyQuoteChar = char;
        } else if (keyInQuote && char === keyQuoteChar) { // 带引号键的结束
            keyInQuote = false; 
            key += char; // 添加结束引号，以便后续 slice
            i++;
            break; 
        }
        
        if (!keyInQuote && char === ':') { // 未带引号键的结束
            break; 
        }
        key += char;
        i++;
      }
      
      key = key.trim();
      if ((key.startsWith('"') && key.endsWith('"')) ||
          (key.startsWith("'") && key.endsWith("'")) ||
          (key.startsWith('`') && key.endsWith('`'))) {
        key = key.slice(1, -1); // 移除键两端的引号
      }
      
      if (i < str.length && str[i] === ':') {
         i++; // 跳过冒号
      } else {
        // 错误：键后面没有冒号，或已到字符串末尾
        if (key.trim() !== "") { // 如果解析了一个键但没有冒号
             console.error("解析错误：键 '" + key + "' 后面没有冒号。");
             // 决定如何处理：中断、赋 null 值等。
        }
        break; 
      }

      while (i < str.length && /\s/.test(str[i])) i++; // 跳过冒号后的空白

      if (i >= str.length && key.trim() !== "") { // 解析了键，但没有值（字符串末尾）
        console.error("解析错误：找到键 '" + key + "' 但在字符串末尾没有值。");
        // result.push(`"${key.replace(/"/g, '\\"')}": null`); // 选项：赋 null 值
        break;
      }

      const valueStr = parseValue();
      result.push(`"${key.replace(/"/g, '\\"')}": ${valueStr}`); // 为JSON输出转义键中的引号

      // 跳过下一个键值对的逗号和空白
      let foundNextPairComma = false;
      while (i < str.length) {
        if (/\s/.test(str[i])) { // 跳过空白
          i++;
          continue;
        }
        if (str[i] === ',') { // 遇到逗号
          i++;
          foundNextPairComma = true;
        }
        break; // 处理完逗号或遇到非空白非逗号字符后退出此循环
      }
      // 如果没有找到逗号但仍有内容，则可能是错误或有效块的结尾
      // 外层的 while (i < str.length) 将处理终止。
    }

    return `{${result.join(',')}}`;
  }
}

/**
 * Android平台解析器
 */
class AndroidParser extends BaseParser {
  static parse({ content }: { content: string }): ParseResult {
    const entries: ParseResult = {}
    const regex = /<string\s+name="(.+?)"[^>]*>([\s\S]*?)<\/string>/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null) {
      entries[match[1]] = this.normalizeValue(match[2])
    }
    return entries
  }
}

/**
 * iOS平台解析器
 */
class IOSParser extends BaseParser {
  static parse({ content }: { content: string }): ParseResult {
    const entries: ParseResult = {}
    const regex = /"((?:\\"|.)*?)"\s*=\s*"((?:\\"|.)*?)"\s*;/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null) {
      entries[this.normalizeValue(match[1])] = this.normalizeValue(match[2])
    }
    return entries
  }
}

/**
 * Web平台解析器
 */
class WebParser extends BaseParser {
  /**
   * 获取文件类型对应的正则表达式
   * @param type 文件扩展名
   * @returns 对应的正则表达式
   */
  static getRegex(type: string): RegExp | null {
    const regexMap: Record<string, RegExp> = {
      '.ts': /^export\s+default\s*({[\s\S]*})/,
      '.js': /^module\.exports\s*=\s*({[\s\S]*})/,
    }
    return regexMap[type] || null
  }

  static parse({ content, ext }: { content: string, ext: string }): ParseResult {
    const regex = this.getRegex(ext)
    if (!regex) {
      throw new Error(`不支持${ext}类型文件`)
    }

    const matchContent = content.match(regex)
    if (!matchContent) {
      console.log(content)
      console.log(regex)
      console.log(ext)
      throw new Error(`无法解析${ext}文件内容`)
    }

    const str = matchContent[1].trim().slice(1, -1)
    const result = this.parseCustomString(str)

    try {
      const rawObj = JSON.parse(result)
      return this._flattenObject(rawObj)
    } catch (error) {
      throw new Error(`解析JSON失败: ${(error as Error).message}`)
    }
  }
}

/**
 * 解析器类型
 */
type ParserType = typeof BaseParser;

/**
 * 解析器工厂，用于注册和获取解析器
 */
class ParserFactory {
  static parsers: Record<string, ParserType> = {
    android: AndroidParser,
    ios: IOSParser,
    web: WebParser
  }

  /**
   * 注册新的解析器
   * @param type 解析器类型
   * @param parser 解析器类
   */
  static register(type: string, parser: ParserType): void {
    if (!(parser.prototype instanceof BaseParser || parser === BaseParser)) {
      throw new Error('解析器必须继承自BaseParser')
    }
    this.parsers[type] = parser
  }

  /**
   * 获取解析器
   * @param type 解析器类型
   * @returns 解析器类
   */
  static getParser(type: string): ParserType {
    const parser = this.parsers[type]
    if (!parser) {
      throw new Error(`未找到类型为 ${type} 的解析器`)
    }
    return parser
  }

  /**
   * 解析内容
   * @param type 解析器类型
   * @param options 解析选项
   * @returns 解析结果
   */
  static parse(type: string, options: ParserOptions): ParseResult {
    const parser = this.getParser(type)
    return parser.parse(options)
  }
}

/**
 * 向后兼容的Parser类
 */
class Parser extends BaseParser {
  static android(options: ParserOptions): ParseResult {
    return ParserFactory.parse('android', options)
  }

  static ios(options: ParserOptions): ParseResult {
    return ParserFactory.parse('ios', options)
  }

  static web(options: ParserOptions): ParseResult {
    return ParserFactory.parse('web', options)
  }
}

export default Parser;
// 导出工厂和基类，便于扩展
export { ParserFactory, BaseParser, ParseResult, ParserOptions };
