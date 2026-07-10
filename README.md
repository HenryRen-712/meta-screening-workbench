# Meta 文献筛选工作台

这是一个系统综述 / Meta 分析文献筛选工具。第一版参考 Rayyan 的核心流程，重点覆盖题录导入、去重、双人盲筛、揭盲冲突、第三人裁决、全文复筛、数据提取和导出。

## 使用

### 在线使用

项目已支持部署为静态网站。部署到 GitHub Pages、Netlify、Vercel 或 Cloudflare Pages 后，只要联网就可以直接打开网址使用。

部署说明见：

```text
docs/07-在线部署.md
```

线上部署后，数据仍保存在当前浏览器中。正式筛选时必须定期导出“项目备份” JSON。

### 本地开发

启动后打开：

http://127.0.0.1:5173/

如果服务关闭了，在这个文件夹中运行：

```bash
PATH="/Users/gavinren/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gavinren/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH" pnpm dev
```

## 第一版功能

- 项目资料：综述题目、研究问题、数据库来源、检索日期、筛选者和裁决者。
- 题录导入：支持 RIS、BibTeX、CSV；中文数据库建议先使用页面里的 CSV 模板。
- 去重：按 DOI、PMID、标题识别可能重复，并支持保留或移除。
- 双人盲筛：筛选者 A/B 独立完成纳入、排除、待定。
- 揭盲冲突：两人完成后查看冲突，由裁决者给出最终决定。
- 全文复筛：记录全文获取状态、PDF 本机路径、全文决定和排除理由。
- 数据提取：最终纳入文献进入自定义数据提取表。
- 审计日志：记录导入、筛选、裁决、全文复筛和数据提取操作。
- 导出：完整筛选记录 CSV、PRISMA 统计 CSV、数据提取表 CSV、Word 报告草稿、项目 JSON 备份。

## 数据保存

项目数据默认保存在本机浏览器中。正式项目建议定期点击“项目备份”，导出 JSON 文件保存到项目文件夹。

## 第一版限制

- 不做云同步和多人在线协作。
- 不做 AI 自动预筛。
- 不做 Meta 统计计算、森林图和异质性分析。
- 不内置复杂 PDF 阅读器，只记录 PDF 在本机的位置。
- 质量评价模块暂时预留，不内置 NOS、JBI 或 RoB 量表。
