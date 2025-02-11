const fs = require('fs')
const XLSX = require('xlsx')
const merge = require('lodash.merge')
const path = require('path')


function parseCustomString(str) {
  str = str.trim();
  const result = [];
  let i = 0;

  function parseValue() {
    let value = '';
    let braceCount = 0;
    let inQuote = false;
    let quoteChar = '';

    while (i < str.length) {
      const char = str[i];

      // 处理引号（包括双引号、单引号和反引号）
      if ((char === '"' || char === "'" || char === '`') && str[i - 1] !== '\\') {
        if (!inQuote) {
          inQuote = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuote = false;
        }
        value += char;
        i++;
        continue;
      }

      // 处理花括号
      if (!inQuote) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (char === '[') braceCount++; // 处理数组开始
        if (char === ']') braceCount--; // 处理数组结束
        if (braceCount < 0) break;
        if (char === ',' && braceCount === 0) break;
      }

      value += char;
      i++;
    }

    // 处理不同类型的值
    let cleanValue = value.trim();
    if (cleanValue.startsWith('{')) {
      // 处理对象
      return parseCustomString(cleanValue.slice(1, -1));
    } else if (cleanValue.startsWith('[')) {
      // 处理数组
      return parseArray(cleanValue);
    } else if (cleanValue.startsWith('"') || cleanValue.startsWith('`')) {
      // 处理双引号或反引号包裹的字符串
      const finalValue = cleanValue.replaceAll(/\\"/g, '"').replaceAll(/\\'/g, "'");
      return JSON.stringify(finalValue.slice(1, -1));
    } else if (cleanValue.startsWith("'")) {
      // 处理单引号包裹的字符串
      const finalValue = cleanValue.replaceAll(/\\'/g, "'");
      return JSON.stringify(finalValue.slice(1, -1));
    } else {
      // 其他情况（未包裹的值）
      return JSON.stringify(cleanValue);
    }
  }
  

  function parseArray(arrayStr) {
    // 去除外层中括号
    const content = arrayStr.slice(1, -1).trim();
    if (!content) return '[]'; // 空数组

    const items = [];
    let start = 0;
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      // 处理引号
      if ((char === '"' || char === "'" || char === '`') && content[i - 1] !== '\\') {
        if (!inQuote) {
          inQuote = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuote = false;
        }
      }

      // 处理逗号分隔
      if (char === ',' && !inQuote) {
        const item = content.slice(start, i).trim();
        items.push(item); // 每一项作为字符串处理
        start = i + 1;
      }
    }

    // 添加最后一个元素
    if (start < content.length) {
      const item = content.slice(start).trim();
      items.push(item);
    }

    return `[${items.join(',')}]`;
  }

  while (i < str.length) {
    // 跳过空白
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i >= str.length) break;

    // 解析键
    let key = '';
    while (i < str.length && str[i] !== ':') {
      key += str[i++];
    }

    // 清理键名
    key = key.trim().replace(/^["'`]|["'`]$/g, '');
    i++; // 跳过冒号

    // 跳过冒号后的空白
    while (i < str.length && /\s/.test(str[i])) i++;

    // 解析值
    const value = parseValue();
    result.push(`"${key}": ${value}`);

    // 跳过逗号和空白
    while (i < str.length && (str[i] === ',' || /\s/.test(str[i]))) i++;
  }

  return `{${result.join(',')}}`;
}

function parseBraced(content) {
  const str = content.trim().slice(1, -1);
  const inner = parseCustomString(str);
  return inner
}

// 获取配置文件
function getConfigInfo() {
  let config = {}

  const configPath = path.join(process.cwd(), 'aibit-lang.config.js')
  if (fs.existsSync(configPath)) {
    config = require(configPath)
  } else {
    throw new Error('配置文件不存在：', configPath)
  }

  if (!config.appName || !config.outDir || !config.xlsxPath) {
    throw new Error('配置文件参数不全')
  }

  return (config = {
    lang: ['cn', 'en'],
    findMissingKey: false,
    findMissingTerm: false,
    singleFile: '',
    singleKeys: [],
    ...config
  })
}

const config = getConfigInfo()

const targetLang = config.completeLang
const targetBaseLang = config.completeBaseLang

const findMissingKey = config.findMissingKey
const findMissingTerm = config.findMissingTerm

const fileType = config.fileType || ".ts"

const sourceLang = targetBaseLang

const langPath = path.join(process.cwd(), config.outDir)
const xlsxPath = path.join(process.cwd(), config.xlsxPath)

const langKeyList = config.lang
const appKey = config.appName

// xlsx 中对应的语言名称索引
const XLSX_ROW_LANG_INDEX_MAP = {
  zh: 11,
  cn: 11, // old version
  en: 12,
  hk: 13,
  tc: 13,
  kr: 14,
  ru: 15,
  es: 16,
  pt: 17,
  fa: 18,
  jp: 19,
  ja: 19,
  tr: 20
}

// xlsx 中对应的应用端名称索引
const XLSX_ROW_APP_INDEX_MAP = {
  WEBUC: 6,
  WEBCO: 7,
  H5WAP: 8,
  H5APP: 9
}

// xlsx 中对应字段索引
const XLSX_ROW_PROP_INDEX_MAP = {
  id: 0,
  issue: 1,
  isHas: 2
}

function runGetDirName() {
  try {
    const files = fs.readdirSync(`${langPath}/${sourceLang}`)
    return files
  } catch (err) {
    if (err) {
      throw new Error('补全基准目录不存在: ' + `${langPath}/${sourceLang}:` + err)
    }
  }
}

// 写入指定内容到文件
function writeContentForPath(filePath, content) {
  fs.mkdir(path.dirname(filePath), { recursive: true }, (err) => {
    if (err) {
      console.error('目录创建失败:', err)
      return
    }
    fs.writeFile(filePath, content, (err) => {
      if (err) {
        console.error('写入失败:', err)
        return
      }
      console.log(filePath + '，写入成功！')
    })
  })
}

// 序列化JSON
function flattenObject(obj, prefix = '') {
  let result = {}

  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = prefix ? `${prefix}.${key}` : key
      if (Object.prototype.toString.call(obj[key]) === '[object Array]' && obj[key] !== null) {
        let ArrayValue = {};
        obj[key].map((v, i) => {
          ArrayValue[`${newKey}.${i}`] = v;
        })
        Object.assign(result, ArrayValue)
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        Object.assign(result, flattenObject(obj[key], newKey))
      } else {
        result[newKey] = obj[key]
      }
    }
  }
  return result
}

// 是否为嵌套结构
// function formatNestedContent(str){
//   const nestedLineRegex = new RegExp(
//     "(?:(?:'[^']+')|(?:[a-zA-Z_]\\w*))\\s*:\\s*({(?:[^{}]|{[^{}]*})*},)",
//   )
//   if (nestedLineRegex.test(str)) {
//     const subMatch = str.match(nestedLineRegex);
//     const subResult = subMatch[1].replaceAll(/}\s*,\s*$/g, '}');
//     return getKeyValueContent(subResult)
//   } else {
//     return str
//   }
// }

// 捕获 key - value 键值对，转义特殊字符 \' \"
function replaceContent(str) {
  const regexTrim = str.replace(/\t|\n|\v|\r|\f/g,'')
  // const extractPattern = /'(?:[^']+)'|(?:[a-zA-Z_]\w*)\s*:\s*(?:{\s*.*})\s*,\s*/g
  const extractPattern = /(?:(?:'[^']+')|(?:\"[^\"]+\")|(?:[a-zA-Z_0-9]\w*))\s*:\s*\{[^\{]*\}\s*/g
  const match1 = regexTrim.match(extractPattern)
  // console.log(regexTrim, "--原始替换字符-")
  // console.log(match1, "--检测是否多个item-")

  if (match1) {
    return match1.map(v => {
      // console.log(v, "--嵌套替换字符-")
      const itemMatch = v.match(/((?:'[^']+')|(?:\"[^\"]+\")|(?:[a-zA-Z_0-9]\w*))\s*:\s*(\{[^\{]*\})/)
      if (itemMatch && itemMatch[2]) {
        const key = itemMatch[1]
        const value = getKeyValueContent(itemMatch[2]);

        // throw new Error('debug');
        // console.log(key, "--已换嵌套字符key-")
        // console.log(value, "--已换嵌套字符value-")
        // console.log(`"${key}": ${value},`, "--已换嵌套字符结果-")
        // throw new Error("debug")
        return `\"${key}\": ${value}`
      }
    }).join("")
  }

  // console.log(regexTrim, match1);
  // console.log(/'([^']+)'|([a-zA-Z_]\w*)\s*:\s*{(.*)}\s*,\s*/g.test(str));
  // console.log("-- 非嵌套字符 --")
  const extractPattern2 = /(?:'([^']+)'|\"([^\"]+)\"|([a-zA-Z_]\w*))\s*:\s*(['"`])((?:(?!\4).)*)\4/g
  const match = regexTrim.match(extractPattern2)

  // console.log("before replaceContent: ", regexTrim)
  // console.log("after replaceContent: ", match)
  // console.log(22,regexTrim, match)

  if (match) {
    // console.log(match, "--替换字符-")
    const resultList = match.map(v => {
      const itemMatch = v.match(/(?:'([^']+)'|\"([^\"]+)\"|([a-zA-Z_]\w*))\s*:\s*(['"`])((?:(?!\4).)*)\4/)

      // console.log(itemMatch, "--检测-")
      const key = itemMatch[1] || itemMatch[2] || itemMatch[3]
      const value = itemMatch[5] || itemMatch[4]

      // console.log("before conver: ", match[4])
      const value1 = value?.replaceAll(/(?<!\\)"/g, '\\"')
      // const value2 = value1?.replaceAll(/(?<!\\)'/g, '\\'')

      // console.log(value)
      // throw new Error("debug")
      // console.log(key, "--已换字符key-")
      // console.log(value1, "--已换字符value-")
      // console.log("after conver: ", value2)
      return `\"${key}\": \"${value1}\"`
    })

    return resultList.join("")
    // const key = match[1] || match[2]
    // // console.log("before conver: ", match[4])
    // const value1 = match[4]?.replaceAll(/(?<!\\)"/g, '\\"')
    // const value2 = value1?.replaceAll(/(?<!\\)'/g, '\\"')
    // console.log(value2, "--已换字符-")
    // // console.log("after conver: ", value2)
    // return `"${key}": "${value2}",`
  }

  return str
}

// 捕获key: value 形式字符
function getKeyValueContent(str) {
  const regexTrim = str.replace(/\t|\n|\v|\r|\f/g,'')
  const clearCommaStr = regexTrim.replaceAll(/,\s*}/g, '}')
  const clearEndStr = clearCommaStr.replaceAll(/\s*}$/g, ',}')
  // console.log("before getKeyValueContent: ", str)
  // console.log("after getKeyValueContent: ", clearEndStr)
  // const lineRegex = new RegExp(
  //   "(?:(?:'[^']+')|(?:[a-zA-Z0-9_]\w*))\s*:\s*(?:(?:\"[^\"].*\")|(?:`[^`].*`)|(?:'[^'].*')|(?:{[^{].*})),",
  //   // "(?:(?:'[^']+')|(?:[a-zA-Z0-9_]\w*))\s*:\s*\{.*\},",
  //   'g'
  // )
  // const lineRegex = /(?:(?:'[^']+')|(?:[a-zA-Z0-9_]\w*))\s*:\s*\{.*\},/g
  // const str2 = replaceContent(clearEndStr)
 

  // const lineRegex = /(['\"`]?)([a-zA-Z0-9_]+)\1\s*:\s*([^\{\},]+|\{[^\{\}]*\}.)/g
  // const lineRegex2 = /(?:(?:'[^']+')|(?:\"[^\"]+\")|(?:[a-zA-Z0-9_]\w*))\s*:\s*(?:(?:\"[^\"].*\")|(?:`[^`].*`)|(?:'[^'].*')),/g


  const lineRegex = /(?:(?:'[^']+')|(?:\"[^\"]+\")|(?:[a-zA-Z0-9_]\w*))\s*:\s*.+,/g

  // const  tempResult = clearEndStr.match(lineRegex)
  // console.log(tempResult)
  // const str2 = clearEndStr.replaceAll(lineRegex, (data) => {
  //   console.log(data);
  //   throw new Error("debug")
  //   return 
  // })

  // console.log(clearEndStr)
  // console.log(tempResult)

  const list = parseBraced(clearEndStr);
  // console.log(clearEndStr)
  // console.log(list)
  const tempResult = list.map(v => {
    return replaceContent(v)
  })

  const replaceStr = `{${tempResult.join(",")}}`
  // throw new Error("debug")

  // const replaceStr = clearEndStr.replaceAll(lineRegex, (p1) => {
    // console.log(clearEndStr, "--getKeyValueContent 原始字符-")
    // console.log(p1, "-- getKeyValueContent 匹配字符-")

    // return replaceContent(p1)
  // })

  // console.log("replaceStr: ", clearEndStr, clearEndStr.match(lineRegex))
  const resultEnd = replaceStr.replace(/,}$/, '}')
  const result = resultEnd.replace(/^\s*{\s*/, '{')
  // console.log("result: ", result)
  return result
}

// 读取TS文件并且序列化为JSON
function readJSONForTs(name, lang) {
  const langName = lang || sourceLang
  const filePath = `${langPath}/${langName}/${name}`
  // try {
    const file = fs.readFileSync(filePath, 'utf-8')
    const regex = getRegex(fileType);
    if (!regex) {
      console.log(fileType)
      throw new Error(`不支持${fileType}类型文件`)
    }
    // const regex = /export\s+default\s*({[\s\S]*})/
    const matchContent = file.match(regex)
    // const clearCommaStr = matchContent[1].replaceAll(/,\s*}/g, '}')

    // const clearEndStr = clearCommaStr.replaceAll(/\s*}$/g, ',}')

    // const lineRegex = new RegExp(
    //   "(?:(?:'[^']+')|(?:[a-zA-Z_]\\w*))\\s*:\\s*(?:(?:'[^']*',)|(?:`[^`]*`,)|(?:\"[^\"]*\",)|(?:{[^{]*},))",
    //   'g'
    // )
    // const replaceStr = clearEndStr.replaceAll(lineRegex, (p1) => {
    //   return replaceContent(p1)
    // })
    // const replaceStr = getKeyValueContent(matchContent[1])
    // console.log(matchContent[1])
    // throw new Error("debug")
    const result = parseBraced(matchContent[1])
    
    // const result = replaceStr.replace(/,\s*\}$/, '}')

    const jsonData = JSON.parse(result)
    // message = result
    // console.log(jsonData, "---- parse ---")
    return jsonData 
    // const jsonData = JSON.parse(result)
    // console.log(jsonData)
    // throw new Error("debug")

    // const jsonData = parse(result)
    // const jsonData = parseJson(result)
    // const temp = `{"luxuryGifts": "<span \'{num} USDT</span> 豪礼等您领取!"}`
    // const jsonData = JSON.parse(temp)
    // return jsonData
  // } catch (err) {
    // if (err) {
      // console.log(message)
      // throw new Error(err)
    // }
  // }
}

function findMissingTerms(sourceObj, targetObj) {
  const sourceKeys = Object.keys(sourceObj)
  // const targetKeys = Object.keys(targetObj)

  const keys = sourceKeys.filter((v) => {
    const formatTarget = targetObj[v]?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')?.replace(/(?<!\\)"/g, '\"')?.replaceAll(/(?<!\\)'/g, '\"')
    const formatSource = sourceObj[v]?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')?.replace(/(?<!\\)"/g, '\"')?.replaceAll(/(?<!\\)'/g, '\"')

    return formatTarget == formatSource
  })

  if (keys.length > 0) {
    const result = {}
    keys.map((v) => (result[v] = sourceObj[v]))
    const filePath = path.resolve(process.cwd(), './missWords.js')
    writeContentForPath(filePath, `export default ${JSON.stringify(result, null, 2)}`)
  }
}

// 查找缺失的词条 Key
function findMissingKeys(lossKeyTempObj, sourceData, targetData) {
  const lossKeys = Object.keys(lossKeyTempObj)

  const lossKeysObj = {}

  if (lossKeys.length > 0) {
    lossKeys.map((v) => {
      const indexObj = {
        isFinded: false,
        index: -1,
        key: '',
        value: ''
      }

      for (let i = 0; i < targetData.length; i++) {

        const entryNameTrim = targetData[i][XLSX_ROW_APP_INDEX_MAP[appKey]]?.trim()
        const entryName = entryNameTrim ? entryNameTrim.replaceAll(/\s*,\s*/g, ',')?.split(',') : ''

        const sourceText = targetData[i][XLSX_ROW_LANG_INDEX_MAP[sourceLang]]
        const sourceId = targetData[i][XLSX_ROW_PROP_INDEX_MAP.id]

        const trimValueStr = sourceData[v]?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')
        const trimTargetStr = sourceText?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')
        if (trimValueStr == trimTargetStr) {
          if (entryName && !indexObj.isFinded) {
            indexObj.isFinded = true
            indexObj.index = -1
            indexObj.key = ''
            indexObj.value = ''
          }
          if (!entryName && !indexObj.isFinded) {
            indexObj.isFinded = false
            indexObj.index = sourceId
            indexObj.key = v
            indexObj.value = sourceData[v]
          }
        }
      }

      if (!indexObj.isFinded) {
        lossKeysObj[`${indexObj.index}`] = {
          [v]: sourceData[v]
        }
      }
    })

    if (Object.keys(lossKeysObj).length > 0) {
      const keyfilePath = path.resolve(process.cwd(), './missKeys.js')
      writeContentForPath(keyfilePath, `export default ${JSON.stringify(lossKeysObj, null, 2)}`)
    }
  }
}

function transformFlatten(flattenObj) {
  const fileStructObj = {}

  Object.keys(flattenObj).map((v) => {
    const fullKey = v
    const keyList = fullKey?.split('.')
    const langName = keyList[0]
    const fileName = keyList[1]

    if (!fileStructObj[langName]) {
      fileStructObj[langName] = {}
    }
    if (!fileStructObj[langName][fileName]) {
      fileStructObj[langName][fileName] = {}
    }

    const contentKeyList = keyList.slice(2)
    contentKeyList.reduce((currentObj, value, index) => {
      if (index < contentKeyList.length - 1) {
        if (!currentObj[value]) {
          currentObj[value] = {}
        }
        return currentObj[value]
      } else {
        currentObj[value] = flattenObj[fullKey]
      }
    }, fileStructObj[langName][fileName])
  })

  return fileStructObj;
}

// 查找缺失的翻译词条
function writeTsToFiles(langObj) {
  // 生成JSON数据
  // {
  //   [lang]: {
  //     [fileName]: {} // JSON
  //   },
  // }
  const fileStructObj = {}

  Object.keys(langObj).map((v) => {
    const fullKey = v
    const keyList = fullKey?.split('.')
    const langName = keyList[0]
    const fileName = keyList[1]

    if (!fileStructObj[langName]) {
      fileStructObj[langName] = {}
    }
    if (!fileStructObj[langName][fileName]) {
      fileStructObj[langName][fileName] = {}
    }
    const contentKeyList = keyList.slice(2)
    contentKeyList.reduce((currentObj, value, index) => {
      if (index < contentKeyList.length - 1) {
        if (/^\d$/.test(contentKeyList[index + 1])) {
          if (!currentObj[value]) {
            currentObj[value] = []
          }
          currentObj[value].push(langObj[fullKey])
        } else if (!currentObj[value]) {
          currentObj[value] = {}
        }
        return currentObj[value]
      } else {
        currentObj[value] = langObj[fullKey]
      }
    }, fileStructObj[langName][fileName])
  })

  const fileContentStart = getFileContentStart(fileType);

  // 写入目录文件
  Object.keys(fileStructObj).forEach((langFile) => {
    Object.keys(fileStructObj[langFile]).forEach((file) => {
      const path = `${langPath}/${langFile}/${file}${fileType}`
      writeContentForPath(path, `${fileContentStart} ${JSON.stringify(fileStructObj[langFile][file], null, 2)}`)
    })
  })
}

// 获取文件类型正则表达式
function getRegex(type) {
  switch(type) {
    case '.ts': return /export\s+default\s*({[\s\S]*})/;break;
    case '.js': return /module\.exports\s*=\s*({[\s\S]*})/;break;
  }
}

// 获取文件开头内容
function getFileContentStart(type) {
  switch(type) {
    case '.ts': return 'export default';break;
    case '.js': return 'module.exports = ';break;
  }
}

// 生成指定语言文件
function generateLangFile() {
  if (!XLSX_ROW_APP_INDEX_MAP[appKey]) {
    throw new Error(`指定应用的词条不存在：${appKey}`)
  }

  if (!fs.existsSync(xlsxPath)) {
    throw new Error('XLSX文件不存在：', xlsxPath)
  }

  const workbook = XLSX.readFile(xlsxPath)
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
  data.shift()

  const langObj = {}

  data.map((item, index) => {
    const entryNameTrim = item[XLSX_ROW_APP_INDEX_MAP[appKey]]?.trim()
    const entryName = entryNameTrim ? entryNameTrim.replaceAll(/\s*,\s*/g, ',')?.split(',') : ''
    if (entryName) {
      langKeyList.map((v) => {
        const indexKey = XLSX_ROW_LANG_INDEX_MAP[v]
        entryName.map((entryKey) => {
          // 转义路径字符
          const key = `${v.toLowerCase()}.${entryKey.replaceAll('/', '.')}`
          // 文本内容转义双引号或单引号
          langObj[key] = item[indexKey] || ''
        })
      })
    }
  })

  writeTsToFiles(langObj)
}


// 根据指定语言补全其他语言文件
function generateLangFileBasedLang() {
  if (!XLSX_ROW_APP_INDEX_MAP[appKey]) {
    throw new Error(`指定应用的词条不存在：${appKey}`)
  }

  if (!fs.existsSync(xlsxPath)) {
    throw new Error('XLSX文件不存在：', xlsxPath)
  }

  let fileNameList = runGetDirName()
  if (config.singleFile) {
    fileNameList = [config.singleFile]
  }

  const singleKeys = config.singleKeys || [];

  console.log(fileNameList)
  const jsonList = fileNameList.map((fileName) => {
    const jsonData = readJSONForTs(fileName)
    const result = flattenObject(jsonData, fileName.slice(0, -3))
    return result
  })

  const sourceData = merge({}, ...jsonList)
  let targetLangObj = {}

  const sourceDataKeys = Object.keys(sourceData)
  let sourceDataValues = Object.values(sourceData)

  if (singleKeys.length > 0) {
    targetLang.map(item => {
      fileNameList.map((fileName) => {
        const jsonData = readJSONForTs(fileName, item)
        const result = flattenObject(jsonData, `${item}.${fileName.slice(0, -3)}`)
        targetLangObj = merge(targetLangObj, result)
      })
    })
  } else {
    targetLang.map(item => {
      sourceDataKeys.map(k => {
        targetLangObj[`${item}.${k}`] = sourceData[k];
      })
    })
  }

  const workbook = XLSX.readFile(xlsxPath)
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
  data.shift()

  const lossKeyTempObj = {}

  if (singleKeys.length > 0) {
    sourceDataValues = singleKeys.map(v => sourceData[v])
  }

  sourceDataValues.map((v, i) => {
    const indexList = []
    data
      .map((item, index) => {

        const entryNameTrim = item[XLSX_ROW_APP_INDEX_MAP[appKey]]?.trim()
        const entryName = entryNameTrim ? entryNameTrim.replace(/\s*,\s*/g, ',')?.split(',') : ''

        const sourceText = item[XLSX_ROW_LANG_INDEX_MAP[sourceLang]]

        const trimTargetStr = sourceText?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')?.replace(/(?<!\\)"/g, '\"')?.replace(/(?<!\\)'/g, '\"')

        const trimValueStr = v?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')?.replace(/(?<!\\)"/g, '\"')?.replace(/(?<!\\)'/g, '\"')
        const cmpResult = trimValueStr?.toLowerCase() == trimTargetStr?.toLowerCase()

        if (findMissingKey && cmpResult) {
          if (!entryName) {
            lossKeyTempObj[sourceDataKeys[i]] = trimTargetStr
          } else if (lossKeyTempObj[sourceDataKeys[i]]){
            delete lossKeyTempObj[sourceDataKeys[i]]
          }
        }
        if (cmpResult) {
          indexList.push({
            index: i,
            rowData: item
          })
        }
      })
    if (indexList.length <= 0) {
      indexList.push({
        index: i
      })
    }  
    // if (indexList.length > 0) {

      targetLang.map(item => {
        indexList.map((value) => {
          const {index, rowData} = value
          const targetText = rowData ? rowData[XLSX_ROW_LANG_INDEX_MAP[item]] : v
          const dataKey = singleKeys && singleKeys.length > 0 ? singleKeys[index] : sourceDataKeys[index]

          // if (sourceData[dataKey] == `<p class=\"title\">首次交易任务说明</p><p class=\"t2\">新手任务有效期内完成首笔合约交易额 ≥{num} USDT 或 首笔现货交易额 ≥{amount} USDT</p>`) {
          //   // console.log(targetText.replace(/^\s+|\s+$/g, ''), '====')
          //   console.log(rowData)
          //   console.log(sourceData[dataKey], '----')
          //   throw new Error("debug")
          // }

          if (targetText) {
            
            targetLangObj[`${item}.${dataKey}`] = targetText.replace(/^\s+|\s+$/g, '')
          }
        })
      })
    // }
  })
  // data.map((item, index) => {

  //   const entryNameTrim = item[XLSX_ROW_APP_INDEX_MAP[appKey]]?.trim()
  //   const entryName = entryNameTrim ? entryNameTrim.replaceAll(/\s*,\s*/g, ',')?.split(',') : ''

  //   const sourceText = item[XLSX_ROW_LANG_INDEX_MAP[sourceLang]]

  //   const trimTargetStr = sourceText?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')
  //   const indexList = sourceDataValues
  //     .map((v, i) => {
  //       const trimValueStr = v?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')
  //       const cmpResult = trimValueStr == trimTargetStr

  //       if (findMissingKey && cmpResult) {
  //         if (!entryName) {
  //           lossKeyTempObj[sourceDataKeys[i]] = trimTargetStr
  //         } else if (lossKeyTempObj[sourceDataKeys[i]]){
  //           delete lossKeyTempObj[sourceDataKeys[i]]
  //         }
  //       }
  //       return cmpResult ? i : -1
  //     })
  //     .filter((v) => v >= 0)

  //   if (indexList.length > 0) {

  //     targetLang.map(v => {

  //       const targetText = item[XLSX_ROW_LANG_INDEX_MAP[v]]
  //       indexList.map((index) => {
  //         const dataKey = sourceDataKeys[index]
  //         targetLangObj[`${v}.${dataKey}`] = targetText ? targetText.replace(/^\s+|\s+$/g, '') : ""
  //       })

  //     })
  //   }
  // })

  // 查找缺失的 key
  if (findMissingKey) {
    findMissingKeys(lossKeyTempObj, sourceData, data)
  }

  // 查找缺失的词条
  if (findMissingTerm) {
    // 反序列化
    const fileStructObj = transformFlatten(targetLangObj)
    // 取第一个语言集
    let itemLangObj = fileStructObj[Object.keys(fileStructObj)[0]]

    if (itemLangObj) {
      let targetData = merge({}, sourceData)

      // 再次序列化
      targetData = flattenObject(targetData)
      itemLangObj = flattenObject(itemLangObj)

      // console.log(Object.keys(itemLangObj), Object.keys(targetData))


      // 覆盖相同词条
      Object.keys(itemLangObj).map(key => {
        const formatTarget = itemLangObj[key]?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')?.replace(/(?<!\\)"/g, '\"')?.replace(/(?<!\\)'/g, '\"')
        const formatSource = targetData[key]?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')?.replace(/(?<!\\)"/g, '\"')?.replace(/(?<!\\)'/g, '\"')

        if (formatSource != formatTarget) {
          targetData[key] = itemLangObj[key]
          // console.log(key)
        }
      })

      // throw new Error("debug")
      // 对比
      findMissingTerms(sourceData, targetData)
    }
  }

  writeTsToFiles(targetLangObj)

}

module.exports = {
  generateLangFileBasedLang,
  generateLangFile,
  getConfigInfo
}