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
export async function handleRagSearch({ query, limit = 3 }) {
    try {
        const results = await documentManager.searchDocuments(query, limit);
        
        if (!results.success || results.results.length === 0) {
            return {
                success: false,
                message: 'No relevant documents found for your query.',
                query
            };
        }
        
        // Format results for voice response
        let response = `Found ${results.resultsCount} relevant documents:\n\n`;
        
        results.results.forEach((result, idx) => {
            response += `From "${result.fileName}" (relevance: ${(result.relevanceScore * 100).toFixed(0)}%):\n`;
            response += `${result.content.substring(0, 300)}...\n\n`;
        });
        
        return {
            success: true,
            message: response,
            results: results.results
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