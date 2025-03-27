// Create a new file for text summarization

import axios from 'axios';

export class TextSummarizer {
    private apiKey: string;
    
    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }
    
    async summarizeText(text: string, maxLength: number = 500): Promise<string> {
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "system",
                            content: `You are a text summarization assistant. Summarize the provided text to approximately ${maxLength} characters while preserving key information.`
                        },
                        {
                            role: "user",
                            content: text
                        }
                    ],
                    max_tokens: maxLength / 2
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    }
                }
            );
            
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Error summarizing text:', error);
            throw new Error('Failed to summarize text');
        }
    }
}
