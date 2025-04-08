const { VARIABLE_PATTERNS } = require('./config');

class Parser {
  static normalizeValue(value) {
    let normalized = value
      .replace(/&apos;/g, "'")
      .replace(/&quot;|\\"/g, '"')
      .replace(/\\n/g, '\n')
    
    // VARIABLE_PATTERNS.forEach(({ regex, replacement }) => {
    //   normalized = normalized.replace(regex, replacement);
    // });
    
    return normalized.trim();
  }

  static android(content) {
    const entries = {};
    const regex = /<string\s+name="(.+?)"[^>]*>([\s\S]*?)<\/string>/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      entries[match[1]] = this.normalizeValue(match[2]);
    }
    return entries;
  }

  static ios(content) {
    const entries = {};
    const regex = /"((?:\\"|.)*?)"\s*=\s*"((?:\\"|.)*?)"\s*;/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      entries[this.normalizeValue(match[1])] = this.normalizeValue(match[2]);
    }
    return entries;
  }
}

module.exports = Parser;