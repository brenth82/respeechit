export class DocumentProcessor {
    static splitDocument(text: string, chunkSize: number = 1000): string[] {
        if (!text?.trim()) { // Handle empty or whitespace-only strings
            return [];
        }
        if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
            throw new Error("chunkSize must be a positive integer.");
        }
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.slice(i, i + chunkSize));
        }
        return chunks;
    }

    // Add text preprocessing methods

    // Add these methods to the DocumentProcessor class
    static preprocessText(text: string, options: {
        normalizeAbbreviations?: boolean,
        expandNumbers?: boolean,
        improvePronunciation?: boolean,
        addPunctuation?: boolean,
    } = {}): string {
        let processedText = text;
        
        if (options.normalizeAbbreviations) {
            processedText = this.expandAbbreviations(processedText);
        }
        
        if (options.expandNumbers) {
            processedText = this.expandNumbers(processedText);
        }
        
        if (options.improvePronunciation) {
            processedText = this.improvePronunciation(processedText);
        }
        
        if (options.addPunctuation) {
            processedText = this.addPunctuation(processedText);
        }
        
        return processedText;
    }

    static expandAbbreviations(text: string): string {
        // Replace common abbreviations
        const abbreviations = {
            'Dr.': 'Doctor',
            'Mr.': 'Mister',
            'Mrs.': 'Missus',
            'e.g.': 'for example',
            'i.e.': 'that is',
            'etc.': 'etcetera',
            // Add more as needed
        };
        
        let processedText = text;
        for (const [abbr, expanded] of Object.entries(abbreviations)) {
            processedText = processedText.replace(new RegExp(`\\b${abbr.replace('.', '\\.')}\\b`, 'g'), expanded);
        }
        
        return processedText;
    }

    // Additional helper methods for other preprocessing steps
    // ...
}
