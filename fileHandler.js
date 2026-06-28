// fileHandler.js — PDF and TXT text extraction

const FileHandler = {

  async extractText(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'txt') return await this.readTxt(file);
    if (ext === 'pdf') return await this.readPdf(file);
    throw new Error('Only PDF and TXT files are supported.');
  },

  readTxt(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsText(file);
    });
  },

  async readPdf(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const typedArray = new Uint8Array(e.target.result);
          const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
          let fullText = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map(item => item.str).join(' ') + '\n';
          }
          resolve(fullText.trim());
        } catch (err) {
          reject(new Error('PDF reading failed: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Could not read PDF.'));
      reader.readAsArrayBuffer(file);
    });
  },

  // Trim to ~12,000 tokens (Groq context limit safe zone)
  trimContext(text, maxChars = 48000) {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + '\n\n[Document trimmed due to length...]';
  }
};
