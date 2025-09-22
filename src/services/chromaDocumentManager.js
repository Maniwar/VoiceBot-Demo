import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import xlsx from 'xlsx';
import { ChromaClient } from 'chromadb';
import { OpenAIEmbeddingFunction } from 'chromadb';

class ChromaDocumentManager {
    constructor() {
        this.documentsPath = path.join(process.cwd(), 'documents');
        this.metadataFile = path.join(this.documentsPath, 'metadata.json');
        this.metadata = {};
        this.client = null;
        this.collection = null;
        this.embeddingFunction = null;
    }

    async initialize() {
        try {
            // Create documents directory if it doesn't exist
            await fs.mkdir(this.documentsPath, { recursive: true });
            
            // Initialize ChromaDB client
            this.client = new ChromaClient({
                path: path.join(process.cwd(), 'chroma_db')
            });
            
            // Initialize OpenAI embedding function
            this.embeddingFunction = new OpenAIEmbeddingFunction({
                openai_api_key: process.env.OPENAI_API_KEY,
                openai_model: "text-embedding-3-small" // Using newer, better model
            });
            
            // Create or get collection
            try {
                this.collection = await this.client.getCollection({
                    name: "documents",
                    embeddingFunction: this.embeddingFunction
                });
                console.log('Using existing ChromaDB collection');
            } catch (error) {
                this.collection = await this.client.createCollection({
                    name: "documents",
                    embeddingFunction: this.embeddingFunction,
                    metadata: { 
                        "description": "Document embeddings for RAG",
                        "hnsw:space": "cosine"
                    }
                });
                console.log('Created new ChromaDB collection');
            }
            
            await this.loadMetadata();
        } catch (error) {
            console.error('Error initializing ChromaDB document manager:', error);
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
            
            // Add chunks to ChromaDB
            const chunkIds = [];
            const chunkTexts = [];
            const chunkMetadatas = [];
            
            for (let i = 0; i < chunks.length; i++) {
                const chunkId = `${docId}_chunk_${i}`;
                chunkIds.push(chunkId);
                chunkTexts.push(chunks[i]);
                chunkMetadatas.push({
                    document_id: docId,
                    document_name: originalName,
                    chunk_index: i,
                    total_chunks: chunks.length,
                    file_type: fileExt,
                    upload_date: new Date().toISOString()
                });
            }
            
            // Add to ChromaDB collection
            if (chunkTexts.length > 0) {
                await this.collection.add({
                    ids: chunkIds,
                    documents: chunkTexts,
                    metadatas: chunkMetadatas
                });
                console.log(`Added ${chunkTexts.length} chunks to ChromaDB for document ${originalName}`);
            }
            
            // Store document metadata
            this.metadata.documents[docId] = {
                id: docId,
                originalName,
                mimeType,
                fileExt,
                filePath: destPath,
                chunks: chunks.length,
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
                message: `Document processed and indexed in ChromaDB`
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

    // Enhanced chunking for better context
    chunkText(text, maxChunkSize = 3000, overlap = 500) {
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
                    max_tokens: 1500
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

    // Search documents using ChromaDB's built-in vector search
    async searchDocuments(query, limit = 15) {
        try {
            if (!this.collection) {
                throw new Error('ChromaDB collection not initialized');
            }
            
            // Query ChromaDB
            const results = await this.collection.query({
                queryTexts: [query],
                nResults: limit,
                include: ["documents", "metadatas", "distances"]
            });
            
            if (!results || !results.documents || results.documents[0].length === 0) {
                return {
                    success: true,
                    query: query,
                    resultsCount: 0,
                    results: []
                };
            }
            
            // Format results
            const formattedResults = [];
            const documents = results.documents[0];
            const metadatas = results.metadatas[0];
            const distances = results.distances[0];
            
            for (let i = 0; i < documents.length; i++) {
                // Convert distance to similarity score (1 - distance for cosine)
                const similarityScore = 1 - (distances[i] || 0);
                
                formattedResults.push({
                    fileName: metadatas[i].document_name || 'Unknown',
                    content: documents[i],
                    relevanceScore: similarityScore,
                    vectorScore: similarityScore,
                    documentId: metadatas[i].document_id,
                    chunkIndex: metadatas[i].chunk_index,
                    metadata: {
                        uploadedAt: metadatas[i].upload_date,
                        fileType: metadatas[i].file_type
                    }
                });
                
                // Update access metadata
                if (metadatas[i].document_id && this.metadata.documents[metadatas[i].document_id]) {
                    const doc = this.metadata.documents[metadatas[i].document_id];
                    doc.lastAccessed = new Date().toISOString();
                    doc.accessCount = (doc.accessCount || 0) + 1;
                }
            }
            
            await this.saveMetadata();
            
            return {
                success: true,
                query: query,
                resultsCount: formattedResults.length,
                results: formattedResults
            };
            
        } catch (error) {
            console.error('ChromaDB search error:', error);
            return {
                success: false,
                error: error.message,
                results: []
            };
        }
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
            // Delete from ChromaDB
            if (this.collection) {
                // Get all chunk IDs for this document
                const chunkIds = [];
                for (let i = 0; i < doc.chunks; i++) {
                    chunkIds.push(`${documentId}_chunk_${i}`);
                }
                
                if (chunkIds.length > 0) {
                    await this.collection.delete({
                        ids: chunkIds
                    });
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
                message: `Document ${doc.originalName} deleted from ChromaDB`,
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
        
        try {
            // Get all chunks for this document from ChromaDB
            const chunkIds = [];
            for (let i = 0; i < doc.chunks; i++) {
                chunkIds.push(`${documentId}_chunk_${i}`);
            }
            
            const result = await this.collection.get({
                ids: chunkIds
            });
            
            const content = result.documents ? result.documents.join('\n\n') : '';
            
            doc.lastAccessed = new Date().toISOString();
            doc.accessCount++;
            await this.saveMetadata();
            
            return {
                success: true,
                document: {
                    id: doc.id,
                    fileName: doc.originalName,
                    content: content,
                    chunks: doc.chunks,
                    uploadedAt: doc.uploadedAt
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Clear all documents
    async clearAllDocuments() {
        try {
            // Delete collection from ChromaDB
            if (this.client && this.collection) {
                await this.client.deleteCollection({ name: "documents" });
                
                // Recreate empty collection
                this.collection = await this.client.createCollection({
                    name: "documents",
                    embeddingFunction: this.embeddingFunction,
                    metadata: { 
                        "description": "Document embeddings for RAG",
                        "hnsw:space": "cosine"
                    }
                });
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
                message: 'All documents cleared from ChromaDB'
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
const chromaDocumentManager = new ChromaDocumentManager();

export default chromaDocumentManager;