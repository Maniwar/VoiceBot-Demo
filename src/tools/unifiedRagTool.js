import documentManager from '../services/pineconeDocumentManager.js';

// Unified RAG Tool - Combines simple and agentic search modes
export const unifiedRagToolDefinition = {
    name: 'search_documents',
    description: 'Advanced document search with configurable modes: simple for direct search, agentic for multi-iteration reasoning',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The search query to find relevant information'
            },
            mode: {
                type: 'string',
                enum: ['simple', 'agentic'],
                default: 'simple',
                description: 'Search mode: simple for direct vector search, agentic for multi-iteration reasoning with query expansion'
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results to return',
                default: 5
            }
        },
        required: ['query']
    }
};

// Query analyzer for agentic mode
async function analyzeQuery(query) {
    const concepts = [];
    const queryLower = query.toLowerCase();

    // Extract potential entities (numbers, sizes, models, etc.)
    const numberPattern = /\b\d+["']?\s*(inch|inches|"|')?\b/gi;
    const numbers = queryLower.match(numberPattern) || [];

    // Extract product mentions
    const products = [];
    if (queryLower.includes('tv')) products.push('television', 'TV', 'display', 'screen');
    if (queryLower.includes('phone')) products.push('phone', 'mobile', 'smartphone', 'device');
    if (queryLower.includes('laptop')) products.push('laptop', 'computer', 'notebook', 'PC');

    // Generate multiple search strategies
    const searchStrategies = [query]; // Original query

    // Add expanded queries with synonyms
    if (products.length > 0) {
        searchStrategies.push(products.join(' '));
    }

    // Add specific extraction queries
    if (numbers.length > 0) {
        searchStrategies.push(`${numbers.join(' ')} ${products.join(' ')}`);
    }

    // Add contextual queries
    if (queryLower.includes('size') || queryLower.includes('how big')) {
        searchStrategies.push('dimensions specifications measurements inch');
    }

    if (queryLower.includes('roleplay') || queryLower.includes('scenario')) {
        searchStrategies.push('scenario example case demonstration roleplay');
    }

    return {
        originalQuery: query,
        expandedQueries: searchStrategies,
        concepts: [...new Set([...products, ...numbers])],
        intent: determineIntent(queryLower)
    };
}

// Determine user intent from query
function determineIntent(queryLower) {
    if (queryLower.includes('how') || queryLower.includes('what')) return 'question';
    if (queryLower.includes('find') || queryLower.includes('search')) return 'search';
    if (queryLower.includes('example') || queryLower.includes('scenario')) return 'example';
    if (queryLower.includes('size') || queryLower.includes('dimension')) return 'specification';
    return 'general';
}

// Perform cascading retrieval for agentic mode
async function cascadingRetrieval(queryAnalysis, maxAttempts = 3) {
    const allResults = [];
    const seenChunks = new Set();

    // Try each search strategy
    for (let i = 0; i < Math.min(maxAttempts, queryAnalysis.expandedQueries.length); i++) {
        const searchQuery = queryAnalysis.expandedQueries[i];
        console.log(`Unified RAG (Agentic): Attempting search with query: "${searchQuery}"`);

        // Search with progressively higher limits
        const limit = 10 + (i * 5); // Start with 10, then 15, then 20
        const results = await documentManager.searchDocuments(searchQuery, limit);

        if (results.success && results.results.length > 0) {
            // Deduplicate results
            results.results.forEach(result => {
                const chunkKey = `${result.documentId}_${result.chunkIndex || 0}`;
                if (!seenChunks.has(chunkKey)) {
                    seenChunks.add(chunkKey);
                    allResults.push({
                        ...result,
                        searchStrategy: i,
                        searchQuery: searchQuery
                    });
                }
            });

            // Check if we found what we're looking for
            const foundRelevant = checkRelevance(allResults, queryAnalysis);
            if (foundRelevant) {
                console.log(`Unified RAG (Agentic): Found relevant content after ${i + 1} attempts`);
                break;
            }
        }
    }

    return allResults;
}

// Check if results contain relevant information
function checkRelevance(results, queryAnalysis) {
    if (results.length === 0) return false;

    // Check if any result contains all key concepts
    for (const result of results) {
        const content = (result.content || '').toLowerCase();
        let matchCount = 0;

        for (const concept of queryAnalysis.concepts) {
            if (content.includes(concept.toLowerCase())) {
                matchCount++;
            }
        }

        // If we match most concepts, consider it relevant
        if (queryAnalysis.concepts.length > 0 && matchCount >= queryAnalysis.concepts.length * 0.7) {
            return true;
        }
    }

    // For general queries, any results are considered relevant
    return results.length >= 3;
}

// Rerank results based on relevance to original query
function rerankResults(results, queryAnalysis) {
    const scoredResults = results.map(result => {
        const content = (result.content || '').toLowerCase();
        let score = result.relevanceScore || 0;

        // Boost for matching original query terms
        const originalWords = queryAnalysis.originalQuery.toLowerCase().split(/\s+/);
        originalWords.forEach(word => {
            if (word.length > 2) {
                const matches = (content.match(new RegExp(`\\b${word}\\b`, 'gi')) || []).length;
                score += matches * 0.2;
            }
        });

        // Boost for matching concepts
        queryAnalysis.concepts.forEach(concept => {
            if (content.includes(concept.toLowerCase())) {
                score += 0.3;
            }
        });

        // Boost for earlier search strategies (they're more direct)
        score += (3 - result.searchStrategy) * 0.1;

        // Boost for intent match
        if (queryAnalysis.intent === 'specification' && content.match(/\d+["']?\s*(inch|")/gi)) {
            score += 0.5;
        }
        if (queryAnalysis.intent === 'example' && content.includes('scenario')) {
            score += 0.3;
        }

        return { ...result, finalScore: score };
    });

    // Sort by final score
    scoredResults.sort((a, b) => b.finalScore - a.finalScore);

    return scoredResults;
}

// Format results for voice-optimized output
function formatResultsForVoice(results, mode, queryAnalysis = null) {
    if (results.length === 0) {
        return {
            success: false,
            message: `No relevant documents found for your query.`,
            query: queryAnalysis?.originalQuery || 'search query'
        };
    }

    // Group results by document for better citation
    const documentGroups = {};
    results.forEach(result => {
        if (!documentGroups[result.fileName]) {
            documentGroups[result.fileName] = [];
        }
        documentGroups[result.fileName].push(result);
    });

    let response = '';

    if (mode === 'agentic' && queryAnalysis) {
        // Agentic mode: Include reasoning
        response += `Found ${results.length} relevant sections across ${Object.keys(documentGroups).length} document(s) using ${queryAnalysis.intent} analysis:\n\n`;
    } else {
        // Simple mode: Direct results
        response += `I found ${results.length} chunks across ${Object.keys(documentGroups).length} document(s). Here's the complete content:\n\n`;
    }

    // Format each document's relevant content for voice
    Object.entries(documentGroups).forEach(([fileName, docResults], docIdx) => {
        const bestResult = docResults[0]; // Highest relevance score
        const relevanceScore = mode === 'agentic' && bestResult.finalScore
            ? (bestResult.finalScore * 20).toFixed(0)
            : (Math.max(...docResults.map(r => r.relevanceScore)) * 100).toFixed(0);

        response += `From ${fileName}:\n`;
        response += `Relevance: ${relevanceScore} percent\n\n`;

        docResults.forEach((result, idx) => {
            // Use the FULL content from each chunk - no truncation for voice
            const displaySnippet = result.content.trim();
            const isTabularData = displaySnippet.includes('|') ||
                                displaySnippet.match(/\b\w+:\s*[\d.]+.*\b\w+:\s*[\d.]+/g);

            if (isTabularData) {
                // Format tabular data for voice readability
                let lines = displaySnippet.split('\n').filter(line => line.trim());
                let formattedTable = '';

                lines.forEach((line, lineIdx) => {
                    let cleanLine = line
                        .replace(/\|/g, ', ') // Replace pipes with commas
                        .replace(/\s{2,}/g, ' ') // Remove extra spaces
                        .replace(/^[\s,]+|[\s,]+$/g, '') // Trim
                        .trim();

                    if (!cleanLine) return;

                    // First line might be headers
                    if (lineIdx === 0 && !cleanLine.match(/^Row \d+/)) {
                        formattedTable += `Table columns: ${cleanLine}\n`;
                    } else {
                        // Data rows
                        if (cleanLine.match(/^Row \d+:/)) {
                            cleanLine = cleanLine.replace(/^Row (\d+):/, 'Row $1 contains:');
                        }
                        formattedTable += `   ${cleanLine}\n`;
                    }
                });

                response += formattedTable;
            } else {
                // For non-tabular content, clean up for voice
                const voiceSnippet = displaySnippet
                    .replace(/\*\*/g, '') // Remove markdown bold
                    .replace(/[\[\]\(\)]/g, '') // Remove brackets
                    .trim();

                response += `   Quote: ${voiceSnippet}\n`;
            }

            // Add chunk reference if multiple chunks
            if (result.chunkIndex !== undefined && docResults.length > 1) {
                response += `   *(Section ${result.chunkIndex + 1})*\n`;
            }
            response += '\n';
        });

        // Show search strategy used for agentic mode
        if (mode === 'agentic' && bestResult.searchQuery && queryAnalysis &&
            bestResult.searchQuery !== queryAnalysis.originalQuery) {
            response += `*Found using expanded query: "${bestResult.searchQuery}"*\n\n`;
        }
    });

    // Add voice-friendly citation summary
    const sourceCount = Object.keys(documentGroups).length;
    response += `\nI referenced ${sourceCount} source${sourceCount > 1 ? 's' : ''}.`;

    if (mode === 'agentic' && queryAnalysis) {
        response += ` Search performed ${queryAnalysis.expandedQueries.length} retrieval attempts with query expansion.`;
    }

    // Voice-friendly instruction for the AI (not sent to user)
    // Instructions moved to toolRegistry.js to avoid appearing in chat

    return {
        success: true,
        message: response,
        results: results,
        citations: Object.keys(documentGroups),
        mode: mode,
        ...(queryAnalysis && { reasoning: queryAnalysis })
    };
}

// Main unified RAG handler
export async function handleUnifiedRagSearch({ query, mode = 'simple', limit = 5 }) {
    try {
        console.log(`Unified RAG: Processing query "${query}" in ${mode} mode`);

        let results = [];
        let queryAnalysis = null;

        if (mode === 'agentic') {
            // Agentic mode: Multi-iteration search with reasoning
            queryAnalysis = await analyzeQuery(query);
            console.log('Unified RAG (Agentic): Query analysis:', queryAnalysis);

            // Perform cascading retrieval
            const cascadeResults = await cascadingRetrieval(queryAnalysis);

            // Rerank results based on relevance
            const rerankedResults = rerankResults(cascadeResults, queryAnalysis);
            results = rerankedResults.slice(0, Math.max(limit, 5)); // At least 5 for agentic

        } else {
            // Simple mode: Direct vector search
            const effectiveLimit = Math.max(limit, 50); // Comprehensive results for RAG
            const searchResults = await documentManager.searchDocuments(query, effectiveLimit);

            if (!searchResults.success) {
                return {
                    success: false,
                    message: 'No relevant documents found for your query.',
                    query
                };
            }

            results = searchResults.results;

            // Log for debugging
            console.log(`Unified RAG (Simple): Query="${query}", Results found=${results.length}`);

            if (results.length > 0) {
                const firstResult = results[0];
                console.log(`First result - File: ${firstResult.fileName}, Content length: ${firstResult.content.length} chars`);
            }
        }

        // Format results for voice output
        return formatResultsForVoice(results, mode, queryAnalysis);

    } catch (error) {
        console.error(`Unified RAG error (${mode} mode):`, error);
        return {
            success: false,
            message: 'Sorry, I encountered an error while searching the documents.',
            error: error.message,
            mode: mode
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
            message: "Sorry, I couldn't retrieve the document list.",
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

        // Return full content - no truncation needed
        const content = result.document.content;

        return {
            success: true,
            message: `Here's the content of "${result.document.fileName}":\n\n${content}`,
            document: result.document
        };

    } catch (error) {
        console.error('Get document error:', error);
        return {
            success: false,
            message: "Sorry, I couldn't retrieve the document.",
            error: error.message
        };
    }
}

// Export unified tool definitions
export const unifiedRagToolDefinitions = [
    unifiedRagToolDefinition,
    listDocumentsToolDefinition,
    getDocumentToolDefinition
];

// Export unified tool handlers
export const unifiedRagToolHandlers = {
    search_documents: handleUnifiedRagSearch,
    list_documents: handleListDocuments,
    get_document: handleGetDocument
};

export default {
    definitions: unifiedRagToolDefinitions,
    handlers: unifiedRagToolHandlers,
    definition: unifiedRagToolDefinition,
    handler: handleUnifiedRagSearch
};