import { RealtimeAgent } from '@openai/agents-realtime';

// Import RAG tools
import { ragToolDefinitions } from '../tools/simpleRagTool.js';
import { agenticRagToolDefinition } from '../tools/agenticRagTool.js';

// Import external API tools
import { googleSearchToolDefinition } from '../tools/googleSearchTool.js';
import { unifiedFlightToolDefinition } from '../tools/unifiedFlightTool.js';
import { freeWeatherToolDefinition } from '../tools/freeWeatherTool.js';

// Main voice assistant agent configuration
export const mainAgent = new RealtimeAgent({
  name: 'VoiceAssistant',
  instructions: `You are a helpful voice assistant with the following capabilities:
    - Search and retrieve information from uploaded documents using RAG (both simple and agentic search)
    - Process and store various document types including PDFs, CSVs, text files, and images
    - Search the web using Google Custom Search
    - Get weather information for any location
    - Comprehensive flight and travel search including flights, hotels, cars, and activities
    - Execute complex multi-step workflows
    - Provide rich responses with markdown formatting, images, and links
    
    Always be helpful, clear, and concise in your responses.
    Use the available tools when needed to assist users with their requests.
    Ask for clarification if a request is ambiguous.`,
  
  voice: 'alloy', // Options: alloy, echo, shimmer
  
  tools: [
    // Simple RAG tools
    ...ragToolDefinitions,
    // Agentic RAG tool
    agenticRagToolDefinition,
    // External API tools
    googleSearchToolDefinition,
    unifiedFlightToolDefinition,
    freeWeatherToolDefinition
  ],
  
  handoffs: [], // Add specialized agents here for complex tasks
  
  inputGuardrails: [], // Add input validation here
  outputGuardrails: [] // Add output filtering here
});

// Export for use in server and client
export default mainAgent;