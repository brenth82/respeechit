// Create a new analytics module

export class Analytics {
    private static data = {
        totalConverts: 0,
        charactersProcessed: 0,
        byVoice: {},
        byDate: {},
        averageProcessingTime: 0,
        totalProcessingTime: 0
    };
    
    static trackConversion(text: string, voice: string, processingTime: number) {
        this.data.totalConverts++;
        this.data.charactersProcessed += text.length;
        
        // Track by voice
        if (!this.data.byVoice[voice]) {
            this.data.byVoice[voice] = 0;
        }
        this.data.byVoice[voice]++;
        
        // Track by date
        const today = new Date().toISOString().split('T')[0];
        if (!this.data.byDate[today]) {
            this.data.byDate[today] = 0;
        }
        this.data.byDate[today]++;
        
        // Track processing time
        this.data.totalProcessingTime += processingTime;
        this.data.averageProcessingTime = this.data.totalProcessingTime / this.data.totalConverts;
        
        // Persist analytics data
        this.saveData();
    }
    
    static getStats() {
        return {
            ...this.data,
            // Add more derived stats
            popularVoice: Object.entries(this.data.byVoice)
                .sort((a, b) => b[1] - a[1])[0]?.[0] || 'none'
        };
    }
    
    private static saveData() {
        // Save to file or database
        // For simplicity, we're just keeping in memory here
    }
}
