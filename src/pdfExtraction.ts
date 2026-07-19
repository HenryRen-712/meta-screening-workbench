import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type ExtractionEvidenceStatus = "found" | "not_found";

export type ExtractionEvidenceRecord = {
  status: ExtractionEvidenceStatus;
  value: string;
  evidence: string[];
  pages: number[];
  source: "pdf-local-deterministic";
  extractedAt: string;
};

export type AutoExtractionRecord = {
  status: "draft_needs_review" | "no_text" | "error";
  extractedAt: string;
  pdfAttachmentId: string;
  pdfSha256: string;
  pagesProcessed: number;
  textCharacters: number;
  fieldsFound: number;
  fieldsTotal: number;
  warnings: string[];
};

export type PdfExtractionResult = {
  evidenceByField: Record<string, ExtractionEvidenceRecord>;
  run: AutoExtractionRecord;
};

export type PdfExtractionReference = {
  title: string;
  abstract: string;
};

type PdfPageText = {
  page: number;
  text: string;
};

type EvidenceFragment = {
  page: number;
  text: string;
  score: number;
};

type ExtractionRule = {
  field: string;
  patterns: RegExp[];
  context?: RegExp[];
  limit?: number;
};

export const META_EXTRACTION_FIELD_GROUPS = [
  {
    label: "研究识别与设计",
    fields: ["研究设计", "国家/地区", "数据来源/队列名称", "研究场景", "招募/研究期间", "随访时间"]
  },
  {
    label: "研究对象",
    fields: ["样本量", "病例/事件数", "年龄", "性别构成", "研究对象", "纳入标准", "排除标准", "基线疾病状态"]
  },
  {
    label: "刷牙暴露",
    fields: ["暴露/干预", "刷牙行为定义", "暴露分组", "对照", "暴露测量方法", "其他口腔卫生行为"]
  },
  {
    label: "结局",
    fields: ["结局类别", "结局指标", "结局定义", "结局测量/判定方法"]
  },
  {
    label: "Meta 效应数据",
    fields: ["效应量类型", "效应量", "原始频数/可计算数据", "统计模型", "调整变量", "亚组/交互作用", "剂量反应/趋势", "敏感性分析"]
  },
  {
    label: "完整性与报告",
    fields: ["缺失数据/失访", "主要结论", "局限性", "资金来源", "利益冲突", "伦理审批", "重复队列/人群重叠提示"]
  }
] as const;

export const META_EXTRACTION_FIELDS = META_EXTRACTION_FIELD_GROUPS.flatMap((group) => [...group.fields]);

const rules: ExtractionRule[] = [
  {
    field: "研究设计",
    patterns: [
      /\b(?:prospective|retrospective|longitudinal|nationwide|population[- ]based)\s+(?:cohort|study)/i,
      /\bcase[- ]control\s+study\b/i,
      /\bcross[- ]sectional\s+study\b/i,
      /\bcohort\s+study\b/i,
      /\bmatched\s+case[- ]control\b/i,
      /病例对照研究|队列研究|横断面研究|纵向研究|回顾性研究|前瞻性研究/
    ],
    limit: 2
  },
  {
    field: "国家/地区",
    patterns: [
      /\b(?:China|Chinese|Japan|Japanese|Korea|Korean|Taiwan|India|Indian|Pakistan|Iran|Saudi Arabia|Romania|Finland|Sweden|Denmark|Norway|United States|USA|United Kingdom|UK|Canada|Australia|Brazil|Mexico|Nigeria|South Africa|Turkey|France|Germany|Italy|Spain|Netherlands)\b/i,
      /中国|日本|韩国|中国台湾|印度|巴基斯坦|伊朗|沙特阿拉伯|罗马尼亚|芬兰|瑞典|丹麦|挪威|美国|英国|加拿大|澳大利亚|巴西|墨西哥|尼日利亚|南非|土耳其|法国|德国|意大利|西班牙|荷兰/
    ],
    context: [/study|cohort|survey|database|population|participants|patients|residents|研究|队列|调查|数据库|人群|患者/i],
    limit: 2
  },
  {
    field: "数据来源/队列名称",
    patterns: [
      /\b(?:cohort|registry|claims database|health insurance|national health|biobank|consortium|survey|database)\b/i,
      /队列|登记系统|医保数据库|健康保险|生物样本库|联盟|全国调查|数据库/
    ],
    context: [/data|participants|subjects|enrolled|included|derived|using|study|数据|参与者|纳入|来源|研究/i],
    limit: 4
  },
  {
    field: "研究场景",
    patterns: [/\b(?:hospital|clinic|community|population[- ]based|nationwide|multicenter|multi[- ]centre|primary care)\b/i, /医院|门诊|社区|人群基础|全国|多中心|基层医疗/],
    context: [/study|participants|patients|subjects|conducted|研究|参与者|患者|开展/i],
    limit: 3
  },
  {
    field: "招募/研究期间",
    patterns: [
      /\b(?:between|from|during)\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|\d{4})[^.;。]{0,90}\d{4}\b/i,
      /\b(?:19|20)\d{2}\s*(?:-|–|—|to)\s*(?:19|20)\d{2}\b/i,
      /(?:19|20)\d{2}\s*年[^。；;]{0,40}(?:19|20)\d{2}\s*年/
    ],
    context: [/recruit|enrol|study|baseline|data|conduct|招募|纳入|研究|基线|数据/i],
    limit: 3
  },
  {
    field: "随访时间",
    patterns: [/\bfollow[- ]?up\b/i, /\bmedian\s+(?:observation|follow[- ]?up)/i, /随访|观察期/],
    context: [/year|month|day|median|mean|range|年|月|天|中位|平均|范围/i],
    limit: 4
  },
  {
    field: "样本量",
    patterns: [
      /\b(?:n\s*=\s*)?\d[\d, ]*\s+(?:participants|patients|subjects|individuals|adults|men|women)\b/i,
      /\b(?:included|enrolled|recruited|analyzed|analysed)\s+(?:a\s+total\s+of\s+)?\d[\d, ]*\s+(?:participants|patients|subjects|individuals|adults)\b/i,
      /(?:共|纳入|招募|分析)\s*\d[\d,， ]*\s*(?:名|例|人)/
    ],
    limit: 4
  },
  {
    field: "病例/事件数",
    patterns: [
      /\b\d[\d, ]*\s+(?:incident\s+)?(?:cases|events|deaths|cancers|strokes|outcomes)\b/i,
      /\b(?:cases|events)\s*\(?n\s*=\s*\d[\d, ]*/i,
      /\d[\d,， ]*\s*(?:例病例|例事件|例癌症|例卒中)/
    ],
    limit: 5
  },
  {
    field: "年龄",
    patterns: [/\b(?:mean|median)\s+age\b/i, /\bage[d]?\s+(?:between|range|≥|>|<|from)\b/i, /平均年龄|中位年龄|年龄范围|年龄为/],
    context: [/year|years|yr|岁/i],
    limit: 3
  },
  {
    field: "性别构成",
    patterns: [/\b(?:male|female|men|women|sex|gender)\b/i, /男性|女性|男|女|性别/],
    context: [/%|percent|proportion|n\s*=|例|名|人|比例|构成/i],
    limit: 3
  },
  {
    field: "研究对象",
    patterns: [
      /\b(?:included|enrolled|recruited|analyzed|analysed)\b[^.;。]{0,100}\b\d[\d, ]*\s+(?:participants|patients|subjects|individuals|adults|residents|employees)\b/i,
      /\beligible\b[^.;。]{0,140}\b(?:participants|patients|subjects|individuals|adults|residents|employees)\b/i,
      /\b(?:participants|patients|subjects|individuals|adults)\s+(?:aged|with an age|who were|from)\b/i,
      /(?:纳入|招募|符合条件的)\s*[^。；;]{0,120}(?:参与者|患者|研究对象|受试者|居民|成人|职工)/
    ],
    limit: 4
  },
  {
    field: "纳入标准",
    patterns: [/\b(?:inclusion criteria|eligible participants|eligibility criteria|were eligible|participants were included)\b/i, /纳入标准|入选标准|符合条件|纳入对象/],
    limit: 4
  },
  {
    field: "排除标准",
    patterns: [/\b(?:exclusion criteria|were excluded|we excluded|participants were excluded)\b/i, /排除标准|剔除标准|予以排除|排除了/],
    limit: 4
  },
  {
    field: "基线疾病状态",
    patterns: [/\b(?:at baseline|baseline)\b/i, /基线时|基线疾病|研究开始时/],
    context: [/diabet|cardiovascular|stroke|cancer|COPD|kidney|CKD|disease|free of|without|糖尿病|心血管|卒中|癌|慢阻肺|肾病|无|未患/i],
    limit: 4
  },
  {
    field: "暴露/干预",
    patterns: [/\b(?:toothbrushing|tooth brushing|brush(?:ed|ing)? (?:the |their )?teeth|oral hygiene behavior|oral hygiene practice|miswak|chewing stick)\b/i, /刷牙|口腔卫生行为|洁牙行为|牙刷|咀嚼棒/],
    limit: 6
  },
  {
    field: "刷牙行为定义",
    patterns: [/\b(?:toothbrushing|tooth brushing|brush(?:ed|ing)? (?:the |their )?teeth)\b/i, /刷牙/],
    context: [/frequency|times|daily|day|week|questionnaire|self[- ]report|频率|次数|每天|每日|每周|问卷|自报/i],
    limit: 6
  },
  {
    field: "暴露分组",
    patterns: [
      /(?:≤|≥|<|>)\s*\d+(?:\.\d+)?\s*(?:times?|次)?\s*(?:per|\/)?\s*(?:day|week|日|天|周)/i,
      /\b(?:never|once|twice|three or more times|less than|more than)\b[^.;。]{0,90}\b(?:brush|toothbrushing)/i,
      /刷牙[^。；;]{0,100}(?:不刷|1次|2次|3次|一次|两次|三次|少于|多于|以上|以下)/
    ],
    limit: 6
  },
  {
    field: "对照",
    patterns: [/\b(?:reference group|referent group|reference category|comparison group)\b/i, /参照组|参考组|对照组/],
    limit: 4
  },
  {
    field: "暴露测量方法",
    patterns: [/\b(?:questionnaire|interview|self[- ]report(?:ed)?|survey question|health examination)\b/i, /问卷|访谈|自我报告|自报|调查问题|健康检查/],
    context: [/tooth|brush|oral hygiene|exposure|刷牙|口腔卫生|暴露/i],
    limit: 4
  },
  {
    field: "其他口腔卫生行为",
    patterns: [/\b(?:dental floss|interdental brush|mouthwash|dental visit|professional dental cleaning|scaling|denture|miswak)\b/i, /牙线|间隙刷|漱口水|牙科就诊|专业洁治|洗牙|义齿|咀嚼棒/],
    limit: 5
  },
  {
    field: "结局类别",
    patterns: [/\b(?:diabetes|hyperglyc|cardiovascular disease|coronary|myocardial infarction|stroke|COPD|chronic obstructive|cancer|carcinoma|chronic kidney disease|CKD)\b/i, /糖尿病|高血糖|心血管|冠心病|心肌梗死|卒中|脑血管|慢性阻塞性肺|慢阻肺|癌|肿瘤|慢性肾脏病|慢性肾病/],
    context: [/inciden|risk|develop|diagnos|outcome|new[- ]onset|发生|风险|诊断|结局|新发/i],
    limit: 6
  },
  {
    field: "结局指标",
    patterns: [/\b(?:primary outcome|secondary outcome|study outcome|endpoint|incident|new[- ]onset)\b/i, /主要结局|次要结局|研究结局|终点|新发|发生率/],
    context: [/diabet|cardiovascular|stroke|COPD|cancer|kidney|CKD|糖尿病|心血管|卒中|慢阻肺|癌|肾病/i],
    limit: 6
  },
  {
    field: "结局定义",
    patterns: [/\b(?:defined as|definition of|was defined|diagnostic criteria|criteria for)\b/i, /定义为|诊断标准|判定标准|结局定义/],
    context: [/outcome|disease|diabet|stroke|cancer|kidney|结局|疾病|糖尿病|卒中|癌|肾病/i],
    limit: 5
  },
  {
    field: "结局测量/判定方法",
    patterns: [/\b(?:medical record|claims data|registry|laboratory|fasting glucose|HbA1c|ICD[- ]?10|death certificate|patholog|self[- ]report)\b/i, /病历|理赔数据|登记系统|实验室|空腹血糖|糖化血红蛋白|疾病编码|病理|自报/],
    context: [/outcome|diagnos|ascertain|identify|结局|诊断|判定|识别/i],
    limit: 5
  },
  {
    field: "效应量类型",
    patterns: [/\b(?:odds ratio|hazard ratio|risk ratio|rate ratio|relative risk|OR|HR|RR|IRR|beta coefficient|regression coefficient)\b/i, /比值比|优势比|风险比|危险比|相对危险度|回归系数|效应量/],
    context: [/confidence interval|95\s*%|CI|adjust|model|置信区间|调整|模型/i],
    limit: 6
  },
  {
    field: "效应量",
    patterns: [
      /\b(?:a?OR|a?HR|a?RR|IRR|odds ratio|hazard ratio|risk ratio|relative risk)\s*(?:=|of|:)?\s*\d+(?:\.\d+)?/i,
      /\b95\s*%\s*(?:CI|confidence interval)\b/i,
      /(?:OR|HR|RR|比值比|风险比|危险比)[为=：:]?\s*\d+(?:\.\d+)?/i,
      /95\s*%\s*置信区间/
    ],
    context: [/tooth|brush|oral hygiene|刷牙|口腔卫生/i],
    limit: 7
  },
  {
    field: "原始频数/可计算数据",
    patterns: [/\b(?:cases? and controls?|events? in|number of events|event rate|contingency table|2\s*[x×]\s*2)\b/i, /病例和对照|事件数|发生例数|发生率|四格表|2\s*[x×]\s*2/],
    context: [/\d|n\s*=/i],
    limit: 6
  },
  {
    field: "统计模型",
    patterns: [/\b(?:logistic regression|Cox proportional hazards?|Poisson regression|linear regression|generalized linear|conditional logistic|competing risk)\b/i, /Logistic回归|逻辑回归|Cox比例风险|泊松回归|线性回归|广义线性|条件Logistic|竞争风险/],
    limit: 5
  },
  {
    field: "调整变量",
    patterns: [/\b(?:adjusted for|after adjustment for|covariates included|multivariable model|fully adjusted)\b/i, /调整了|校正了|协变量|多变量模型|完全调整/],
    limit: 8
  },
  {
    field: "亚组/交互作用",
    patterns: [/\b(?:subgroup|stratified|interaction|effect modification|P for interaction)\b/i, /亚组|分层分析|交互作用|效应修饰|交互检验/],
    limit: 6
  },
  {
    field: "剂量反应/趋势",
    patterns: [/\b(?:dose[- ]response|P for trend|trend test|linear trend)\b/i, /剂量反应|趋势检验|P趋势|线性趋势/],
    limit: 5
  },
  {
    field: "敏感性分析",
    patterns: [/\b(?:sensitivity analysis|robustness analysis|excluding|restricted to)\b/i, /敏感性分析|稳健性分析|排除.+后|限制于/],
    context: [/result|estimate|association|analysis|结果|估计|关联|分析/i],
    limit: 5
  },
  {
    field: "缺失数据/失访",
    patterns: [/\b(?:missing data|missing values|lost to follow[- ]?up|loss to follow[- ]?up|complete case|multiple imputation)\b/i, /缺失数据|缺失值|失访|完整病例|多重插补/],
    limit: 5
  },
  {
    field: "主要结论",
    patterns: [/\b(?:in conclusion|we conclude|our findings suggest|these findings indicate)\b/i, /综上|结论是|研究结果提示|结果表明/],
    context: [/tooth|brush|oral hygiene|刷牙|口腔卫生/i],
    limit: 4
  },
  {
    field: "局限性",
    patterns: [/\b(?:limitation|limitations of this study|should be interpreted with caution)\b/i, /局限性|本研究的局限|谨慎解释/],
    limit: 5
  },
  {
    field: "资金来源",
    patterns: [/\b(?:funding|financial support|supported by|grant number|funder)\b/i, /资金来源|基金资助|资助方|项目资助|基金号/],
    limit: 4
  },
  {
    field: "利益冲突",
    patterns: [/\b(?:conflict of interest|competing interests?|disclosure statement)\b/i, /利益冲突|竞争性利益|利益声明/],
    limit: 4
  },
  {
    field: "伦理审批",
    patterns: [/\b(?:ethics committee|institutional review board|IRB approval|ethical approval|informed consent)\b/i, /伦理委员会|机构审查委员会|伦理批准|知情同意/],
    limit: 4
  },
  {
    field: "重复队列/人群重叠提示",
    patterns: [/\b(?:previously reported|same cohort|overlapping population|overlap(?:ping)? participants|duplicate publication)\b/i, /既往报道|同一队列|人群重叠|样本重叠|重复发表/],
    limit: 4
  }
];

export async function extractMetaEvidenceFromPdf(
  blob: Blob,
  attachmentId: string,
  reference: PdfExtractionReference
): Promise<PdfExtractionResult> {
  const extractedAt = new Date().toISOString();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const pdfSha256 = await sha256(bytes);
  const pages = trimReferenceSection(await extractPdfPages(bytes));
  const textCharacters = pages.reduce((total, page) => total + page.text.length, 0);

  if (textCharacters < 300) {
    return {
      evidenceByField: Object.fromEntries(META_EXTRACTION_FIELDS.map((field) => [field, notFoundRecord(extractedAt)])),
      run: {
        status: "no_text",
        extractedAt,
        pdfAttachmentId: attachmentId,
        pdfSha256,
        pagesProcessed: pages.length,
        textCharacters,
        fieldsFound: 0,
        fieldsTotal: META_EXTRACTION_FIELDS.length,
        warnings: ["PDF 未提取到足够文本；可能为扫描版、受保护文件或文字编码异常，未生成任何推断值。"]
      }
    };
  }

  const evidenceByField: Record<string, ExtractionEvidenceRecord> = {};
  const titleTokens = tokenSet(`${reference.title} ${reference.abstract}`);

  for (const rule of rules) {
    const fragments = findEvidenceFragments(pages, rule, titleTokens);
    evidenceByField[rule.field] = fragments.length
      ? foundRecord(fragments, extractedAt)
      : notFoundRecord(extractedAt);
  }

  const fieldsFound = Object.values(evidenceByField).filter((record) => record.status === "found").length;
  return {
    evidenceByField,
    run: {
      status: "draft_needs_review",
      extractedAt,
      pdfAttachmentId: attachmentId,
      pdfSha256,
      pagesProcessed: pages.length,
      textCharacters,
      fieldsFound,
      fieldsTotal: META_EXTRACTION_FIELDS.length,
      warnings: [
        "自动结果仅由 PDF 原文规则定位生成，属于待人工核验草稿；未进行语义补写、数值换算或缺失信息推断。",
        "表格跨行、图片、扫描页和附录中的数据可能无法完整识别；用于 Meta 前必须回看原文和表格。"
      ]
    }
  };
}

async function extractPdfPages(bytes: Uint8Array): Promise<PdfPageText[]> {
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const document = await loadingTask.promise;
  const pages: PdfPageText[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let line = "";

      for (const rawItem of content.items) {
        const item = rawItem as { str?: string; hasEOL?: boolean };
        if (item.str) line += `${line ? " " : ""}${item.str}`;
        if (item.hasEOL && line.trim()) {
          lines.push(line.trim());
          line = "";
        }
      }
      if (line.trim()) lines.push(line.trim());
      pages.push({ page: pageNumber, text: lines.join("\n") });
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }

  return pages;
}

function trimReferenceSection(pages: PdfPageText[]) {
  const retained: PdfPageText[] = [];
  for (const page of pages) {
    const referenceHeading = /(?:^|\n)\s*(?:references|bibliography|参考文献)\s*(?:\n|$)/i.exec(page.text);
    if (!referenceHeading || retained.length < 2) {
      retained.push(page);
      continue;
    }
    const beforeReferences = page.text.slice(0, referenceHeading.index).trim();
    if (beforeReferences.length > 120) retained.push({ ...page, text: beforeReferences });
    break;
  }
  return retained;
}

function findEvidenceFragments(pages: PdfPageText[], rule: ExtractionRule, titleTokens: Set<string>) {
  const candidates: EvidenceFragment[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    for (const fragment of pageFragments(page.text)) {
      const matchedPatterns = rule.patterns.filter((pattern) => pattern.test(fragment));
      if (!matchedPatterns.length) continue;
      if (rule.context?.length && !rule.context.some((pattern) => pattern.test(fragment))) continue;

      const key = normalizeForDedup(fragment);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const overlap = [...tokenSet(fragment)].filter((token) => titleTokens.has(token)).length;
      const sectionBonus = /method|result|participant|analysis|conclusion|方法|结果|对象|分析|结论/i.test(fragment) ? 2 : 0;
      candidates.push({
        page: page.page,
        text: compactFragment(fragment, matchedPatterns[0]),
        score: matchedPatterns.length * 4 + sectionBonus + Math.min(overlap, 4) - page.page * 0.01
      });
    }
  }

  return distinctFragments(candidates
    .sort((left, right) => right.score - left.score || right.text.length - left.text.length || left.page - right.page), rule.limit || 4)
    .sort((left, right) => left.page - right.page);
}

function distinctFragments(candidates: EvidenceFragment[], limit: number) {
  const selected: EvidenceFragment[] = [];
  for (const candidate of candidates) {
    const candidateText = normalizeForDedup(candidate.text);
    const overlaps = selected.some((existing) => {
      const existingText = normalizeForDedup(existing.text);
      return candidateText.includes(existingText) || existingText.includes(candidateText);
    });
    if (!overlaps) selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

function pageFragments(text: string) {
  const withSentenceBreaks = text.replace(/([.!?。！？；;])\s+/g, "$1\n");
  const lines = withSentenceBreaks.split(/\n+/).map(cleanText).filter((line) => line.length >= 18);
  const fragments = [...lines];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const combined = `${lines[index]} ${lines[index + 1]}`;
    if (combined.length <= 1200) fragments.push(combined);
  }

  return fragments;
}

function compactFragment(fragment: string, matchedPattern: RegExp) {
  const cleanFragment = cleanText(fragment);
  if (cleanFragment.length <= 520) return cleanFragment;
  const matchIndex = cleanFragment.search(matchedPattern);
  const start = Math.max(0, matchIndex - 180);
  const end = Math.min(cleanFragment.length, start + 520);
  return `${start > 0 ? "…" : ""}${cleanFragment.slice(start, end)}${end < cleanFragment.length ? "…" : ""}`;
}

function foundRecord(fragments: EvidenceFragment[], extractedAt: string): ExtractionEvidenceRecord {
  const evidence = fragments.map((fragment) => `[PDF第${fragment.page}页] ${fragment.text}`);
  return {
    status: "found",
    value: evidence.join("\n"),
    evidence,
    pages: [...new Set(fragments.map((fragment) => fragment.page))],
    source: "pdf-local-deterministic",
    extractedAt
  };
}

function notFoundRecord(extractedAt: string): ExtractionEvidenceRecord {
  return {
    status: "not_found",
    value: "",
    evidence: [],
    pages: [],
    source: "pdf-local-deterministic",
    extractedAt
  };
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForDedup(value: string) {
  return cleanText(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 360);
}

function tokenSet(value: string) {
  return new Set(
    value
      .toLowerCase()
      .match(/[a-z][a-z0-9-]{2,}|[\p{Script=Han}]{2,}/gu)
      ?.filter((token) => !stopTokens.has(token)) || []
  );
}

const stopTokens = new Set(["the", "and", "with", "from", "this", "that", "study", "were", "was", "for", "between", "研究", "结果", "分析", "患者", "人群"]);

async function sha256(bytes: Uint8Array) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
