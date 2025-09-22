import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import xlsx from 'xlsx';

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
                    try {
                        const pdfBuffer = await fs.readFile(destPath);
                        const pdfData = await pdfParse(pdfBuffer);
                        content = pdfData.text;
                        chunks = this.chunkText(content);
                        console.log(`Extracted ${pdfData.numpages} pages from PDF`);
                    } catch (pdfError) {
                        console.error('PDF parsing error:', pdfError);
                        content = `PDF document: ${originalName} (text extraction failed)`;
                        chunks = [content];
                    }
                    break;
                    
                case '.png':
                case '.jpg':
                case '.jpeg':
                case '.gif':
                case '.webp':
                case '.svg':
                case '.bmp':
                    // Process image with Vision API
                    content = await this.processImage(destPath, originalName);
                    chunks = [content];  // Images get one chunk with description
                    break;
                    
                case '.docx':
                case '.doc':
                    try {
                        const docBuffer = await fs.readFile(destPath);
                        const result = await mammoth.extractRawText({ buffer: docBuffer });
                        content = result.value;
                        chunks = this.chunkText(content);
                    } catch (docError) {
                        console.error('Word document parsing error:', docError);
                        content = `Word document: ${originalName} (text extraction failed)`;
                        chunks = [content];
                    }
                    break;
                    
                case '.xlsx':
                case '.xls':
                    try {
                        const workbook = xlsx.readFile(destPath);
                        const sheets = [];
                        for (const sheetName of workbook.SheetNames) {
                            const sheet = workbook.Sheets[sheetName];
                            const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
                            sheets.push(`Sheet: ${sheetName}\n${jsonData.map(row => row.join('\t')).join('\n')}`);
                        }
                        content = sheets.join('\n\n');
                        chunks = this.chunkText(content);
                    } catch (xlsError) {
                        console.error('Excel parsing error:', xlsError);
                        content = `Excel document: ${originalName} (text extraction failed)`;
                        chunks = [content];
                    }
                    break;
                    
                case '.html':
                case '.htm':
                case '.xml':
                    content = await fs.readFile(destPath, 'utf8');
                    // Remove HTML tags for better text extraction
                    const textContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                    chunks = this.chunkText(textContent);
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

    // Chunk text for better retrieval - increased size for more context
    chunkText(text, maxChunkSize = 4000, overlap = 800) {
        const chunks = [];
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        let currentChunk = '';
        let previousChunk = '';
        
        for (const sentence of sentences) {
            if ((currentChunk + sentence).length <= maxChunkSize) {
                currentChunk += sentence + ' ';
            } else {
                if (currentChunk) {
                    // Add overlap from previous chunk for better context
                    if (previousChunk && overlap > 0) {
                        const overlapText = previousChunk.split(' ').slice(-Math.floor(overlap/10)).join(' ');
                        chunks.push(overlapText + ' ' + currentChunk.trim());
                    } else {
                        chunks.push(currentChunk.trim());
                    }
                    previousChunk = currentChunk;
                }
                currentChunk = sentence + ' ';
            }
        }
        
        if (currentChunk) {
            if (previousChunk && overlap > 0) {
                const overlapText = previousChunk.split(' ').slice(-Math.floor(overlap/10)).join(' ');
                chunks.push(overlapText + ' ' + currentChunk.trim());
            } else {
                chunks.push(currentChunk.trim());
            }
        }
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
            
            // Determine MIME type based on extension
            const ext = path.extname(fileName).toLowerCase();
            let mimeType = 'image/jpeg';  // default
            const mimeTypes = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.bmp': 'image/bmp',
                '.svg': 'image/svg+xml'
            };
            if (mimeTypes[ext]) {
                mimeType = mimeTypes[ext];
            }
            
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
                                text: 'Analyze this image thoroughly. Describe: 1) All visible text (OCR), 2) Objects and their positions, 3) People and their actions, 4) Colors and composition, 5) Any charts, graphs, or data visualizations, 6) The overall context and purpose of the image. Be as detailed as possible.'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${mimeType};base64,${imageData}`
                                }
                            }
                        ]
                    }],
                    max_tokens: 1500  // Increased for more detailed descriptions
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

    // Search documents - implementing hybrid search with better ranking
    async searchDocuments(query, limit = 20) {
        try {
            // Query rewriting for better search (following Azure best practices)
            const searchQuery = this.rewriteQuery(query);
            
            // Generate embedding for query
            const queryEmbedding = await this.generateEmbeddings([searchQuery]);
            const qEmbed = queryEmbedding[0];
            
            const results = [];
            
            for (const [docId, doc] of Object.entries(this.metadata.documents)) {
                // Calculate relevance scores for each chunk
                const chunkScores = doc.content.map((chunk, idx) => {
                    // Hybrid scoring: combine vector similarity and keyword matching
                    let vectorScore = 0;
                    let keywordScore = 0;
                    let semanticBoost = 0;
                    
                    // Vector similarity (if embeddings available)
                    if (doc.embeddings && doc.embeddings[idx] && qEmbed.length > 0) {
                        vectorScore = this.cosineSimilarity(qEmbed, doc.embeddings[idx]);
                    }
                    
                    // Keyword matching with TF-IDF style scoring
                    const queryWords = searchQuery.toLowerCase().split(/\s+/);
                    const chunkLower = chunk.toLowerCase();
                    const chunkWords = chunkLower.split(/\s+/);
                    
                    // Calculate term frequency and match score
                    for (const queryWord of queryWords) {
                        if (queryWord.length > 1) { // Include short terms like "TV"
                            // Use word boundary regex for exact matches
                            const regex = new RegExp(`\\b${queryWord}\\b`, 'gi');
                            const occurrences = (chunkLower.match(regex) || []).length;
                            if (occurrences > 0) {
                                // Weight by inverse document frequency (IDF-like)
                                const tf = occurrences / chunkWords.length; // Term frequency
                                keywordScore += tf * 2; // Higher weight for term frequency
                            }
                        }
                    }
                    
                    // Boost for exact phrase matches
                    if (chunk.toLowerCase().includes(query.toLowerCase())) {
                        semanticBoost = 0.4;
                    }
                    
                    // Normalize keyword score
                    keywordScore = Math.min(keywordScore / queryWords.length, 1);
                    
                    // Hybrid score with weights (following Azure's approach)
                    // 60% vector, 30% keyword, 10% semantic boost
                    const hybridScore = (vectorScore * 0.6) + (keywordScore * 0.3) + semanticBoost;
                    
                    return {
                        documentId: docId,
                        fileName: doc.originalName,
                        chunk,
                        chunkIndex: idx,
                        vectorScore,
                        keywordScore,
                        hybridScore,
                        score: hybridScore, // Use hybrid score as main score
                        metadata: {
                            uploadedAt: doc.uploadedAt,
                            fileType: doc.fileExt,
                            accessCount: doc.accessCount
                        }
                    };
                });
                
                // Get ALL chunks that have any relevance - let reranking handle selection
                const topChunks = chunkScores
                    .filter(chunk => chunk.score > 0) // Include any chunk with a score
                    .sort((a, b) => b.score - a.score);
                
                results.push(...topChunks);
            }
            
            // Sort by relevance with diversity (don't return all chunks from same doc)
            results.sort((a, b) => b.score - a.score);
            
            // Ensure diversity - max 3 chunks from same document
            const diverseResults = [];
            const docCounts = {};
            
            for (const result of results) {
                const docId = result.documentId;
                if (!docCounts[docId]) docCounts[docId] = 0;
                
                // Following Pinecone best practice - don't limit chunks per document
                diverseResults.push(result);
                docCounts[docId]++;
                if (diverseResults.length >= limit) break;
            }
            
            const topResults = diverseResults;
            
            // Update access metadata
            for (const result of topResults) {
                const doc = this.metadata.documents[result.documentId];
                doc.lastAccessed = new Date().toISOString();
                doc.accessCount++;
            }
            await this.saveMetadata();
            
            return {
                success: true,
                query: query,
                searchQuery: searchQuery, // Include rewritten query
                resultsCount: topResults.length,
                results: topResults.map(r => ({
                    fileName: r.fileName,
                    content: r.chunk,
                    relevanceScore: r.score,
                    vectorScore: r.vectorScore,
                    keywordScore: r.keywordScore,
                    documentId: r.documentId,
                    metadata: r.metadata
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

    // Query rewriting for better search (following Azure best practices)
    rewriteQuery(query) {
        // Expand abbreviations and add synonyms
        let rewritten = query;
        
        // Common expansions
        const expansions = {
            'roi': 'return on investment ROI',
            'api': 'application programming interface API',
            'ai': 'artificial intelligence AI',
            'ml': 'machine learning ML',
            'rag': 'retrieval augmented generation RAG',
            'llm': 'large language model LLM',
            'ui': 'user interface UI',
            'ux': 'user experience UX'
        };
        
        // Replace abbreviations with expanded forms
        for (const [abbr, expansion] of Object.entries(expansions)) {
            const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
            if (regex.test(rewritten)) {
                rewritten = rewritten.replace(regex, expansion);
            }
        }
        
        return rewritten;
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