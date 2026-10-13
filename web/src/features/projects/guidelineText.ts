import { readZip } from '../../lib/zip.ts';

// The model call takes plain text, so each guideline format is reduced to text in the browser.
// The file itself is still what gets uploaded and stored with the project.
export const GUIDELINE_TYPES = ['.md', '.markdown', '.txt', '.docx', '.pdf', '.json'];
const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// A .docx is a ZIP whose word/document.xml lists the paragraphs in reading order. Numbers that
// Word generates for lists and headings are not stored as text, so they are not in the result.
async function docxText(file: Blob) {
  const entry = (await readZip(file).catch(() => [])).find((e) => e.name === 'word/document.xml');
  if (!entry) throw new Error('Tệp DOCX không hợp lệ: thiếu nội dung văn bản.');
  const xml = new DOMParser().parseFromString(await (await entry.blob()).text(), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length)
    throw new Error('Tệp DOCX không hợp lệ: không đọc được nội dung.');
  const lines: string[] = [];
  for (const paragraph of xml.getElementsByTagNameNS(WORD, 'p')) {
    let line = '';
    const walk = (node: Element) => {
      for (const child of node.children) {
        if (child.namespaceURI !== WORD) walk(child);
        else if (child.localName === 't') line += child.textContent;
        else if (child.localName === 'tab') line += '\t';
        else if (child.localName === 'br' || child.localName === 'cr') line += '\n';
        // Deleted text of a tracked change is no longer part of the document.
        else if (child.localName !== 'del' && child.localName !== 'p') walk(child);
      }
    };
    walk(paragraph);
    lines.push(line);
  }
  return lines.join('\n');
}

// Loaded on demand: the PDF reader is large and most projects never open one.
async function pdfText(file: Blob) {
  const [pdf, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdf.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdf.getDocument({ data: await file.arrayBuffer() });
  try {
    const document = await task.promise.catch(() => {
      throw new Error('Không mở được PDF (tệp hỏng hoặc có mật khẩu).');
    });
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const { items } = await (await document.getPage(number)).getTextContent();
      let page = '';
      for (const item of items) if ('str' in item) page += item.str + (item.hasEOL ? '\n' : '');
      pages.push(page);
    }
    return pages.join('\n');
  } finally {
    await task.destroy();
  }
}

export async function guidelineText(name: string, file: Blob) {
  const type = name.slice(name.lastIndexOf('.')).toLowerCase();
  const text =
    type === '.docx'
      ? await docxText(file)
      : type === '.pdf'
        ? await pdfText(file)
        : await file.text();
  if (!text.trim())
    throw new Error(
      type === '.pdf'
        ? 'PDF không có lớp chữ (có thể là bản quét). Dùng bản có chữ hoặc dán nội dung.'
        : 'Guideline rỗng.',
    );
  return text;
}
