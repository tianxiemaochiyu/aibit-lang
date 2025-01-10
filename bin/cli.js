#!/usr/bin/env node

const { program } = require('commander');
const { generateLangFile, generateLangFileBasedLang } = require("../src/index")

program.name("aibit-lang")
  .description("Aibit Lang tool")
  .version("1.0.0")
  .command('generate', '生成语言文件')
  .alias('g')
  .action(generateLangFile)
  .command('complete', '根据指定语言生成其他语言文件')
  .alias('c')
  .action(generateLangFileBasedLang)

