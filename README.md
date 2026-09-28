# BookBot

A browser-based chatbot that searches uploaded books and answers with source quotations using Groq.

## Run

Serve this directory with a static web server (for example, `python -m http.server 8000`) and visit `http://localhost:8000`, or deploy the static files to GitHub Pages over HTTPS. No build step is required. Use a current browser with IndexedDB support.

1. Enter your own Groq API key from https://console.groq.com/keys.
2. Upload a searchable PDF, UTF-8 TXT/Markdown file, or DOCX file (up to 50 MB).
3. Ask a specific question. Answers include supporting quotations and PDF page numbers or passage numbers.
4. Create another folder for another book. Replacing a folder's document starts a fresh chat; earlier conversations remain readable.

**After upgrading, upload long books again.** The original app saved only the first 48,000 characters. The missing text cannot be recovered from that saved copy. Old conversations are kept, but start a new chat to use the current document.

## What changed

- Complete extracted text is saved in IndexedDB rather than trimmed or put into localStorage.
- Overlapping passages from every page are searched locally using BM25-style term ranking. Selected passages and neighboring text are sent within a bounded context budget.
- PDF citations use physical PDF page numbers, which may differ from printed page labels. TXT, MD and DOCX use passage identifiers because they have no stable PDF pagination.
- Answers require structured claims with quotations. Every source identifier and quotation is checked against the selected passages; invalid evidence is rejected. No document means no model request.
- Previous assistant responses are excluded from evidence. A previous user question helps resolve short follow-ups.
- Uploads and pending answers retain their original folder/chat even when the user switches conversations.
- Empty files and unreadable PDF pages are reported. Old truncated uploads require re-uploading.

## Limits and privacy

This improves grounding; it does not guarantee perfect answers. Quote validation verifies the text and location, not whether a generated explanation logically follows from it. Check the displayed evidence for important answers.

Search uses words from the question, so paraphrases, cross-language questions, complex tables, formulas and broad whole-book summaries may need more specific questions. An unsuccessful search does not prove the answer is absent from the book. The app does not provide OCR or interpret images; scanned books need OCR first. Legacy DOC and EPUB files must be converted. Large books can use substantial browser memory.

Books are stored in this browser's IndexedDB, and chats and the entered API key are stored in localStorage. Relevant book excerpts and the current/previous user questions are sent to Groq when answering. Only use a personal key on a trusted device; this static app is not a server-side key vault. A shared production deployment should use a backend with authentication and server-side secrets. Do not commit API keys.

Groq availability and account limits vary. The app reports rejected keys, rate limits, oversized requests and timeouts. It uses `llama-3.3-70b-versatile` and JSON object mode; see https://console.groq.com/docs/structured-outputs.

PDF.js and Mammoth are loaded from CDNs, so first load needs internet access. Browser storage must be enabled; clearing site data removes saved documents and chats.

## Tests

With Node.js 22 or newer:

```sh
node --test tests/core.test.cjs tests/app.test.cjs
```

For environments that prohibit child processes, Node.js 24 supports `--test-isolation=none`.

The tests use simulated model responses, PDF extraction and UI/storage adapters. They cover late-chapter retrieval, Unicode and numeric searches, chunk coverage, invalid evidence, refusal paths, API failures and cross-chat state isolation. They do not establish live model accuracy or real browser IndexedDB/CDN compatibility.

Before release, run the app in a browser, upload representative real PDFs and DOCX files, reload to check persistence, and ask known-answer and unanswerable questions with your Groq account. Compare each answer and quoted page against the original book.
