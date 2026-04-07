import { pdf } from '@react-pdf/renderer';
import { ReportDocument } from './ReportDocument';
import type { TestPlan } from '../types';

/**
 * Gera o PDF usando @react-pdf/renderer e dispara o download no browser.
 * É async porque pdf().toBlob() retorna uma Promise.
 */
export async function generatePdfReport(plan: TestPlan): Promise<void> {
  try {
    const blob = await pdf(<ReportDocument plan={plan} />).toBlob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const safe = plan.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').slice(0, 40);
    a.href     = url;
    a.download = `QAFlow_${safe}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[generatePdfReport]', err);
    alert('Erro ao gerar o PDF. Veja o console para detalhes.');
  }
}
