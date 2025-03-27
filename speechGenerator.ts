import { OpenAIClient } from './openaiClient';
import { DocumentProcessor } from './documentProcessor';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

export class SpeechGenerator {
    private client: OpenAIClient;

    constructor(apiKey: string) {
        this.client = new OpenAIClient(apiKey);
    }

    async generateSpeechFromDocument(document: string, outputDir: string, voice: string = "alloy", instructions: string = "Speak in a neutral tone."): Promise<string[]> {
        const chunkSize = 1000; // Limit chunk size to 1000 characters
        const chunks = DocumentProcessor.splitDocument(document, chunkSize);
        const filePaths: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
            try {
                console.log(`Generating speech for chunk ${i + 1}/${chunks.length}...`);
                console.log(`Chunk content: "${chunks[i]}"`);
                const audioBuffer = await this.client.generateSpeech(chunks[i], voice, instructions);
                const outputPath = path.join(outputDir, `chunk_${i + 1}.mp3`);
                fs.writeFileSync(outputPath, audioBuffer);
                filePaths.push(outputPath.replace(/\\/g, '/')); // Ensure consistent URL paths
                console.log(`Successfully generated speech for chunk ${i + 1}`);
            } catch (error) {
                console.error(`Skipping chunk ${i + 1} due to error:`, error.message || error);
                continue; // Skip to the next chunk instead of throwing
            }
        }
        console.log(`Speech generation completed. Successfully processed ${filePaths.length}/${chunks.length} chunks.`);
        return filePaths;
    }

    async combineAudioFiles(filePaths: string[], outputPath: string): Promise<string> {
        // Requires ffmpeg to be installed on the system
        if (filePaths.length === 0) return null;
        if (filePaths.length === 1) return filePaths[0];
        
        const fileList = filePaths.map(f => `"${f}"`).join('|');
        const command = `ffmpeg -i "concat:${fileList}" -acodec copy "${outputPath}"`;
        
        try {
            await execAsync(command);
            return outputPath;
        } catch (error) {
            console.error('Failed to combine audio files:', error);
            throw new Error('Failed to combine audio files');
        }
    }
}
