#!/usr/bin/env node

const { Command } = require('commander');
const program = new Command();
const { generateLangFile, generateLangFileBasedLang } = require("../src/index")

program.name("aibit-lang")
  .description("aibit language tool")
  .version("1.0.0")

program.command('generate')
  .description('生成语言文件')
  .alias('g')
  .action(generateLangFile)
  
program.command('complete')
  .description('根据指定语言生成其他语言文件')
  .alias('c')
  .action(generateLangFileBasedLang)

program.parse()

