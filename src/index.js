const fs = require('fs')
const XLSX = require('xlsx')
const merge = require('lodash.merge')
const path = require('path')

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
    ...config
  })
}

const config = getConfigInfo()

const targetLang = config.completeLang
const targetBaseLang = config.completeBaseLang

const findMissingKey = config.findMissingKey
const findMissingTerm = config.findMissingTerm

const sourceLang = targetBaseLang

const langPath = path.join(process.cwd(), config.outDir)
const xlsxPath = path.join(process.cwd(), config.xlsxPath)

const langKeyList = config.lang
const appKey = config.appName

// xlsx 中对应的语言名称索引
const XLSX_ROW_LANG_INDEX_MAP = {
  zh: 11,
  en: 12,
  hk: 13,
  kr: 14,
  ru: 15,
  es: 16,
  pt: 17,
  fa: 18,
  jp: 19,
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
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        Object.assign(result, flattenObject(obj[key], newKey))
      } else {
        result[newKey] = obj[key]
      }
    }
  }
  return result
}

// 捕获 key - value 键值对，转义特殊字符 \' \"
function replaceContent(str) {
  const extractPattern = /(?:'([^']+)'|([a-zA-Z_]\w*))\s*:\s*(['"`])((?:(?!\3).)*)\3,/
  const match = str.match(extractPattern)

  if (match) {
    const key = match[1] || match[2]
    const value = match[4]?.replaceAll(/("|')/g, '\\$1')
    return `"${key}": "${value}",`
  }
  return str
}

// 读取TS文件并且序列化为JSON
function readJSONForTs(name) {
  const filePath = `${langPath}/${sourceLang}/${name}`
  try {
    const file = fs.readFileSync(filePath, 'utf-8')
    const regex = /export\s+default\s*({[\s\S]*})/
    const matchContent = file.match(regex)
    const clearCommaStr = matchContent[1].replaceAll(/,\s*}/g, '}')

    const clearEndStr = clearCommaStr.replaceAll(/\s*}$/g, ',}')

    const lineRegex = new RegExp(
      "(?:(?:'[^']+')|(?:[a-zA-Z_]\\w*))\\s*:\\s*(?:(?:'[^']*')|(?:`[^`]*`)|(?:\"[^\"]*\")),",
      'g'
    )
    const replaceStr = clearEndStr.replaceAll(lineRegex, (p1) => {
      return replaceContent(p1)
    })

    const result = replaceStr.replace(/,\}$/, '}')

    const jsonData = JSON.parse(result)
    return jsonData
  } catch (err) {
    if (err) {
      throw new Error('Unable to scan file: ' + err)
    }
  }
}

function findMissingTerms(sourceObj, targetObj) {
  const sourceKeys = Object.keys(sourceObj)

  const keys = sourceKeys.filter((v) => sourceObj[v] == targetObj[v])

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
        if (!currentObj[value]) {
          currentObj[value] = {}
        }
        return currentObj[value]
      } else {
        currentObj[value] = langObj[fullKey]
      }
    }, fileStructObj[langName][fileName])
  })

  // 写入目录文件
  Object.keys(fileStructObj).forEach((langFile) => {
    Object.keys(fileStructObj[langFile]).forEach((file) => {
      const path = `${langPath}/${langFile}/${file}.ts`
      writeContentForPath(path, `export default ${JSON.stringify(fileStructObj[langFile][file], null, 2)}`)
    })
  })
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

  const fileNameList = runGetDirName()
  const jsonList = fileNameList.map((fileName) => {
    const jsonData = readJSONForTs(fileName)
    const result = flattenObject(jsonData, fileName.slice(0, -3))
    return result
  })
  
  const sourceData = merge({}, ...jsonList)
  const targetLangObj = {} 

  const sourceDataKeys = Object.keys(sourceData)
  const sourceDataValues = Object.values(sourceData)

  const workbook = XLSX.readFile(xlsxPath)
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
  data.shift()

  const lossKeyTempObj = {}

  data.map((item, index) => {

    const entryNameTrim = item[XLSX_ROW_APP_INDEX_MAP[appKey]]?.trim()
    const entryName = entryNameTrim ? entryNameTrim.replaceAll(/\s*,\s*/g, ',')?.split(',') : ''

    const sourceText = item[XLSX_ROW_LANG_INDEX_MAP[sourceLang]]

    const trimTargetStr = sourceText?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')
    const indexList = sourceDataValues
      .map((v, i) => {
        const trimValueStr = v?.replace(/^\d[\.|、]/, '')?.replace(/\s+/g, '')
        const cmpResult = trimValueStr == trimTargetStr

        if (findMissingKey && cmpResult) {
          if (!entryName) {
            lossKeyTempObj[sourceDataKeys[i]] = trimTargetStr
          } else if (lossKeyTempObj[sourceDataKeys[i]]){
            delete lossKeyTempObj[sourceDataKeys[i]]
          }
        }
        return cmpResult ? i : -1
      })
      .filter((v) => v >= 0)
    
    if (indexList.length > 0) {

      targetLang.map(v => {
        
        const targetText = item[XLSX_ROW_LANG_INDEX_MAP[v]]
        indexList.map((index) => {
          const dataKey = sourceDataKeys[index]
          targetLangObj[`${v}.${dataKey}`] = targetText ? targetText.replace(/^\s+|\s+$/g, '') : ""
        })

      })
    }
  })

  // 查找缺失的 key
  if (findMissingKey) {
    findMissingKeys(lossKeyTempObj, sourceData, data)
  }

  // 查找缺失的词条
  if (findMissingTerm) {
    // 反序列化
    const fileStructObj = transformFlatten(targetLangObj)
    // 取第一个语言集
    const itemLangObj = fileStructObj[Object.keys(fileStructObj)[0]]

    if (itemLangObj) {
      let targetData = merge({}, sourceData)
      // 覆盖相同词条
      Object.keys(itemLangObj).map(key => {
        if (targetData[key] != itemLangObj[key]) {
          targetData[key] = itemLangObj[key]
        }
      })
      // 再次序列化
      targetData = flattenObject(targetData)
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
