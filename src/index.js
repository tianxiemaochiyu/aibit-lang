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
function parseXML(xmlString) {
  const result = {};
  const tagRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g;
  const attrRegex = /name="([^"]*)"/g;

  xmlString.trim().replaceAll(tagRegex, (...params) => {
    const tag = params[1];
    const attrs = params[2];
    const content = params[3];
    if (tag === "string") {
      const attrMatch = [...attrs.trim().matchAll(attrRegex)][0];
      if (attrMatch) {
        const key = attrMatch[1];
        result[key] = content;
      }
    }
  })

  return JSON.stringify(result);
}

function parseBraced(content) {
  switch (fileType) {
    case ".xml":
      return parseXML(content);
    case ".strings":
      return parseStrings(content);
    default:
      const str = content.trim().slice(1, -1);
      return parseCustomString(str);
  }
}

function parseStrings(strings) {
  const result = {};
  const lineRegex = /"([^"]*)"\s*=\s*"([^"]*)"\s*;/g;

  strings.trim().replaceAll(lineRegex, (...params) => {
    const key = params[1];
    const content = params[2];
    if (key) {
      result[key] = content;
    }
  })
  return JSON.stringify(result);
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

  if (!config.outDir || !config.xlsxPath) {
    throw new Error('配置文件参数不全')
  }

  config = {
    lang: ['en'],
    findMissingKey: false,
    findMissingTerm: false,
    singleFile: '',
    fileType: ".js",
    singleKeys: [],
    clientType: 'browser',
    ...config
  }

  if (config.clientType === "android") {
    config.fileType = ".xml"
  } else if (config.clientType === "ios") {
    config.fileType = ".strings"
  }

  return config
}

const config = getConfigInfo()

const targetLang = config.completeLang
const targetBaseLang = config.completeBaseLang

const findMissingKey = config.findMissingKey
const findMissingTerm = config.findMissingTerm

const fileType = config.fileType

const sourceLang = targetBaseLang

const langPath = path.join(process.cwd(), config.outDir)
const xlsxPath = path.join(process.cwd(), config.xlsxPath)

const langKeyList = config.lang
const appKey = 
  config.clientType === "browser" 
    ? config.appName 
    : config.clientType === "android" 
      ? "ANDROID"
      : "IOS"

// xlsx 中对应的语言名称索引
const XLSX_ROW_LANG_INDEX_MAP = {
  zh: 10,
  cn: 10, // old version
  en: 12,
  hk: 17,
  tc: 17,
  kr: 19,
  ru: 21,
  es: 15,
  pt: 20,
  fa: 16,
  jp: 18,
  ja: 18,
  tr: 22,
  fr: 13,
  vi: 23,
  de: 14,
}

// xlsx 中对应的应用端名称索引
const XLSX_ROW_APP_INDEX_MAP = {
  // WEBUC: 6 + 2,
  // WEBCO: 7 + 2,
  // H5WAP: 8 + 2,
  // H5APP: 9 + 2,
  // ANDROID: 6,
  // IOS: 7,
}

// xlsx 中对应字段索引
const XLSX_ROW_PROP_INDEX_MAP = {
  id: 0,
  issue: 1,
  isHas: 2
}

const getClientPlaceHolder = (clientType) => {
  switch(clientType) {
    case "android": 
      return {
        match: /({.*})|(%@)/g,
        placeholder: "%s"
      };
    case "ios":
      return {
        match:  /({.*})|(%s)|(%\d\$s)/g,
        placeholder: "%@"
      };
    case "browser":
      return {
        match: /(%s)|(%\d\$s)/g,
        placeholder: "{a}"
      };
  }
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

function replaceContent(str) {
  const regexTrim = str.replace(/\t|\n|\v|\r|\f/g,'')
  const extractPattern = /(?:(?:'[^']+')|(?:\"[^\"]+\")|(?:[a-zA-Z_0-9]\w*))\s*:\s*\{[^\{]*\}\s*/g
  const match1 = regexTrim.match(extractPattern)

  if (match1) {
    return match1.map(v => {
      const itemMatch = v.match(/((?:'[^']+')|(?:\"[^\"]+\")|(?:[a-zA-Z_0-9]\w*))\s*:\s*(\{[^\{]*\})/)
      if (itemMatch && itemMatch[2]) {
        const key = itemMatch[1]
        const value = getKeyValueContent(itemMatch[2]);

        return `\"${key}\": ${value}`
      }
    }).join("")
  }

  const extractPattern2 = /(?:'([^']+)'|\"([^\"]+)\"|([a-zA-Z_]\w*))\s*:\s*(['"`])((?:(?!\4).)*)\4/g
  const match = regexTrim.match(extractPattern2)


  if (match) {
    const resultList = match.map(v => {
      const itemMatch = v.match(/(?:'([^']+)'|\"([^\"]+)\"|([a-zA-Z_]\w*))\s*:\s*(['"`])((?:(?!\4).)*)\4/)

      const key = itemMatch[1] || itemMatch[2] || itemMatch[3]
      const value = itemMatch[5] || itemMatch[4]

      const value1 = value?.replaceAll(/(?<!\\)"/g, '\\"')

      return `\"${key}\": \"${value1}\"`
    })

    return resultList.join("")

  }

  return str
}

// 捕获key: value 形式字符
function getKeyValueContent(str) {
  const regexTrim = str.replace(/\t|\n|\v|\r|\f/g,'')
  const clearCommaStr = regexTrim.replaceAll(/,\s*}/g, '}')
  const clearEndStr = clearCommaStr.replaceAll(/\s*}$/g, ',}')

  const lineRegex = /(?:(?:'[^']+')|(?:\"[^\"]+\")|(?:[a-zA-Z0-9_]\w*))\s*:\s*.+,/g


  const list = parseBraced(clearEndStr);

  const tempResult = list.map(v => {
    return replaceContent(v)
  })

  const replaceStr = `{${tempResult.join(",")}}`

  const resultEnd = replaceStr.replace(/,}$/, '}')
  const result = resultEnd.replace(/^\s*{\s*/, '{')
  return result
}

function getRegexContent(regexContent) {
  switch(fileType) {
    case ".xml": return regexContent[2];
    case ".strings": return regexContent["input"];
    default: return regexContent[1];
  }
}

// 读取TS文件并且序列化为JSON
function readJSONForTs(name, lang) {
  const langName = lang || sourceLang
  const filePath = `${langPath}/${langName}/${name}`
    const file = fs.readFileSync(filePath, 'utf-8')
    const regex = getRegex(fileType);
    if (!regex) {
      console.log(fileType)
      throw new Error(`不支持${fileType}类型文件`)
    }
    const matchContent = file.match(regex)

    const result = parseBraced(getRegexContent(matchContent))
    
    const jsonData = JSON.parse(result)
    return jsonData 
}

function findMissingTerms(sourceObj, targetObj) {
  const sourceKeys = Object.keys(sourceObj)

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

function writeToFile(contentObj) {
  switch(fileType) {
    case ".xml": return writetoXML(contentObj);
    case ".strings": return writetoStrings(contentObj);
    default: return writeTsToJS(contentObj);
  }
}

function writetoXML(contentObj) {
  const fileStructObj = {}
  Object.keys(contentObj).map((v) => {
    const fullKey = v
    const keyList = fullKey?.split('.')
    const langName = keyList[0]
    const fileName = keyList[1]

    if (!fileStructObj[langName]) {
      fileStructObj[langName] = {}
    }
    if (!fileStructObj[langName][fileName]) {
      fileStructObj[langName][fileName] = "<resources>\n"
    }
    const key = keyList.slice(2).join(".")
    fileStructObj[langName][fileName] += `<string name="${key}">${contentObj[fullKey]}</string>\n`
  })
  // 写入目录文件
  Object.keys(fileStructObj).forEach((langFile) => {
    Object.keys(fileStructObj[langFile]).forEach((file) => {
      const path = `${langPath}/${langFile}/${file}${fileType}`
      writeContentForPath(path, fileStructObj[langName][fileName] + "</resources>")
    })
  })
}

function writetoStrings(contentObj) {
  const fileStructObj = {}
  Object.keys(contentObj).map((v) => {
    const fullKey = v
    const keyList = fullKey?.split('.')
    const langName = keyList[0]
    const fileName = keyList[1]

    if (!fileStructObj[langName]) {
      fileStructObj[langName] = {}
    }
    if (!fileStructObj[langName][fileName]) {
      fileStructObj[langName][fileName] = ""
    }
    const key = keyList.slice(2).join(".")
    fileStructObj[langName][fileName] += `"${key}" = "${contentObj[fullKey]}";\n`
  })
  // 写入目录文件`
  Object.keys(fileStructObj).forEach((langFile) => {
    Object.keys(fileStructObj[langFile]).forEach((file) => {
      const path = `${langPath}/${langFile}/${file}${fileType}`
      writeContentForPath(path, fileStructObj[langFile][file])
    })
  })
}

function writeTsToJS(langObj) {
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
    case '.ts': return /^export\s+default\s*({[\s\S]*})/;break;
    case '.js': return /^module\.exports\s*=\s*({[\s\S]*})/;break;
    case '.xml': return /^<([a-z]+)>([\s\S]*)<\/\1>$/i;break;
    case '.strings': return /.*/;break;
    // case '.strings'  // ios 没有文件头
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

  if (!fs.existsSync(xlsxPath)) {
    throw new Error('XLSX文件不存在：', xlsxPath)
  }

  let fileNameList = runGetDirName()
  let baseLangObj = {}
  fileNameList.map((fileName) => {
    const jsonData = readJSONForTs(fileName, sourceLang)
    const result = flattenObject(jsonData, `${sourceLang}.${fileName.replace(fileType, "")}`)
    baseLangObj = merge(baseLangObj, result)
  })

  const baseLangObjKeys = Object.keys(baseLangObj)

  const workbook = XLSX.readFile(xlsxPath)
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
  data.shift()

  const langObj = {}
  const lossKeysObj = {}
  const valueFilterRegex = getClientPlaceHolder(config.clientType);

  data.map((item, index) => {
    const entryNameTrim = item[XLSX_ROW_APP_INDEX_MAP[appKey]]?.trim()
    const entryName = entryNameTrim ? entryNameTrim.replaceAll(/\s*,\s*/g, ',')?.split(',') : ''
    if (entryName) {
      langKeyList.map((v) => {
        const indexKey = XLSX_ROW_LANG_INDEX_MAP[v]
        const fileName = 
          config.clientType == "android" 
            ? "strings" 
            : config.clientType == "ios" 
              ? "Localizable" 
              : ""
        entryName.map((entryKey) => {
          const clientKey = 
            config.clientType == "android" || config.clientType == "ios" 
              ? entryKey : entryKey.replaceAll('/', '.')

          const key = `${v.toLowerCase()}${fileName ? `.${fileName}` : ''}.${clientKey}`
          
          langObj[key] = item[indexKey]?.trim().replaceAll(valueFilterRegex.match, valueFilterRegex.placeholder) || ''
        })
      })
    } else {
      baseLangObjKeys.map((v) => {
        const sourceValue = baseLangObj[v].trim();
        const xlsxValue = item[XLSX_ROW_LANG_INDEX_MAP[sourceLang]]?.trim()
        if (sourceValue ==  xlsxValue) {
          langKeyList.map(langKey => {
            const langObjTargetLangKey = `${langKey}.${v.split(".").splice(1).join(".")}`
            langObj[langObjTargetLangKey] = item[XLSX_ROW_LANG_INDEX_MAP[langKey]]?.trim()
            if (!item[XLSX_ROW_LANG_INDEX_MAP[langKey]]) {
              console.log(item[XLSX_ROW_LANG_INDEX_MAP[langKey]]?.trim())
              console.log(XLSX_ROW_LANG_INDEX_MAP[langKey])
              console.log(langKey)
              throw new Error("debugger")
            }
          })
                    
          const id = item[XLSX_ROW_PROP_INDEX_MAP.id]
          lossKeysObj[id] = item[XLSX_ROW_LANG_INDEX_MAP["zh"]]?.trim()
        }
      })
    }
  })
  
  writeToFile(langObj)

  if (Object.keys(lossKeysObj).length > 0) {
    const keyfilePath = path.resolve(process.cwd(), './missKeys.js')
    writeContentForPath(keyfilePath, `export default ${JSON.stringify(lossKeysObj, null, 2)}`)
  }
}


// 根据指定语言补全其他语言文件
function generateLangFileBasedLang() {

  if (!fs.existsSync(xlsxPath)) {
    throw new Error('XLSX文件不存在：', xlsxPath)
  }

  let fileNameList = runGetDirName()
  if (config.singleFile) {
    fileNameList = [config.singleFile]
  }

  const singleKeys = config.singleKeys || [];
  const singleFileName = config.singleFile?.replace(fileType, "");
  const transformSingleKeys = singleKeys.map(v => `${singleFileName}.${v}`)

  console.log(fileNameList)
  const jsonList = fileNameList.map((fileName) => {
    const jsonData = readJSONForTs(fileName)
    const result = flattenObject(jsonData, fileName.replace(fileType, ""))
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
        const result = flattenObject(jsonData, `${item}.${fileName.replace(fileType, "")}`)
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
    sourceDataValues = transformSingleKeys.map(v => {
      return sourceData[v]
    })
  }

  sourceDataValues.map((v, i) => {
    const indexList = []
    data
      .map((item, index) => {

        const sourceText = item[XLSX_ROW_LANG_INDEX_MAP[sourceLang]]

        const trimTargetStr = sourceText?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')?.replace(/(?<!\\)"/g, '\"')?.replace(/(?<!\\)'/g, '\"')

        const trimValueStr = v?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')?.replace(/(?<!\\)"/g, '\"')?.replace(/(?<!\\)'/g, '\"')
        const cmpResult = trimValueStr?.toLowerCase() == trimTargetStr?.toLowerCase()

        if (findMissingKey && cmpResult) {
          if (lossKeyTempObj[sourceDataKeys[i]]){
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
    targetLang.map(item => {
      indexList.map((value) => {
        const {index, rowData} = value
        const targetText = rowData ? rowData[XLSX_ROW_LANG_INDEX_MAP[item]] : v
        const dataKey = transformSingleKeys && transformSingleKeys.length > 0 ? transformSingleKeys[index] : sourceDataKeys[index]
        if (targetText) {
          targetLangObj[`${item}.${dataKey}`] = targetText.replace(/^\s+|\s+$/g, '')
        }
      })
    })
  })
  

  // 查找缺失的 key
  if (findMissingKey) {
    findMissingKeys(lossKeyTempObj, sourceData, data)
  }

  // 查找缺失的词条
  if (findMissingTerm) {
    
    let itemLangObj = {}
    if (config.clientType != "android" && config.clientType != "ios") {
    // 反序列化
      const fileStructObj = transformFlatten(targetLangObj)
      // 取第一个语言集
      itemLangObj = fileStructObj[Object.keys(fileStructObj)[0]]
    } else {
      Object.keys(targetLangObj).map((v) => {
        const langKey = v.split(".")[0]
        const key = v.replace(`${langKey}.`, "")
        itemLangObj[key] = targetLangObj[v]
      })
    }
    

    if (itemLangObj) {
      let targetData = merge({}, sourceData)

      // 再次序列化
      targetData = flattenObject(targetData)
      itemLangObj = flattenObject(itemLangObj)


      // 覆盖相同词条
      Object.keys(itemLangObj).map(key => {
        const formatTarget = itemLangObj[key]?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')?.replace(/(?<!\\)"/g, '\"')?.replace(/(?<!\\)'/g, '\"')
        const formatSource = targetData[key]?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')?.replace(/(?<!\\)"/g, '\"')?.replace(/(?<!\\)'/g, '\"')

        if (formatSource != formatTarget) {
          targetData[key] = itemLangObj[key]
        }
      })
      findMissingTerms(sourceData, targetData)
    }
  }

  writeToFile(targetLangObj)
}

module.exports = {
  generateLangFileBasedLang,
  generateLangFile,
  getConfigInfo
}