/**
 * PDF 2 — Relatório Técnico de Evidências
 * Focado em rastreabilidade: exibe a estrutura Dado/Quando/Então,
 * status de cada passo, comentários de erro e imagens de evidência.
 *
 * Regra: cada bloco de passo usa wrap={false} para evitar que uma
 * imagem seja cortada no meio da quebra de página.
 */
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { TestPlan } from "../types";
import {
  computeStatus,
  DocHeader,
  C,
  SC,
  SL,
  shared,
} from "./ExecutiveSummaryDocument";

// ── Mapa de cores por tipo de passo BDD ──────────────────────────────────────

const TC: Record<string, string> = {
  Dado: C.indigo,
  Quando: C.blue,
  Então: C.violet,
  E: C.grey,
};

// ── Estilos do documento técnico ─────────────────────────────────────────────

const T = StyleSheet.create({
  pageTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
    marginBottom: 14,
  },
  // Cartão do cenário
  scenCard: { marginBottom: 18 },
  scenHdr: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: C.hbg,
    borderWidth: 0.5,
    borderColor: C.lgrey,
  },
  scenStripe: { width: 4, borderRadius: 1, marginRight: 8 },
  scenId: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.blue,
    marginRight: 6,
  },
  scenTitle: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.dark,
  },
  scenBadge: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  // Tabela de passos
  stepsTbl: {
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: C.lgrey,
  },
  stepsTblHdr: {
    flexDirection: "row",
    backgroundColor: C.hbg,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: C.lgrey,
  },
  stepTh: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.grey,
    borderRightWidth: 0.5,
    borderRightColor: C.lgrey,
  },
  // Bloco individual de passo (wrap={false} para não cortar imagem)
  stepBlock: { borderTopWidth: 0.5, borderTopColor: C.lgrey },
  stepRow: { flexDirection: "row" },
  stepRowAlt: { backgroundColor: C.rowAlt },
  stepTd: {
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 8,
    color: C.dark,
    borderRightWidth: 0.5,
    borderRightColor: C.lgrey,
  },
  // Caixa de comentário de erro
  commentBox: {
    marginHorizontal: 4,
    marginBottom: 4,
    marginTop: 0,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: "#fff5f5",
    borderLeftWidth: 2,
    borderLeftColor: C.failed,
  },
  commentLbl: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.failed,
    marginBottom: 3,
  },
  commentTxt: { fontSize: 7.5, color: C.grey },
  // Caixa de observação (status ≠ failed)
  observationBox: {
    marginHorizontal: 4,
    marginBottom: 4,
    marginTop: 0,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: "#f5faf7",
    borderLeftWidth: 2,
    borderLeftColor: C.passed,
  },
  observationLbl: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.passed,
    marginBottom: 3,
  },
  // Evidência visual
  evidWrap: {
    marginHorizontal: 4,
    marginBottom: 4,
    marginTop: 0,
    padding: 4,
    backgroundColor: "#f8f8f8",
    borderWidth: 0.5,
    borderColor: C.lgrey,
  },
  evidImg: { width: "100%", height: 210, objectFit: "contain" },
  // Rodapé de cenário sem passos
  noSteps: {
    fontSize: 7.5,
    color: C.grey,
    fontFamily: "Helvetica-Oblique",
    margin: 6,
  },
});

// ── Larguras das colunas da tabela de passos ─────────────────────────────────

const CW = {
  n: "5%",
  type: "9%",
  action: "43%",
  exp: "35%",
  status: "8%",
};

// ── Componente principal ─────────────────────────────────────────────────────

export function TechnicalReportDocument({ plan }: { plan: TestPlan }) {
  const enriched = plan.scenarios.map((s) => ({
    ...s,
    computed: computeStatus(s),
  }));

  const dateStr = new Date(plan.meta.createdAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <Document author="QA Flow" title={`Relatório Técnico - ${plan.name}`}>
      <Page size="A4" style={shared.page}>
        {/* Cabeçalho do plano */}
        <DocHeader plan={plan} dateStr={dateStr} />

        <Text style={T.pageTitle}>RELATÓRIO TÉCNICO DE EVIDÊNCIAS</Text>

        {enriched.map((scenario) => (
          <View key={scenario.id} style={T.scenCard}>
            {/* Cabeçalho do cenário */}
            <View style={T.scenHdr}>
              <View
                style={[
                  T.scenStripe,
                  { backgroundColor: SC[scenario.computed], height: 18 },
                ]}
              />
              <Text style={T.scenId}>{scenario.caseId}</Text>
              <Text style={T.scenTitle}>{scenario.title}</Text>
              <Text style={[T.scenBadge, { color: SC[scenario.computed] }]}>
                {SL[scenario.computed]}
              </Text>
            </View>

            {scenario.steps.length === 0 ? (
              <Text style={T.noSteps}>Nenhum passo cadastrado.</Text>
            ) : (
              <>
                {/* Cabeçalho da tabela */}
                <View style={T.stepsTblHdr}>
                  {(
                    [
                      ["#", CW.n],
                      ["TIPO", CW.type],
                      ["AÇÃO", CW.action],
                      ["ESPERADO", CW.exp],
                      ["STATUS", CW.status],
                    ] as [string, string][]
                  ).map(([h, w]) => (
                    <View
                      key={h}
                      style={[
                        T.stepTh,
                        {
                          width: w,
                          ...(h === "STATUS" ? { borderRightWidth: 0 } : {}),
                        },
                      ]}
                    >
                      <Text>{h}</Text>
                    </View>
                  ))}
                </View>

                {/* Linhas de passo — cada uma com wrap={false} */}
                <View style={T.stepsTbl}>
                  {scenario.steps.map((step, idx) => {
                    const hasComment = !!step.comment;
                    const hasEvidence = !!step.evidence;

                    return (
                      /* wrap={false}: impede que imagem seja cortada na quebra de página */
                      <View key={step.id} style={T.stepBlock} wrap={false}>
                        {/* Linha da tabela */}
                        <View
                          style={[T.stepRow, idx % 2 !== 0 ? T.stepRowAlt : {}]}
                        >
                          <View style={[T.stepTd, { width: CW.n }]}>
                            <Text style={{ textAlign: "center" }}>
                              {idx + 1}
                            </Text>
                          </View>
                          <View style={[T.stepTd, { width: CW.type }]}>
                            <Text
                              style={{
                                color: TC[step.type] ?? C.grey,
                                fontFamily: "Helvetica-Bold",
                              }}
                            >
                              {step.type}
                            </Text>
                          </View>
                          <View style={[T.stepTd, { width: CW.action }]}>
                            <Text>{step.action}</Text>
                          </View>
                          <View style={[T.stepTd, { width: CW.exp }]}>
                            <Text>{step.expectedResult}</Text>
                          </View>
                          <View
                            style={[
                              T.stepTd,
                              { width: CW.status, borderRightWidth: 0 },
                            ]}
                          >
                            <Text
                              style={{
                                color: SC[step.status],
                                fontFamily: "Helvetica-Bold",
                              }}
                            >
                              {SL[step.status]}
                            </Text>
                          </View>
                        </View>

                        {/* Comentário / Observação — cor condicional por status */}
                        {hasComment && (
                          <View
                            style={
                              step.status === "failed"
                                ? T.commentBox
                                : T.observationBox
                            }
                          >
                            <Text
                              style={
                                step.status === "failed"
                                  ? T.commentLbl
                                  : T.observationLbl
                              }
                            >
                              {step.status === "failed"
                                ? "Motivo da Falha"
                                : "Observação"}
                            </Text>
                            <Text style={T.commentTxt}>{step.comment}</Text>
                          </View>
                        )}

                        {/* Imagem de evidência (Base64) — max 210pt de altura */}
                        {hasEvidence && (
                          <View style={T.evidWrap}>
                            <Image src={step.evidence!} style={T.evidImg} />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        ))}
      </Page>
    </Document>
  );
}
