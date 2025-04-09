// JSON验证结果接口
export interface JSONValidationResult {
  isValid: boolean;
  error?: {
    message: string;
    position?: number;
    line?: number;
    column?: number;
    context?: string;
  };
}

/**
 * 验证JSON字符串的格式是否正确
 * @param jsonString 要验证的JSON字符串
 * @returns 验证结果对象
 */
export const validateJSON = function (jsonString: string): JSONValidationResult {
  try {
      JSON.parse(jsonString);
      return { isValid: true };
  } catch (error) {
      if (error instanceof SyntaxError) {
          // 获取错误位置
          const match = error.message.match(/position (\d+)/);
          const position = match ? parseInt(match[1]) : -1;
          
          // 获取错误行号和列号
          let line = 1;
          let column = 1;
          for (let i = 0; i < position; i++) {
              if (jsonString[i] === '\n') {
                  line++;
                  column = 1;
              } else {
                  column++;
              }
          }
          
          // 获取错误附近的上下文
          const contextStart = Math.max(0, position - 10);
          const contextEnd = Math.min(jsonString.length, position + 10);
          const context = jsonString.slice(contextStart, contextEnd);
          
          return {
              isValid: false,
              error: {
                  message: error.message,
                  position,
                  line,
                  column,
                  context
              }
          };
      }
      return { isValid: false, error: { message: 'Unknown error' } };
  }
}

// // 使用示例
// const testJSON = '{"name": "John", "age": 30, "city": "New York"';
// const result = validateJSON(testJSON);

// if (!result.isValid) {
//   console.log('JSON格式错误:');
//   console.log(`错误信息: ${result.error.message}`);
//   console.log(`错误位置: 第${result.error.line}行, 第${result.error.column}列`);
//   console.log(`错误上下文: ...${result.error.context}...`);
// } else {
//   console.log('JSON格式正确');
// }