import {
  Document, Page, View, Text, Image,
  Svg, Path, Rect,
  StyleSheet,
} from '@react-pdf/renderer';
import type { TestPlan, RunStatus } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeStatus(scenario: TestPlan['scenarios'][0]): RunStatus {
  const { steps } = scenario;
  if (!steps.length) return 'pending';
  if (steps.some((s) => s.status === 'failed'))  return 'failed';
  if (steps.some((s) => s.status === 'blocked')) return 'blocked';
  if (steps.every((s) => s.status === 'passed')) return 'passed';
  return 'pending';
}

function piePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  if (a1 - a0 >= Math.PI * 2 - 0.01) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  }
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const lg = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${lg} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  passed: '#2db39e', failed: '#8b1a1a', blocked: '#a0a0a0', pending: '#c8c8c8',
  blue: '#1e5aa0', dark: '#1e1e1e', grey: '#646464', lgrey: '#d8d8d8',
  hbg: '#f2f2f2', rowAlt: '#fafafa', failBg: '#fff5f5',
  indigo: '#4f46e5', violet: '#7c3aed',
};
const SC: Record<RunStatus, string> = { passed: C.passed, failed: C.failed, blocked: C.blocked, pending: C.grey };
const SL: Record<RunStatus, string> = { passed: 'Passed', failed: 'Failed', blocked: 'Blocked', pending: 'Pending' };
const TC: Record<string, string>    = { Dado: C.indigo, Quando: C.blue, Então: C.violet, E: C.grey };

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page:       { paddingTop: 36, paddingBottom: 52, paddingHorizontal: 38, fontFamily: 'Helvetica', fontSize: 9, color: C.dark, backgroundColor: '#fff', lineHeight: 1.45 },
  // header
  hdrRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleBlk:   { flex: 1, paddingRight: 14 },
  planTitle:  { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.blue, lineHeight: 1.4, marginBottom: 6 },
  metaLine:   { fontSize: 8, color: C.grey, marginBottom: 2 },
  logoRow:    { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 2 },
  logoQA:     { fontSize: 19, fontFamily: 'Helvetica-Bold', color: C.dark },
  logoFl:     { fontSize: 19, fontFamily: 'Helvetica-Bold', color: C.passed },
  sep:        { borderBottomWidth: 0.5, borderBottomColor: C.lgrey, marginVertical: 10 },
  // chart
  chartRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  legendBlk:  { flex: 1, paddingLeft: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  legendRect: { width: 10, height: 10, marginRight: 6 },
  legendLbl:  { fontSize: 9, color: C.dark },
  // section
  secTitle:   { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 5 },
  breadcrumb: { fontSize: 9, color: C.blue, marginBottom: 5 },
  // table
  tbl:        { width: '100%' },
  thr:        { flexDirection: 'row', backgroundColor: C.hbg, borderTopWidth: 0.5, borderTopColor: C.lgrey, borderLeftWidth: 0.5, borderLeftColor: C.lgrey, borderRightWidth: 0.5, borderRightColor: C.lgrey },
  tr:         { flexDirection: 'row', borderLeftWidth: 0.5, borderLeftColor: C.lgrey, borderRightWidth: 0.5, borderRightColor: C.lgrey, borderBottomWidth: 0.5, borderBottomColor: C.lgrey },
  trAlt:      { backgroundColor: C.rowAlt },
  th:         { paddingVertical: 4, paddingHorizontal: 4, fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.grey, borderRightWidth: 0.5, borderRightColor: C.lgrey },
  td:         { paddingVertical: 5, paddingHorizontal: 4, fontSize: 8, color: C.dark, borderRightWidth: 0.5, borderRightColor: C.lgrey },
  // page 2
  p2Title:    { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 10 },
  scenCard:   { marginBottom: 12 },
  scenHdr:    { flexDirection: 'row', alignItems: 'center', marginBottom: 3, paddingVertical: 3 },
  scenStripe: { width: 3, marginRight: 6 },
  scenTitle:  { flex: 1, fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.dark },
  scenBadge:  { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  stepsTbl:   { width: '100%', borderWidth: 0.5, borderColor: C.lgrey },
  stepThr:    { flexDirection: 'row', backgroundColor: C.hbg },
  stepTr:     { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: C.lgrey },
  stepTrAlt:  { backgroundColor: C.rowAlt },
  stepTh:     { paddingVertical: 3, paddingHorizontal: 3, fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: C.grey, borderRightWidth: 0.5, borderRightColor: C.lgrey },
  stepTd:     { paddingVertical: 4, paddingHorizontal: 4, fontSize: 7.5, color: C.dark, borderRightWidth: 0.5, borderRightColor: C.lgrey },
  failBox:    { backgroundColor: C.failBg, marginTop: 3, paddingVertical: 5, paddingHorizontal: 8, borderLeftWidth: 2, borderLeftColor: C.failed },
  failLbl:    { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.failed, marginBottom: 3 },
  failTxt:    { fontSize: 7, color: C.grey, marginBottom: 4 },
  evidImg:    { width: '100%', height: 180, objectFit: 'contain', marginTop: 4 },
});

// ── PieChart component ────────────────────────────────────────────────────────

interface Slice { value: number; color: string; label: string }

function PieChart({ slices, total }: { slices: Slice[]; total: number }) {
  const cx = 95, cy = 90, r = 80;
  const paths: { d: string; color: string }[] = [];
  let a = -Math.PI / 2;
  for (const sl of slices) {
    if (!sl.value) continue;
    const da = (sl.value / total) * 2 * Math.PI;
    paths.push({ d: piePath(cx, cy, r, a, a + da), color: sl.color });
    a += da;
  }
  return (
    <Svg width={210} height={195} viewBox="0 0 210 195">
      {paths.map((p, i) => <Path key={i} d={p.d} fill={p.color} stroke="white" strokeWidth={1.5} />)}
    </Svg>
  );
}

// ── Main Document ─────────────────────────────────────────────────────────────

export function ReportDocument({ plan }: { plan: TestPlan }) {
  const enriched = plan.scenarios.map((s) => ({ ...s, computed: computeStatus(s) }));
  const total   = enriched.length;
  const passed  = enriched.filter((s) => s.computed === 'passed').length;
  const failed  = enriched.filter((s) => s.computed === 'failed').length;
  const blocked = enriched.filter((s) => s.computed === 'blocked').length;
  const pending = enriched.filter((s) => s.computed === 'pending').length;
  const pct     = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const slices: Slice[] = [
    { value: passed,  color: C.passed,  label: `Passed (${passed}/${total}) - ${pct(passed)}%`   },
    { value: failed,  color: C.failed,  label: `Failed (${failed}/${total}) - ${pct(failed)}%`   },
    { value: blocked, color: C.blocked, label: `Blocked (${blocked}/${total}) - ${pct(blocked)}%` },
    { value: pending, color: C.pending, label: `Pending (${pending}/${total}) - ${pct(pending)}%` },
  ].filter((s) => s.value > 0);

  const crumb   = [plan.meta.project, plan.meta.section].filter(Boolean).join(' / ') || plan.name;
  const dateStr = new Date(plan.meta.createdAt).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const today = new Date().toLocaleDateString('pt-BR');

  // Column widths for scenario table
  const CW = { id: '8%', title: '27%', status: '12%', date: '14%', by: '14%', el: '11%', iss: '14%' };
  const STEP_CW = { n: '5%', type: '9%', action: '42%', exp: '36%', status: '8%' };

  return (
    <Document author="QA Flow" title={`QAFlow - ${plan.name}`}>

      {/* ── PAGE 1: Summary ── */}
      <Page size="A4" style={S.page}>
        {/* Header row */}
        <View style={S.hdrRow}>
          <View style={S.titleBlk}>
            <Text style={S.planTitle}>Plano de testes - {plan.name}</Text>
            <Text style={S.metaLine}>Project: {plan.meta.project}</Text>
            <Text style={S.metaLine}>Created by {plan.meta.createdBy} on {dateStr}</Text>
            <Text style={S.metaLine}>Test plan status: Open</Text>
          </View>
          <View style={S.logoRow}>
            <Text style={S.logoQA}>QA</Text>
            <Text style={S.logoFl}>Flow</Text>
          </View>
        </View>

        <View style={S.sep} />

        {/* Pie chart + legend */}
        <View style={S.chartRow}>
          <PieChart slices={slices} total={total} />
          <View style={S.legendBlk}>
            {slices.map((sl) => (
              <View key={sl.color} style={S.legendItem}>
                <Svg width={10} height={10} style={S.legendRect}>
                  <Rect x={0} y={0} width={10} height={10} fill={sl.color} />
                </Svg>
                <Text style={S.legendLbl}>{sl.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={S.secTitle}>DETAILS</Text>
        <Text style={S.breadcrumb}>{crumb}</Text>

        {/* Scenarios table */}
        <View style={S.tbl}>
          <View style={S.thr} fixed>
            {[['ID', CW.id], ['TITLE', CW.title], ['STATUS', CW.status],
              ['TEST RESULT\nADDED ON', CW.date], ['TEST RESULT\nADDED BY', CW.by],
              ['ELAPSED\nTIME', CW.el], ['ISSUES LINKED', CW.iss]].map(([label, w]) => (
              <View key={label} style={[S.th, { width: w }]}>
                <Text>{label}</Text>
              </View>
            ))}
          </View>
          {enriched.map((s, i) => {
            const issues = s.steps
              .filter((st) => st.status === 'failed' && st.comment)
              .map((st) => st.comment).join('; ');
            return (
              <View key={s.id} style={[S.tr, i % 2 !== 0 ? S.trAlt : {}]} wrap={false}>
                <View style={[S.td, { width: CW.id }]}><Text>{s.caseId}</Text></View>
                <View style={[S.td, { width: CW.title }]}><Text>{s.title}</Text></View>
                <View style={[S.td, { width: CW.status }]}>
                  <Text style={{ color: SC[s.computed], fontFamily: 'Helvetica-Bold' }}>{SL[s.computed]}</Text>
                </View>
                <View style={[S.td, { width: CW.date }]}>
                  <Text>{s.computed !== 'pending' ? today : ''}</Text>
                </View>
                <View style={[S.td, { width: CW.by }]}>
                  <Text>{s.computed !== 'pending' ? plan.meta.createdBy : ''}</Text>
                </View>
                <View style={[S.td, { width: CW.el }]}><Text /></View>
                <View style={[S.td, { width: CW.iss, borderRightWidth: 0 }]}><Text>{issues}</Text></View>
              </View>
            );
          })}
        </View>
      </Page>

      {/* ── PAGE 2: Step Details ── */}
      <Page size="A4" style={S.page}>
        <Text style={S.p2Title}>DETALHAMENTO DOS PASSOS</Text>

        {enriched.map((scenario) => {
          const failedSteps = scenario.steps.filter(
            (st) => st.status === 'failed' && (st.comment || st.evidence)
          );
          return (
            <View key={scenario.id} style={S.scenCard} wrap={false}>
              {/* Scenario header */}
              <View style={S.scenHdr}>
                <View style={[S.scenStripe, { backgroundColor: SC[scenario.computed], height: 16 }]} />
                <Text style={S.scenTitle}>{scenario.caseId} — {scenario.title}</Text>
                <Text style={[S.scenBadge, { color: SC[scenario.computed] }]}>{SL[scenario.computed]}</Text>
              </View>

              {/* Steps table */}
              {scenario.steps.length > 0 ? (
                <View style={S.stepsTbl}>
                  <View style={S.stepThr}>
                    {[['#', STEP_CW.n], ['TIPO', STEP_CW.type], ['AÇÃO', STEP_CW.action],
                      ['RESULTADO ESPERADO', STEP_CW.exp], ['STATUS', STEP_CW.status]].map(([h, w]) => (
                      <View key={h} style={[S.stepTh, { width: w }]}><Text>{h}</Text></View>
                    ))}
                  </View>
                  {scenario.steps.map((step, idx) => (
                    <View key={step.id} style={[S.stepTr, idx % 2 !== 0 ? S.stepTrAlt : {}]} wrap={false}>
                      <View style={[S.stepTd, { width: STEP_CW.n }]}>
                        <Text style={{ textAlign: 'center' }}>{idx + 1}</Text>
                      </View>
                      <View style={[S.stepTd, { width: STEP_CW.type }]}>
                        <Text style={{ color: TC[step.type] ?? C.grey, fontFamily: 'Helvetica-Bold' }}>{step.type}</Text>
                      </View>
                      <View style={[S.stepTd, { width: STEP_CW.action }]}><Text>{step.action}</Text></View>
                      <View style={[S.stepTd, { width: STEP_CW.exp }]}><Text>{step.expectedResult}</Text></View>
                      <View style={[S.stepTd, { width: STEP_CW.status, borderRightWidth: 0 }]}>
                        <Text style={{ color: SC[step.status], fontFamily: 'Helvetica-Bold' }}>{SL[step.status]}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: 7.5, color: C.grey, fontFamily: 'Helvetica-Oblique', marginLeft: 6 }}>
                  Nenhum passo cadastrado.
                </Text>
              )}

              {/* Failure evidence blocks */}
              {failedSteps.map((fs, fi) => (
                <View key={fi} style={S.failBox} wrap={false}>
                  <Text style={S.failLbl}>Evidência de falha — {fs.type}: {fs.action}</Text>
                  {fs.comment ? <Text style={S.failTxt}>{fs.comment}</Text> : null}
                  {fs.evidence ? (
                    <Image
                      src={fs.evidence}
                      style={S.evidImg}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          );
        })}
      </Page>
    </Document>
  );
}
