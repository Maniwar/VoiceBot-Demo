
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { unifiedRagToolHandlers } from '../../tools/unifiedRagTool.js';
import { formatTableHandler } from '../../tools/formatTableTool.js';

// Workflow: Table Workflow
// Description: Search and format tables automatically
// Generated: 2025-09-27T18:45:12.137Z

const WorkflowState = Annotation.Root({
    userQuery: Annotation,
    search_documentsResult: Annotation,
    format_tableResult: Annotation,
    finalResponse: Annotation
});


async function search_documentsNode(state) {
    try {
        const result = await unifiedRagToolHandlers.search_documents({ query: state.userQuery });
        return { search_documentsResult: result };
    } catch (error) {
        console.error('search_documents error:', error);
        return { search_documentsResult: { success: false, error: error.message } };
    }
}

async function format_tableNode(state) {
    try {
        // Extract content from search results array
        const searchResults = state.search_documentsResult;
        let rawData = '';

        if (Array.isArray(searchResults) && searchResults.length > 0) {
            // Use the content from the first search result
            rawData = searchResults[0].content || '';
        } else if (searchResults && searchResults.message) {
            // Fallback to message property if it exists
            rawData = searchResults.message;
        } else {
            rawData = 'No data found';
        }

        console.log('Format table input data length:', rawData.length);
        const result = await formatTableHandler({ rawData: rawData, context: 'workflow data' }, { openaiApiKey: process.env.OPENAI_API_KEY });
        return { format_tableResult: result };
    } catch (error) {
        console.error('format_table error:', error);
        return { format_tableResult: { success: false, error: error.message } };
    }
}

const workflow = new StateGraph(WorkflowState)
    .addNode("search_documents", search_documentsNode)
    .addNode("format_table", format_tableNode)
    .addEdge(START, "search_documents")
    .addEdge("search_documents", "format_table")
    .addEdge("format_table", END);

const graph = workflow.compile();

export async function executeWorkflow(query) {
    return await graph.invoke({ userQuery: query });
}
