// const { VARIABLE_PATTERNS } = require('./config');
const { validateJSON } = require('./test')

class Parser {
  static normalizeValue(value) {
    let normalized = value
      // 第一步：保护{}内容（先于其他处理）
      .replace(/\{([^{}]+)\}/g, (match) => `TEMPLATE_VAR_${Buffer.from(match).toString('base64')}`)
      // 第二步：保护HTML标记
      .replace(/<[^>]+>/g, (match) => `HTML_TAG_${Buffer.from(match).toString('base64')}`)
      // 第三步：处理特殊字符和转义
      .replace(/(?<!\\)'/g, "\\'")
      .replace(/&apos;/g, "'")
      .replace(/&quot;|\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')

    // 恢复处理顺序：先恢复HTML标记，再恢复模板变量
    normalized = normalized
      .replace(/HTML_TAG_([A-Za-z0-9+/=]+)/g, (_, base64) => Buffer.from(base64, 'base64').toString())
      .replace(/TEMPLATE_VAR_([A-Za-z0-9+/=]+)/g, (_, base64) => Buffer.from(base64, 'base64').toString())

    return normalized.trim()
  }

  static android({content}) {
    const entries = {}
    const regex = /<string\s+name="(.+?)"[^>]*>([\s\S]*?)<\/string>/g
    let match
    while ((match = regex.exec(content)) !== null) {
      entries[match[1]] = this.normalizeValue(match[2])
    }
    return entries
  }

  static ios({content}) {
    const entries = {}
    const regex = /"((?:\\"|.)*?)"\s*=\s*"((?:\\"|.)*?)"\s*;/g
    let match
    while ((match = regex.exec(content)) !== null) {
      entries[this.normalizeValue(match[1])] = this.normalizeValue(match[2])
    }
    return entries
  }

  static web({content, ext}) {
    // 获取文件类型正则表达式
    function getRegex(type) {
      switch(type) {
        case '.ts': return /^export\s+default\s*({[\s\S]*})/;break;
        case '.js': return /^module\.exports\s*=\s*({[\s\S]*})/;break;
      }
    }
    const regex = getRegex(ext);
    if (!regex) {
      throw new Error(`不支持${ext}类型文件`)
    }
    const matchContent = content.match(regex)

    const str = matchContent[1].trim().slice(1, -1)
    const result = this.parseCustomString(str)

    const rawObj = JSON.parse(result)
    return this._flattenObject(rawObj)

    // let objStr = '';
    // let filePath = '';
    // let objStart = 0;

    // try {
    //   // 获取调用栈信息以定位源文件
    //   const stack = new Error().stack.split('\n')
    //   if (stack.length > 2) {
    //     filePath = stack[2].match(/\((.+?):\d+:\d+\)/)?.[1] || ''
    //   }
    //   // 提取可能包含翻译对象的代码块
    //   objStart = Math.max(
    //     // 确保变量在try块外声明
    //     content.indexOf('export default'),
    //     content.indexOf('module.exports'),
    //     content.indexOf('{')
    //   )
    //   const objEnd = content.lastIndexOf('}')
    //   if (objStart === -1 || objEnd === -1) return {}

    //   objStr = content.slice(objStart, content.lastIndexOf('}') + 1)
    //     // 保护HTML标签及其属性
    //     .replace(/<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>([^<]*)<\/\1>/g, (match) => {
    //       return `HTML_TAG_${Buffer.from(match).toString('base64')}`;
    //     })
    //     // 保护自闭合HTML标签
    //     .replace(/<([a-zA-Z][a-zA-Z0-9]*)([^>]*)\/>/g, (match) => {
    //       return `HTML_TAG_${Buffer.from(match).toString('base64')}`;
    //     })
    //     // 处理key的引号问题
    //     .replace(/([{,]\s*)(['"]?)([a-zA-Z_$][\w$]*)\2\s*:/g, '$1"$3":')
    //     // 转换单引号包裹的value为双引号（恢复转义的单引号）
    //     .replace(/"([^"]+?)"\s*:\s*'([^']*?)'/g, (match, key, value) => {
    //       return `"${key}": "${value.replace(/\\'/g, "'")}"`;
    //     })
    //     // 处理双引号包裹的value（最终版转义逻辑）
    //     .replace(/"([^"]+?)"\s*:\s*"((?:\\"|[\s\S])*?)"/g, (match, key, value) => {
    //       return `"${key}": "${value
    //         .replace(/\\'/g, "'")
    //         // 改进的转义逻辑，处理连续未转义引号
    //         .replace(/(\\*)"/g, (m, slashes) =>
    //           slashes.length % 2 === 0 ? `${slashes}\\"` : m
    //         )}"`;
    //     })
    //     // 移除注释
    //     .replace(/\/\/.*?\n/g, '')
    //     .replace(/\/\*[\s\S]*?\*\//g, '')
    //     // 移除多余的逗号
    //     .replace(/,\s*([}\]])/g, '$1');

    //   // 恢复HTML标签
    //   objStr = objStr.replace(/HTML_TAG_([A-Za-z0-9+/=]+)/g, (_, base64) => {
    //     return Buffer.from(base64, 'base64').toString();
    //   });

    //   // const result = validateJSON(objStr);
    //   // if (!result.isValid) {
    //   //   console.log('JSON格式错误:');
    //   //   console.log(`错误信息: ${result.error.message}`);
    //   //   console.log(`错误位置: 第${result.error.line}行, 第${result.error.column}列`);
    //   //   console.log(`错误上下文: ...${result.error.context}...`);
    //   //   console.log(objStr)
    //   //   throw new Error('Debugger')
    //   // }

    //   // // 安全解析
    //   // const rawObj = JSON.parse(`${objStr}`)
    //   const rawObj = JSON.parse(objStr)
    //   console.log(filePath, "done!")

    //   // return this._flattenObject(rawObj)
    // } catch (e) {
    //   console.warn(`Web词条解析失败[${filePath || '未知文件'}]:`, e.message)
    //   if (objStr) {
    //     console.warn(objStr)
    //   }
    //   return {}
    // }
  }

  static _flattenObject(obj, prefix = '', result = {}) {
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

  static parseCustomString(str) {
    str = str.trim()
    const result = []
    let i = 0

    const parseValue = () => {  // 改为箭头函数以继承外部this
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
        // 处理对象时显式使用Parser类调用
        return Parser.parseCustomString(cleanValue.slice(1, -1))
      } else if (cleanValue.startsWith('[')) {
        // 处理数组
        return parseArray(cleanValue)
      } else if (cleanValue.startsWith('"') || cleanValue.startsWith('`')) {
        // 处理双引号或反引号包裹的字符串
        const finalValue = cleanValue.replaceAll(/\\"/g, '"').replaceAll(/\\'/g, "'")
        return JSON.stringify(finalValue.slice(1, -1))
      } else if (cleanValue.startsWith("'")) {
        // 处理单引号包裹的字符串
        const finalValue = cleanValue.replaceAll(/\\'/g, "'")
        return JSON.stringify(finalValue.slice(1, -1))
      } else {
        // 其他情况（未包裹的值）
        return JSON.stringify(cleanValue)
      }
    }
    
    const parseArray = (arrayStr) => {  // 改为箭头函数
      // 去除外层中括号
      const content = arrayStr.slice(1, -1).trim()
      if (!content) return '[]' // 空数组

      const items = []
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
      const value = parseValue()  // 现在通过箭头函数继承正确this
      result.push(`"${key}": ${value}`)

      // 跳过逗号和空白
      while (i < str.length && (str[i] === ',' || /\s/.test(str[i]))) i++
    }

    return `{${result.join(',')}}`
  }
}

module.exports = Parser
