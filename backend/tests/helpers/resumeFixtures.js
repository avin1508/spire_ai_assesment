import JSZip from 'jszip';

// Real (minimal) PDF and DOCX files for tests, built in memory.

export const SAMPLE_RESUME_LINES = [
  'Asha Verma',
  'asha.verma@example.com | +91 98765 43210 | Pune, Maharashtra, India',
  'Senior Backend Engineer at Northwind Tech (2023-04 to present)',
  'Built Node.js and MongoDB services handling payments and notifications.',
  'Backend Engineer at Bluepeak Labs (2020-06 to 2023-03)',
  'Designed REST APIs and Redis caching for a logistics platform.',
  'Education: B.Tech Computer Science, Example Institute of Technology, 2016-2020',
  'Skills: Node.js, Express, MongoDB, Redis, Docker, TypeScript, AWS',
];

const escapePdf = (text) => text.replace(/[\\()]/g, (char) => `\\${char}`);

// A one-page PDF whose text layer contains `lines` (empty → no text at all).
export function makePdf(lines = SAMPLE_RESUME_LINES) {
  const content = lines.length
    ? ['BT', '/F1 11 Tf', '14 TL', '50 780 Td', ...lines.map((line) => `(${escapePdf(line)}) Tj T*`), 'ET'].join('\n')
    : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const xmlEscape = (text) => text.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[char]);

// A minimal Word document with one paragraph per line.
export async function makeDocx(lines = SAMPLE_RESUME_LINES) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      lines.map((line) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`).join('') +
      '</w:body></w:document>'
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

// What a well-behaved model returns for SAMPLE_RESUME_LINES.
export const SAMPLE_MODEL_OUTPUT = {
  fullName: 'Asha Verma',
  email: 'asha.verma@example.com',
  countryCode: '+91',
  phone: '98765 43210',
  currentRole: 'Senior Backend Engineer',
  currentCompany: 'Northwind Tech',
  currentLocation: 'Pune, Maharashtra, India',
  preferredLocations: [],
  experienceYears: '5',
  experienceMonths: '4',
  skills: ['Node.js', 'Express', 'MongoDB', 'Redis', 'Docker', 'TypeScript', 'AWS'],
  experiences: [
    { title: 'Senior Backend Engineer', company: 'Northwind Tech', startDate: '2023-04', endDate: '' },
    { title: 'Backend Engineer', company: 'Bluepeak Labs', startDate: '2020-06', endDate: '2023-03' },
  ],
  education: [
    {
      institution: 'Example Institute of Technology',
      degree: 'B.Tech',
      field: 'Computer Science',
      startYear: '2016',
      endYear: '2020',
    },
  ],
};
