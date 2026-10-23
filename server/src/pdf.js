// Minimal single-page PDF writer (Helvetica text lines). Used for seeded demo documents.
const enc = new TextEncoder();
const byteLen = (s) => enc.encode(s).length;

export function makePdf(lines) {
  const esc = (s) => String(s).replace(/[^\x20-\x7e]/g, '-').replace(/([()\\])/g, '\\$1');
  const body = ['BT', '/F1 11 Tf', '14 TL', '56 780 Td']
    .concat(lines.map((l, i) => (i === 0 ? `/F1 13 Tf (${esc(l)}) Tj T* /F1 11 Tf` : `(${esc(l)}) Tj T*`)))
    .concat(['ET'])
    .join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${byteLen(body)} >>\nstream\n${body}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(byteLen(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = byteLen(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc.encode(out);
}
