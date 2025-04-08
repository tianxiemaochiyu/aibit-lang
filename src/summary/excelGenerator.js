const XLSX = require('xlsx')
const { MASTER_LANGUAGE, STRICT_MATCH_LANGUAGES, LANGUAGE_NORMALIZATION } = require('./config')

class ExcelGenerator {
  static generate(langData, languages, keyToClientType) {
    const { groupedEntries, allLanguages } = this._groupEntries(langData, keyToClientType, [
      ...STRICT_MATCH_LANGUAGES,
      ...languages.filter((l) => !STRICT_MATCH_LANGUAGES.includes(l))
    ])

    const worksheetData = this._createWorksheetData(groupedEntries, allLanguages)
    return this._createWorkbook(worksheetData, languages)
  }

  static _groupEntries(langData, keyToClientType, allLanguages) {
    // 标准化所有语言代码
    const normalizedLangData = {}
    Object.entries(langData).forEach(([lang, translations]) => {
      const normalizedLang = LANGUAGE_NORMALIZATION[lang] || lang
      normalizedLangData[normalizedLang] = translations
    })

    const groupedMap = new Map()
    const zhData = normalizedLangData[MASTER_LANGUAGE] || {}

    Object.entries(zhData).forEach(([key, zhValue]) => {
      if (!zhValue || zhValue.trim() === '') return

      // 使用标准化后的语言检查
      const matchValues = STRICT_MATCH_LANGUAGES.map((lang) => normalizedLangData[lang]?.[key])
      // 创建分组签名
      const signature = STRICT_MATCH_LANGUAGES.map(
        (lang, i) => `${lang}:${matchValues[i] || ''}`
      ).join('|')

      if (!groupedMap.has(signature)) {
        groupedMap.set(signature, {
          androidKeys: new Set(),
          iosKeys: new Set(),
          translations: {}
        })
      }

      const group = groupedMap.get(signature);
      
      if (keyToClientType[key] === 'android') {
        group.androidKeys.add(key)
      } else {
        group.iosKeys.add(key)
      }

      // 保存所有语言翻译
      allLanguages.forEach((lang) => {
        if (!group.translations[lang]) {
          group.translations[lang] = langData[lang]?.[key] || ''
        }
      })
    })

    return {
      groupedEntries: Array.from(groupedMap.values()),
      allLanguages
    }
  }

  static _createWorksheetData(groupedEntries, allLanguages) {
    const header = ['Android-key', 'iOS-key', ...allLanguages]
    const worksheetData = [header]

    groupedEntries.forEach((group) => {
      const androidKeys = Array.from(group.androidKeys).sort()
      const iosKeys = Array.from(group.iosKeys).sort()
      const maxRows = Math.max(androidKeys.length, iosKeys.length)

      for (let i = 0; i < maxRows; i++) {
        const row = [androidKeys[i] || '', iosKeys[i] || '']

        allLanguages.forEach((lang) => {
          row.push(group.translations[lang] || '')
        })

        worksheetData.push(row)
      }
    })

    return worksheetData
  }

  static _createWorkbook(worksheetData, languages) {
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Translations')

    // 设置更合理的列宽
    worksheet['!cols'] = [
      { wch: 40 }, // Android-key
      { wch: 40 }, // iOS-key
      { wch: 30 }, // 中文
      ...languages.filter(lang => lang !== MASTER_LANGUAGE).map(() => ({ wch: 30 }))
    ]

    // 添加冻结首行功能
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2' }

    return workbook
  }
}

module.exports = ExcelGenerator
