// Use Pinecone document manager (same as server.js)
import pineconeDocumentManager from '../services/pineconeDocumentManager.js';
const documentManager = pineconeDocumentManager;
import OpenAI from 'openai';

// Agentic RAG tool that reasons about queries and performs intelligent retrieval
export const agenticRagToolDefinition = {
    name: 'agentic_search',
    description: 'Advanced document search that reasons about the query and performs multiple retrieval attempts to find the best information',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The search query to find relevant information'
            }
        },
        required: ['query']
    }
};

// Query analyzer to understand intent and generate better search queries
async function analyzeQuery(query) {
    // Extract key concepts and expand query
    const concepts = [];
    
    // Identify key terms and their synonyms
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
    const searchStrategies = [
        query, // Original query
    ];
    
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

// Perform cascading retrieval with multiple strategies
async function cascadingRetrieval(queryAnalysis, maxAttempts = 3) {
    const allResults = [];
    const seenChunks = new Set();
    
    // Try each search strategy
    for (let i = 0; i < Math.min(maxAttempts, queryAnalysis.expandedQueries.length); i++) {
        const searchQuery = queryAnalysis.expandedQueries[i];
        console.log(`Agentic RAG: Attempting search with query: "${searchQuery}"`);
        
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
                console.log(`Agentic RAG: Found relevant content after ${i + 1} attempts`);
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
    // Score each result based on multiple factors
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

// Format results with reasoning explanation
function formatResultsWithReasoning(results, queryAnalysis) {
    if (results.length === 0) {
        return {
            success: false,
            message: `I couldn't find relevant information for "${queryAnalysis.originalQuery}". The documents may not contain this specific information.`,
            reasoning: 'No matching content found after multiple search attempts.'
        };
    }
    
    // Group by document
    const documentGroups = {};
    results.forEach(result => {
        if (!documentGroups[result.fileName]) {
            documentGroups[result.fileName] = [];
        }
        documentGroups[result.fileName].push(result);
    });
    
    // Build response with reasoning
    let response = `**Search Analysis:**\n`;
    response += `Intent: ${queryAnalysis.intent}\n`;
    response += `Key concepts: ${queryAnalysis.concepts.join(', ') || 'general search'}\n\n`;
    response += `**Found ${results.length} relevant sections across ${Object.keys(documentGroups).length} document(s):**\n\n`;
    
    // Format each document's results
    Object.entries(documentGroups).forEach(([fileName, docResults]) => {
        const bestResult = docResults[0]; // Already sorted by relevance
        response += `📄 **${fileName}** (${(bestResult.finalScore * 20).toFixed(0)}% confidence)\n`;
        
        // Show the most relevant snippet
        let snippet = bestResult.content || '';
        const maxLength = 400;
        
        // Find the most relevant part of the content
        const queryWords = queryAnalysis.originalQuery.toLowerCase().split(/\s+/);
        let bestSnippetStart = 0;
        let bestSnippetScore = 0;
        
        for (let i = 0; i < snippet.length - 100; i += 50) {
            const window = snippet.substring(i, Math.min(i + 400, snippet.length)).toLowerCase();
            let score = 0;
            
            queryWords.forEach(word => {
                if (word.length > 2 && window.includes(word)) score++;
            });
            queryAnalysis.concepts.forEach(concept => {
                if (window.includes(concept.toLowerCase())) score += 2;
            });
            
            if (score > bestSnippetScore) {
                bestSnippetScore = score;
                bestSnippetStart = i;
            }
        }
        
        // Extract the best snippet
        snippet = snippet.substring(bestSnippetStart, Math.min(bestSnippetStart + maxLength, snippet.length));
        
        // Clean up edges
        if (bestSnippetStart > 0) {
            const firstSentence = snippet.indexOf('. ');
            if (firstSentence > 0 && firstSentence < 50) {
                snippet = snippet.substring(firstSentence + 2);
            }
            snippet = '...' + snippet;
        }
        if (bestSnippetStart + maxLength < bestResult.content.length) {
            const lastSentence = snippet.lastIndexOf('. ');
            if (lastSentence > snippet.length - 50) {
                snippet = snippet.substring(0, lastSentence + 1);
            } else {
                snippet = snippet + '...';
            }
        }
        
        // Highlight matching terms
        [...queryWords, ...queryAnalysis.concepts].forEach(term => {
            if (term.length > 1) {
                const regex = new RegExp(`\\b(${term}\\w*)\\b`, 'gi');
                snippet = snippet.replace(regex, '**$1**');
            }
        });
        
        response += `> ${snippet.trim()}\n\n`;
        
        // Show search strategy used
        if (bestResult.searchQuery !== queryAnalysis.originalQuery) {
            response += `*Found using: "${bestResult.searchQuery}"*\n\n`;
        }
    });
    
    // Add reasoning footer
    response += `---\n`;
    response += `*Search performed ${queryAnalysis.expandedQueries.length} retrieval attempts with query expansion*`;
    
    return {
        success: true,
        message: response,
        results: results,
        reasoning: queryAnalysis
    };
}

// Main handler for agentic RAG search
export async function handleAgenticSearch({ query }) {
    try {
        console.log(`Agentic RAG: Processing query: "${query}"`);
        
        // Step 1: Analyze the query to understand intent
        const queryAnalysis = await analyzeQuery(query);
        console.log('Agentic RAG: Query analysis:', queryAnalysis);
        
        // Step 2: Perform cascading retrieval with multiple strategies
        const results = await cascadingRetrieval(queryAnalysis);
        console.log(`Agentic RAG: Retrieved ${results.length} total results`);
        
        // Step 3: Rerank results based on relevance
        const rerankedResults = rerankResults(results, queryAnalysis);
        
        // Step 4: Format results with reasoning
        const formattedResponse = formatResultsWithReasoning(rerankedResults.slice(0, 5), queryAnalysis);
        
        return formattedResponse;
        
    } catch (error) {
        console.error('Agentic RAG error:', error);
        return {
            success: false,
            message: 'Sorry, I encountered an error while searching with reasoning.',
            error: error.message
        };
    }
}

export default {
    definition: agenticRagToolDefinition,
    handler: handleAgenticSearch
};