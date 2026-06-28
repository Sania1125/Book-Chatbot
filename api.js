// api.js — Groq API integration (FREE)

const API = {
  endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  model: 'llama-3.3-70b-versatile', // Free & powerful model on Groq

  buildSystemPrompt(sourceData) {
    if (!sourceData || !sourceData.text) {
      return 'You are a helpful assistant.';
    }
    return `You are an expert assistant. Answer questions ONLY based on the document below.

Document: "${sourceData.name}"
Topic: ${sourceData.topic || 'General'}

--- DOCUMENT START ---
${sourceData.text}
--- DOCUMENT END ---

RULES:
1. Answer ONLY from the document above.
2. If answer is not in the document, say: "This is not covered in the uploaded document."
3. Be clear, helpful, and concise.
4. Quote relevant parts when useful.`;
  },

  async sendMessage(messages, sourceData, apiKey) {
    if (!apiKey) throw new Error('Please enter your Groq API key first.');

    const systemPrompt = this.buildSystemPrompt(sourceData);

    // Format messages for OpenAI-compatible API
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: formattedMessages,
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Groq API request failed.');
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No response received.';
  }
};
