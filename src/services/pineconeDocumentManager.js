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
                        console.log('Creating serverless Pinecone index...');
                        await this.pinecone.createIndex({
                            name: this.indexName,
                            dimension: 1536, // OpenAI text-embedding-ada-002 dimension
                            metric: 'cosine',
                            spec: {
                                serverless: {
                                    cloud: 'aws',
                                    region: 'us-west-2' // Updated to us-west-2 as per best practices
                                }
                            },
                            waitUntilReady: true // Use built-in wait functionality
                        });
                        console.log('Pinecone index created and ready');
                    }
                    
                    // Connect to index (following Context7 TypeScript client patterns)
                    this.index = this.pinecone.index(this.indexName);
                    
                    // Get index stats to verify connection
                    const stats = await this.index.describeIndexStats();
                    console.log(`✅ Connected to Pinecone index: ${this.indexName}`);
                    console.log(`📊 Index stats: ${stats.totalRecordCount || 0} vectors across ${Object.keys(stats.namespaces || {}).length} namespaces`);
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

    // Generate embeddings using OpenAI (matching Pinecone index dimension)
    async generateEmbeddings(texts) {
        try {
            // Handle large batches - OpenAI has token limits
            const maxBatchSize = 100; // Process in manageable batches
            const allEmbeddings = [];
            
            for (let i = 0; i < texts.length; i += maxBatchSize) {
                const batch = texts.slice(i, i + maxBatchSize);
                const response = await this.openai.embeddings.create({
                    model: "text-embedding-ada-002",  // Must match index dimension (1536)
                    input: batch
                });
                
                allEmbeddings.push(...response.data.map(d => d.embedding));
                
                // Rate limiting - respect API limits
                if (i + maxBatchSize < texts.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            
            return allEmbeddings;
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

                    // For CSV files, use Context7 optimized chunking to preserve complete records
                    const contentLength = content.length;
                    console.log(`Processing CSV file: ${contentLength} chars, ${parsed.data.length} records`);

                    if (contentLength <= 7000 || parsed.data.length <= 25) {
                        // Small CSV files - keep as single chunk to preserve all data
                        chunks = [content];
                        console.log(`CSV file kept as single chunk (${contentLength} chars, ${parsed.data.length} records)`);
                    } else {
                        // Larger CSV files - use record-aware chunking
                        chunks = this.chunkCSVRecords(content, 5000);
                        console.log(`CSV file split into ${chunks.length} chunks for ${parsed.data.length} records`);
                    }
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
                        const allSheets = [];
                        
                        for (const sheetName of workbook.SheetNames) {
                            const sheet = workbook.Sheets[sheetName];
                            // Get data as array including headers
                            const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
                            
                            if (rawData.length === 0) continue;
                            
                            // Format as pipe-separated for better parsing
                            const headers = rawData[0];
                            const formattedRows = [];
                            
                            // Add headers
                            formattedRows.push(`Sheet: ${sheetName}`);
                            formattedRows.push(headers.map(h => String(h || '').trim()).join(' | '));
                            formattedRows.push('-'.repeat(50)); // Separator line
                            
                            // Add data rows with row numbers
                            for (let i = 1; i < rawData.length; i++) {
                                const row = rawData[i];
                                const formattedRow = `Row ${i}: ` + row.map(cell => String(cell || '').trim()).join(' | ');
                                formattedRows.push(formattedRow);
                            }
                            
                            allSheets.push(formattedRows.join('\n'));
                        }
                        
                        content = allSheets.join('\n\n');
                        
                        // For Excel files, use larger chunks to preserve table structure
                        const contentLength = content.length;
                        if (contentLength <= 12000) {
                            // Small Excel files - keep as single chunk
                            chunks = [content];
                            console.log(`Excel file kept as single chunk (${contentLength} chars)`);
                        } else {
                            // Larger Excel files - use bigger chunks with more overlap
                            chunks = this.chunkText(content, 8000, 1000);
                            console.log(`Excel file split into ${chunks.length} chunks`);
                        }
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
                    
                case '.pptx':
                case '.ppt':
                    // PowerPoint files - extract text from slides using xlsx library
                    try {
                        const pptBuffer = await fs.readFile(destPath);
                        // For PPTX, we can try to extract text using mammoth or fall back to Vision API
                        // Note: Full PPTX support requires specialized library, using Vision API as fallback
                        console.log('Processing PowerPoint file with Vision API...');
                        content = await this.processPowerPointWithVision(destPath, originalName);
                        chunks = this.chunkText(content);
                    } catch (pptError) {
                        console.error('PowerPoint parsing error:', pptError);
                        content = `PowerPoint presentation: ${originalName} (text extraction via OCR)`;
                        chunks = [content];
                    }
                    break;
                    
                case '.rtf':
                    // RTF files - extract plain text
                    try {
                        const rtfContent = await fs.readFile(destPath, 'utf8');
                        // Basic RTF to text conversion - remove RTF control codes
                        content = rtfContent
                            .replace(/\\par[\s]?/g, '\n')  // Replace paragraph markers
                            .replace(/\{\\.*?\}/g, '')      // Remove RTF groups
                            .replace(/\\[a-z]+\d*\s?/gi, '') // Remove control words
                            .replace(/[{}]/g, '')           // Remove remaining braces
                            .trim();
                        chunks = this.chunkText(content);
                    } catch (rtfError) {
                        console.error('RTF parsing error:', rtfError);
                        content = `RTF document: ${originalName} (text extraction failed)`;
                        chunks = [content];
                    }
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
                
                // Upsert to Pinecone following Context7 best practices
                const batchSize = 100; // Recommended batch size from Pinecone docs
                const namespacedIndex = this.index.namespace(this.namespace);
                
                for (let i = 0; i < vectors.length; i += batchSize) {
                    const batch = vectors.slice(i, i + batchSize);
                    try {
                        await namespacedIndex.upsert(batch);
                        console.log(`✅ Upserted batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(vectors.length/batchSize)} for ${originalName}`);
                    } catch (error) {
                        console.error(`❌ Error upserting batch ${Math.floor(i/batchSize) + 1}:`, error);
                        // Retry once with backoff
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        try {
                            await namespacedIndex.upsert(batch);
                            console.log(`✅ Retry successful for batch ${Math.floor(i/batchSize) + 1}`);
                        } catch (retryError) {
                            console.error(`❌ Retry failed for batch ${Math.floor(i/batchSize) + 1}:`, retryError);
                            throw retryError;
                        }
                    }
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
    // Pinecone best practices chunking - Context7 optimized
    chunkText(text, maxChunkSize = 1000, overlap = 200) {
        const chunks = [];
        const textLength = text.length;

        // For very small content, keep as single chunk
        if (textLength <= maxChunkSize) {
            return [text];
        }

        // For CSV-like data with line-based records, preserve record boundaries
        if (text.includes('id:') && text.includes(',')) {
            return this.chunkCSVRecords(text, maxChunkSize);
        }

        // For other text, use line-aware chunking to preserve structure
        const lines = text.split('\n');
        let currentChunk = '';

        for (const line of lines) {
            const lineWithNewline = line + '\n';

            // If adding this line would exceed chunk size
            if (currentChunk.length + lineWithNewline.length > maxChunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                // Start next chunk with overlap (last few lines)
                const currentLines = currentChunk.split('\n');
                const overlapLines = currentLines.slice(-Math.floor(overlap/100));
                currentChunk = overlapLines.join('\n') + '\n' + line + '\n';
            } else {
                currentChunk += lineWithNewline;
            }
        }

        // Add final chunk
        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks.filter(chunk => chunk.length > 0);
    }

    // Specialized chunking for CSV records to preserve complete entries
    chunkCSVRecords(text, maxChunkSize = 1000) {
        const lines = text.split('\n');
        const chunks = [];
        let currentChunk = '';

        console.log(`CSV chunking: ${lines.length} lines, max chunk size: ${maxChunkSize}`);

        for (const line of lines) {
            const lineWithNewline = line + '\n';

            // If adding this line would exceed chunk size, save current chunk
            if (currentChunk.length + lineWithNewline.length > maxChunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                console.log(`CSV chunk created: ${currentChunk.length} chars`);
                currentChunk = lineWithNewline;
            } else {
                currentChunk += lineWithNewline;
            }
        }

        // Add final chunk
        if (currentChunk.trim().length > 0) {
            chunks.push(currentChunk.trim());
            console.log(`CSV final chunk: ${currentChunk.length} chars`);
        }

        console.log(`CSV chunking complete: ${chunks.length} chunks total`);
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

    // Process PowerPoint using Vision API for OCR
    async processPowerPointWithVision(pptPath, fileName) {
        try {
            // For now, treat PowerPoint files as binary and use a simplified extraction
            // In production, you would use a specialized library like node-pptx or convert to PDF first
            const pptData = await fs.readFile(pptPath, { encoding: 'base64' });
            
            // Use GPT-4 Vision to extract text from PowerPoint (limited support)
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'This is a PowerPoint presentation file. Extract ALL text content from the slides including: titles, bullet points, text boxes, notes, tables, and any other visible text. Format the output clearly with slide numbers and content structure preserved.'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:application/vnd.ms-powerpoint;base64,${pptData}`,
                                detail: 'high'
                            }
                        }
                    ]
                }],
                max_tokens: 4096,
                temperature: 0.1
            });
            
            const extractedText = response.choices[0]?.message?.content || '';
            console.log(`Vision API extracted ${extractedText.length} characters from PowerPoint`);
            return extractedText;
            
        } catch (error) {
            console.error('Error processing PowerPoint with Vision API:', error);
            // Fallback: try to extract any readable text from the binary
            try {
                const content = await fs.readFile(pptPath, 'utf8');
                // Extract any readable ASCII text from the binary file
                const readableText = content.replace(/[^\x20-\x7E\n\r\t]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .substring(0, 5000); // Limit to first 5000 chars
                
                if (readableText.length > 100) {
                    return `PowerPoint: ${fileName}\nExtracted text fragments:\n${readableText}`;
                }
            } catch (fallbackError) {
                console.error('Fallback text extraction failed:', fallbackError);
            }
            
            return `PowerPoint presentation: ${fileName} (content extraction failed - consider converting to PDF)`;
        }
    }

    // Search documents with complete retrieval (following Context7 patterns)
    async searchDocuments(query, limit = 10) {
        try {
            if (this.index) {
                // Use Pinecone for search
                const queryEmbedding = await this.generateEmbeddings([query]);
                
                // CRITICAL: For RAG, retrieve MORE than requested to ensure complete documents
                // Following Context7 patterns - retrieve enough to reconstruct full documents
                const effectiveLimit = Math.max(limit * 10, 500); // Get many chunks to ensure completeness
                
                // Query with namespace targeting (Context7 pattern)
                const namespacedIndex = this.index.namespace(this.namespace);
                const searchResults = await namespacedIndex.query({
                    vector: queryEmbedding[0],
                    topK: effectiveLimit,
                    includeMetadata: true,
                    includeValues: false
                    // No filter - we want ALL relevant content
                });
                
                if (!searchResults.matches || searchResults.matches.length === 0) {
                    return {
                        success: true,
                        query: query,
                        resultsCount: 0,
                        results: []
                    };
                }
                
                // Group by document to ensure we get complete documents
                const documentGroups = {};
                searchResults.matches.forEach(match => {
                    const metadata = match.metadata || {};
                    const docId = metadata.document_id || 'unknown';
                    
                    if (!documentGroups[docId]) {
                        documentGroups[docId] = {
                            documentId: docId,
                            fileName: metadata.document_name || 'Unknown',
                            fileType: metadata.file_type,
                            uploadDate: metadata.upload_date,
                            chunks: [],
                            maxScore: 0,
                            totalChunks: metadata.total_chunks || 1
                        };
                    }
                    
                    documentGroups[docId].chunks.push({
                        chunkIndex: metadata.chunk_index || 0,
                        content: metadata.full_text || metadata.chunk_text || '', // Use FULL text
                        score: match.score || 0
                    });
                    
                    documentGroups[docId].maxScore = Math.max(documentGroups[docId].maxScore, match.score || 0);
                });
                
                // Process and format results
                const formattedResults = [];
                
                // Sort documents by max relevance score
                const sortedDocs = Object.values(documentGroups).sort((a, b) => b.maxScore - a.maxScore);
                
                for (const doc of sortedDocs) {
                    // Sort chunks by index to maintain document order
                    doc.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
                    
                    // For highly relevant documents (score > 0.7), include ALL chunks
                    // This ensures complete document retrieval for accurate RAG
                    if (doc.maxScore > 0.7) {
                        // Check if we have all chunks, if not, fetch missing ones
                        if (doc.chunks.length < doc.totalChunks) {
                            // We have partial chunks - try to fetch remaining chunks
                            const missingIndices = [];
                            for (let i = 0; i < doc.totalChunks; i++) {
                                if (!doc.chunks.some(c => c.chunkIndex === i)) {
                                    missingIndices.push(i);
                                }
                            }
                            
                            if (missingIndices.length > 0) {
                                // Fetch missing chunks directly
                                const missingIds = missingIndices.map(idx => `${doc.documentId}_chunk_${idx}`);
                                try {
                                    const fetchResult = await namespacedIndex.fetch(missingIds);
                                    Object.entries(fetchResult.records || {}).forEach(([id, record]) => {
                                        if (record && record.metadata) {
                                            const chunkIdx = parseInt(id.split('_chunk_')[1]);
                                            doc.chunks.push({
                                                chunkIndex: chunkIdx,
                                                content: record.metadata.full_text || record.metadata.chunk_text || '',
                                                score: 0.7 // Assign minimum threshold score
                                            });
                                        }
                                    });
                                    // Re-sort after adding missing chunks
                                    doc.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
                                } catch (fetchError) {
                                    console.warn(`Could not fetch missing chunks for ${doc.fileName}:`, fetchError);
                                }
                            }
                        }
                        
                        // Add ALL chunks from this highly relevant document
                        doc.chunks.forEach(chunk => {
                            formattedResults.push({
                                fileName: doc.fileName,
                                content: chunk.content, // FULL content, no truncation
                                snippet: chunk.content.substring(0, 150) + '...', // Short preview
                                relevanceScore: chunk.score,
                                vectorScore: chunk.score,
                                documentId: doc.documentId,
                                chunkIndex: chunk.chunkIndex,
                                citation: `[${formattedResults.length + 1}] ${doc.fileName} (Section ${chunk.chunkIndex + 1}/${doc.totalChunks})`,
                                metadata: {
                                    uploadedAt: doc.uploadDate,
                                    fileType: doc.fileType
                                }
                            });
                        });
                    } else if (doc.maxScore > 0.5) {
                        // For moderately relevant docs, include chunks with score > 0.5
                        doc.chunks.filter(chunk => chunk.score > 0.5).forEach(chunk => {
                            formattedResults.push({
                                fileName: doc.fileName,
                                content: chunk.content,
                                snippet: chunk.content.substring(0, 150) + '...',
                                relevanceScore: chunk.score,
                                vectorScore: chunk.score,
                                documentId: doc.documentId,
                                chunkIndex: chunk.chunkIndex,
                                citation: `[${formattedResults.length + 1}] ${doc.fileName} (Section ${chunk.chunkIndex + 1})`,
                                metadata: {
                                    uploadedAt: doc.uploadDate,
                                    fileType: doc.fileType
                                }
                            });
                        });
                    }
                    
                    // Stop if we have enough results
                    if (formattedResults.length >= limit * 10) break;
                }
                
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