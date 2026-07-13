import React from "react";
import ReactDOM from "react-dom/client";
import {
  Archive,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
  FileDown,
  FileSpreadsheet,
  FileText,
  Filter,
  FolderOpen,
  History,
  Import,
  ListChecks,
  Plus,
  Search,
  ShieldCheck,
  Split,
  Table2,
  Trash2,
  UploadCloud,
  Users
} from "lucide-react";
import "./styles.css";

type Role = "reviewerA" | "reviewerB" | "adjudicator";
type Stage = "titleAbstract" | "conflicts" | "fullText" | "extraction" | "exports" | "audit";
type Decision = "include" | "maybe" | "exclude";
type FullTextStatus = "notStarted" | "needed" | "retrieved" | "unavailable";

type ReviewProject = {
  id: string;
  title: string;
  question: string;
  databases: string[];
  searchDate: string;
  reviewerA: string;
  reviewerB: string;
  adjudicator: string;
  exclusionReasons: string[];
  extractionFields: string[];
  references: ReferenceRecord[];
  auditLog: AuditEntry[];
  createdAt: string;
  updatedAt: string;
  blindingRevealed: boolean;
};

type ReferenceRecord = {
  id: string;
  title: string;
  abstract: string;
  authors: string;
  year: string;
  journal: string;
  doi: string;
  pmid: string;
  database: string;
  keywords: string;
  sourceFile: string;
  duplicateGroupId?: string;
  duplicateStatus: "unique" | "possible" | "resolvedRemoved" | "resolvedKept";
  decisions: Partial<Record<Role, ScreeningDecision>>;
  adjudication?: ScreeningDecision;
  fullText: FullTextReview;
  extraction: Record<string, string>;
  translation?: ReferenceTranslation;
  notes: string;
};

type ReferenceTranslation = {
  titleZh?: string;
  abstractZh?: string;
  updatedAt?: string;
};

type ScreeningDecision = {
  decision: Decision;
  reason: string;
  note: string;
  decidedBy: Role;
  decidedAt: string;
};

type FullTextReview = {
  status: FullTextStatus;
  pdfPath: string;
  decision: Decision | "";
  reason: string;
  note: string;
  reviewedAt: string;
};

type AuditEntry = {
  id: string;
  at: string;
  actor: Role;
  action: string;
  target: string;
  detail: string;
};

type FilterState = {
  query: string;
  decision: "all" | "unscreened" | Decision;
  duplicate: "all" | "possible" | "resolved" | "unique";
};

type ProjectStats = {
  total: number;
  duplicates: number;
  reviewerA: number;
  reviewerB: number;
  conflicts: number;
  finalIncluded: number;
  excluded: number;
  maybe: number;
  fullTextIncluded: number;
};

const STORAGE_KEY = "meta_screening_project_v1";
const STORAGE_META_KEY = `${STORAGE_KEY}_meta`;
const STORAGE_DB_NAME = "meta_screening_project_db";
const STORAGE_STORE_NAME = "projects";
const STORAGE_PROJECT_ID = "active";
const SCREENING_PAGE_SIZE = 100;
const REVIEW_PAGE_SIZE = 40;
const AUDIT_PAGE_SIZE = 80;
const LARGE_PROJECT_REFERENCE_COUNT = 5000;
const AUTOSAVE_DELAY_MS = 2500;
const MAX_LOCAL_STORAGE_BACKUP_BYTES = 4 * 1024 * 1024;
const roleLabels: Record<Role, string> = {
  reviewerA: "筛选者 A",
  reviewerB: "筛选者 B",
  adjudicator: "裁决者"
};

const decisionLabels: Record<Decision, string> = {
  include: "纳入",
  maybe: "待定",
  exclude: "排除"
};

const fullTextStatusLabels: Record<FullTextStatus, string> = {
  notStarted: "未开始",
  needed: "需获取",
  retrieved: "已获取",
  unavailable: "无法获取"
};

const defaultReasons = [
  "研究对象不符合",
  "暴露/干预不符合",
  "结局指标不符合",
  "研究设计不符合",
  "重复发表",
  "非原始研究",
  "无可用全文",
  "数据不足"
];

const defaultExtractionFields = [
  "研究设计",
  "国家/地区",
  "样本量",
  "研究对象",
  "暴露/干预",
  "对照",
  "结局指标",
  "效应量",
  "调整变量",
  "主要结论"
];

const coreHeaderNames = new Set([
  "标题",
  "题名",
  "文献题名",
  "篇名",
  "articletitle",
  "title",
  "作者",
  "姓名",
  "author",
  "authors",
  "creator",
  "刊名",
  "期刊",
  "文献来源",
  "source文献来源",
  "journal",
  "journalbook",
  "sourcetitle",
  "publication",
  "年份",
  "年",
  "出版年",
  "发表年份",
  "publicationyear",
  "year"
]);

const knownHeaderNames = new Set([
  ...coreHeaderNames,
  "摘要",
  "文摘",
  "abstract",
  "abstracts",
  "abstractnote",
  "articleabstract",
  "englishabstract",
  "summary",
  "description",
  "ab",
  "n2",
  "关键词",
  "keywords",
  "keyword",
  "authorkeywords",
  "keywordsplus",
  "doi",
  "pmid",
  "pubmedid",
  "来源",
  "来源数据库",
  "数据库",
  "database",
  "source",
  "卷",
  "volume",
  "期",
  "issue",
  "页码",
  "pages",
  "url",
  "文献类型",
  "documenttype",
  "会议",
  "conference",
  "学位",
  "degree",
  "thesis",
  "dissertation",
  "出版日期",
  "publicationdate"
]);

const abstractFieldNames = [
  "摘要",
  "文摘",
  "文　摘",
  "abstract",
  "abstracts",
  "abstract note",
  "abstract_note",
  "abstract-note",
  "article abstract",
  "english abstract",
  "summary",
  "description",
  "description abstract",
  "record abstract",
  "AB",
  "N2"
];

type ProjectIndex = {
  byId: Map<string, ReferenceRecord>;
  conflicts: ReferenceRecord[];
  finalIncluded: ReferenceRecord[];
  fullTextCandidates: ReferenceRecord[];
  stats: ProjectStats;
};

function App() {
  const [project, setProject] = React.useState<ReviewProject>(readProject);
  const projectRef = React.useRef(project);
  const [role, setRole] = React.useState<Role>("reviewerA");
  const [stage, setStage] = React.useState<Stage>("titleAbstract");
  const [activeId, setActiveId] = React.useState<string>(() => project.references[0]?.id || "");
  const [filters, setFilters] = React.useState<FilterState>({ query: "", decision: "all", duplicate: "all" });
  const [message, setMessage] = React.useState("项目已保存在本机浏览器，可随时导出备份。");
  const [storageReady, setStorageReady] = React.useState(false);
  const [storageStatus, setStorageStatus] = React.useState("正在检查本机保存状态");
  const [abstractEnrichmentRunning, setAbstractEnrichmentRunning] = React.useState(false);
  const deferredFilters = React.useDeferredValue(filters);

  React.useEffect(() => {
    projectRef.current = project;
  }, [project]);

  React.useEffect(() => {
    let cancelled = false;
    readProjectFromIndexedDb()
      .then((stored) => {
        if (cancelled) return;
        const localProject = readProjectFromLocalStorage();
        const projectToRestore = chooseStartupProject(stored, localProject);
        if (projectToRestore) {
          projectRef.current = projectToRestore;
          setProject(projectToRestore);
          setActiveId(projectToRestore.references[0]?.id || "");
          setMessage("已从本机数据库恢复最近保存的项目。");
        }
        setStorageReady(true);
        setStorageStatus("本机数据库自动保存已启用");
      })
      .catch(() => {
        if (cancelled) return;
        setStorageReady(true);
        setStorageStatus("本机数据库不可用，需更频繁导出 JSON 备份");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!storageReady) return;
    const timer = window.setTimeout(() => {
      persistProjectNow(project)
        .catch(() => {
          setStorageStatus("自动保存失败，请立即导出项目备份");
        });
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [project, storageReady]);

  React.useEffect(() => {
    function persistLatestProject() {
      void saveProjectToBrowserStorage(projectRef.current);
    }

    function persistWhenHidden() {
      if (document.visibilityState === "hidden") persistLatestProject();
    }

    window.addEventListener("pagehide", persistLatestProject);
    document.addEventListener("visibilitychange", persistWhenHidden);
    return () => {
      window.removeEventListener("pagehide", persistLatestProject);
      document.removeEventListener("visibilitychange", persistWhenHidden);
    };
  }, []);

  async function persistProjectNow(projectToSave: ReviewProject) {
    const result = await saveProjectToBrowserStorage(projectToSave);
    setStorageStatus(saveResultMessage(result));
    return result;
  }

  const projectIndex = React.useMemo(() => buildProjectIndex(project.references), [project.references]);
  const visibleReferences = React.useMemo(
    () => applyFilters(project.references, deferredFilters, role),
    [project.references, deferredFilters, role]
  );
  const active = projectIndex.byId.get(activeId) || visibleReferences[0] || project.references[0] || null;
  const { conflicts, finalIncluded, fullTextCandidates, stats } = projectIndex;
  const missingAbstractWithPmidCount = React.useMemo(
    () => project.references.filter((reference) => !reference.abstract && normalizePmid(reference.pmid)).length,
    [project.references]
  );

  React.useEffect(() => {
    const activeReference = projectIndex.byId.get(activeId);
    if (visibleReferences.length && (!activeReference || !referenceMatchesFilters(activeReference, deferredFilters, role))) {
      setActiveId(visibleReferences[0].id);
    }
  }, [activeId, deferredFilters, projectIndex.byId, role, visibleReferences]);

  function updateProject(updater: (current: ReviewProject) => ReviewProject) {
    setProject((current) => {
      const nextProject = { ...updater(current), updatedAt: nowIso() };
      projectRef.current = nextProject;
      return nextProject;
    });
  }

  function updateReference(referenceId: string, updater: (reference: ReferenceRecord) => ReferenceRecord, actor: Role, action: string, detail: string) {
    updateProject((current) => {
      const target = current.references.find((reference) => reference.id === referenceId);
      if (!target) return current;
      return logProject({
        ...current,
        references: replaceReference(current.references, referenceId, updater)
      }, actor, action, target.title || "文献", detail);
    });
  }

  function updateReferenceTranslation(referenceId: string, patch: Partial<ReferenceTranslation>) {
    updateProject((current) => ({
      ...current,
      references: replaceReference(current.references, referenceId, (reference) => ({
        ...reference,
        translation: {
          ...reference.translation,
          ...patch,
          updatedAt: nowIso()
        }
      }))
    }));
  }

  function createNewProject() {
    const confirmed = window.confirm("创建新项目会替换当前本机项目。请先导出备份后再继续。确定创建吗？");
    if (!confirmed) return;
    const next = createSeedProject(false);
    projectRef.current = next;
    setProject(next);
    setActiveId("");
    setStage("titleAbstract");
    setMessage("已创建空白项目。");
    void persistProjectNow(next);
  }

  function updateProjectInfo(key: keyof Pick<ReviewProject, "title" | "question" | "searchDate" | "reviewerA" | "reviewerB" | "adjudicator">, value: string) {
    updateProject((current) => logProject({
      ...current,
      [key]: value
    }, role, "更新项目资料", "项目", `${String(key)} 已更新`));
  }

  function addDatabase(value: string) {
    const clean = value.trim();
    if (!clean || project.databases.includes(clean)) return;
    updateProject((current) => logProject({
      ...current,
      databases: [...current.databases, clean]
    }, role, "添加数据库", clean, "项目检索来源已更新"));
  }

  function removeDatabase(database: string) {
    updateProject((current) => logProject({
      ...current,
      databases: current.databases.filter((item) => item !== database)
    }, role, "移除数据库", database, "项目检索来源已更新"));
  }

  async function importFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const imported: ReferenceRecord[] = [];
    const errors: string[] = [];
    const files = Array.from(fileList);

    setMessage(`正在读取 ${files.length} 个题录文件，大文件导入时请不要关闭页面。`);
    await yieldToBrowser();

    for (const [fileIndex, file] of files.entries()) {
      try {
        const text = await file.text();
        setMessage(`正在解析 ${file.name}（${fileIndex + 1}/${files.length}）。`);
        await yieldToBrowser();
        const records = parseReferenceFile(file.name, text);
        imported.push(...records);
        await yieldToBrowser();
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : "无法读取"}`);
      }
    }

    if (!imported.length) {
      setMessage(errors.length ? errors.join("；") : "没有识别到可导入的题录。");
      return;
    }

    setMessage(`已识别 ${imported.length} 条题录，正在合并并重算重复记录。`);
    await yieldToBrowser();

    let importedForMerge = imported;
    let abstractEnrichmentDetail = "";
    const missingImportedAbstracts = imported.filter((reference) => !reference.abstract && normalizePmid(reference.pmid)).length;
    if (missingImportedAbstracts) {
      setMessage(`已识别 ${imported.length} 条题录，正在尝试从 PubMed 补全 ${missingImportedAbstracts} 条缺失摘要。`);
      const enrichment = await enrichMissingPubMedAbstracts(imported, (completed, total) => {
        setMessage(`正在从 PubMed 补全摘要：${completed}/${total} 批。`);
      });
      importedForMerge = enrichment.references;
      abstractEnrichmentDetail = enrichment.enriched ? `，PubMed 补全摘要 ${enrichment.enriched} 条` : "，未从 PubMed 补到新增摘要";
    }

    const merged = [...projectRef.current.references, ...importedForMerge];
    const withDuplicates = markDuplicates(merged);
    const nextProject = {
      ...logProject({
        ...projectRef.current,
        references: withDuplicates
      }, role, "导入题录", "题录库", `新增 ${imported.length} 条题录`),
      updatedAt: nowIso()
    };
    projectRef.current = nextProject;
    setProject(nextProject);
    setActiveId(importedForMerge[0].id);
    setMessage(`已导入 ${imported.length} 条题录${abstractEnrichmentDetail}${errors.length ? `，${errors.length} 个文件有异常` : ""}。`);
    persistProjectNow(nextProject)
      .then(() => setMessage(`已导入 ${imported.length} 条题录${abstractEnrichmentDetail}，并已立即自动保存。${errors.length ? ` ${errors.length} 个文件有异常` : ""}`))
      .catch(() => setStorageStatus("导入后立即保存失败，请立即点击项目备份"));
  }

  async function enrichProjectAbstracts() {
    if (abstractEnrichmentRunning) return;
    const targetCount = projectRef.current.references.filter((reference) => !reference.abstract && normalizePmid(reference.pmid)).length;
    if (!targetCount) {
      setMessage("当前项目没有可自动补全的摘要。需要题录中带有 PMID，才能从 PubMed 联网补全。");
      return;
    }

    setAbstractEnrichmentRunning(true);
    setMessage(`正在从 PubMed 联网补全 ${targetCount} 条缺失摘要，请保持网络连接。`);
    try {
      const baseProject = projectRef.current;
      const enrichment = await enrichMissingPubMedAbstracts(baseProject.references, (completed, total) => {
        setMessage(`正在从 PubMed 补全摘要：${completed}/${total} 批。`);
      });
      if (!enrichment.enriched) {
        setMessage("PubMed 没有返回可补全的新增摘要。可能是题录缺 PMID，或原始记录本身没有公开摘要。");
        return;
      }
      const nextProject = {
        ...logProject({
          ...projectRef.current,
          references: enrichment.references
        }, role, "联网补全摘要", "PubMed", `补全 ${enrichment.enriched} 条缺失摘要`),
        updatedAt: nowIso()
      };
      projectRef.current = nextProject;
      setProject(nextProject);
      setMessage(`已从 PubMed 补全 ${enrichment.enriched} 条摘要，正在自动保存。`);
      await persistProjectNow(nextProject);
      setMessage(`已从 PubMed 补全 ${enrichment.enriched} 条摘要，并已自动保存。`);
    } catch {
      setMessage("联网补全摘要失败。请检查网络，或确认题录中包含 PMID。");
    } finally {
      setAbstractEnrichmentRunning(false);
    }
  }

  function downloadTemplate() {
    const csv = [
      ["标题", "摘要", "作者", "年份", "期刊", "DOI", "PMID", "来源数据库", "关键词"].join(","),
      ["牙周炎与糖尿病风险的队列研究", "这里填写摘要", "Zhang et al.", "2024", "Journal name", "10.xxxx/example", "", "CNKI", "牙周炎;糖尿病"].join(",")
    ].join("\n");
    downloadText("\ufeff" + csv, "中文数据库导入模板.csv", "text/csv;charset=utf-8");
  }

  function clearReferences() {
    if (!project.references.length) return;
    const confirmed = window.confirm("确定清空当前题录库吗？这会删除已导入文献及其筛选、裁决、全文复筛和数据提取记录。项目资料和数据库列表会保留。");
    if (!confirmed) return;

    updateProject((current) => logProject({
      ...current,
      references: [],
      blindingRevealed: false
    }, role, "清空题录", "题录库", `清空 ${current.references.length} 条题录及相关筛选记录`));
    setActiveId("");
    setStage("titleAbstract");
    setMessage("已清空题录库。可以导入新的主题文献。");
  }

  function recomputeDuplicates() {
    updateProject((current) => logProject({
      ...current,
      references: markDuplicates(current.references)
    }, role, "重算去重", "题录库", "已重新识别 DOI、PMID 和题名重复记录"));
    setMessage("已重新识别疑似重复记录。");
  }

  function autoDeduplicateReferences() {
    if (!project.references.length) return;
    const deduped = autoResolveDuplicates(project.references);
    if (!deduped.removed) {
      setMessage("未发现可一键处理的重复记录。");
      return;
    }
    const confirmed = window.confirm(`已识别 ${deduped.groups} 组重复记录，将自动保留信息最完整的一条，并把 ${deduped.removed} 条标记为“重复移除”。不会物理删除原始记录。确定继续吗？`);
    if (!confirmed) return;
    updateProject((current) => logProject({
      ...current,
      references: deduped.references
    }, role, "一键去重", "题录库", `保留 ${deduped.kept} 条，标记移除 ${deduped.removed} 条`));
    setMessage(`一键去重完成：保留 ${deduped.kept} 条，标记移除 ${deduped.removed} 条重复记录。`);
  }

  function setScreeningDecision(referenceId: string, decision: Decision, reason = "", note = "") {
    if (decision === "exclude" && !reason.trim()) {
      const selected = window.prompt("排除理由不能为空，请填写或选择排除理由：", project.exclusionReasons[0] || "");
      if (!selected?.trim()) return;
      reason = selected.trim();
    }

    updateReference(referenceId, (reference) => ({
      ...reference,
      decisions: {
        ...reference.decisions,
        [role]: {
          decision,
          reason,
          note,
          decidedBy: role,
          decidedAt: nowIso()
        }
      }
    }), role, "题名摘要筛选", decisionLabels[decision]);
  }

  function revealBlinding() {
    const incompleteA = stats.total - stats.reviewerA;
    const incompleteB = stats.total - stats.reviewerB;
    if (incompleteA || incompleteB) {
      const confirmed = window.confirm(`筛选尚未全部完成：A 未筛 ${incompleteA} 篇，B 未筛 ${incompleteB} 篇。仍要揭盲吗？`);
      if (!confirmed) return;
    }

    updateProject((current) => logProject({
      ...current,
      blindingRevealed: true
    }, role, "揭盲", "题名摘要筛选", "显示双方决定和冲突列表"));
    setStage("conflicts");
  }

  function adjudicate(referenceId: string, decision: Decision, reason = "", note = "") {
    if (role !== "adjudicator") {
      setMessage("只有裁决者可以给出最终裁决。");
      return;
    }
    if (decision === "exclude" && !reason.trim()) {
      const selected = window.prompt("裁决为排除时必须填写排除理由：", project.exclusionReasons[0] || "");
      if (!selected?.trim()) return;
      reason = selected.trim();
    }

    updateReference(referenceId, (reference) => ({
      ...reference,
      adjudication: {
        decision,
        reason,
        note,
        decidedBy: role,
        decidedAt: nowIso()
      }
    }), role, "第三人裁决", decisionLabels[decision]);
  }

  function updateDuplicate(referenceId: string, status: ReferenceRecord["duplicateStatus"]) {
    updateReference(referenceId, (reference) => ({
      ...reference,
      duplicateStatus: status
    }), role, "处理重复", duplicateLabel(status));
  }

  function updateFullText(referenceId: string, patch: Partial<FullTextReview>) {
    updateReference(referenceId, (reference) => {
      const nextFullText = { ...reference.fullText, ...patch };
      if (patch.decision) nextFullText.reviewedAt = nowIso();
      return { ...reference, fullText: nextFullText };
    }, role, "全文复筛", summarizeFullTextPatch(patch));
  }

  function addExtractionField() {
    const field = window.prompt("新增数据提取字段名称：")?.trim();
    if (!field || project.extractionFields.includes(field)) return;
    updateProject((current) => logProject({
      ...current,
      extractionFields: [...current.extractionFields, field],
      references: current.references.map((reference) => ({
        ...reference,
        extraction: { ...reference.extraction, [field]: "" }
      }))
    }, role, "新增提取字段", field, "数据提取表结构已更新"));
  }

  function removeExtractionField(field: string) {
    updateProject((current) => logProject({
      ...current,
      extractionFields: current.extractionFields.filter((item) => item !== field),
      references: current.references.map((reference) => {
        const { [field]: _removed, ...rest } = reference.extraction;
        return { ...reference, extraction: rest };
      })
    }, role, "删除提取字段", field, "数据提取表结构已更新"));
  }

  function updateExtraction(referenceId: string, field: string, value: string) {
    updateReference(referenceId, (reference) => ({
      ...reference,
      extraction: { ...reference.extraction, [field]: value }
    }), role, "更新数据提取", field);
  }

  function exportProjectBackup() {
    downloadText(JSON.stringify(project, null, 2), `${safeFileName(project.title)}_项目备份.json`, "application/json");
  }

  function restoreProject(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    file.text().then((text) => {
      const parsed = JSON.parse(text) as ReviewProject;
      if (!parsed.references || !parsed.auditLog) throw new Error("不是有效项目备份。");
      projectRef.current = parsed;
      setProject(parsed);
      setActiveId(parsed.references[0]?.id || "");
      setMessage("已恢复项目备份。");
      void persistProjectNow(parsed);
    }).catch((error) => setMessage(error instanceof Error ? error.message : "项目恢复失败。"));
  }

  function exportCsv() {
    const rows = buildExportRows(project);
    downloadText(toCsv(rows), `${safeFileName(project.title)}_筛选记录.csv`, "text/csv;charset=utf-8");
  }

  function exportPrisma() {
    const rows = buildPrismaRows(stats);
    downloadText(toCsv(rows), `${safeFileName(project.title)}_PRISMA统计.csv`, "text/csv;charset=utf-8");
  }

  function exportExtraction() {
    const rows = finalIncluded.map((reference) => ({
      标题: reference.title,
      作者: reference.authors,
      年份: reference.year,
      期刊: reference.journal,
      DOI: reference.doi,
      ...Object.fromEntries(project.extractionFields.map((field) => [field, reference.extraction[field] || ""]))
    }));
    downloadText(toCsv(rows), `${safeFileName(project.title)}_数据提取表.csv`, "text/csv;charset=utf-8");
  }

  function exportWordReport() {
    const html = buildWordReport(project, stats);
    downloadText(html, `${safeFileName(project.title)}_筛选报告.doc`, "application/msword;charset=utf-8");
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <p className="eyebrow">Meta Screening Workbench</p>
          <h1>Meta 文献筛选工作台</h1>
          <p className="topSubline">联网协作路线 · 双人盲筛 · 全文复筛 · 数据提取 · PRISMA 导出</p>
        </div>
        <div className="topActions">
          <label className="fileAction">
            <input accept="application/json,.json" type="file" onChange={(event) => restoreProject(event.target.files)} />
            <FolderOpen size={17} />
            恢复项目
          </label>
          <button className="ghostButton" onClick={exportProjectBackup} type="button">
            <Archive size={17} />
            项目备份
          </button>
          <button className="primaryButton" onClick={createNewProject} type="button">
            <Plus size={17} />
            新项目
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidePanel">
          <section className="versionBanner">
            <div className="versionBadge">v2 baseline</div>
            <strong>当前为本地稳定版</strong>
            <p>已保留本机自动保存与 JSON 备份。Rayyan 对齐、云端协作、RoB、Meta 统计和 AI 提示将按阶段接入。</p>
          </section>

          <section className="panelBlock">
            <div className="panelTitle">
              <ShieldCheck size={18} />
              <span>当前角色</span>
            </div>
            <div className="segmented">
              {(Object.keys(roleLabels) as Role[]).map((item) => (
                <button className={role === item ? "active" : ""} key={item} onClick={() => setRole(item)} type="button">
                  {roleLabels[item]}
                </button>
              ))}
            </div>
            <p className="helperText">{role === "adjudicator" ? "可查看揭盲后的冲突并完成裁决。" : "盲筛阶段只能看到自己的决定。"}</p>
          </section>

          <section className="panelBlock">
            <div className="panelTitle">
              <ClipboardList size={18} />
              <span>项目资料</span>
            </div>
            <label>
              <span>综述题目</span>
              <input value={project.title} onChange={(event) => updateProjectInfo("title", event.target.value)} />
            </label>
            <label>
              <span>研究问题</span>
              <textarea rows={3} value={project.question} onChange={(event) => updateProjectInfo("question", event.target.value)} />
            </label>
            <label>
              <span>检索日期</span>
              <input type="date" value={project.searchDate} onChange={(event) => updateProjectInfo("searchDate", event.target.value)} />
            </label>
            <div className="personGrid">
              <label>
                <span>A</span>
                <input value={project.reviewerA} onChange={(event) => updateProjectInfo("reviewerA", event.target.value)} />
              </label>
              <label>
                <span>B</span>
                <input value={project.reviewerB} onChange={(event) => updateProjectInfo("reviewerB", event.target.value)} />
              </label>
              <label>
                <span>裁决</span>
                <input value={project.adjudicator} onChange={(event) => updateProjectInfo("adjudicator", event.target.value)} />
              </label>
            </div>
          </section>

          <section className="panelBlock importPanel">
            <div className="panelTitle importTitle">
              <span>
                <Import size={18} />
                <span>题录导入</span>
              </span>
              <b>{project.references.length} 条</b>
            </div>
            <label className="dropZone">
              <input multiple accept=".csv,.ris,.bib,.txt" type="file" onChange={(event) => importFiles(event.target.files)} />
              <UploadCloud size={22} />
              <span>
                <strong>导入题录文件</strong>
                <small>RIS / BibTeX / CSV</small>
              </span>
            </label>
            <div className="importActions">
              <button className="secondaryButton" onClick={downloadTemplate} type="button">
                <FileDown size={16} />
                中文模板
              </button>
              <button className="ghostButton" disabled={!project.references.length} onClick={recomputeDuplicates} type="button">
                <Split size={16} />
                查重
              </button>
              <button className="ghostButton" disabled={!project.references.length} onClick={autoDeduplicateReferences} type="button">
                <Check size={16} />
                一键去重
              </button>
              <button className="ghostButton" disabled={!missingAbstractWithPmidCount || abstractEnrichmentRunning} onClick={enrichProjectAbstracts} type="button">
                <Search size={16} />
                {abstractEnrichmentRunning ? "补全中" : "补摘要"}
              </button>
              <button className="dangerGhostButton" disabled={!project.references.length} onClick={clearReferences} type="button">
                <Trash2 size={16} />
                清空题录
              </button>
            </div>
            <DatabaseEditor databases={project.databases} onAdd={addDatabase} onRemove={removeDatabase} />
          </section>

          <nav className="stageNav" aria-label="工作流程">
            <StageButton icon={<ListChecks size={17} />} label="题名摘要" active={stage === "titleAbstract"} count={stats.total} onClick={() => setStage("titleAbstract")} />
            <StageButton icon={<Eye size={17} />} label="揭盲冲突" active={stage === "conflicts"} count={conflicts.length} onClick={() => setStage("conflicts")} />
            <StageButton icon={<BookOpen size={17} />} label="全文复筛" active={stage === "fullText"} count={stats.fullTextIncluded} onClick={() => setStage("fullText")} />
            <StageButton icon={<Table2 size={17} />} label="数据提取" active={stage === "extraction"} count={finalIncluded.length} onClick={() => setStage("extraction")} />
            <StageButton icon={<Download size={17} />} label="导出报告" active={stage === "exports"} count={4} onClick={() => setStage("exports")} />
            <StageButton icon={<History size={17} />} label="审计日志" active={stage === "audit"} count={project.auditLog.length} onClick={() => setStage("audit")} />
          </nav>
        </aside>

        <section className="mainPanel">
          <StatusStrip stats={stats} message={message} storageStatus={storageStatus} blindingRevealed={project.blindingRevealed} onReveal={revealBlinding} />

          {stage === "titleAbstract" ? (
            <ScreeningView
              active={active}
              filters={filters}
              project={project}
              references={visibleReferences}
              role={role}
              setActiveId={setActiveId}
              setFilters={setFilters}
              setScreeningDecision={setScreeningDecision}
              updateDuplicate={updateDuplicate}
              updateTranslation={updateReferenceTranslation}
            />
          ) : null}

          {stage === "conflicts" ? (
            <ConflictView
              project={project}
              role={role}
              references={conflicts}
              adjudicate={adjudicate}
            />
          ) : null}

          {stage === "fullText" ? (
            <FullTextView references={fullTextCandidates} updateFullText={updateFullText} />
          ) : null}

          {stage === "extraction" ? (
            <ExtractionView
              fields={project.extractionFields}
              references={finalIncluded}
              addField={addExtractionField}
              removeField={removeExtractionField}
              updateExtraction={updateExtraction}
            />
          ) : null}

          {stage === "exports" ? (
            <ExportView
              exportCsv={exportCsv}
              exportExtraction={exportExtraction}
              exportPrisma={exportPrisma}
              exportWordReport={exportWordReport}
              stats={stats}
            />
          ) : null}

          {stage === "audit" ? <AuditView auditLog={project.auditLog} /> : null}
        </section>
      </section>
    </main>
  );
}

function StatusStrip({ stats, message, storageStatus, blindingRevealed, onReveal }: { stats: ProjectStats; message: string; storageStatus: string; blindingRevealed: boolean; onReveal: () => void }) {
  return (
    <section className="statusStrip">
      <div>
        <div className={`statusPill ${blindingRevealed ? "revealed" : "blind"}`}>
          {blindingRevealed ? <Eye size={16} /> : <EyeOff size={16} />}
          {blindingRevealed ? "已揭盲" : "盲筛中"}
        </div>
        <p>{message}</p>
        <p className="storageStatus">{storageStatus}</p>
      </div>
      <div className="metrics">
        <Metric label="总题录" value={stats.total} />
        <Metric label="A完成" value={stats.reviewerA} />
        <Metric label="B完成" value={stats.reviewerB} />
        <Metric label="冲突" value={stats.conflicts} />
        <Metric label="纳入" value={stats.finalIncluded} />
      </div>
      <button className="primaryButton" onClick={onReveal} type="button">
        <Eye size={17} />
        揭盲/查看冲突
      </button>
    </section>
  );
}

function usePagedItems<T>(items: T[], pageSize: number, resetKeys: React.DependencyList = []) {
  const [page, setPage] = React.useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  React.useEffect(() => {
    setPage(1);
  }, resetKeys);

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, items.length);

  return {
    page: currentPage,
    totalPages,
    startIndex,
    endIndex,
    pageItems: items.slice(startIndex, endIndex),
    setPage
  };
}

function PaginationBar({
  endIndex,
  label,
  page,
  setPage,
  startIndex,
  total,
  totalPages
}: {
  endIndex: number;
  label: string;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  startIndex: number;
  total: number;
  totalPages: number;
}) {
  if (total <= 0) {
    return <div className="paginationBar"><span>{label}：0 条</span></div>;
  }

  return (
    <div className="paginationBar">
      <span>{label}：{startIndex + 1}-{endIndex} / {total}</span>
      <div className="paginationControls">
        <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button" aria-label="上一页">
          <ChevronLeft size={15} />
        </button>
        <strong>{page} / {totalPages}</strong>
        <button disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button" aria-label="下一页">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function ScreeningView({
  active,
  filters,
  project,
  references,
  role,
  setActiveId,
  setFilters,
  setScreeningDecision,
  updateDuplicate,
  updateTranslation
}: {
  active: ReferenceRecord | null;
  filters: FilterState;
  project: ReviewProject;
  references: ReferenceRecord[];
  role: Role;
  setActiveId: (id: string) => void;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  setScreeningDecision: (referenceId: string, decision: Decision, reason?: string, note?: string) => void;
  updateDuplicate: (referenceId: string, status: ReferenceRecord["duplicateStatus"]) => void;
  updateTranslation: (referenceId: string, patch: Partial<ReferenceTranslation>) => void;
}) {
  const currentDecision = active?.decisions[role];
  const [readingMode, setReadingMode] = React.useState<"source" | "bilingual" | "edit">("source");
  const paged = usePagedItems(references, SCREENING_PAGE_SIZE, [filters.query, filters.decision, filters.duplicate, role]);
  const titleZh = active?.translation?.titleZh?.trim() || "";
  const abstractZh = active?.translation?.abstractZh?.trim() || "";

  React.useEffect(() => {
    if (paged.pageItems.length && !paged.pageItems.some((reference) => reference.id === active?.id)) {
      setActiveId(paged.pageItems[0].id);
    }
  }, [active?.id, paged.pageItems, setActiveId]);

  return (
    <div className="splitLayout">
      <section className="listPane">
        <div className="toolbar">
          <div className="searchBox">
            <Search size={16} />
            <input placeholder="搜索标题、摘要、作者、DOI" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} />
          </div>
          <select value={filters.decision} onChange={(event) => setFilters((current) => ({ ...current, decision: event.target.value as FilterState["decision"] }))}>
            <option value="all">全部状态</option>
            <option value="unscreened">未筛选</option>
            <option value="include">纳入</option>
            <option value="maybe">待定</option>
            <option value="exclude">排除</option>
          </select>
          <select value={filters.duplicate} onChange={(event) => setFilters((current) => ({ ...current, duplicate: event.target.value as FilterState["duplicate"] }))}>
            <option value="all">全部去重</option>
            <option value="possible">可能重复</option>
            <option value="resolved">已处理重复</option>
            <option value="unique">唯一</option>
          </select>
        </div>
        <PaginationBar
          endIndex={paged.endIndex}
          label="当前列表"
          page={paged.page}
          setPage={paged.setPage}
          startIndex={paged.startIndex}
          total={references.length}
          totalPages={paged.totalPages}
        />
        <div className="referenceList">
          {paged.pageItems.map((reference) => (
            <button className={`referenceItem ${active?.id === reference.id ? "active" : ""}`} key={reference.id} onClick={() => setActiveId(reference.id)} type="button">
              <span className="referenceTitle">{reference.title || "未命名题录"}</span>
              <span className="referenceMeta">{[reference.authors, reference.year, reference.database].filter(Boolean).join(" · ") || "来源未明确"}</span>
              <span className="itemBadges">
                <DecisionBadge decision={reference.decisions[role]?.decision} />
                {reference.duplicateStatus === "possible" ? <span className="miniBadge warning">可能重复</span> : null}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="detailPane">
        {!active ? (
          <div className="blankState">
            <FileText size={26} />
            <span>导入题录后开始筛选</span>
          </div>
        ) : (
          <>
            <div className="paperHeader">
              <div>
                <p className="eyebrow">Title and abstract screening</p>
                <div className="paperTitleScroll">
                  <h2>{active.title || "未命名题录"}</h2>
                </div>
                <p>{[active.authors, active.year, active.journal].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="paperHeaderActions">
                <span className={`duplicatePill ${active.duplicateStatus}`}>{duplicateLabel(active.duplicateStatus)}</span>
                {active.duplicateStatus === "possible" ? (
                  <>
                    <button className="smallButton" onClick={() => updateDuplicate(active.id, "resolvedKept")} type="button">保留</button>
                    <button className="smallButton danger" onClick={() => updateDuplicate(active.id, "resolvedRemoved")} type="button">移除</button>
                  </>
                ) : null}
              </div>
            </div>
            <div className="readingModeTabs" role="group" aria-label="文献显示模式">
              <button className={readingMode === "source" ? "active" : ""} onClick={() => setReadingMode("source")} type="button">原文</button>
              <button className={readingMode === "bilingual" ? "active" : ""} onClick={() => setReadingMode("bilingual")} type="button">中英文对照</button>
              <button className={readingMode === "edit" ? "active" : ""} onClick={() => setReadingMode("edit")} type="button">译文编辑</button>
            </div>
            {readingMode === "source" ? (
              <div className="abstractBox">
                <p>{active.abstract || "暂无摘要。"}</p>
              </div>
            ) : null}
            {readingMode === "bilingual" ? (
              <div className="bilingualStack">
                <section className="readingBlock">
                  <span>英文摘要</span>
                  <p>{active.abstract || "暂无摘要。"}</p>
                </section>
                <section className="readingBlock translated">
                  <span>中文译文</span>
                  <h3>{titleZh || "暂无中文标题译文"}</h3>
                  <p>{abstractZh || "暂无中文摘要译文"}</p>
                </section>
              </div>
            ) : null}
            {readingMode === "edit" ? (
              <div className="translationEditor">
                <label>
                  中文标题译文
                  <textarea
                    value={active.translation?.titleZh || ""}
                    onChange={(event) => updateTranslation(active.id, { titleZh: event.target.value })}
                    placeholder="在这里粘贴中文标题译文"
                  />
                </label>
                <label>
                  中文摘要译文
                  <textarea
                    className="abstractTranslationInput"
                    value={active.translation?.abstractZh || ""}
                    onChange={(event) => updateTranslation(active.id, { abstractZh: event.target.value })}
                    placeholder="在这里粘贴中文摘要译文"
                  />
                </label>
              </div>
            ) : null}
            <div className="metadataGrid">
              <Meta label="DOI" value={active.doi} />
              <Meta label="PMID" value={active.pmid} />
              <Meta label="来源" value={active.database} />
              <Meta label="关键词" value={active.keywords} />
            </div>

            <div className="decisionPanel">
              <div>
                <div className="panelTitle">
                  <Users size={18} />
                  <span>{roleLabels[role]} 决策</span>
                </div>
                <p className="helperText">当前决定：{currentDecision ? `${decisionLabels[currentDecision.decision]}${currentDecision.reason ? ` · ${currentDecision.reason}` : ""}` : "未筛选"}</p>
              </div>
              <div className="decisionButtons">
                <button className="includeButton" onClick={() => setScreeningDecision(active.id, "include")} type="button">
                  <Check size={18} />
                  纳入
                </button>
                <button className="maybeButton" onClick={() => setScreeningDecision(active.id, "maybe")} type="button">
                  <Filter size={18} />
                  待定
                </button>
                <ReasonMenu reasons={project.exclusionReasons} onChoose={(reason) => setScreeningDecision(active.id, "exclude", reason)} />
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ConflictView({ project, role, references, adjudicate }: { project: ReviewProject; role: Role; references: ReferenceRecord[]; adjudicate: (referenceId: string, decision: Decision, reason?: string, note?: string) => void }) {
  const paged = usePagedItems(references, REVIEW_PAGE_SIZE, [references.length, project.blindingRevealed]);

  if (!project.blindingRevealed) {
    return (
      <section className="contentBlock centeredBlock">
        <EyeOff size={34} />
        <h2>尚未揭盲</h2>
        <p>两位筛选者完成后点击上方“揭盲/查看冲突”。揭盲前不会显示双方决定。</p>
      </section>
    );
  }

  return (
    <section className="contentBlock">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">Conflict resolution</p>
          <h2>冲突与第三人裁决</h2>
        </div>
        <span className="countBadge">{references.length} 条冲突</span>
      </div>
      <PaginationBar
        endIndex={paged.endIndex}
        label="冲突列表"
        page={paged.page}
        setPage={paged.setPage}
        startIndex={paged.startIndex}
        total={references.length}
        totalPages={paged.totalPages}
      />
      <div className="conflictList">
        {references.length === 0 ? <p className="emptyText">暂无冲突。</p> : paged.pageItems.map((reference) => (
          <article className="conflictCard" key={reference.id}>
            <div>
              <h3>{reference.title}</h3>
              <p>{[reference.authors, reference.year, reference.journal].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="voteGrid">
              <VoteCard label="筛选者 A" decision={reference.decisions.reviewerA} />
              <VoteCard label="筛选者 B" decision={reference.decisions.reviewerB} />
              <VoteCard label="最终裁决" decision={reference.adjudication} />
            </div>
            <div className="decisionButtons compact">
              <button className="includeButton" disabled={role !== "adjudicator"} onClick={() => adjudicate(reference.id, "include")} type="button">纳入</button>
              <button className="maybeButton" disabled={role !== "adjudicator"} onClick={() => adjudicate(reference.id, "maybe")} type="button">待定</button>
              <ReasonMenu disabled={role !== "adjudicator"} reasons={project.exclusionReasons} onChoose={(reason) => adjudicate(reference.id, "exclude", reason)} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function FullTextView({ references, updateFullText }: { references: ReferenceRecord[]; updateFullText: (referenceId: string, patch: Partial<FullTextReview>) => void }) {
  const paged = usePagedItems(references, REVIEW_PAGE_SIZE, [references.length]);

  return (
    <section className="contentBlock">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">Full-text screening</p>
          <h2>全文复筛</h2>
        </div>
        <span className="countBadge">{references.length} 篇候选</span>
      </div>
      <PaginationBar
        endIndex={paged.endIndex}
        label="全文候选"
        page={paged.page}
        setPage={paged.setPage}
        startIndex={paged.startIndex}
        total={references.length}
        totalPages={paged.totalPages}
      />
      <div className="fullTextList">
        {paged.pageItems.map((reference) => (
          <article className="fullTextCard" key={reference.id}>
            <div>
              <h3>{reference.title}</h3>
              <p>{[reference.authors, reference.year, reference.journal].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="fullTextGrid">
              <label>
                <span>全文状态</span>
                <select value={reference.fullText.status} onChange={(event) => updateFullText(reference.id, { status: event.target.value as FullTextStatus })}>
                  {(Object.keys(fullTextStatusLabels) as FullTextStatus[]).map((status) => <option key={status} value={status}>{fullTextStatusLabels[status]}</option>)}
                </select>
              </label>
              <label>
                <span>PDF 本机路径</span>
                <input placeholder="/Users/.../paper.pdf" value={reference.fullText.pdfPath} onChange={(event) => updateFullText(reference.id, { pdfPath: event.target.value })} />
              </label>
              <label>
                <span>全文决定</span>
                <select value={reference.fullText.decision} onChange={(event) => updateFullText(reference.id, { decision: event.target.value as Decision | "" })}>
                  <option value="">未决定</option>
                  <option value="include">纳入</option>
                  <option value="maybe">待定</option>
                  <option value="exclude">排除</option>
                </select>
              </label>
              <label>
                <span>全文排除理由/备注</span>
                <input value={reference.fullText.reason || reference.fullText.note} onChange={(event) => updateFullText(reference.id, { reason: event.target.value })} />
              </label>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ExtractionView({
  fields,
  references,
  addField,
  removeField,
  updateExtraction
}: {
  fields: string[];
  references: ReferenceRecord[];
  addField: () => void;
  removeField: (field: string) => void;
  updateExtraction: (referenceId: string, field: string, value: string) => void;
}) {
  const paged = usePagedItems(references, REVIEW_PAGE_SIZE, [references.length, fields.length]);

  return (
    <section className="contentBlock">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">Data extraction</p>
          <h2>自定义数据提取表</h2>
        </div>
        <button className="primaryButton" onClick={addField} type="button">
          <Plus size={17} />
          新增字段
        </button>
      </div>
      <div className="fieldChips">
        {fields.map((field) => (
          <span className="fieldChip" key={field}>
            {field}
            <button aria-label={`删除 ${field}`} onClick={() => removeField(field)} type="button"><Trash2 size={13} /></button>
          </span>
        ))}
      </div>
      <PaginationBar
        endIndex={paged.endIndex}
        label="数据提取"
        page={paged.page}
        setPage={paged.setPage}
        startIndex={paged.startIndex}
        total={references.length}
        totalPages={paged.totalPages}
      />
      <div className="extractionTableWrap">
        <table className="extractionTable">
          <thead>
            <tr>
              <th>文献</th>
              {fields.map((field) => <th key={field}>{field}</th>)}
            </tr>
          </thead>
          <tbody>
            {paged.pageItems.map((reference) => (
              <tr key={reference.id}>
                <td>
                  <strong>{reference.title}</strong>
                  <span>{[reference.authors, reference.year].filter(Boolean).join(" · ")}</span>
                </td>
                {fields.map((field) => (
                  <td key={field}>
                    <textarea value={reference.extraction[field] || ""} onChange={(event) => updateExtraction(reference.id, field, event.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ExportView({ exportCsv, exportExtraction, exportPrisma, exportWordReport, stats }: {
  exportCsv: () => void;
  exportExtraction: () => void;
  exportPrisma: () => void;
  exportWordReport: () => void;
  stats: ProjectStats;
}) {
  return (
    <section className="contentBlock">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">Exports</p>
          <h2>导出报告</h2>
        </div>
      </div>
      <div className="exportGrid">
        <ExportCard icon={<FileSpreadsheet size={22} />} title="完整筛选记录 CSV" detail="包含题录、双人决定、裁决、全文复筛和最终状态。" onClick={exportCsv} />
        <ExportCard icon={<FileSpreadsheet size={22} />} title="PRISMA 统计 CSV" detail={`当前总题录 ${stats.total} 条，重复 ${stats.duplicates} 条，最终纳入 ${stats.finalIncluded} 条。`} onClick={exportPrisma} />
        <ExportCard icon={<Table2 size={22} />} title="数据提取表 CSV" detail="导出最终纳入文献的自定义数据提取字段。" onClick={exportExtraction} />
        <ExportCard icon={<FileText size={22} />} title="Word 报告草稿" detail="生成可放入论文方法部分的筛选流程与统计草稿。" onClick={exportWordReport} />
      </div>
    </section>
  );
}

function AuditView({ auditLog }: { auditLog: AuditEntry[] }) {
  const paged = usePagedItems(auditLog, AUDIT_PAGE_SIZE, [auditLog.length]);

  return (
    <section className="contentBlock">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">Audit trail</p>
          <h2>审计日志</h2>
        </div>
        <span className="countBadge">{auditLog.length} 条记录</span>
      </div>
      <PaginationBar
        endIndex={paged.endIndex}
        label="审计日志"
        page={paged.page}
        setPage={paged.setPage}
        startIndex={paged.startIndex}
        total={auditLog.length}
        totalPages={paged.totalPages}
      />
      <div className="auditList">
        {paged.pageItems.map((entry) => (
          <article className="auditItem" key={entry.id}>
            <span>{formatDateTime(entry.at)}</span>
            <strong>{roleLabels[entry.actor]} · {entry.action}</strong>
            <p>{entry.target} · {entry.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function DatabaseEditor({ databases, onAdd, onRemove }: { databases: string[]; onAdd: (value: string) => void; onRemove: (value: string) => void }) {
  const [value, setValue] = React.useState("");
  return (
    <div className="databaseBox">
      <div className="chipList">
        {databases.map((database) => (
          <span className="chip" key={database}>
            {database}
            <button aria-label={`删除 ${database}`} onClick={() => onRemove(database)} type="button">×</button>
          </span>
        ))}
      </div>
      <div className="inlineInput">
        <input placeholder="添加数据库" value={value} onChange={(event) => setValue(event.target.value)} />
        <button className="smallButton" onClick={() => { onAdd(value); setValue(""); }} type="button">添加</button>
      </div>
    </div>
  );
}

function ReasonMenu({ disabled, reasons, onChoose }: { disabled?: boolean; reasons: string[]; onChoose: (reason: string) => void }) {
  return (
    <select className="excludeSelect" disabled={disabled} defaultValue="" onChange={(event) => {
      if (!event.target.value) return;
      onChoose(event.target.value);
      event.target.value = "";
    }}>
      <option value="">排除...</option>
      {reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
      <option value="其他">其他</option>
    </select>
  );
}

function StageButton({ active, count, icon, label, onClick }: { active: boolean; count: number; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={`stageButton ${active ? "active" : ""}`} onClick={onClick} type="button">
      <span>{icon}{label}</span>
      <b>{count}</b>
      <ChevronRight size={15} />
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="metaItem">
      <span>{label}</span>
      <strong>{value || "未明确"}</strong>
    </div>
  );
}

function DecisionBadge({ decision }: { decision?: Decision }) {
  return <span className={`miniBadge ${decision || "empty"}`}>{decision ? decisionLabels[decision] : "未筛"}</span>;
}

function VoteCard({ decision, label }: { label: string; decision?: ScreeningDecision }) {
  return (
    <div className="voteCard">
      <span>{label}</span>
      <strong>{decision ? decisionLabels[decision.decision] : "未决定"}</strong>
      <p>{decision?.reason || decision?.note || "无备注"}</p>
    </div>
  );
}

function ExportCard({ detail, icon, onClick, title }: { detail: string; icon: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button className="exportCard" onClick={onClick} type="button">
      {icon}
      <strong>{title}</strong>
      <span>{detail}</span>
    </button>
  );
}

type BrowserSaveResult = {
  indexedDbSaved: boolean;
  localStorageSaved: boolean;
  bytes: number;
};

function readProject(): ReviewProject {
  return readProjectFromLocalStorage() || createSeedProject(true);
}

function readProjectFromLocalStorage(): ReviewProject | null {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "");
    if (isValidProject(stored)) return stored;
  } catch {
    // fall back to IndexedDB or seed
  }
  return null;
}

function isValidProject(value: unknown): value is ReviewProject {
  const candidate = value as Partial<ReviewProject> | null;
  return Boolean(candidate && Array.isArray(candidate.references) && Array.isArray(candidate.auditLog));
}

function chooseStartupProject(indexedDbProject: ReviewProject | null, localStorageProject: ReviewProject | null) {
  if (!isValidProject(indexedDbProject)) return localStorageProject;
  if (isClearlyNewerCompleteProject(localStorageProject, indexedDbProject)) return localStorageProject;
  return indexedDbProject;
}

function isClearlyNewerCompleteProject(candidate: ReviewProject | null, baseline: ReviewProject) {
  if (!isValidProject(candidate)) return false;
  if (candidate.id !== baseline.id) return false;
  const candidateTime = projectTimestamp(candidate);
  const baselineTime = projectTimestamp(baseline);
  if (!Number.isFinite(candidateTime) || !Number.isFinite(baselineTime)) return false;
  return candidateTime >= baselineTime;
}

function projectTimestamp(project: ReviewProject) {
  return Date.parse(project.updatedAt || project.createdAt || "");
}

function saveResultMessage(result: BrowserSaveResult) {
  if (result.indexedDbSaved) return `已自动保存到本机数据库：${formatBytes(result.bytes)}`;
  if (result.localStorageSaved) return `已保存到浏览器临时存储：${formatBytes(result.bytes)}`;
  return `已保存到本机数据库，浏览器临时存储仅保留索引：${formatBytes(result.bytes)}`;
}

async function saveProjectToBrowserStorage(project: ReviewProject): Promise<BrowserSaveResult> {
  const estimatedBytes = estimateProjectBytes(project);
  const result: BrowserSaveResult = {
    indexedDbSaved: false,
    localStorageSaved: false,
    bytes: estimatedBytes
  };

  try {
    await writeProjectToIndexedDb(project);
    result.indexedDbSaved = true;
  } catch {
    result.indexedDbSaved = false;
  }

  try {
    if (estimatedBytes > MAX_LOCAL_STORAGE_BACKUP_BYTES || project.references.length >= LARGE_PROJECT_REFERENCE_COUNT) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STORAGE_META_KEY, JSON.stringify(storageMeta(project, estimatedBytes, result.indexedDbSaved)));
      return result;
    }
    const json = JSON.stringify(project);
    result.bytes = new Blob([json]).size;
    localStorage.setItem(STORAGE_KEY, json);
    localStorage.setItem(STORAGE_META_KEY, JSON.stringify(storageMeta(project, result.bytes, result.indexedDbSaved)));
    result.localStorageSaved = true;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STORAGE_META_KEY, JSON.stringify(storageMeta(project, result.bytes, result.indexedDbSaved)));
    } catch {
      // IndexedDB remains the primary durable copy when localStorage is full.
    }
  }

  if (!result.indexedDbSaved && !result.localStorageSaved) {
    throw new Error("Browser storage failed");
  }

  return result;
}

function estimateProjectBytes(project: ReviewProject) {
  let characters = 1200 + project.auditLog.length * 220;
  for (const reference of project.references) {
    characters += 900;
    characters += reference.title.length + reference.abstract.length + reference.authors.length + reference.journal.length;
    characters += reference.doi.length + reference.pmid.length + reference.database.length + reference.keywords.length + reference.notes.length;
    characters += (reference.translation?.titleZh || "").length + (reference.translation?.abstractZh || "").length;
    characters += Object.keys(reference.decisions).length * 180;
    characters += Object.values(reference.extraction).join("").length;
    characters += reference.fullText.pdfPath.length + reference.fullText.reason.length + reference.fullText.note.length;
  }
  return characters * 2;
}

function storageMeta(project: ReviewProject, bytes: number, indexedDbSaved: boolean) {
  return {
    id: project.id,
    title: project.title,
    references: project.references.length,
    auditLog: project.auditLog.length,
    updatedAt: project.updatedAt,
    bytes,
    indexedDbSaved
  };
}

function readProjectFromIndexedDb(): Promise<ReviewProject | null> {
  return openProjectDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORAGE_STORE_NAME, "readonly");
    const request = transaction.objectStore(STORAGE_STORE_NAME).get(STORAGE_PROJECT_ID);
    request.onsuccess = () => {
      const result = request.result as (ReviewProject & { storageId?: string }) | undefined;
      if (!result) {
        resolve(null);
        return;
      }
      const { storageId: _storageId, ...project } = result;
      resolve(project as ReviewProject);
    };
    request.onerror = () => reject(request.error);
  }));
}

function writeProjectToIndexedDb(project: ReviewProject): Promise<void> {
  return openProjectDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORAGE_STORE_NAME, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.objectStore(STORAGE_STORE_NAME).put({ ...project, storageId: STORAGE_PROJECT_ID });
  }));
}

function openProjectDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(STORAGE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORAGE_STORE_NAME)) {
        database.createObjectStore(STORAGE_STORE_NAME, { keyPath: "storageId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createSeedProject(withExamples: boolean): ReviewProject {
  const id = createId("project");
  const references = withExamples ? markDuplicates([
    createReference({
      title: "Periodontitis and risk of type 2 diabetes: a prospective cohort study",
      abstract: "This prospective cohort study evaluated whether periodontitis was associated with incident type 2 diabetes after adjustment for age, sex, smoking, BMI and socioeconomic factors.",
      authors: "Chen L; Wang Y; Li X",
      year: "2024",
      journal: "Journal of Clinical Periodontology",
      doi: "10.1000/jcp.2024.001",
      pmid: "39000001",
      database: "PubMed",
      keywords: "periodontitis; diabetes; cohort"
    }),
    createReference({
      title: "Association between periodontal disease and cardiovascular disease in adults",
      abstract: "A population-based study assessed periodontal disease indicators and cardiovascular outcomes, reporting higher odds of cardiovascular disease among adults with severe periodontal disease.",
      authors: "Miller A; Smith J",
      year: "2023",
      journal: "Community Dentistry and Oral Epidemiology",
      doi: "10.1000/cdoe.2023.002",
      pmid: "38000002",
      database: "Embase",
      keywords: "periodontal disease; cardiovascular disease"
    }),
    createReference({
      title: "Periodontitis and risk of type 2 diabetes: a prospective cohort study",
      abstract: "Duplicate sample record from another database.",
      authors: "Chen L; Wang Y; Li X",
      year: "2024",
      journal: "Journal of Clinical Periodontology",
      doi: "10.1000/jcp.2024.001",
      pmid: "39000001",
      database: "Web of Science",
      keywords: "periodontitis; diabetes"
    })
  ]) : [];

  return {
    id,
    title: "牙周炎与慢性病关联性的系统综述和 Meta 分析",
    question: "牙周炎是否与糖尿病、心血管疾病等慢性病风险相关？",
    databases: ["PubMed", "Embase", "Web of Science", "Cochrane Library", "CNKI", "万方", "维普"],
    searchDate: new Date().toISOString().slice(0, 10),
    reviewerA: "Henry Ren",
    reviewerB: "Reviewer B",
    adjudicator: "Adjudicator",
    exclusionReasons: defaultReasons,
    extractionFields: defaultExtractionFields,
    references,
    auditLog: [createAudit("adjudicator", "创建项目", "项目", withExamples ? "已载入示例题录" : "空白项目")],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    blindingRevealed: false
  };
}

function createReference(input: Partial<ReferenceRecord>): ReferenceRecord {
  return {
    id: createId("ref"),
    title: clean(input.title),
    abstract: clean(input.abstract),
    authors: clean(input.authors),
    year: clean(input.year),
    journal: clean(input.journal),
    doi: clean(input.doi),
    pmid: clean(input.pmid),
    database: clean(input.database),
    keywords: clean(input.keywords),
    sourceFile: clean(input.sourceFile),
    duplicateStatus: "unique",
    decisions: {},
    fullText: {
      status: "notStarted",
      pdfPath: "",
      decision: "",
      reason: "",
      note: "",
      reviewedAt: ""
    },
    extraction: Object.fromEntries(defaultExtractionFields.map((field) => [field, ""])),
    notes: ""
  };
}

function ensureImportableReference(reference: ReferenceRecord, fileName: string, index: number): ReferenceRecord {
  if (reference.title || reference.doi || reference.pmid || reference.abstract || reference.authors) {
    return reference;
  }
  return {
    ...reference,
    title: `未命名题录 ${index + 1}`,
    notes: `该题录来自 ${fileName}，但未识别到标题、摘要、作者、DOI 或 PMID。请人工核对原始文件。`
  };
}

function parseReferenceFile(fileName: string, text: string): ReferenceRecord[] {
  const lower = fileName.toLowerCase();
  const trimmed = text.trimStart();
  if (lower.endsWith(".ris") || /^TY\s+-\s+/im.test(text)) return parseRis(text, fileName);
  if (lower.endsWith(".bib") || /^@\w+\s*[{(]/m.test(trimmed)) return parseBibtex(text, fileName);
  if (lower.endsWith(".nbib") || /^PMID\s*-\s+/im.test(text)) return parseMedline(text, fileName);
  return parseCsv(text, fileName);
}

function parseRis(text: string, fileName: string): ReferenceRecord[] {
  return splitRisRecords(text)
    .map((block) => {
      const fields = collectRisFields(block);
      return createReference({
        title: first(fields.TI, fields.T1, fields.CT),
        abstract: first(fields.AB, fields.N2),
        authors: fields.AU?.join("; ") || "",
        year: first(fields.PY, fields.Y1, fields.DA).slice(0, 4),
        journal: first(fields.JO, fields.JF, fields.T2),
        doi: first(fields.DO),
        pmid: first(fields.PM),
        database: inferDatabase(fileName),
        keywords: fields.KW?.join("; ") || "",
        sourceFile: fileName
      });
    });
}

function splitRisRecords(text: string): string[] {
  const records: string[] = [];
  let current: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if (/^TY\s+-\s+/i.test(line) && current.length) {
      records.push(current.join("\n"));
      current = [];
    }
    current.push(line);
    if (/^ER\s+-\s*/i.test(line)) {
      records.push(current.join("\n"));
      current = [];
    }
  }
  if (current.some((line) => line.trim())) records.push(current.join("\n"));
  return records.map((record) => record.trim()).filter(Boolean);
}

function collectRisFields(block: string): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  let lastKey = "";
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9]{2})\s+-\s+(.*)$/);
    if (match) {
      const key = match[1];
      fields[key] = [...(fields[key] || []), match[2].trim()];
      lastKey = key;
    } else if (lastKey && line.trim()) {
      const values = fields[lastKey] || [];
      const lastValue = values[values.length - 1] || "";
      values[values.length - 1] = `${lastValue} ${line.trim()}`.trim();
      fields[lastKey] = values;
    }
  }
  return fields;
}

function parseBibtex(text: string, fileName: string): ReferenceRecord[] {
  const entries = splitBibtexEntries(text);
  return entries.map((entry) => {
    const fields = collectBibtexFields(entry);
    const field = (name: string) => cleanBib(fields[name.toLowerCase()] || "");
    return createReference({
      title: field("title"),
      abstract: first(field("abstract"), field("abstractnote"), field("annote"), field("description")),
      authors: field("author"),
      year: field("year"),
      journal: field("journal") || field("booktitle"),
      doi: field("doi"),
      pmid: field("pmid"),
      database: inferDatabase(fileName),
      keywords: field("keywords"),
      sourceFile: fileName
    });
  }).map((reference, index) => ensureImportableReference(reference, fileName, index));
}

function splitBibtexEntries(text: string): string[] {
  const entries: string[] = [];
  const source = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "@") continue;
    let cursor = index + 1;
    while (cursor < source.length && /[A-Za-z]/.test(source[cursor])) cursor += 1;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    const opener = source[cursor];
    if (opener !== "{" && opener !== "(") continue;
    const closer = opener === "{" ? "}" : ")";
    let depth = 0;
    let quoted = false;
    for (; cursor < source.length; cursor += 1) {
      const char = source[cursor];
      const prev = source[cursor - 1];
      if (char === "\"" && prev !== "\\") quoted = !quoted;
      if (!quoted && char === opener) depth += 1;
      if (!quoted && char === closer) depth -= 1;
      if (depth === 0) {
        entries.push(source.slice(index, cursor + 1));
        index = cursor;
        break;
      }
    }
  }
  return entries;
}

function collectBibtexFields(entry: string): Record<string, string> {
  const bodyStart = entry.search(/[({]/);
  if (bodyStart < 0) return {};
  const body = entry.slice(bodyStart + 1, -1);
  const firstComma = body.indexOf(",");
  const fieldsText = firstComma >= 0 ? body.slice(firstComma + 1) : body;
  const fields: Record<string, string> = {};
  let index = 0;

  while (index < fieldsText.length) {
    while (index < fieldsText.length && /[\s,]/.test(fieldsText[index])) index += 1;
    const nameMatch = fieldsText.slice(index).match(/^([A-Za-z][A-Za-z0-9_-]*)\s*=/);
    if (!nameMatch) break;
    const name = nameMatch[1].toLowerCase();
    index += nameMatch[0].length;
    while (index < fieldsText.length && /\s/.test(fieldsText[index])) index += 1;

    const { value, nextIndex } = readBibtexValue(fieldsText, index);
    fields[name] = value;
    index = nextIndex;
  }

  return fields;
}

function readBibtexValue(text: string, startIndex: number): { value: string; nextIndex: number } {
  const opener = text[startIndex];
  if (opener === "{" || opener === "\"") {
    const closer = opener === "{" ? "}" : "\"";
    let depth = opener === "{" ? 1 : 0;
    let quoted = opener === "\"";
    let value = "";
    let index = startIndex + 1;
    for (; index < text.length; index += 1) {
      const char = text[index];
      const prev = text[index - 1];
      if (opener === "{" && char === "{") depth += 1;
      if (opener === "{" && char === "}") {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          break;
        }
      }
      if (opener === "\"" && char === "\"" && prev !== "\\") {
        quoted = !quoted;
        index += 1;
        break;
      }
      value += char;
    }
    while (index < text.length && text[index] !== ",") index += 1;
    return { value, nextIndex: index + 1 };
  }

  let index = startIndex;
  while (index < text.length && text[index] !== ",") index += 1;
  return { value: text.slice(startIndex, index).trim(), nextIndex: index + 1 };
}

function parseMedline(text: string, fileName: string): ReferenceRecord[] {
  return splitMedlineRecords(text).map((block, index) => {
    const fields = collectMedlineFields(block);
    return ensureImportableReference(createReference({
      title: first(fields.TI),
      abstract: first(fields.AB),
      authors: fields.FAU?.join("; ") || fields.AU?.join("; ") || "",
      year: first(fields.DP, fields.DCOM, fields.CRDT).slice(0, 4),
      journal: first(fields.JT, fields.TA, fields.SO),
      doi: extractDoi(fields.AID, fields.LID),
      pmid: first(fields.PMID),
      database: inferDatabase(fileName) || "PubMed",
      keywords: fields.OT?.join("; ") || fields.MH?.join("; ") || "",
      sourceFile: fileName
    }), fileName, index);
  });
}

function splitMedlineRecords(text: string): string[] {
  const records: string[] = [];
  let current: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if (/^PMID\s*-\s+/i.test(line) && current.length) {
      records.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.some((line) => line.trim())) records.push(current.join("\n"));
  return records.map((record) => record.trim()).filter(Boolean);
}

function collectMedlineFields(block: string): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  let lastKey = "";
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9]+)\s*-\s*(.*)$/);
    if (match) {
      const key = match[1];
      fields[key] = [...(fields[key] || []), match[2].trim()];
      lastKey = key;
    } else if (lastKey && line.trim()) {
      const values = fields[lastKey] || [];
      const lastValue = values[values.length - 1] || "";
      values[values.length - 1] = `${lastValue} ${line.trim()}`.trim();
      fields[lastKey] = values;
    }
  }
  return fields;
}

function extractDoi(...values: Array<string[] | undefined>) {
  const joined = values.flatMap((value) => value || []).join(" ");
  return joined.match(/\b10\.\d{4,9}\/[^\s;\]]+/i)?.[0] || "";
}

function parseCsv(text: string, fileName: string): ReferenceRecord[] {
  const rows = parseDelimited(text);
  if (rows.length < 2) return [];
  const references: ReferenceRecord[] = [];
  let headers = rows.find(isHeaderRow)?.map(normalizeHeader) || rows[0].map(normalizeHeader);

  rows.forEach((row) => {
    if (!row.some(Boolean)) return;
    if (isHeaderRow(row)) {
      headers = row.map(normalizeHeader);
      return;
    }
    if (!headers.length) return;

    const get = (...names: string[]) => {
      for (const name of names) {
        const index = headers.indexOf(normalizeHeader(name));
        if (index >= 0) return row[index] || "";
      }
      return "";
    };
    const firstCell = row.find((cell) => cell.trim()) || "";
    const reference = createReference({
      title: get("标题", "title", "article title", "文献题名", "题名", "title题名", "题　名") || firstCell,
      abstract: get(...abstractFieldNames),
      authors: get("作者", "姓名", "authors", "author", "creator", "author作者", "作　者"),
      year: get("年份", "年", "出版年", "发表时间", "发表年份", "year", "publication year"),
      journal: get("期刊", "刊名", "刊　名", "文献来源", "来源", "journal", "journal/book", "source title", "source-文献来源", "publication", "source"),
      doi: get("doi"),
      pmid: get("pmid", "pubmed id"),
      database: get("数据库来源", "来源数据库", "数据库", "database") || inferDatabase(fileName),
      keywords: get("关键词", "keywords", "key words"),
      sourceFile: fileName
    });
    references.push(ensureImportableReference(reference, fileName, references.length));
  });

  return references;
}

type AbstractEnrichmentResult = {
  references: ReferenceRecord[];
  enriched: number;
  attempted: number;
  failed: number;
};

async function enrichMissingPubMedAbstracts(
  references: ReferenceRecord[],
  onProgress?: (completedBatches: number, totalBatches: number) => void
): Promise<AbstractEnrichmentResult> {
  const pmids = Array.from(new Set(references
    .filter((reference) => !reference.abstract)
    .map((reference) => normalizePmid(reference.pmid))
    .filter(Boolean)));
  if (!pmids.length) return { references, enriched: 0, attempted: 0, failed: 0 };

  const batchSize = 150;
  const batches: string[][] = [];
  for (let index = 0; index < pmids.length; index += batchSize) {
    batches.push(pmids.slice(index, index + batchSize));
  }

  const abstractsByPmid = new Map<string, string>();
  let failed = 0;
  for (const [batchIndex, batch] of batches.entries()) {
    try {
      const batchAbstracts = await fetchPubMedAbstractBatch(batch);
      batchAbstracts.forEach((abstract, pmid) => abstractsByPmid.set(pmid, abstract));
    } catch {
      failed += batch.length;
    }
    onProgress?.(batchIndex + 1, batches.length);
    if (batchIndex < batches.length - 1) await delay(350);
  }

  let enriched = 0;
  const enrichedReferences = references.map((reference) => {
    if (reference.abstract) return reference;
    const pmid = normalizePmid(reference.pmid);
    const abstract = pmid ? abstractsByPmid.get(pmid) : "";
    if (!abstract) return reference;
    enriched += 1;
    return { ...reference, abstract };
  });

  return {
    references: enrichedReferences,
    enriched,
    attempted: pmids.length,
    failed
  };
}

async function fetchPubMedAbstractBatch(pmids: string[]): Promise<Map<string, string>> {
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi");
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("id", pmids.join(","));
  url.searchParams.set("retmode", "xml");
  url.searchParams.set("tool", "meta_screening_workbench");

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`PubMed request failed: ${response.status}`);

  const xmlText = await response.text();
  const document = new DOMParser().parseFromString(xmlText, "application/xml");
  const articles = Array.from(document.getElementsByTagName("PubmedArticle"));
  const abstracts = new Map<string, string>();

  for (const article of articles) {
    const pmid = article.getElementsByTagName("PMID")[0]?.textContent?.trim() || "";
    if (!pmid) continue;
    const abstractTexts = Array.from(article.getElementsByTagName("AbstractText"))
      .map((node) => {
        const label = node.getAttribute("Label") || node.getAttribute("NlmCategory") || "";
        const text = clean(node.textContent);
        if (!text) return "";
        return label ? `${label}: ${text}` : text;
      })
      .filter(Boolean);
    const abstract = clean(abstractTexts.join(" "));
    if (abstract) abstracts.set(pmid, abstract);
  }

  return abstracts;
}

function isHeaderRow(row: string[]): boolean {
  const normalizedCells = row.map(normalizeHeader).filter(Boolean);
  if (!normalizedCells.length) return false;
  const uniqueCells = new Set(normalizedCells);
  const headerHits = normalizedCells.filter((cell) => knownHeaderNames.has(cell)).length;
  const coreHits = normalizedCells.filter((cell) => coreHeaderNames.has(cell)).length;
  return coreHits >= 2 || (coreHits >= 1 && headerHits >= 3) || (headerHits >= 4 && uniqueCells.size <= normalizedCells.length);
}

function parseDelimited(text: string): string[][] {
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(current.trim());
      current = "";
    } else if (char === "\n" && !quoted) {
      row.push(current.trim());
      rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  rows.push(row);
  return rows.filter((item) => item.some(Boolean));
}

function markDuplicates(references: ReferenceRecord[]): ReferenceRecord[] {
  const groups = new Map<string, string[]>();
  for (const reference of references) {
    const keys = duplicateKeys(reference);
    for (const key of keys) {
      const group = groups.get(key);
      if (group) {
        group.push(reference.id);
      } else {
        groups.set(key, [reference.id]);
      }
    }
  }
  const duplicateIds = new Map<string, string>();
  Array.from(groups.entries()).forEach(([key, ids], index) => {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length > 1) {
      for (const id of uniqueIds) duplicateIds.set(id, `dup-${index}-${key.slice(0, 8)}`);
    }
  });
  return references.map((reference) => {
    const groupId = duplicateIds.get(reference.id);
    if (!groupId) return { ...reference, duplicateGroupId: undefined, duplicateStatus: reference.duplicateStatus === "possible" ? "unique" : reference.duplicateStatus };
    return {
      ...reference,
      duplicateGroupId: groupId,
      duplicateStatus: reference.duplicateStatus === "resolvedKept" || reference.duplicateStatus === "resolvedRemoved" ? reference.duplicateStatus : "possible"
    };
  });
}

function autoResolveDuplicates(references: ReferenceRecord[]) {
  const marked = markDuplicates(references);
  const groups = new Map<string, ReferenceRecord[]>();
  for (const reference of marked) {
    if (!reference.duplicateGroupId) continue;
    groups.set(reference.duplicateGroupId, [...(groups.get(reference.duplicateGroupId) || []), reference]);
  }

  const statusById = new Map<string, ReferenceRecord["duplicateStatus"]>();
  let removed = 0;
  let kept = 0;

  for (const group of groups.values()) {
    const activeGroup = group.filter((reference) => reference.duplicateStatus !== "resolvedRemoved");
    if (activeGroup.length < 2) continue;
    const keeper = activeGroup.slice().sort((a, b) => duplicateKeepScore(b) - duplicateKeepScore(a))[0];
    for (const reference of activeGroup) {
      if (reference.id === keeper.id) {
        statusById.set(reference.id, "resolvedKept");
        kept += 1;
      } else {
        statusById.set(reference.id, "resolvedRemoved");
        removed += 1;
      }
    }
  }

  return {
    references: marked.map((reference) => statusById.has(reference.id)
      ? { ...reference, duplicateStatus: statusById.get(reference.id)! }
      : reference),
    groups: Array.from(groups.values()).filter((group) => group.filter((reference) => reference.duplicateStatus !== "resolvedRemoved").length > 1).length,
    kept,
    removed
  };
}

function duplicateKeepScore(reference: ReferenceRecord) {
  const screenedCount = Object.keys(reference.decisions).length;
  const extractionText = Object.values(reference.extraction).join(" ");
  return screenedCount * 1000
    + (reference.adjudication ? 600 : 0)
    + (reference.fullText.decision ? 400 : 0)
    + (reference.abstract ? Math.min(reference.abstract.length, 1200) : 0)
    + (reference.doi ? 180 : 0)
    + (reference.pmid ? 180 : 0)
    + (reference.journal ? 120 : 0)
    + (reference.authors ? 100 : 0)
    + (reference.year ? 80 : 0)
    + (reference.keywords ? 60 : 0)
    + (extractionText.trim() ? 300 : 0);
}

function replaceReference(references: ReferenceRecord[], referenceId: string, updater: (reference: ReferenceRecord) => ReferenceRecord) {
  const index = references.findIndex((reference) => reference.id === referenceId);
  if (index < 0) return references;
  const next = references.slice();
  next[index] = updater(references[index]);
  return next;
}

function duplicateKeys(reference: ReferenceRecord): string[] {
  const keys = [];
  if (reference.doi) keys.push(`doi:${reference.doi.toLowerCase().replace(/^https?:\/\/doi.org\//, "")}`);
  if (reference.pmid) keys.push(`pmid:${reference.pmid}`);
  const title = normalizeTitle(reference.title);
  if (title.length > 20) keys.push(`title:${title}`);
  return keys;
}

function applyFilters(references: ReferenceRecord[], filters: FilterState, role: Role): ReferenceRecord[] {
  return references.filter((reference) => referenceMatchesFilters(reference, filters, role));
}

function referenceMatchesFilters(reference: ReferenceRecord, filters: FilterState, role: Role) {
  const query = filters.query.trim().toLowerCase();
  if (filters.decision === "unscreened" && reference.decisions[role]) return false;
  if (filters.decision !== "all" && filters.decision !== "unscreened" && reference.decisions[role]?.decision !== filters.decision) return false;
  if (filters.duplicate === "possible" && reference.duplicateStatus !== "possible") return false;
  if (filters.duplicate === "unique" && reference.duplicateStatus !== "unique") return false;
  if (filters.duplicate === "resolved" && !reference.duplicateStatus.startsWith("resolved")) return false;
  if (reference.duplicateStatus === "resolvedRemoved") return false;
  if (!query) return true;
  return reference.title.toLowerCase().includes(query)
    || reference.authors.toLowerCase().includes(query)
    || reference.doi.toLowerCase().includes(query)
    || reference.pmid.toLowerCase().includes(query)
    || reference.keywords.toLowerCase().includes(query)
    || reference.abstract.toLowerCase().includes(query);
}

function isConflict(reference: ReferenceRecord): boolean {
  const a = reference.decisions.reviewerA?.decision;
  const b = reference.decisions.reviewerB?.decision;
  return Boolean(a && b && a !== b && !reference.adjudication);
}

function finalDecision(reference: ReferenceRecord): Decision | "" {
  if (reference.duplicateStatus === "resolvedRemoved") return "exclude";
  if (reference.adjudication) return reference.adjudication.decision;
  const a = reference.decisions.reviewerA?.decision;
  const b = reference.decisions.reviewerB?.decision;
  return a && b && a === b ? a : "";
}

function buildProjectIndex(references: ReferenceRecord[]): ProjectIndex {
  const byId = new Map<string, ReferenceRecord>();
  const conflicts: ReferenceRecord[] = [];
  const finalIncluded: ReferenceRecord[] = [];
  const fullTextCandidates: ReferenceRecord[] = [];
  let duplicates = 0;
  let reviewerA = 0;
  let reviewerB = 0;
  let excluded = 0;
  let maybe = 0;

  for (const reference of references) {
    byId.set(reference.id, reference);
    if (reference.duplicateStatus === "possible" || reference.duplicateStatus.startsWith("resolved")) duplicates += 1;
    if (reference.decisions.reviewerA) reviewerA += 1;
    if (reference.decisions.reviewerB) reviewerB += 1;
    if (isConflict(reference)) conflicts.push(reference);

    const decision = finalDecision(reference);
    if (decision === "include") {
      finalIncluded.push(reference);
      fullTextCandidates.push(reference);
    } else if (decision === "maybe") {
      maybe += 1;
      fullTextCandidates.push(reference);
    } else if (decision === "exclude") {
      excluded += 1;
    }
  }

  return {
    byId,
    conflicts,
    finalIncluded,
    fullTextCandidates,
    stats: {
      total: references.length,
      duplicates,
      reviewerA,
      reviewerB,
      conflicts: conflicts.length,
      finalIncluded: finalIncluded.length,
      excluded,
      maybe,
      fullTextIncluded: fullTextCandidates.length
    }
  };
}

function buildStats(project: ReviewProject) {
  return buildProjectIndex(project.references).stats;
}

function buildExportRows(project: ReviewProject) {
  return project.references.map((reference) => ({
    标题: reference.title,
    摘要: reference.abstract,
    作者: reference.authors,
    年份: reference.year,
    期刊: reference.journal,
    DOI: reference.doi,
    PMID: reference.pmid,
    来源数据库: reference.database,
    去重状态: duplicateLabel(reference.duplicateStatus),
    筛选者A: reference.decisions.reviewerA ? decisionLabels[reference.decisions.reviewerA.decision] : "",
    A排除理由: reference.decisions.reviewerA?.reason || "",
    筛选者B: reference.decisions.reviewerB ? decisionLabels[reference.decisions.reviewerB.decision] : "",
    B排除理由: reference.decisions.reviewerB?.reason || "",
    第三人裁决: reference.adjudication ? decisionLabels[reference.adjudication.decision] : "",
    裁决理由: reference.adjudication?.reason || "",
    最终决定: finalDecision(reference) ? decisionLabels[finalDecision(reference) as Decision] : "",
    全文状态: fullTextStatusLabels[reference.fullText.status],
    PDF路径: reference.fullText.pdfPath,
    全文决定: reference.fullText.decision ? decisionLabels[reference.fullText.decision] : "",
    全文排除理由: reference.fullText.reason,
    备注: reference.notes
  }));
}

function buildPrismaRows(stats: ProjectStats) {
  return [
    { 指标: "数据库检索获得记录", 数量: stats.total },
    { 指标: "识别为重复记录", 数量: stats.duplicates },
    { 指标: "进入题名摘要筛选", 数量: Math.max(stats.total - stats.duplicates, 0) },
    { 指标: "题名摘要后排除", 数量: stats.excluded },
    { 指标: "进入全文评估", 数量: stats.fullTextIncluded },
    { 指标: "最终纳入", 数量: stats.finalIncluded },
    { 指标: "待定", 数量: stats.maybe },
    { 指标: "未解决冲突", 数量: stats.conflicts }
  ];
}

function buildWordReport(project: ReviewProject, stats: ProjectStats) {
  const rows = buildPrismaRows(stats).map((row) => `<tr><td>${escapeHtml(row.指标)}</td><td>${row.数量}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(project.title)}</title></head><body>
    <h1>${escapeHtml(project.title)}</h1>
    <h2>研究问题</h2><p>${escapeHtml(project.question)}</p>
    <h2>检索来源</h2><p>${project.databases.map(escapeHtml).join("；")}。检索日期：${escapeHtml(project.searchDate)}</p>
    <h2>筛选流程</h2>
    <p>本项目采用双人独立盲法筛选。筛选者 A 为 ${escapeHtml(project.reviewerA)}，筛选者 B 为 ${escapeHtml(project.reviewerB)}。两名筛选者完成题名摘要筛选后揭盲，不一致记录由 ${escapeHtml(project.adjudicator)} 进行第三人裁决。</p>
    <p>全文复筛阶段记录全文获取状态、本机 PDF 路径、全文纳入或排除决定及排除理由。最终纳入文献进入自定义数据提取表。</p>
    <h2>PRISMA 统计草表</h2><table border="1" cellspacing="0" cellpadding="6"><tbody>${rows}</tbody></table>
    <h2>说明</h2><p>本报告由本地 Meta 文献筛选工作台自动生成，具体排除理由和审计日志请以导出的完整筛选记录为准。</p>
  </body></html>`;
}

function toCsv(rows: Array<Record<string, string | number>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const body = rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  return "\ufeff" + [headers.join(","), ...body].join("\n");
}

function csvCell(value: string | number | undefined) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function logProject(project: ReviewProject, actor: Role, action: string, target: string, detail: string): ReviewProject {
  return {
    ...project,
    auditLog: [createAudit(actor, action, compactAuditText(target), compactAuditText(detail)), ...project.auditLog]
  };
}

function createAudit(actor: Role, action: string, target: string, detail: string): AuditEntry {
  return {
    id: createId("audit"),
    at: nowIso(),
    actor,
    action,
    target,
    detail
  };
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanBib(value: string) {
  return value.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

function compactAuditText(value: string) {
  const text = clean(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function first(...values: Array<string[] | string | undefined>) {
  for (const value of values) {
    if (Array.isArray(value) && value[0]) return value[0];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function inferDatabase(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.includes("pubmed")) return "PubMed";
  if (lower.includes("embase")) return "Embase";
  if (lower.includes("wos") || lower.includes("web of science")) return "Web of Science";
  if (lower.includes("cochrane")) return "Cochrane Library";
  if (lower.includes("cnki") || fileName.includes("知网")) return "CNKI";
  if (fileName.includes("万方")) return "万方";
  if (fileName.includes("维普")) return "维普";
  return "";
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizePmid(value: string) {
  return clean(value).match(/\d{5,9}/)?.[0] || "";
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function duplicateLabel(status: ReferenceRecord["duplicateStatus"]) {
  return {
    unique: "唯一记录",
    possible: "可能重复",
    resolvedRemoved: "重复移除",
    resolvedKept: "重复保留"
  }[status];
}

function summarizeFullTextPatch(patch: Partial<FullTextReview>) {
  if (patch.decision) return `全文决定：${decisionLabels[patch.decision]}`;
  if (patch.status) return `全文状态：${fullTextStatusLabels[patch.status]}`;
  if (patch.pdfPath !== undefined) return "更新 PDF 路径";
  return "更新全文信息";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function safeFileName(value: string) {
  return (value || "Meta文献筛选项目").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

function downloadText(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function nowIso() {
  return new Date().toISOString();
}

function yieldToBrowser() {
  return delay(0);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char] || char));
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
