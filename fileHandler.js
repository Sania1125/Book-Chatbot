// Keep complete text and physical PDF page numbers.
const FileHandler = {
  async extractDocument(file) {
    if (file.size > 50 * 1024 * 1024) throw new Error('Please use a file smaller than 50 MB.');
    const ext = file.name.split('.').pop().toLowerCase();
    let pages;
    const warnings = [];
    if (ext === 'pdf') {
      if (typeof pdfjsLib === 'undefined') throw new Error('PDF reader could not load. Check your connection and reload.');
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      pages = [];
      try {
        for (let number = 1; number <= pdf.numPages; number++) {
          const page = await pdf.getPage(number);
          const content = await page.getTextContent();
          const text = content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('').trim();
          pages.push({ number, text });
          page.cleanup();
        }
      } finally { await pdf.destroy(); }
      const empty = pages.filter(p => !p.text.trim()).length;
      if (empty) warnings.push(`${empty} PDF page(s) contain no readable text. Scanned pages and images need OCR before uploading.`);
    } else if (ext === 'txt' || ext === 'md') {
      pages = [{ number: null, text: await file.text() }];
    } else if (ext === 'docx') {
      if (typeof mammoth === 'undefined') throw new Error('Word reader could not load. Check your connection and reload.');
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      pages = [{ number: null, text: result.value }];
      if (result.messages.length) warnings.push('Some Word document elements could not be read. Check the source excerpts.');
    } else throw new Error('Supported formats: PDF, TXT, MD and DOCX. Convert other formats first.');
    if (!pages.some(p => p.text.trim())) throw new Error('No readable text found. For a scanned book, run OCR and upload the searchable PDF.');
    return { pages, warnings, version: 2 };
  }
};
