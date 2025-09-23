import { ragToolDefinitions, ragToolHandlers } from './simpleRagTool.js';
import agenticRagTool from './agenticRagTool.js';
import { GoogleSearchTool } from './googleSearchTool.js';
import { FreeWeatherTool } from './freeWeatherTool.js';
import unifiedFlightTool from './unifiedFlightTool.js';

// Unified tool registry for the voice assistant
// These tools are exposed to the Realtime API via the client

const toolRegistry = {
    // RAG Tools - Document Search and Retrieval
    rag: {
        // Simple RAG - Direct vector search
        search_documents: {
            definition: ragToolDefinitions[0], // ragSearchToolDefinition
            handler: ragToolHandlers.search_documents,
            endpoint: '/api/documents/search',
            category: 'rag',
            enabled: true,
            description: 'Direct vector search in uploaded documents',
            instructions: `KNOWLEDGE-FIRST APPROACH: For EVERY user question (except greetings), ALWAYS search the knowledge base FIRST before responding.
                The knowledge base is the primary source of truth. Even for general questions, check if relevant information exists in the documents.
                
                WORKFLOW:
                1. ALWAYS use search_documents tool immediately when user asks any question
                2. Extract keywords and synonyms from their question automatically
                3. Search the knowledge base comprehensively
                4. If relevant information is found, base your answer on it
                5. If no relevant information is found, then provide a general answer noting that nothing specific was found in the knowledge base
                
                CRITICAL: When asked about comparisons ("best", "highest", "most", "least"), COMPARE all relevant values/options in the data.
                Provide SPECIFIC answers with actual numbers, percentages, or concrete details from the documents.
                Always cite which document the information came from.`
        },
        
        // Agentic RAG - Advanced reasoning search
        agentic_search: {
            definition: agenticRagTool.definition,
            handler: agenticRagTool.handler,
            endpoint: '/api/documents/agentic-search',
            category: 'rag',
            enabled: true,
            description: 'Advanced search with reasoning and multiple retrieval attempts',
            instructions: `Use this tool for complex queries that require reasoning across multiple concepts or documents.
                This tool performs multiple search iterations and can rephrase queries to find better results.
                Best used when the simple search doesn't return satisfactory results or when dealing with complex questions.`
        },
        
        // List documents
        list_documents: {
            definition: ragToolDefinitions[1], // listDocumentsToolDefinition
            handler: ragToolHandlers.list_documents,
            endpoint: '/api/documents',
            category: 'rag',
            enabled: true,
            description: 'List all uploaded documents in the knowledge base',
            instructions: `Use this tool when users ask what documents are available, what's in the knowledge base, or want to see uploaded files.
                Show the document names, types, sizes, and when they were uploaded.`
        },
        
        // Get document content
        get_document: {
            definition: ragToolDefinitions[2], // getDocumentToolDefinition  
            handler: ragToolHandlers.get_document,
            endpoint: '/api/documents/:id',
            category: 'rag',
            enabled: true,
            description: 'Get the full content of a specific document',
            instructions: `Use this tool when users want to see the entire content of a specific document.
                Requires either the document ID or filename. Use list_documents first if you need to find the document.`
        }
    },
    
    // External API Tools
    external: {
        // Google Search
        search_google: {
            definition: {
                name: 'search_google',
                description: 'Search Google for current information',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'The search query'
                        },
                        num_results: {
                            type: 'number',
                            description: 'Number of results to return',
                            default: 5
                        }
                    },
                    required: ['query']
                }
            },
            handler: GoogleSearchTool ? GoogleSearchTool.execute : null,
            endpoint: '/api/tools/google-search',
            category: 'search',
            enabled: false, // Requires API key
            requiresApiKey: 'google',
            description: 'Web search using Google Custom Search API',
            instructions: `Use the search_google tool when users ask for current information, news, or web content.
                Format results nicely with images when available.
                Include relevant links and show images inline using markdown.
                This tool requires Google API credentials to be configured in the admin panel.`
        },
        
        // Weather
        get_weather: {
            definition: {
                name: 'get_weather',
                description: 'Get weather information for a location',
                parameters: {
                    type: 'object',
                    properties: {
                        location: {
                            type: 'string',
                            description: 'City name or location'
                        },
                        units: {
                            type: 'string',
                            enum: ['metric', 'imperial'],
                            default: 'imperial'
                        }
                    },
                    required: ['location']
                }
            },
            handler: FreeWeatherTool ? FreeWeatherTool.execute : null,
            endpoint: '/api/tools/weather',
            category: 'weather',
            enabled: true, // Free API
            description: 'Get current weather and forecast (free API)',
            instructions: `Use the get_weather tool for weather inquiries.
                This is a free API that doesn't require configuration.
                Provide both current weather and forecast when asked.
                Format the weather data in a conversational way for voice output.`
        },
        
        // Unified Flight & Travel Search
        unified_flight_search: {
            definition: unifiedFlightTool.definition,
            handler: unifiedFlightTool.execute,
            endpoint: '/api/tools/unified-flight-search',
            category: 'travel',
            enabled: false, // Requires Amadeus API key
            requiresApiKey: 'amadeus',
            description: 'Comprehensive flight and travel search with advanced features',
            instructions: `Use this unified flight tool for ALL travel-related queries including:

                FLIGHT OPERATIONS:
                - Flight search with advanced filtering (action: "search")
                - Price prediction and analysis (action: "price_prediction")
                - Flight inspiration and destinations (action: "inspiration")
                - Find cheapest travel dates (action: "cheapest_dates")
                - Real-time flight status (action: "status")
                - Most booked destinations and analytics (action: "most_booked")

                AIRPORT & AIRLINE INFO:
                - Search airports and cities (action: "airport_search")
                - Get detailed airport information (action: "airport_info")
                - Airline information lookup (action: "airline_info")
                - Direct routes from airports (action: "airport_routes")

                EXTENDED TRAVEL SERVICES:
                - Hotel search by city or location (action: "hotel_search")
                - Car rental availability (action: "car_rental")
                - Activities and tours (action: "activities")
                - Points of interest (action: "points_of_interest")

                USAGE TIPS:
                - Always specify the 'action' parameter first
                - Extract travel dates, locations, and preferences from user requests
                - For complex queries, break them into multiple actions if needed
                - Format results in voice-friendly markdown with key details highlighted
                - Include booking links and practical information when available

                EXAMPLES:
                - "Find flights from NYC to LAX on Dec 15" → action: "search"
                - "What's the cheapest time to fly to Paris?" → action: "cheapest_dates"
                - "Find hotels in Tokyo for next week" → action: "hotel_search"
                - "Check status of AA flight 123" → action: "status"

                This tool requires Amadeus API credentials to be configured in the admin panel.`
        }
    },
    
    // Camera/Vision Tools
    vision: {
        analyze_image: {
            definition: {
                name: 'analyze_image',
                description: 'Analyze an image and describe its contents',
                parameters: {
                    type: 'object',
                    properties: {
                        image: {
                            type: 'string',
                            description: 'Base64 encoded image or image URL'
                        },
                        prompt: {
                            type: 'string',
                            description: 'Specific question about the image',
                            default: 'Describe what you see in detail'
                        }
                    },
                    required: ['image']
                }
            },
            handler: null, // Handled by server endpoint
            endpoint: '/api/analyze-image',
            category: 'vision',
            enabled: true,
            description: 'Analyze images using GPT-4 Vision',
            instructions: `When the user shares an image or asks you to look at something, analyze it carefully.
                Describe what you see in detail and answer any questions about the image.
                Be specific about colors, objects, text, people, and any other relevant details.`
        }
    }
};

// Get all tools as a flat list
export function getAllTools() {
    const tools = [];
    for (const category of Object.values(toolRegistry)) {
        for (const [name, tool] of Object.entries(category)) {
            tools.push({
                name,
                ...tool
            });
        }
    }
    return tools;
}

// Get enabled tools only
export function getEnabledTools() {
    return getAllTools().filter(tool => tool.enabled);
}

// Get tools by category
export function getToolsByCategory(category) {
    return toolRegistry[category] || {};
}

// Get tool by name
export function getToolByName(name) {
    for (const category of Object.values(toolRegistry)) {
        if (category[name]) {
            return category[name];
        }
    }
    return null;
}

// Get tool definitions for Realtime API
export function getRealtimeToolDefinitions() {
    return getEnabledTools()
        .filter(tool => tool.definition)
        .map(tool => tool.definition);
}

// Get tools with merged instructions for voice assistant
export function getToolsWithInstructions() {
    const tools = getEnabledTools();
    const result = {
        tools: {},
        instructions: {}
    };
    
    tools.forEach(tool => {
        // Add to tools object (enabled status)
        result.tools[tool.name] = {
            enabled: tool.enabled,
            category: tool.category,
            description: tool.description,
            requiresApiKey: tool.requiresApiKey
        };
        
        // Add instructions if available
        if (tool.instructions) {
            result.instructions[tool.name] = tool.instructions;
        }
    });
    
    return result;
}

// Get comprehensive tool configuration
export function getComprehensiveToolConfig() {
    const enabledTools = getEnabledTools();
    const config = {
        definitions: [],
        instructions: '',
        categories: {}
    };
    
    // Group tools by category
    enabledTools.forEach(tool => {
        if (!config.categories[tool.category]) {
            config.categories[tool.category] = [];
        }
        config.categories[tool.category].push(tool.name);
        
        // Add definition
        if (tool.definition) {
            config.definitions.push(tool.definition);
        }
        
        // Build comprehensive instructions
        if (tool.instructions) {
            config.instructions += `\n\n**${tool.definition?.name || tool.name}:**\n${tool.instructions}`;
        }
    });
    
    return config;
}

// Execute a tool by name
export async function executeTool(name, args) {
    const tool = getToolByName(name);
    if (!tool) {
        throw new Error(`Tool ${name} not found`);
    }
    
    if (!tool.enabled) {
        throw new Error(`Tool ${name} is not enabled`);
    }
    
    if (!tool.handler) {
        throw new Error(`Tool ${name} has no handler`);
    }
    
    return await tool.handler(args);
}

export default {
    registry: toolRegistry,
    getAllTools,
    getEnabledTools,
    getToolsByCategory,
    getToolByName,
    getRealtimeToolDefinitions,
    getToolsWithInstructions,
    getComprehensiveToolConfig,
    executeTool
};