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
   * @param options 解析选项
   * @returns 解析结果
   */
  static parse(options: ParserOptions): ParseResult {
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
      .replace(/(?<!\\)'/g, "\\'")
      .replace(/&apos;/g, "'")
      .replace(/&quot;|\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    
    // 恢复所有替换的内容
    Object.keys(replacements).forEach(placeholder => {
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
      const newKey = prefix ? `${prefix}.${key}` : key
      if (typeof value === 'object' && value !== null) {
        this._flattenObject(value, newKey, result)
      } else {
        result[newKey] = this.normalizeValue(String(value))
      }
    }
    return result
  }

  /**
   * 解析自定义字符串为JSON
   * @param str 自定义格式的字符串
   * @returns JSON字符串
   */
  static parseCustomString(str: string): string {
    str = str.trim()
    const result: string[] = []
    let i = 0

    const parseValue = (): string => {
      let value = ''
      let braceCount = 0
      let inQuote = false
      let quoteChar = ''

      while (i < str.length) {
        const char = str[i]

        // 处理引号（包括双引号、单引号和反引号）
        if ((char === '"' || char === "'" || char === '`') && str[i - 1] !== '\\') {
          if (!inQuote) {
            inQuote = true
            quoteChar = char
          } else if (char === quoteChar) {
            inQuote = false
          }
          value += char
          i++
          continue
        }

        // 处理花括号
        if (!inQuote) {
          if (char === '{') braceCount++
          if (char === '}') braceCount--
          if (char === '[') braceCount++ // 处理数组开始
          if (char === ']') braceCount-- // 处理数组结束
          if (braceCount < 0) break
          if (char === ',' && braceCount === 0) break
        }

        value += char
        i++
      }

      // 处理不同类型的值
      let cleanValue = value.trim()
      if (cleanValue.startsWith('{')) {
        // 处理对象时显式使用当前类调用
        return this.parseCustomString(cleanValue.slice(1, -1))
      } else if (cleanValue.startsWith('[')) {
        // 处理数组
        return parseArray(cleanValue)
      } else if (cleanValue.startsWith('"') || cleanValue.startsWith('`')) {
        // 处理双引号或反引号包裹的字符串
        const finalValue = cleanValue.replace(/\\"/g, '"').replace(/\\'/g, "'")
        return JSON.stringify(finalValue.slice(1, -1))
      } else if (cleanValue.startsWith("'")) {
        // 处理单引号包裹的字符串
        const finalValue = cleanValue.replace(/\\'/g, "'")
        return JSON.stringify(finalValue.slice(1, -1))
      } else {
        // 其他情况（未包裹的值）
        return JSON.stringify(cleanValue)
      }
    }
    
    const parseArray = (arrayStr: string): string => {
      // 去除外层中括号
      const content = arrayStr.slice(1, -1).trim()
      if (!content) return '[]' // 空数组

      const items: string[] = []
      let start = 0
      let inQuote = false
      let quoteChar = ''

      for (let i = 0; i < content.length; i++) {
        const char = content[i]

        // 处理引号
        if ((char === '"' || char === "'" || char === '`') && content[i - 1] !== '\\') {
          if (!inQuote) {
            inQuote = true
            quoteChar = char
          } else if (char === quoteChar) {
            inQuote = false
          }
        }

        // 处理逗号分隔
        if (char === ',' && !inQuote) {
          const item = content.slice(start, i).trim()
          items.push(item) // 每一项作为字符串处理
          start = i + 1
        }
      }

      // 添加最后一个元素
      if (start < content.length) {
        const item = content.slice(start).trim()
        items.push(item)
      }

      return `[${items.join(',')}]`
    }

    while (i < str.length) {
      // 跳过空白
      while (i < str.length && /\s/.test(str[i])) i++
      if (i >= str.length) break

      // 解析键
      let key = ''
      while (i < str.length && str[i] !== ':') {
        key += str[i++]
      }

      // 清理键名
      key = key.trim().replace(/^["'`]|["'`]$/g, '')
      i++ // 跳过冒号

      // 跳过冒号后的空白
      while (i < str.length && /\s/.test(str[i])) i++

      // 解析值
      const value = parseValue()
      result.push(`"${key}": ${value}`)

      // 跳过逗号和空白
      while (i < str.length && (str[i] === ',' || /\s/.test(str[i]))) i++
    }

    return `{${result.join(',')}}`
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
