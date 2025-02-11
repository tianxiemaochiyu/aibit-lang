# aibit-lang

主要用于 aibit 项目一键生成多语言文件

## Config

- `xlsxPath`: string
  - Excel 文件路径，存储所有语言的翻译内容
  - 相对路径，基于项目根目录
  - 例如：`"./data.xlsx"`
- `outDir`: string
  - 字符串，输出目录路径
  - 生成的语言文件将保存在此目录下
  - 例如：`"./lang"`
- `lang`: Array\<string\>
  - 需要生成的语言列表
  - 可选值：`zh`, `en`, `hk`, `kr`, `ru`, `es`, `pt`, `fa`, `jp`, `tr`
  - 例如：`['zh', 'en']`
- `appName`: string
  - 字符串，应用名称
  - 可选值：`WEBUC`, `WEBCO`, `H5WAP`, `H5APP`
- `completeLang`: Array\<string\>
  - 需要补全的语言列表
  - 可选值：`zh`, `en`, `hk`, `kr`, `ru`, `es`, `pt`, `fa`, `jp`, `tr`
  - 例如：`['zh', 'en']`
- `completeBaseLang`: string
  - 补全操作的基准语言
  - 可选值：`zh`, `en`, `hk`, `kr`, `ru`, `es`, `pt`, `fa`, `jp`, `tr`
  - 例如：`'zh'`
- `fileType:`: string
  - 生成的文件类型
  - 可选值：`.ts`, `.js`
  - 例如：`'.ts'`
- `singleFile:`: string
  - 只对单个文件生效的文件名
- `singleKeys:`: Array\<string\>
  - 只对指定 key 生效
  - 例如, 只对 `api` 文件下的 `code` 字段生效：["api.code"]
- `findMissingKey`: boolean
  - 布尔型，当进行补全语言文件时，开启缺失键检测
  - 以指定基准语言中已有的键名去扫描 XLSX 中缺少的键名
  - 默认在项目根目录下文件 `missKey.ts`
- `findMissingTerm`: boolean
  - 布尔型，当进行补全语言文件时，开启缺失项检测
  - 以指定基准语言中已有的词条去扫描 XLSX 中缺少的翻译词条
  - 默认在项目根目录下文件 `missWord.ts`

## Usage

1. 确保项目根目录下存在 `.xlsx` 后缀表格文件
2. `npm install aibit-lang`
3. 确保在项目根目录下存在配置文件 `aibit-lang.config.js`
4. 在 `package.json` 中添加指令：

```json
  {
    "scripts": {
      "generate:lang": "aibit-lang g",
      "complete:lang": "aibit-lang c"
    }
  }
```

5. 运行 `npm run generate:lang` , 语言文件将会在 `outDir` 目录下生成
