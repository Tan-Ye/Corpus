# MCP 插件

## 插件分两种

项目里的「插件」是产品概念：凡是额外功能都算，但执行位置不同。

- **内置插件**：放在仓库的 plugins 目录里，随代码一起分发，例如 MDN 文档、Context7 文档。
- **额外 MCP**：用户在界面里自己添加，定义存在数据库里，随时可以关掉或删掉。

两者的开关都保存在服务端，但内置插件的定义在文件里，额外插件的定义在表里。

## manifest 的形状

```json
{
  "id": "mdn",
  "name": "MDN 文档",
  "description": "查询 MDN 的 Web 文档与兼容性数据",
  "modelHint": "查 Web 平台 API 用法时用这个",
  "tools": ["search", "get-doc"],
  "transport": { "type": "http", "url": "https://mcp.mdn.mozilla.net/" }
}
```

四个字段各有用途：id 用来生成工具名前缀，description 给人看，modelHint 告诉模型什么时候该用，tools 是暴露给模型的工具白名单。

## stdio 还是 http

http 适合远端服务，不需要本机装任何东西。

stdio 适合本地进程：服务端 fork 一个子进程，通过标准输入输出通信。命令写 node 或 python，参数是脚本路径或包名。Windows 上 npx 要写成 npx.cmd。

## 为什么要有 modelHint

模型选择工具时只能看到名字和描述。多个服务并存时，描述太抽象就会选错。

modelHint 写的是「什么时候用我」，比如「查 API 用法」还是「查源码实现」，这比让模型自己猜有效得多。
