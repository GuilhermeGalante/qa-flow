import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { isImageDataSource, isRasterImageSource } from "../domain/reporting";
import type { PdfReportData } from "../domain/reporting";
import {
  C,
  formatDate,
  PRIORITY_LABEL,
  ReportFooter,
  ReportHeader,
  shared,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_SOFT,
} from "./ExecutiveSummaryDocument";

const TYPE_COLOR: Record<string, string> = {
  Dado: "#4338ca",
  Quando: C.navy,
  Então: "#7e22ce",
  E: C.muted,
};

const T = StyleSheet.create({
  context: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
    marginBottom: 16,
    padding: 9,
    borderWidth: 0.7,
    borderColor: C.line,
    borderRadius: 7,
    backgroundColor: C.shell,
  },
  contextItem: { width: "33.333%", paddingVertical: 4, paddingHorizontal: 5 },
  contextLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted, marginBottom: 2 },
  contextValue: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.ink },
  intro: { marginBottom: 14, color: C.body },
  caseCard: {
    marginBottom: 4,
    borderWidth: 0.7,
    borderColor: C.line,
    borderRadius: 7,
  },
  caseHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: C.shell,
    borderBottomWidth: 0.7,
    borderBottomColor: C.line,
  },
  caseIdentity: { flex: 1, paddingRight: 8 },
  caseId: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.navy, marginBottom: 2 },
  caseTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink, lineHeight: 1.25 },
  badge: { borderRadius: 4, paddingVertical: 3, paddingHorizontal: 6 },
  badgeText: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  caseMeta: { paddingVertical: 4, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: C.line },
  metaLine: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 72, fontSize: 7, fontFamily: "Helvetica-Bold", color: C.muted },
  metaValue: { flex: 1, fontSize: 7.5, color: C.body },
  noSteps: { padding: 14, textAlign: "center", color: C.muted, fontFamily: "Helvetica-Oblique" },
  step: { marginHorizontal: 10, marginTop: 8, borderWidth: 0.7, borderColor: C.line, borderRadius: 6 },
  stepLast: { marginBottom: 5 },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    backgroundColor: "#fcfcfd",
  },
  stepNumber: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.muted, marginRight: 7 },
  stepType: { flex: 1, fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  stepStatus: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  field: { paddingVertical: 4, paddingHorizontal: 8 },
  fieldExpected: { borderTopWidth: 0.5, borderTopColor: C.line, backgroundColor: "#fcfcfd" },
  fieldLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted, marginBottom: 2 },
  fieldText: { fontSize: 8, color: C.ink, lineHeight: 1.38 },
  actual: { margin: 5, padding: 5, borderRadius: 5 },
  actualLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  actualText: { fontSize: 7.5, color: C.body },
  evidence: {
    marginHorizontal: 10,
    marginTop: 7,
    padding: 7,
    borderWidth: 0.7,
    borderColor: C.line,
    borderRadius: 6,
    backgroundColor: C.shell,
  },
  evidenceLast: { marginBottom: 10 },
  evidenceLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.muted, marginBottom: 5 },
  evidenceImage: { width: "100%", height: 100, objectFit: "contain", backgroundColor: C.raised },
});

export function TechnicalReportDocument({ report, logoSrc }: { report: PdfReportData; logoSrc: string }) {
  return (
    <Document author="QA Flow" title={`Relatório técnico - ${report.planName}`} subject={`Tentativa ${report.attempt}`}>
      <Page size="A4" style={shared.page}>
        <ReportHeader report={report} logoSrc={logoSrc} kind="RELATÓRIO TÉCNICO DE EVIDÊNCIAS" />

        <View style={T.context}>
          <View style={T.contextItem}><Text style={T.contextLabel}>PROJETO</Text><Text style={T.contextValue}>{report.project || "Não informado"}</Text></View>
          <View style={T.contextItem}><Text style={T.contextLabel}>AMBIENTE</Text><Text style={T.contextValue}>{report.environment || "Não informado"}</Text></View>
          <View style={T.contextItem}><Text style={T.contextLabel}>BUILD</Text><Text style={T.contextValue}>{report.build || "Não informada"}</Text></View>
          <View style={T.contextItem}><Text style={T.contextLabel}>PLATAFORMA</Text><Text style={T.contextValue}>{report.platform || "Não informada"}</Text></View>
          <View style={T.contextItem}><Text style={T.contextLabel}>DISPOSITIVO / NAVEGADOR</Text><Text style={T.contextValue}>{[report.device, report.browser].filter(Boolean).join(" / ") || "Não informado"}</Text></View>
          <View style={T.contextItem}><Text style={T.contextLabel}>RESPONSÁVEL / INÍCIO</Text><Text style={T.contextValue}>{report.tester || report.createdBy} | {formatDate(report.startedAt)}</Text></View>
        </View>

        <Text style={shared.sectionTitle}>Casos, passos e evidências</Text>
        <Text style={T.intro}>Este relatório foi materializado a partir do snapshot imutável da tentativa. Cada resultado abaixo pertence à revisão registrada no início da execução.</Text>

        {report.cases.length === 0 ? (
          <Text style={T.noSteps}>Nenhum caso registrado no snapshot desta tentativa.</Text>
        ) : report.cases.map((testCase) => (
          <View key={testCase.id} style={T.caseCard} wrap={false}>
            <View wrap={false}>
              <View style={T.caseHeader}>
                <View style={T.caseIdentity}>
                  <Text style={T.caseId}>{testCase.id}</Text>
                  <Text style={T.caseTitle}>{testCase.title}</Text>
                </View>
                <View style={[T.badge, { backgroundColor: STATUS_SOFT[testCase.status] }]}>
                  <Text style={[T.badgeText, { color: STATUS_COLOR[testCase.status] }]}>{STATUS_LABEL[testCase.status]}</Text>
                </View>
              </View>

              <View style={T.caseMeta}>
                <View style={T.metaLine}><Text style={T.metaLabel}>Prioridade</Text><Text style={T.metaValue}>{PRIORITY_LABEL[testCase.priority]}</Text></View>
                {testCase.path && <View style={T.metaLine}><Text style={T.metaLabel}>Caminho</Text><Text style={T.metaValue}>{testCase.path}</Text></View>}
                {testCase.precondition && <View style={T.metaLine}><Text style={T.metaLabel}>Pré-condição</Text><Text style={T.metaValue}>{testCase.precondition}</Text></View>}
                {testCase.references.length > 0 && <View style={T.metaLine}><Text style={T.metaLabel}>Referências</Text><Text style={T.metaValue}>{testCase.references.join(" | ")}</Text></View>}
              </View>
            </View>

            {testCase.steps.length === 0 ? (
              <Text style={T.noSteps}>Nenhum passo cadastrado.</Text>
            ) : testCase.steps.map((step, stepIndex) => (
              <View key={step.id}>
                <View style={[T.step, stepIndex === testCase.steps.length - 1 && step.evidence.length === 0 ? T.stepLast : {}]} wrap={false}>
                  <View style={T.stepHeader}>
                    <Text style={T.stepNumber}>PASSO {stepIndex + 1}</Text>
                    <Text style={[T.stepType, { color: TYPE_COLOR[step.type] ?? C.muted }]}>{step.type}</Text>
                    <Text style={[T.stepStatus, { color: STATUS_COLOR[step.status] }]}>{STATUS_LABEL[step.status]}</Text>
                  </View>
                  <View style={T.field}>
                    <Text style={T.fieldLabel}>AÇÃO</Text>
                    <Text style={T.fieldText}>{step.action}</Text>
                  </View>
                  <View style={[T.field, T.fieldExpected]}>
                    <Text style={T.fieldLabel}>RESULTADO ESPERADO</Text>
                    <Text style={T.fieldText}>{step.expectedResult}</Text>
                  </View>
                  {step.actualResult && (
                    <View style={[T.actual, { backgroundColor: STATUS_SOFT[step.status] }]}>
                      <Text style={[T.actualLabel, { color: STATUS_COLOR[step.status] }]}>RESULTADO OBTIDO / OBSERVAÇÃO</Text>
                      <Text style={T.actualText}>{step.actualResult}</Text>
                    </View>
                  )}
                </View>

                {step.evidence.map((source, evidenceIndex) => isRasterImageSource(source) ? (
                  <View
                    key={`${step.id}-evidence-${evidenceIndex}`}
                    style={[T.evidence, stepIndex === testCase.steps.length - 1 && evidenceIndex === step.evidence.length - 1 ? T.evidenceLast : {}]}
                    wrap={false}
                  >
                    <Text style={T.evidenceLabel}>EVIDÊNCIA {evidenceIndex + 1} DO PASSO {stepIndex + 1}</Text>
                    <Image src={source} style={T.evidenceImage} />
                  </View>
                ) : null)}
                {step.evidence.some((source) => isImageDataSource(source) && !isRasterImageSource(source)) && (
                  <Text style={[T.evidenceLabel, { marginHorizontal: 10, marginBottom: 8, color: C.muted }]}>Há evidência de imagem em formato não compatível com a visualização no PDF.</Text>
                )}
              </View>
            ))}
          </View>
        ))}

        <ReportFooter report={report} />
      </Page>
    </Document>
  );
}
