import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';

class DocumentManager {
    constructor() {
        this.documentsPath = path.join(process.cwd(), 'documents');
        this.metadataFile = path.join(this.documentsPath, 'metadata.json');
        this.metadata = {};
        this.embeddings = new Map();
    }

    async initialize() {
        // Create documents directory if it doesn't exist
        try {
            await fs.mkdir(this.documentsPath, { recursive: true });
            await this.loadMetadata();
        } catch (error) {
            console.error('Error initializing document manager:', error);
        }
    }

    async loadMetadata() {
        try {
            const data = await fs.readFile(this.metadataFile, 'utf8');
            this.metadata = JSON.parse(data);
        } catch (error) {
            // Initialize empty metadata if file doesn't exist
            this.metadata = {
                documents: {},
                totalDocuments: 0,
                lastUpdated: new Date().toISOString()
            };
            await this.saveMetadata();
        }
    }

    async saveMetadata() {
        await fs.writeFile(
            this.metadataFile,
            JSON.stringify(this.metadata, null, 2),
            'utf8'
        );
    }

    // Process and store uploaded document
    async processDocument(filePath, originalName, mimeType) {
        const docId = uuidv4();
        const fileExt = path.extname(originalName).toLowerCase();
        const destPath = path.join(this.documentsPath, `${docId}${fileExt}`);
        
        // Move file to documents directory
        await fs.rename(filePath, destPath);
        
        // Process content based on file type
        let content = '';
        let chunks = [];
        
        try {
            switch (fileExt) {
                case '.txt':
                case '.md':
                    content = await fs.readFile(destPath, 'utf8');
                    chunks = this.chunkText(content);
                    break;
                    
                case '.csv':
                    const csvContent = await fs.readFile(destPath, 'utf8');
                    const parsed = Papa.parse(csvContent, {
                        header: true,
                        dynamicTyping: true,
                        skipEmptyLines: true
                    });
                    
                    content = parsed.data.map(row => 
                        Object.entries(row).map(([key, value]) => `${key}: ${value}`).join(', ')
                    ).join('\n');
                    chunks = this.chunkText(content);
                    break;
                    
                case '.json':
                    const jsonContent = await fs.readFile(destPath, 'utf8');
                    const jsonData = JSON.parse(jsonContent);
                    content = JSON.stringify(jsonData, null, 2);
                    chunks = this.chunkText(content);
                    break;
                    
                case '.pdf':
                    // For now, store as-is - can add PDF processing later
                    content = `PDF document: ${originalName}`;
                    chunks = [content];
                    break;
                    
                case '.png':
                case '.jpg':
                case '.jpeg':
                    // Process image with Vision API if available
                    content = await this.processImage(destPath, originalName);
                    chunks = [content];
                    break;
                    
                default:
                    content = `Unsupported file type: ${fileExt}`;
                    chunks = [content];
            }
            
            // Generate embeddings for each chunk
            const embeddings = await this.generateEmbeddings(chunks);
            
            // Store document metadata
            this.metadata.documents[docId] = {
                id: docId,
                originalName,
                mimeType,
                fileExt,
                filePath: destPath,
                chunks: chunks.length,
                content: chunks, // Store chunks directly for simple search
                embeddings: embeddings,
                uploadedAt: new Date().toISOString(),
                size: (await fs.stat(destPath)).size,
                lastAccessed: null,
                accessCount: 0
            };
            
            this.metadata.totalDocuments++;
            this.metadata.lastUpdated = new Date().toISOString();
            await this.saveMetadata();
            
            return {
                success: true,
                documentId: docId,
                fileName: originalName,
                chunks: chunks.length,
                message: `Document processed successfully`
            };
            
        } catch (error) {
            console.error('Document processing error:', error);
            // Clean up file if processing failed
            try {
                await fs.unlink(destPath);
            } catch {}
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Chunk text for better retrieval
    chunkText(text, maxChunkSize = 1000, overlap = 200) {
        const chunks = [];
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        let currentChunk = '';
        
        for (const sentence of sentences) {
            if ((currentChunk + sentence).length <= maxChunkSize) {
                currentChunk += sentence + ' ';
            } else {
                if (currentChunk) chunks.push(currentChunk.trim());
                currentChunk = sentence + ' ';
            }
        }
        
        if (currentChunk) chunks.push(currentChunk.trim());
        return chunks.length > 0 ? chunks : [text];
    }

    // Generate embeddings using OpenAI API
    async generateEmbeddings(texts) {
        try {
            const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'text-embedding-ada-002',
                    input: texts
                })
            });
            
            if (!response.ok) {
                console.error('Embedding generation failed');
                return texts.map(() => []); // Return empty embeddings as fallback
            }
            
            const data = await response.json();
            return data.data.map(d => d.embedding);
        } catch (error) {
            console.error('Embedding error:', error);
            return texts.map(() => []); // Return empty embeddings as fallback
        }
    }

    // Process image with Vision API
    async processImage(imagePath, fileName) {
        try {
            const imageData = await fs.readFile(imagePath, { encoding: 'base64' });
            const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Describe this image in detail, including any text, objects, people, and context visible.'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${mimeType};base64,${imageData}`
                                }
                            }
                        ]
                    }],
                    max_tokens: 500
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                return `Image: ${fileName}\nDescription: ${result.choices[0].message.content}`;
            }
        } catch (error) {
            console.error('Vision API error:', error);
        }
        
        return `Image: ${fileName} (analysis not available)`;
    }

    // Search documents
    async searchDocuments(query, limit = 5) {
        try {
            // Generate embedding for query
            const queryEmbedding = await this.generateEmbeddings([query]);
            const qEmbed = queryEmbedding[0];
            
            const results = [];
            
            for (const [docId, doc] of Object.entries(this.metadata.documents)) {
                // Calculate relevance scores for each chunk
                const chunkScores = doc.content.map((chunk, idx) => {
                    // Simple text similarity if embeddings are not available
                    let score = 0;
                    
                    if (doc.embeddings && doc.embeddings[idx] && qEmbed.length > 0) {
                        // Cosine similarity
                        score = this.cosineSimilarity(qEmbed, doc.embeddings[idx]);
                    } else {
                        // Fallback to keyword matching
                        const queryWords = query.toLowerCase().split(/\s+/);
                        const chunkLower = chunk.toLowerCase();
                        score = queryWords.reduce((acc, word) => {
                            return acc + (chunkLower.includes(word) ? 1 : 0);
                        }, 0) / queryWords.length;
                    }
                    
                    return {
                        documentId: docId,
                        fileName: doc.originalName,
                        chunk,
                        chunkIndex: idx,
                        score
                    };
                });
                
                // Get best matching chunk from this document
                const bestChunk = chunkScores.reduce((best, current) => 
                    current.score > best.score ? current : best
                );
                
                if (bestChunk.score > 0) {
                    results.push(bestChunk);
                }
            }
            
            // Sort by relevance and limit
            results.sort((a, b) => b.score - a.score);
            const topResults = results.slice(0, limit);
            
            // Update access metadata
            for (const result of topResults) {
                const doc = this.metadata.documents[result.documentId];
                doc.lastAccessed = new Date().toISOString();
                doc.accessCount++;
            }
            await this.saveMetadata();
            
            return {
                success: true,
                query,
                resultsCount: topResults.length,
                results: topResults.map(r => ({
                    fileName: r.fileName,
                    content: r.chunk,
                    relevanceScore: r.score,
                    documentId: r.documentId
                }))
            };
            
        } catch (error) {
            console.error('Search error:', error);
            return {
                success: false,
                error: error.message,
                results: []
            };
        }
    }

    // Calculate cosine similarity between two vectors
    cosineSimilarity(vec1, vec2) {
        if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;
        
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }
        
        const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
        return denominator === 0 ? 0 : dotProduct / denominator;
    }

    // Get all documents
    async getAllDocuments() {
        return Object.values(this.metadata.documents).map(doc => ({
            id: doc.id,
            fileName: doc.originalName,
            fileType: doc.fileExt,
            size: doc.size,
            chunks: doc.chunks,
            uploadedAt: doc.uploadedAt,
            lastAccessed: doc.lastAccessed,
            accessCount: doc.accessCount
        }));
    }

    // Delete document
    async deleteDocument(documentId) {
        const doc = this.metadata.documents[documentId];
        if (!doc) {
            return { success: false, error: 'Document not found' };
        }
        
        try {
            // Delete file
            await fs.unlink(doc.filePath);
            
            // Remove from metadata
            delete this.metadata.documents[documentId];
            this.metadata.totalDocuments--;
            this.metadata.lastUpdated = new Date().toISOString();
            await this.saveMetadata();
            
            return {
                success: true,
                message: `Document ${doc.originalName} deleted`,
                documentId
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get document content
    async getDocumentContent(documentId) {
        const doc = this.metadata.documents[documentId];
        if (!doc) {
            return { success: false, error: 'Document not found' };
        }
        
        doc.lastAccessed = new Date().toISOString();
        doc.accessCount++;
        await this.saveMetadata();
        
        return {
            success: true,
            document: {
                id: doc.id,
                fileName: doc.originalName,
                content: doc.content.join('\n\n'),
                chunks: doc.chunks,
                uploadedAt: doc.uploadedAt
            }
        };
    }

    // Clear all documents
    async clearAllDocuments() {
        try {
            // Delete all document files
            for (const doc of Object.values(this.metadata.documents)) {
                try {
                    await fs.unlink(doc.filePath);
                } catch (error) {
                    console.error(`Failed to delete ${doc.filePath}:`, error);
                }
            }
            
            // Reset metadata
            this.metadata = {
                documents: {},
                totalDocuments: 0,
                lastUpdated: new Date().toISOString()
            };
            await this.saveMetadata();
            
            return {
                success: true,
                message: 'All documents cleared'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Create singleton instance
const documentManager = new DocumentManager();

export default documentManager;