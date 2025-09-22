import { RealtimeAgent } from '@openai/agents-realtime';
import { handoff } from '@openai/agents';
import { ragSearchTool } from '../tools/ragTool.js';
import { documentUploadTool } from '../tools/documentTool.js';
import { workflowTool } from '../tools/workflowTool.js';

// Main voice assistant agent
export const mainAgent = new RealtimeAgent({
  name: 'VoiceAssistant',
  instructions: `You are a helpful voice assistant with the following capabilities:
    - Search and retrieve information from uploaded documents using RAG
    - Process and store various document types including PDFs, CSVs, text files, and images
    - Execute complex multi-step workflows
    - Provide rich responses with markdown formatting, images, and links
    
    Always be helpful, clear, and concise in your responses.
    Use the available tools when needed to assist users with their requests.
    Ask for clarification if a request is ambiguous.`,
  
  voice: 'alloy', // Options: alloy, echo, shimmer
  
  tools: [
    ragSearchTool,
    documentUploadTool,
    workflowTool
  ],
  
  handoffs: [], // Add specialized agents here for complex tasks
  
  inputGuardrails: [], // Add input validation here
  outputGuardrails: [] // Add output filtering here
});

// Export for use in server and client
export default mainAgent;