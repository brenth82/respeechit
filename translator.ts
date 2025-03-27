// Create a new translator module

import axios from 'axios';

export class Translator {
    private apiKey: string;
    
    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }
    
    async translateText(text: string, targetLanguage: string): Promise<string> {
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "system",
                            content: `You are a translator. Translate the provided text to ${targetLanguage}.`
                        },
                        {
                            role: "user",
                            content: text
                        }
                    ]
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
            console.error('Error translating text:', error);
            throw new Error('Failed to translate text');
        }
    }
}
