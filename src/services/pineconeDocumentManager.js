import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import xlsx from 'xlsx';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

class PineconeDocumentManager {
    constructor() {
        this.documentsPath = path.join(process.cwd(), 'documents');
        this.metadataFile = path.join(this.documentsPath, 'metadata.json');
        this.metadata = {};
        this.pinecone = null;
        this.index = null;
        this.openai = null;
        this.indexName = 'voicebot-documents';
        this.namespace = 'default';
    }

    async initialize() {
        try {
            // Create documents directory if it doesn't exist
            await fs.mkdir(this.documentsPath, { recursive: true });
            
            // Initialize OpenAI client
            this.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
            
            // Initialize Pinecone client
            this.pinecone = new Pinecone({
                apiKey: process.env.PINECONE_API_KEY || ''
            });
            
            // Check if we have Pinecone API key
            if (!process.env.PINECONE_API_KEY) {
                console.warn('⚠️ Pinecone API key not found. Please set PINECONE_API_KEY in .env');
                console.warn('Get your free API key at: https://www.pinecone.io/');
                // Fall back to in-memory storage
                this.index = null;
            } else {
                try {
                    // Get or create index
                    const indexes = await this.pinecone.listIndexes();
                    const indexExists = indexes.indexes?.some(idx => idx.name === this.indexName);
                    
                    if (!indexExists) {
                        console.log('Creating Pinecone index...');
                        await this.pinecone.createIndex({
                            name: this.indexName,
                            dimension: 1536, // OpenAI embeddings dimension
                            metric: 'cosine',
                            spec: {
                                serverless: {
                                    cloud: 'aws',
                                    region: 'us-east-1'
                                }
                            }
                        });
                        
                        // Wait for index to be ready
                        await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60s for index creation
                    }
                    
                    this.index = this.pinecone.index(this.indexName);
                    console.log('Connected to Pinecone index:', this.indexName);
                } catch (error) {
                    console.error('Pinecone initialization error:', error);
                    console.log('Falling back to local storage');
                    this.index = null;
                }
            }
            
            await this.loadMetadata();
        } catch (error) {
            console.error('Error initializing Pinecone document manager:', error);
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

    // Generate embeddings using OpenAI
    async generateEmbeddings(texts) {
        try {
            const response = await this.openai.embeddings.create({
                model: "text-embedding-3-small",  // Using newer, better model
                input: texts
            });
            
            return response.data.map(d => d.embedding);
        } catch (error) {
            console.error('Embedding generation error:', error);
            // Return empty embeddings as fallback
            return texts.map(() => new Array(1536).fill(0));
        }
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
                        
                        // Check if we got meaningful text
                        if (pdfData.text && pdfData.text.trim().length > 50) {
                            content = pdfData.text;
                            chunks = this.chunkText(content);
                            console.log(`Extracted ${pdfData.numpages} pages from PDF (${content.length} chars)`);
                        } else {
                            // PDF might be scanned/image-based, use Vision API
                            console.log('PDF has minimal text, attempting OCR with Vision API...');
                            content = await this.processPDFWithVision(destPath, originalName);
                            chunks = this.chunkText(content);
                        }
                    } catch (pdfError) {
                        console.error('PDF parsing error, trying Vision API:', pdfError);
                        // Fallback to Vision API for OCR
                        try {
                            content = await this.processPDFWithVision(destPath, originalName);
                            chunks = this.chunkText(content);
                        } catch (visionError) {
                            console.error('Vision API error:', visionError);
                            content = `PDF document: ${originalName} (extraction failed)`;
                            chunks = [content];
                        }
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
            
            // Generate embeddings for chunks
            const embeddings = await this.generateEmbeddings(chunks);
            
            // Store in Pinecone if available, otherwise use local storage
            if (this.index) {
                // Prepare vectors for Pinecone
                const vectors = [];
                for (let i = 0; i < chunks.length; i++) {
                    vectors.push({
                        id: `${docId}_chunk_${i}`,
                        values: embeddings[i],
                        metadata: {
                            document_id: docId,
                            document_name: originalName,
                            chunk_index: i,
                            chunk_text: chunks[i].substring(0, 1000), // Store first 1000 chars for preview
                            full_text: chunks[i], // Store full text for retrieval
                            total_chunks: chunks.length,
                            file_type: fileExt,
                            upload_date: new Date().toISOString()
                        }
                    });
                }
                
                // Upsert to Pinecone in batches
                const batchSize = 100;
                for (let i = 0; i < vectors.length; i += batchSize) {
                    const batch = vectors.slice(i, i + batchSize);
                    await this.index.namespace(this.namespace).upsert(batch);
                }
                
                console.log(`Added ${vectors.length} chunks to Pinecone for document ${originalName}`);
            }
            
            // Store document metadata locally
            this.metadata.documents[docId] = {
                id: docId,
                originalName,
                mimeType,
                fileExt,
                filePath: destPath,
                chunks: chunks.length,
                content: chunks, // Store locally as backup
                embeddings: this.index ? null : embeddings, // Only store embeddings locally if no Pinecone
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
                message: this.index ? 
                    `Document indexed in Pinecone (${chunks.length} chunks)` : 
                    `Document stored locally (${chunks.length} chunks)`
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

    // Enhanced chunking for better context with smaller chunks for better precision
    chunkText(text, maxChunkSize = 1500, overlap = 300) {
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

    // Process image with Vision API
    // Process PDF using Vision API for OCR
    async processPDFWithVision(pdfPath, fileName) {
        try {
            // Convert PDF to base64
            const pdfData = await fs.readFile(pdfPath, { encoding: 'base64' });
            
            // Use GPT-4 Vision to extract text from PDF
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Extract ALL text from this PDF document. Include every single word, number, heading, paragraph, table content, footnotes, and any other text visible in the document. Preserve the structure and formatting as much as possible. If there are tables, format them clearly. If there are multiple pages, indicate page breaks.'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:application/pdf;base64,${pdfData}`,
                                detail: 'high'
                            }
                        }
                    ]
                }],
                max_tokens: 4096,
                temperature: 0.1
            });
            
            const extractedText = response.choices[0]?.message?.content || '';
            console.log(`Vision API extracted ${extractedText.length} characters from PDF`);
            return extractedText;
            
        } catch (error) {
            console.error('Error processing PDF with Vision API:', error);
            // Try with pdf-to-png conversion if direct PDF fails
            throw error;
        }
    }

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
            
            const response = await this.openai.chat.completions.create({
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
                max_tokens: 1500
            });
            
            return `Image: ${fileName}\nDescription: ${response.choices[0].message.content}`;
        } catch (error) {
            console.error('Vision API error:', error);
            return `Image: ${fileName} (analysis not available)`;
        }
    }

    // Search documents with citations
    async searchDocuments(query, limit = 10) {
        try {
            if (this.index) {
                // Use Pinecone for search
                const queryEmbedding = await this.generateEmbeddings([query]);
                
                const searchResults = await this.index.namespace(this.namespace).query({
                    vector: queryEmbedding[0],
                    topK: limit,
                    includeMetadata: true,
                    includeValues: false
                });
                
                if (!searchResults.matches || searchResults.matches.length === 0) {
                    return {
                        success: true,
                        query: query,
                        resultsCount: 0,
                        results: []
                    };
                }
                
                // Format results with citations
                const formattedResults = searchResults.matches.map((match, idx) => {
                    const metadata = match.metadata || {};
                    
                    // Extract a snippet around the most relevant part
                    const fullText = metadata.full_text || metadata.chunk_text || '';
                    const snippet = this.extractSnippet(fullText, query, 150);
                    
                    return {
                        fileName: metadata.document_name || 'Unknown',
                        content: fullText,
                        snippet: snippet,
                        relevanceScore: match.score || 0,
                        vectorScore: match.score || 0,
                        documentId: metadata.document_id,
                        chunkIndex: metadata.chunk_index,
                        citation: `[${idx + 1}] ${metadata.document_name || 'Document'} (Chunk ${(metadata.chunk_index || 0) + 1})`,
                        metadata: {
                            uploadedAt: metadata.upload_date,
                            fileType: metadata.file_type
                        }
                    };
                });
                
                // Update access metadata
                formattedResults.forEach(result => {
                    if (result.documentId && this.metadata.documents[result.documentId]) {
                        const doc = this.metadata.documents[result.documentId];
                        doc.lastAccessed = new Date().toISOString();
                        doc.accessCount = (doc.accessCount || 0) + 1;
                    }
                });
                await this.saveMetadata();
                
                return {
                    success: true,
                    query: query,
                    resultsCount: formattedResults.length,
                    results: formattedResults,
                    usingPinecone: true
                };
                
            } else {
                // Fallback to local search (original implementation)
                return this.localSearch(query, limit);
            }
            
        } catch (error) {
            console.error('Pinecone search error:', error);
            // Fallback to local search
            return this.localSearch(query, limit);
        }
    }

    // Extract snippet around matching text
    extractSnippet(text, query, maxLength = 150) {
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const queryWords = lowerQuery.split(/\s+/);
        
        // Find the best matching position
        let bestPosition = -1;
        let bestScore = 0;
        
        for (let i = 0; i < lowerText.length - 50; i++) {
            let score = 0;
            const window = lowerText.substring(i, i + 200);
            
            for (const word of queryWords) {
                if (window.includes(word)) {
                    score++;
                }
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestPosition = i;
            }
        }
        
        if (bestPosition === -1) {
            // No match found, return beginning
            return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
        }
        
        // Extract snippet around best position
        const start = Math.max(0, bestPosition - 50);
        const end = Math.min(text.length, bestPosition + maxLength);
        let snippet = text.substring(start, end);
        
        // Add ellipsis if needed
        if (start > 0) snippet = '...' + snippet;
        if (end < text.length) snippet = snippet + '...';
        
        // Highlight matching words
        for (const word of queryWords) {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            snippet = snippet.replace(regex, `**${word}**`);
        }
        
        return snippet;
    }

    // Local search fallback (when Pinecone is not available)
    async localSearch(query, limit = 10) {
        // Implementation similar to original documentManager
        const queryWords = query.toLowerCase().split(/\s+/);
        const results = [];
        
        for (const [docId, doc] of Object.entries(this.metadata.documents)) {
            if (!doc.content) continue;
            
            doc.content.forEach((chunk, idx) => {
                let score = 0;
                const chunkLower = chunk.toLowerCase();
                
                // Simple keyword matching
                for (const word of queryWords) {
                    if (chunkLower.includes(word)) {
                        score += (chunkLower.match(new RegExp(word, 'g')) || []).length;
                    }
                }
                
                if (score > 0) {
                    const snippet = this.extractSnippet(chunk, query, 150);
                    
                    results.push({
                        fileName: doc.originalName,
                        content: chunk,
                        snippet: snippet,
                        relevanceScore: score / queryWords.length,
                        documentId: docId,
                        chunkIndex: idx,
                        citation: `[${results.length + 1}] ${doc.originalName} (Chunk ${idx + 1})`,
                        metadata: {
                            uploadedAt: doc.uploadedAt,
                            fileType: doc.fileExt
                        }
                    });
                }
            });
        }
        
        // Sort by relevance and return top results
        results.sort((a, b) => b.relevanceScore - a.relevanceScore);
        
        return {
            success: true,
            query: query,
            resultsCount: Math.min(results.length, limit),
            results: results.slice(0, limit),
            usingPinecone: false
        };
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
            // Delete from Pinecone if available
            if (this.index) {
                try {
                    const chunkIds = [];
                    // Add the main document ID
                    chunkIds.push(documentId);
                    // Add all chunk IDs
                    for (let i = 0; i < doc.chunks; i++) {
                        chunkIds.push(`${documentId}_chunk_${i}`);
                    }
                    
                    if (chunkIds.length > 0) {
                        // Use the correct Pinecone delete method - deleteMany for multiple IDs
                        await this.index.namespace(this.namespace).deleteMany(chunkIds);
                    }
                } catch (pineconeError) {
                    console.warn('Pinecone delete warning:', pineconeError.message);
                    // Continue with local deletion even if Pinecone fails
                }
            }
            
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
                content: doc.content ? doc.content.join('\n\n') : '',
                chunks: doc.chunks,
                uploadedAt: doc.uploadedAt
            }
        };
    }

    // Clear all documents
    async clearAllDocuments() {
        try {
            // Delete all from Pinecone if available
            if (this.index) {
                await this.index.namespace(this.namespace).deleteAll();
            }
            
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
const pineconeDocumentManager = new PineconeDocumentManager();

export default pineconeDocumentManager;