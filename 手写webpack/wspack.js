const fs = require("fs");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const config = require("./webpack.config");
const t = require("@babel/types");
const path = require("path");
const generate = require("@babel/generator").default;
const ejs = require("ejs");

const EXPORT_DEFAULT_FUN = `
__webpack_require__.d(__webpack_exports__, {
   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
});\n
`;

const ESMODULE_TAG_FUN = `
__webpack_require__.r(__webpack_exports__);\n
`;

const parseFile = (file) => {
  // 读取入口文件
  const fileContent = fs.readFileSync(file, "utf-8");
  const ast = parser.parse(fileContent, {
    sourceType: "module", //表示要解析的es模块
  });
  let importFilePath = "";
  let importVarName = "";
  let importCovertVarName = "";
  let hasExport = false;
  traverse(ast, {
    ImportDeclaration(p) {
      const importFile = p.node.source.value;
      // import进来的变量名字
      importVarName = p.node.specifiers[0].local.name;
      // 获取文件路径
      importFilePath = path.join(path.dirname(file), importFile);
      importFilePath = `./${importFilePath}.js`;
      // 替换后的变量名字
      importCovertVarName = `__${path.basename(
        importFile
      )}__WEBPACK_IMPORTED_MODULE_0__`;
      const variable = t.variableDeclaration("var", [
        t.variableDeclarator(
          t.identifier(importCovertVarName),
          t.callExpression(t.identifier("__webpack_require__"), [
            t.stringLiteral(importFilePath),
          ])
        ),
      ]);
      p.replaceWith(variable);
    },
    ExportDefaultDeclaration(p) {
      hasExport = true; // 先标记是否有export
      // 跟前面import类似的，创建一个变量定义节点
      const variableDeclaration = t.variableDeclaration("const", [
        t.variableDeclarator(
          t.identifier("__WEBPACK_DEFAULT_EXPORT__"),
          t.identifier(p.node.declaration.name)
        ),
      ]);

      // 将当前节点替换为变量定义节点
      p.replaceWith(variableDeclaration);
    },
    CallExpression(p) {
      // 如果调用的是import进来的函数
      if (p.node.callee.name === importVarName) {
        // 就将它替换为转换后的函数名字
        p.node.callee.name = `${importCovertVarName}.default`;
      }
    },
    Identifier(p) {
      // 如果调用的是import进来的变量
      if (p.node.name === importVarName) {
        // 就将它替换为转换后的变量名字
        p.node.name = `${importCovertVarName}.default`;
      }
    },
  });
  let newCode = generate(ast).code;
  if (hasExport) {
    newCode = `${EXPORT_DEFAULT_FUN} ${newCode}`;
  }
  // 下面添加模块标记代码
  newCode = `${ESMODULE_TAG_FUN} ${newCode}`;
  // 返回一个包含必要信息的新对象
  return {
    file,
    deps: [importFilePath],
    code: newCode,
  };
};

function parseFiles(entryFile) {
  const entryRes = parseFile(entryFile); // 解析入口文件
  const results = [entryRes]; // 将解析结果放入一个数组

  // 循环结果数组，将它的依赖全部拿出来解析
  for (const res of results) {
    const dependencies = res.deps;
    dependencies.map((dependency) => {
      if (dependency) {
        const ast = parseFile(dependency);
        results.push(ast);
      }
    });
  }

  return results;
}

// 使用ejs将上面解析好的ast传递给模板
// 返回最终生成的代码
function generateCode(allAst, entry) {
  const temlateFile = fs.readFileSync(
    path.join(__dirname, "./template1.js"),
    "utf-8"
  );

  const codes = ejs.render(temlateFile, {
    __TO_REPLACE_WEBPACK_MODULES__: allAst,
    __TO_REPLACE_WEBPACK_ENTRY__: entry,
  });

  return codes;
}
const allAst = parseFiles(config.entry);
const codes = generateCode(allAst, config.entry);
fs.writeFileSync(path.join(config.output.path, config.output.filename), codes);
console.log(codes);
