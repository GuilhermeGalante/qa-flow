/* eslint-disable react-refresh/only-export-components -- helpers de documento são usados por dois templates PDF */
/**
 * PDF 1 — Resumo Executivo
 * Leve, sem steps detalhados e sem imagens.
 * Contém: cabeçalho, gráfico de pizza, tabela de cenários com status.
 */
import {
  Document, Page, View, Text,
  Svg, Path, Rect,
  StyleSheet,
} from '@react-pdf/renderer';
import type { TestPlan, RunStatus } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function computeStatus(scenario: TestPlan['scenarios'][0]): RunStatus {
  const { steps } = scenario;
  if (!steps.length) return 'pending';
  if (steps.some((s) => s.status === 'failed'))  return 'failed';
  if (steps.some((s) => s.status === 'blocked')) return 'blocked';
  if (steps.every((s) => s.status === 'passed')) return 'passed';
  return 'pending';
}

export function piePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  if (a1 - a0 >= Math.PI * 2 - 0.01) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  }
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const lg = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${lg} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

// ── Palette & Maps ────────────────────────────────────────────────────────────

export const C = {
  passed: '#2db39e', failed: '#8b1a1a', blocked: '#a0a0a0', pending: '#c8c8c8',
  blue: '#1e5aa0', dark: '#1e1e1e', grey: '#646464', lgrey: '#d8d8d8',
  hbg: '#f2f2f2', rowAlt: '#fafafa', failBg: '#fff5f5',
  indigo: '#4f46e5', violet: '#7c3aed',
};
export const SC: Record<RunStatus, string> = { passed: C.passed, failed: C.failed, blocked: C.blocked, pending: C.grey, paused: C.grey, untested: C.pending };
export const SL: Record<RunStatus, string> = { passed: 'Passed', failed: 'Failed', blocked: 'Blocked', pending: 'Pending', paused: 'Paused', untested: 'Untested' };

// ── Shared styles ─────────────────────────────────────────────────────────────

export const shared = StyleSheet.create({
  page:      { paddingTop: 36, paddingBottom: 52, paddingHorizontal: 38, fontFamily: 'Helvetica', fontSize: 9, color: C.dark, backgroundColor: '#fff', lineHeight: 1.45 },
  hdrRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleBlk:  { flex: 1, paddingRight: 14 },
  planTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.blue, lineHeight: 1.4, marginBottom: 6 },
  metaLine:  { fontSize: 8, color: C.grey, marginBottom: 2 },
  logoRow:   { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 2 },
  logoQA:    { fontSize: 19, fontFamily: 'Helvetica-Bold', color: C.dark },
  logoFl:    { fontSize: 19, fontFamily: 'Helvetica-Bold', color: C.passed },
  sep:       { borderBottomWidth: 0.5, borderBottomColor: C.lgrey, marginVertical: 10 },
  secTitle:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 5 },
  breadcrumb:{ fontSize: 9, color: C.blue, marginBottom: 5 },
  tbl:       { width: '100%' },
  thr:       { flexDirection: 'row', backgroundColor: C.hbg, borderTopWidth: 0.5, borderTopColor: C.lgrey, borderLeftWidth: 0.5, borderLeftColor: C.lgrey, borderRightWidth: 0.5, borderRightColor: C.lgrey },
  tr:        { flexDirection: 'row', borderLeftWidth: 0.5, borderLeftColor: C.lgrey, borderRightWidth: 0.5, borderRightColor: C.lgrey, borderBottomWidth: 0.5, borderBottomColor: C.lgrey },
  trAlt:     { backgroundColor: C.rowAlt },
  th:        { paddingVertical: 4, paddingHorizontal: 4, fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.grey, borderRightWidth: 0.5, borderRightColor: C.lgrey },
  td:        { paddingVertical: 5, paddingHorizontal: 4, fontSize: 8, color: C.dark, borderRightWidth: 0.5, borderRightColor: C.lgrey },
});

// ── Pie chart ─────────────────────────────────────────────────────────────────

export interface Slice { value: number; color: string; label: string }

export function PieChart({ slices, total }: { slices: Slice[]; total: number }) {
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

// ── Header (reusable) ─────────────────────────────────────────────────────────

export function DocHeader({ plan, dateStr }: { plan: TestPlan; dateStr: string }) {
  return (
    <>
      <View style={shared.hdrRow}>
        <View style={shared.titleBlk}>
          <Text style={shared.planTitle}>Plano de testes - {plan.name}</Text>
          <Text style={shared.metaLine}>Project: {plan.meta.project}</Text>
          <Text style={shared.metaLine}>Created by {plan.meta.createdBy} on {dateStr}</Text>
          <Text style={shared.metaLine}>Test plan status: Open</Text>
        </View>
        <View style={shared.logoRow}>
          <Text style={shared.logoQA}>QA</Text>
          <Text style={shared.logoFl}>Flow</Text>
        </View>
      </View>
      <View style={shared.sep} />
    </>
  );
}

// ── Executive Summary Document ────────────────────────────────────────────────

const ES = StyleSheet.create({
  chartRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  legendBlk:  { flex: 1, paddingLeft: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  legendRect: { width: 10, height: 10, marginRight: 6 },
  legendLbl:  { fontSize: 9, color: C.dark },
});

export function ExecutiveSummaryDocument({ plan }: { plan: TestPlan }) {
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
  const CW = { id: '8%', title: '28%', status: '12%', date: '14%', by: '14%', el: '11%', iss: '13%' };

  return (
    <Document author="QA Flow" title={`Resumo Executivo - ${plan.name}`}>
      <Page size="A4" style={shared.page}>
        <DocHeader plan={plan} dateStr={dateStr} />

        {/* Pie chart + legend */}
        <View style={ES.chartRow}>
          <PieChart slices={slices} total={total} />
          <View style={ES.legendBlk}>
            {slices.map((sl) => (
              <View key={sl.color} style={ES.legendItem}>
                <Svg width={10} height={10} style={ES.legendRect}>
                  <Rect x={0} y={0} width={10} height={10} fill={sl.color} />
                </Svg>
                <Text style={ES.legendLbl}>{sl.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={shared.secTitle}>DETAILS</Text>
        <Text style={shared.breadcrumb}>{crumb}</Text>

        {/* Summary table — NO step details, NO images */}
        <View style={shared.tbl}>
          <View style={shared.thr} fixed>
            {[['ID', CW.id], ['TITLE', CW.title], ['STATUS', CW.status],
              ['TEST RESULT\nADDED ON', CW.date], ['TEST RESULT\nADDED BY', CW.by],
              ['ELAPSED\nTIME', CW.el], ['ISSUES LINKED', CW.iss]].map(([label, w]) => (
              <View key={label} style={[shared.th, { width: w }]}>
                <Text>{label}</Text>
              </View>
            ))}
          </View>
          {enriched.map((s, i) => {
            const issues = s.steps
              .filter((st) => st.status === 'failed' && st.comment)
              .map((st) => st.comment).join('; ');
            return (
              <View key={s.id} style={[shared.tr, i % 2 !== 0 ? shared.trAlt : {}]} wrap={false}>
                <View style={[shared.td, { width: CW.id }]}><Text>{s.caseId}</Text></View>
                <View style={[shared.td, { width: CW.title }]}><Text>{s.title}</Text></View>
                <View style={[shared.td, { width: CW.status }]}>
                  <Text style={{ color: SC[s.computed], fontFamily: 'Helvetica-Bold' }}>{SL[s.computed]}</Text>
                </View>
                <View style={[shared.td, { width: CW.date }]}>
                  <Text>{s.computed !== 'pending' ? today : ''}</Text>
                </View>
                <View style={[shared.td, { width: CW.by }]}>
                  <Text>{s.computed !== 'pending' ? plan.meta.createdBy : ''}</Text>
                </View>
                <View style={[shared.td, { width: CW.el }]}><Text /></View>
                <View style={[shared.td, { width: CW.iss, borderRightWidth: 0 }]}>
                  <Text>{issues}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </Page>
    </Document>
  );
}
