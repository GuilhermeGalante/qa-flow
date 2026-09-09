/* eslint-disable react-refresh/only-export-components -- componentes compartilhados entre os dois templates PDF */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { PdfReportData } from "../domain/reporting";
import type { CasePriority, RunStatus, StepStatus } from "../domain/types";
import { getActiveLocale, tr } from "../i18n";

export const C = {
  ink: "#101828",
  body: "#344054",
  muted: "#667085",
  line: "#d0d5dd",
  shell: "#f2f4f7",
  raised: "#ffffff",
  navy: "#0747a6",
  cyan: "#0891b2",
  cyanSoft: "#ecfeff",
  passed: "#067647",
  passedSoft: "#ecfdf3",
  failed: "#b42318",
  failedSoft: "#fef3f2",
  blocked: "#b54708",
  blockedSoft: "#fffaeb",
  skipped: "#6941c6",
  skippedSoft: "#f4f3ff",
  notRun: "#667085",
  notRunSoft: "#f2f4f7",
};

export const STATUS_LABEL: Record<StepStatus, string> = {
  not_run: "Não executado",
  passed: "Aprovado",
  failed: "Reprovado",
  blocked: "Bloqueado",
  skipped: "Ignorado",
};

export const STATUS_COLOR: Record<StepStatus, string> = {
  not_run: C.notRun,
  passed: C.passed,
  failed: C.failed,
  blocked: C.blocked,
  skipped: C.skipped,
};

export const STATUS_SOFT: Record<StepStatus, string> = {
  not_run: C.notRunSoft,
  passed: C.passedSoft,
  failed: C.failedSoft,
  blocked: C.blockedSoft,
  skipped: C.skippedSoft,
};

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  draft: "Rascunho",
  in_progress: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
  aborted: "Abortada",
};

export const PRIORITY_LABEL: Record<CasePriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

export function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(getActiveLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startedAt: string, finishedAt?: string): string {
  if (!finishedAt) return tr("Em andamento");
  const milliseconds = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "-";
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

export const shared = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 32,
    paddingHorizontal: 38,
    fontFamily: "Helvetica",
    fontSize: 8.5,
    lineHeight: 1.38,
    color: C.body,
    backgroundColor: C.raised,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  logoBlock: { width: 68, alignItems: "center", marginRight: 14 },
  logo: { width: 54, height: 54, objectFit: "contain" },
  brandName: { marginTop: 4, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.ink },
  brandFlow: { color: C.cyan },
  headerCopy: { flex: 1 },
  documentKind: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.cyan,
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  planTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    lineHeight: 1.25,
  },
  headerMeta: { color: C.muted, fontSize: 8, marginTop: 4 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    marginBottom: 8,
  },
  footer: {
    position: "absolute",
    left: 38,
    right: 38,
    bottom: 20,
    paddingTop: 7,
    borderTopWidth: 0.5,
    borderTopColor: C.line,
    color: C.muted,
    fontSize: 7,
    textAlign: "center",
  },
});

const S = StyleSheet.create({
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
    marginBottom: 14,
    borderWidth: 0.7,
    borderColor: C.line,
    borderRadius: 7,
    backgroundColor: C.shell,
  },
  metaItem: { width: "33.333%", paddingVertical: 7, paddingHorizontal: 9 },
  metaLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted, marginBottom: 2 },
  metaValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.ink },
  objective: {
    padding: 10,
    marginBottom: 14,
    borderRadius: 7,
    backgroundColor: C.cyanSoft,
    borderWidth: 0.7,
    borderColor: "#a5f3fc",
  },
  objectiveLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.cyan, marginBottom: 3 },
  objectiveText: { fontSize: 8.5, color: C.body },
  metrics: { flexDirection: "row", marginBottom: 14 },
  metric: {
    width: "20%",
    paddingVertical: 8,
    paddingHorizontal: 7,
    borderWidth: 0.7,
    borderColor: C.line,
    borderRightWidth: 0,
  },
  metricFirst: { borderTopLeftRadius: 7, borderBottomLeftRadius: 7 },
  metricLast: { borderRightWidth: 0.7, borderTopRightRadius: 7, borderBottomRightRadius: 7 },
  metricValue: { fontSize: 16, lineHeight: 1, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  metricLabel: { fontSize: 6.5, lineHeight: 1.25, fontFamily: "Helvetica-Bold", color: C.muted },
  distribution: {
    padding: 10,
    marginBottom: 16,
    borderWidth: 0.7,
    borderColor: C.line,
    borderRadius: 7,
  },
  distributionBar: { flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: C.shell },
  legend: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  legendItem: { width: "33.333%", flexDirection: "row", alignItems: "center", marginBottom: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 5 },
  legendText: { fontSize: 7.5, color: C.body },
  table: { width: "100%", borderWidth: 0.7, borderColor: C.line, borderRadius: 6, overflow: "hidden" },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line },
  tableRowLast: { borderBottomWidth: 0 },
  tableHeader: { backgroundColor: C.shell },
  th: { paddingVertical: 6, paddingHorizontal: 5, fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted },
  td: { paddingVertical: 7, paddingHorizontal: 5, fontSize: 7.5, color: C.body },
  idText: { fontFamily: "Helvetica-Bold", color: C.navy },
  titleText: { fontFamily: "Helvetica-Bold", color: C.ink },
  status: { borderRadius: 4, paddingVertical: 2, paddingHorizontal: 4, alignSelf: "flex-start" },
  statusText: { fontSize: 6.8, fontFamily: "Helvetica-Bold" },
  empty: { padding: 18, textAlign: "center", color: C.muted },
  note: { marginTop: 12, padding: 9, borderRadius: 6, backgroundColor: C.shell, color: C.body },
});

const STATUS_ORDER: StepStatus[] = ["passed", "failed", "blocked", "skipped", "not_run"];

export function ReportHeader({ report, logoSrc, kind }: { report: PdfReportData; logoSrc: string; kind: string }) {
  return (
    <View style={shared.header}>
      <View style={shared.logoBlock}>
        <Image src={logoSrc} style={shared.logo} />
        <Text style={shared.brandName}>QA <Text style={shared.brandFlow}>Flow</Text></Text>
      </View>
      <View style={shared.headerCopy}>
        <Text style={shared.documentKind}>{tr(kind).toLocaleUpperCase(getActiveLocale())}</Text>
        <Text style={shared.planTitle}>{report.planName}</Text>
        <Text style={shared.headerMeta}>{tr("Tentativa")} {report.attempt} | {tr("Plano rev.")} {report.planRevision} | {tr(RUN_STATUS_LABEL[report.status])}</Text>
      </View>
    </View>
  );
}

export function ReportFooter({ report }: { report: PdfReportData }) {
  return (
    <Text
      fixed
      style={shared.footer}
      render={({ pageNumber, totalPages }) => (
        `QA Flow | ${report.id} | ${tr("Gerado do snapshot imutável")} | ${tr("Página")} ${pageNumber} ${tr("de")} ${totalPages}`
      )}
    />
  );
}

export function ExecutiveSummaryDocument({ report, logoSrc }: { report: PdfReportData; logoSrc: string }) {
  const counts = STATUS_ORDER.reduce<Record<StepStatus, number>>((accumulator, status) => {
    accumulator[status] = report.cases.filter((item) => item.status === status).length;
    return accumulator;
  }, { not_run: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 });
  const total = report.cases.length;
  const evidenceCount = report.cases.reduce((sum, item) => (
    sum + item.steps.reduce((stepSum, step) => stepSum + step.evidence.length, 0)
  ), 0);
  const distribution = STATUS_ORDER.filter((status) => counts[status] > 0);

  return (
    <Document author="QA Flow" title={`${tr("Resumo executivo")} - ${report.planName}`} subject={`${tr("Tentativa")} ${report.attempt}`}>
      <Page size="A4" style={shared.page}>
        <ReportHeader report={report} logoSrc={logoSrc} kind="Resumo executivo" />

        <View style={S.metaGrid}>
          <View style={S.metaItem}><Text style={S.metaLabel}>{tr("Projeto").toLocaleUpperCase(getActiveLocale())}</Text><Text style={S.metaValue}>{report.project || tr("Não informado")}</Text></View>
          <View style={S.metaItem}><Text style={S.metaLabel}>{tr("Ambiente").toLocaleUpperCase(getActiveLocale())}</Text><Text style={S.metaValue}>{report.environment || tr("Não informado")}</Text></View>
          <View style={S.metaItem}><Text style={S.metaLabel}>BUILD</Text><Text style={S.metaValue}>{report.build || tr("Não informada")}</Text></View>
          <View style={S.metaItem}><Text style={S.metaLabel}>{tr("Responsável").toLocaleUpperCase(getActiveLocale())}</Text><Text style={S.metaValue}>{report.tester || report.createdBy}</Text></View>
          <View style={S.metaItem}><Text style={S.metaLabel}>{tr("Início").toLocaleUpperCase(getActiveLocale())}</Text><Text style={S.metaValue}>{formatDate(report.startedAt)}</Text></View>
          <View style={S.metaItem}><Text style={S.metaLabel}>{tr("Duração").toLocaleUpperCase(getActiveLocale())}</Text><Text style={S.metaValue}>{formatDuration(report.startedAt, report.finishedAt)}</Text></View>
        </View>

        {(report.objective || report.description) && (
          <View style={S.objective}>
            <Text style={S.objectiveLabel}>{tr("Objetivo").toLocaleUpperCase(getActiveLocale())}</Text>
            <Text style={S.objectiveText}>{report.objective || report.description}</Text>
          </View>
        )}

        <Text style={shared.sectionTitle}>{tr("Visão geral")}</Text>
        <View style={S.metrics}>
          {STATUS_ORDER.map((status, index) => (
            <View key={status} style={[S.metric, index === 0 ? S.metricFirst : {}, index === STATUS_ORDER.length - 1 ? S.metricLast : {}]}>
              <Text style={[S.metricValue, { color: STATUS_COLOR[status] }]}>{counts[status]}</Text>
              <Text style={S.metricLabel}>{tr(STATUS_LABEL[status]).toLocaleUpperCase(getActiveLocale())}</Text>
            </View>
          ))}
        </View>

        <View style={S.distribution}>
          <Text style={shared.sectionTitle}>{tr("Distribuição por caso")}</Text>
          <View style={S.distributionBar}>
            {distribution.map((status) => (
              <View key={status} style={{ width: `${(counts[status] / Math.max(total, 1)) * 100}%`, backgroundColor: STATUS_COLOR[status] }} />
            ))}
          </View>
          <View style={S.legend}>
            {STATUS_ORDER.map((status) => (
              <View key={status} style={S.legendItem}>
                <View style={[S.legendDot, { backgroundColor: STATUS_COLOR[status] }]} />
                <Text style={S.legendText}>{tr(STATUS_LABEL[status])}: {counts[status]} ({total ? Math.round((counts[status] / total) * 100) : 0}%)</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={shared.sectionTitle}>{tr("Resultado por caso")}</Text>
        <View style={S.table}>
          <View style={[S.tableRow, S.tableHeader]} fixed>
            <Text style={[S.th, { width: "18%" }]}>ID</Text>
            <Text style={[S.th, { width: "42%" }]}>{tr("Caso de teste").toLocaleUpperCase(getActiveLocale())}</Text>
            <Text style={[S.th, { width: "13%" }]}>{tr("Prioridade").toLocaleUpperCase(getActiveLocale())}</Text>
            <Text style={[S.th, { width: "17%" }]}>{tr("Resultado").toLocaleUpperCase(getActiveLocale())}</Text>
            <Text style={[S.th, { width: "10%", textAlign: "center" }]}>EVID.</Text>
          </View>
          {report.cases.length === 0 ? (
            <Text style={S.empty}>{tr("Nenhum caso registrado no snapshot desta tentativa.")}</Text>
          ) : report.cases.map((item, index) => {
            const itemEvidence = item.steps.reduce((sum, step) => sum + step.evidence.length, 0);
            return (
              <View key={item.id} style={[S.tableRow, index === report.cases.length - 1 ? S.tableRowLast : {}]} wrap={false}>
                <Text style={[S.td, S.idText, { width: "18%" }]}>{item.id}</Text>
                <Text style={[S.td, S.titleText, { width: "42%" }]}>{item.title}</Text>
                <Text style={[S.td, { width: "13%" }]}>{tr(PRIORITY_LABEL[item.priority])}</Text>
                <View style={[S.td, { width: "17%" }]}>
                  <View style={[S.status, { backgroundColor: STATUS_SOFT[item.status] }]}>
                    <Text style={[S.statusText, { color: STATUS_COLOR[item.status] }]}>{tr(STATUS_LABEL[item.status])}</Text>
                  </View>
                </View>
                <Text style={[S.td, { width: "10%", textAlign: "center" }]}>{itemEvidence}</Text>
              </View>
            );
          })}
        </View>

        {report.notes && <Text style={S.note}>{tr("Notas da execução")}: {report.notes}</Text>}
        <Text style={{ marginTop: 7, color: C.muted, fontSize: 7 }}>{tr("Total de evidências vinculadas")}: {evidenceCount}</Text>
        <ReportFooter report={report} />
      </Page>
    </Document>
  );
}
