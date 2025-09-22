import documentManager from '../services/documentManager.js';

// Simple RAG search tool for OpenAI Realtime API
export const ragSearchToolDefinition = {
    name: 'search_documents',
    description: 'Search through uploaded documents to find relevant information',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The search query to find relevant information'
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results to return',
                default: 3
            }
        },
        required: ['query']
    }
};

// Tool handler for server-side execution
export async function handleRagSearch({ query, limit = 8 }) {
    try {
        // Search for more chunks to ensure we find all relevant content
        const results = await documentManager.searchDocuments(query, limit);
        
        if (!results.success || results.results.length === 0) {
            return {
                success: false,
                message: 'No relevant documents found for your query.',
                query
            };
        }
        
        // Format results with proper citations and snippets
        let response = `Based on searching ${results.resultsCount} relevant sources:\n\n`;
        
        // Group results by document for better citation
        const documentGroups = {};
        results.results.forEach(result => {
            if (!documentGroups[result.fileName]) {
                documentGroups[result.fileName] = [];
            }
            documentGroups[result.fileName].push(result);
        });
        
        // Format each document's relevant content
        Object.entries(documentGroups).forEach(([fileName, docResults], docIdx) => {
            response += `📄 **Source: ${fileName}**\n`;
            response += `   *Relevance: ${(Math.max(...docResults.map(r => r.relevanceScore)) * 100).toFixed(0)}%*\n\n`;
            
            docResults.forEach((result, idx) => {
                // Extract the most relevant snippet containing query terms
                const snippet = result.content.trim();
                const queryLower = query.toLowerCase();
                const snippetLower = snippet.toLowerCase();
                
                // Find the best matching section
                let displaySnippet = '';
                const maxLength = 500;
                const contextPadding = 150; // Characters to show before/after match
                
                // Try to find where query terms appear in the snippet
                const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
                let bestMatchIndex = -1;
                let bestMatchScore = 0;
                
                // Find the position with the most query terms nearby
                for (let i = 0; i < snippetLower.length - 100; i += 50) {
                    const window = snippetLower.substring(i, Math.min(i + 200, snippetLower.length));
                    let score = 0;
                    queryWords.forEach(word => {
                        if (window.includes(word)) score++;
                    });
                    if (score > bestMatchScore) {
                        bestMatchScore = score;
                        bestMatchIndex = i;
                    }
                }
                
                // Extract snippet around the best match
                if (bestMatchIndex >= 0) {
                    const start = Math.max(0, bestMatchIndex - contextPadding);
                    const end = Math.min(snippet.length, bestMatchIndex + maxLength - contextPadding);
                    displaySnippet = snippet.substring(start, end);
                    
                    // Clean up the snippet edges at sentence boundaries
                    if (start > 0) {
                        const firstPeriod = displaySnippet.indexOf('. ');
                        if (firstPeriod > 0 && firstPeriod < 100) {
                            displaySnippet = '...' + displaySnippet.substring(firstPeriod + 1);
                        } else {
                            displaySnippet = '...' + displaySnippet;
                        }
                    }
                    
                    if (end < snippet.length) {
                        const lastPeriod = displaySnippet.lastIndexOf('.');
                        const lastQuestion = displaySnippet.lastIndexOf('?');
                        const lastExclaim = displaySnippet.lastIndexOf('!');
                        const lastBoundary = Math.max(lastPeriod, lastQuestion, lastExclaim);
                        
                        if (lastBoundary > displaySnippet.length - 100) {
                            displaySnippet = displaySnippet.substring(0, lastBoundary + 1);
                        } else {
                            displaySnippet += '...';
                        }
                    }
                } else {
                    // Fallback to showing the beginning of the snippet
                    displaySnippet = snippet.substring(0, maxLength);
                    const lastPeriod = displaySnippet.lastIndexOf('.');
                    if (lastPeriod > 200) {
                        displaySnippet = displaySnippet.substring(0, lastPeriod + 1);
                    } else if (snippet.length > maxLength) {
                        displaySnippet += '...';
                    }
                }
                
                // Highlight matching terms in the snippet (using markdown bold)
                queryWords.forEach(word => {
                    if (word.length > 2) {
                        const regex = new RegExp(`\\b(${word}\\w*)\\b`, 'gi');
                        displaySnippet = displaySnippet.replace(regex, '**$1**');
                    }
                });
                
                response += `   > "${displaySnippet.trim()}"\n`;
                
                // Add chunk reference if multiple chunks
                if (result.chunkIndex !== undefined && docResults.length > 1) {
                    response += `   *(Section ${result.chunkIndex + 1})*\n`;
                }
                response += '\n';
            });
        });
        
        // Add citation summary
        const sourceCount = Object.keys(documentGroups).length;
        response += `\n---\n*Citations: ${sourceCount} source${sourceCount > 1 ? 's' : ''} referenced*`;
        
        return {
            success: true,
            message: response,
            results: results.results,
            citations: Object.keys(documentGroups)
        };
        
    } catch (error) {
        console.error('RAG search error:', error);
        return {
            success: false,
            message: 'Sorry, I encountered an error while searching the documents.',
            error: error.message
        };
    }
}

// List documents tool definition
export const listDocumentsToolDefinition = {
    name: 'list_documents',
    description: 'List all uploaded documents in the knowledge base',
    parameters: {
        type: 'object',
        properties: {}
    }
};

// Tool handler for listing documents
export async function handleListDocuments() {
    try {
        const documents = await documentManager.getAllDocuments();
        
        if (documents.length === 0) {
            return {
                success: true,
                message: 'No documents have been uploaded yet. You can upload PDFs, text files, CSVs, or images through the admin panel.'
            };
        }
        
        let response = `I have ${documents.length} documents in the knowledge base:\n\n`;
        
        documents.forEach((doc, idx) => {
            const size = doc.size < 1024 ? `${doc.size} bytes` : 
                         doc.size < 1024*1024 ? `${(doc.size/1024).toFixed(1)} KB` : 
                         `${(doc.size/(1024*1024)).toFixed(1)} MB`;
            
            response += `${idx + 1}. "${doc.fileName}" - ${doc.fileType} (${size}, ${doc.chunks} chunks)\n`;
            response += `   Uploaded: ${new Date(doc.uploadedAt).toLocaleDateString()}\n`;
            if (doc.lastAccessed) {
                response += `   Last accessed: ${new Date(doc.lastAccessed).toLocaleDateString()}\n`;
            }
        });
        
        return {
            success: true,
            message: response,
            documents
        };
        
    } catch (error) {
        console.error('List documents error:', error);
        return {
            success: false,
            message: 'Sorry, I couldn't retrieve the document list.',
            error: error.message
        };
    }
}

// Get document content tool definition
export const getDocumentToolDefinition = {
    name: 'get_document',
    description: 'Get the full content of a specific document',
    parameters: {
        type: 'object',
        properties: {
            documentId: {
                type: 'string',
                description: 'The document ID to retrieve'
            },
            fileName: {
                type: 'string',
                description: 'The file name of the document (alternative to documentId)'
            }
        }
    }
};

// Tool handler for getting document content
export async function handleGetDocument({ documentId, fileName }) {
    try {
        let docId = documentId;
        
        // If fileName provided, find the document ID
        if (!docId && fileName) {
            const documents = await documentManager.getAllDocuments();
            const doc = documents.find(d => 
                d.fileName.toLowerCase().includes(fileName.toLowerCase())
            );
            if (doc) {
                docId = doc.id;
            }
        }
        
        if (!docId) {
            return {
                success: false,
                message: `I couldn't find a document with the name "${fileName}". Try listing documents to see what's available.`
            };
        }
        
        const result = await documentManager.getDocumentContent(docId);
        
        if (!result.success) {
            return {
                success: false,
                message: result.error || 'Document not found'
            };
        }
        
        // Truncate if too long for voice response
        const content = result.document.content.length > 2000 ? 
            result.document.content.substring(0, 2000) + '...\n\n[Content truncated]' : 
            result.document.content;
        
        return {
            success: true,
            message: `Here's the content of "${result.document.fileName}":\n\n${content}`,
            document: result.document
        };
        
    } catch (error) {
        console.error('Get document error:', error);
        return {
            success: false,
            message: 'Sorry, I couldn't retrieve the document.',
            error: error.message
        };
    }
}

// Export all tool definitions
export const ragToolDefinitions = [
    ragSearchToolDefinition,
    listDocumentsToolDefinition,
    getDocumentToolDefinition
];

// Export all tool handlers
export const ragToolHandlers = {
    search_documents: handleRagSearch,
    list_documents: handleListDocuments,
    get_document: handleGetDocument
};

export default {
    definitions: ragToolDefinitions,
    handlers: ragToolHandlers
};