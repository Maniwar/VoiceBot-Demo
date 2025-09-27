import { unifiedRagToolDefinitions, unifiedRagToolHandlers } from './unifiedRagTool.js';
import { GoogleSearchTool } from './googleSearchTool.js';
import { FreeWeatherTool } from './freeWeatherTool.js';
import unifiedFlightTool from './unifiedFlightTool.js';
import { formatTableToolDefinition, formatTableHandler } from './formatTableTool.js';
import { tableRecreationWorkflowDefinition, executeTableRecreationWorkflow } from '../workflows/tableRecreationWorkflow.js';
import workflowRegistry from '../services/workflowRegistry.js';

// Unified tool registry for the voice assistant
// These tools are exposed to the Realtime API via the client

const toolRegistry = {
    // RAG Tools - Document Search and Retrieval
    rag: {
        // Unified RAG - Supports both simple and agentic modes
        search_documents: {
            definition: unifiedRagToolDefinitions[0], // unifiedRagToolDefinition
            handler: unifiedRagToolHandlers.search_documents,
            endpoint: '/api/documents/search',
            category: 'rag',
            enabled: true,
            description: 'Advanced document search with configurable modes (simple/agentic)',
            instructions: `CRITICAL: DO NOT USE search_documents FOR TABLE REQUESTS! For any request containing "table", "recreate", "format table", use table_workflow tool instead.

                WORKFLOW-FIRST APPROACH: Check if there's a dedicated workflow for the user's request before using individual tools.

                WORKFLOW PRIORITY:
                - For table requests ("recreate table", "show table", "format table"), you MUST use the table_workflow tool - DO NOT use search_documents
                - Workflows automatically chain multiple tools and provide better results
                - Only use search_documents for non-table document searches

                KNOWLEDGE-FIRST FALLBACK: If no workflow matches, search the knowledge base for relevant information.

                UNIFIED RAG MODES:
                - Use mode="simple" (default) for direct vector search - fast and precise
                - Use mode="agentic" for complex queries requiring multi-iteration reasoning

                WORKFLOW:
                1. Check for workflows that match the user's request (table workflows, research workflows, etc.)
                2. If workflow exists, use it instead of individual tools
                3. If no workflow, then use search_documents tool
                4. Extract keywords and synonyms from their question automatically
                5. Choose appropriate mode: simple for straightforward questions, agentic for complex analysis
                6. Search the knowledge base comprehensively
                7. If relevant information is found, base your answer on it
                8. If no relevant information is found, then provide a general answer

                CRITICAL: When asked about comparisons ("best", "highest", "most", "least"), COMPARE all relevant values/options in the data.
                Provide SPECIFIC answers with actual numbers, percentages, or concrete details from the documents.
                Always cite which document the information came from.`
        },

        // List documents
        list_documents: {
            definition: unifiedRagToolDefinitions[1], // listDocumentsToolDefinition
            handler: unifiedRagToolHandlers.list_documents,
            endpoint: '/api/documents',
            category: 'rag',
            enabled: true,
            description: 'List all uploaded documents in the knowledge base',
            instructions: `Use this tool when users ask what documents are available, what's in the knowledge base, or want to see uploaded files.
                Show the document names, types, sizes, and when they were uploaded.`
        },

        // Get document content
        get_document: {
            definition: unifiedRagToolDefinitions[2], // getDocumentToolDefinition
            handler: unifiedRagToolHandlers.get_document,
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
        },

        // Table formatting agent
        format_table: {
            definition: formatTableToolDefinition,
            handler: formatTableHandler,
            endpoint: '/api/tools/format-table',
            category: 'formatting',
            enabled: true,
            description: 'Format raw data into clean markdown tables for chat display',
            instructions: `Use this tool when you need to present tabular data in a clean, readable format.
                Call this tool AFTER getting raw data from search_documents or other sources.
                Pass the raw data to get a clean markdown table that displays nicely in chat.

                WORKFLOW:
                1. Get data from search_documents or other sources
                2. Call format_table with the raw data
                3. Present the formatted result to the user

                Example: "Let me format this data into a table for you" → call format_table → present clean result`
        },

        // Dynamic table creation agent
        create_table: {
            definition: {
                name: 'create_table',
                description: 'Create any custom table with specified data and formatting instructions',
                parameters: {
                    type: 'object',
                    properties: {
                        data: {
                            type: 'string',
                            description: 'Raw data, values, or content to be formatted into a table'
                        },
                        instructions: {
                            type: 'string',
                            description: 'Specific instructions for table structure, columns, formatting, or organization',
                            default: 'Create a well-organized table from this data'
                        },
                        context: {
                            type: 'string',
                            description: 'Context about what this table represents or how it should be used',
                            default: 'custom table'
                        }
                    },
                    required: ['data']
                }
            },
            handler: async (args, configManager) => {
                try {
                    // Use the format table handler with enhanced instructions
                    const enhancedInstructions = `${args.instructions || 'Create a well-organized table from this data'}

FORMATTING REQUIREMENTS:
- Return ONLY the table in markdown format
- No explanations or additional text
- Ensure clean, readable structure
- Use appropriate column headers
- Handle missing data gracefully`;

                    const result = await formatTableHandler({
                        rawData: args.data,
                        context: args.context || 'custom table',
                        instructions: enhancedInstructions
                    }, {
                        openaiApiKey: configManager?.openaiApiKey || process.env.OPENAI_API_KEY
                    });

                    return result;
                } catch (error) {
                    return {
                        success: false,
                        error: `Table creation failed: ${error.message}`
                    };
                }
            },
            endpoint: '/api/tools/create-table',
            category: 'formatting',
            enabled: true,
            description: 'Create custom tables with any data and formatting instructions',
            instructions: `Use this tool to create any table you want without describing what you're doing.
                Simply send the data and optional formatting instructions to the table creation agent.

                DIRECT USAGE:
                - Send any raw data (numbers, lists, information, etc.)
                - Optionally specify table structure or formatting requirements
                - Get back a clean, formatted table immediately
                - No need to explain or announce what you're doing

                EXAMPLES:
                - Data: "Sales: 1000, Marketing: 500, Support: 300" → creates expense table
                - Data: "John: 25, Sarah: 30, Mike: 28" + Instructions: "Age comparison table"
                - Data: Any list, comparison, or structured information

                WHEN TO USE create_table:
                - When you need to organize or present data in table format
                - For comparisons, analysis, summaries, or any structured data
                - When you have information that would be clearer as a table
                - For creating new tables from your analysis or responses

                DO NOT USE create_table for:
                - Recreating tables from uploaded documents (use table_workflow instead)
                - Searching document content (use search_documents instead)

                SILENT OPERATION: You can use this tool without telling the user what you're doing - just create the table they need.`
        },

        // NOTE: LangGraph workflows are now managed in the Workflows section of admin panel
        // The recreate_table workflow has been moved to the workflows system for proper management
    }
};

// Get all tools as a flat list (including dynamic workflows)
export async function getAllTools() {
    const tools = [];

    // Add static tools from registry
    for (const category of Object.values(toolRegistry)) {
        for (const [name, tool] of Object.entries(category)) {
            tools.push({
                name,
                ...tool
            });
        }
    }

    // Add dynamic workflow tools
    try {
        await workflowRegistry.initialize();
        const workflowTools = workflowRegistry.getWorkflowTools();

        for (const [toolName, workflowTool] of Object.entries(workflowTools)) {
            tools.push({
                name: toolName,
                ...workflowTool
            });
        }

        console.log('Added', Object.keys(workflowTools).length, 'workflow tools to voice agent');
    } catch (error) {
        console.error('Error loading workflow tools:', error);
    }

    return tools;
}

// Get enabled tools only
export async function getEnabledTools() {
    const allTools = await getAllTools();
    return allTools.filter(tool => tool.enabled);
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
export async function getRealtimeToolDefinitions() {
    const enabledTools = await getEnabledTools();
    return enabledTools
        .filter(tool => tool.definition)
        .map(tool => ({
            ...tool.definition,
            type: 'function' // Required by OpenAI Realtime API
        }));
}

// Get tools with merged instructions for voice assistant
export async function getToolsWithInstructions() {
    const tools = await getEnabledTools();
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
export async function getComprehensiveToolConfig() {
    const enabledTools = await getEnabledTools();
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

// Execute a tool by name with configManager injection
export async function executeTool(name, args, configManager = null) {
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

    // For tools that require API keys, inject configManager
    if (tool.requiresApiKey && configManager) {
        return await tool.handler(args, configManager);
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