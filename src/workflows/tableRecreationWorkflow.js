import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { unifiedRagToolHandlers } from '../tools/unifiedRagTool.js';
import { formatTableHandler } from '../tools/formatTableTool.js';

// Define workflow state
const TableWorkflowState = Annotation.Root({
    userQuery: Annotation,
    searchResults: Annotation,
    rawTableData: Annotation,
    formattedTable: Annotation,
    finalResponse: Annotation
});

// Workflow nodes
async function searchDocuments(state) {
    console.log('TableWorkflow: Searching documents for:', state.userQuery);

    try {
        const searchResult = await unifiedRagToolHandlers.search_documents({
            query: state.userQuery,
            mode: 'simple' // Use simple mode for table searches
        });

        if (searchResult.success) {
            return {
                searchResults: searchResult,
                rawTableData: searchResult.message
            };
        } else {
            return {
                finalResponse: "I couldn't find any table data in the documents."
            };
        }
    } catch (error) {
        console.error('TableWorkflow search error:', error);
        return {
            finalResponse: "Error searching documents for table data."
        };
    }
}

async function formatTable(state) {
    console.log('TableWorkflow: Formatting table data');

    try {
        const formatResult = await formatTableHandler({
            rawData: state.rawTableData,
            context: 'analytics table from document'
        }, {
            openaiApiKey: process.env.OPENAI_API_KEY
        });

        if (formatResult.success) {
            return {
                formattedTable: formatResult.message,
                finalResponse: `Here is the table:\n\n${formatResult.message}`
            };
        } else {
            return {
                finalResponse: "I found table data but couldn't format it properly."
            };
        }
    } catch (error) {
        console.error('TableWorkflow format error:', error);
        return {
            finalResponse: "Error formatting the table data."
        };
    }
}

// Route function - decide whether to format or finish
function shouldFormatTable(state) {
    // If we have search results and raw data, format it
    if (state.searchResults && state.rawTableData &&
        (state.rawTableData.includes('|') || state.rawTableData.includes(',') ||
         state.rawTableData.toLowerCase().includes('table'))) {
        return "format_table";
    }
    // Otherwise, we're done
    return END;
}

// Build the workflow
const tableRecreationWorkflow = new StateGraph(TableWorkflowState)
    .addNode("search_documents", searchDocuments)
    .addNode("format_table", formatTable)
    .addEdge(START, "search_documents")
    .addConditionalEdges("search_documents", shouldFormatTable, {
        "format_table": "format_table",
        [END]: END
    })
    .addEdge("format_table", END);

// Compile the workflow
const tableWorkflowGraph = tableRecreationWorkflow.compile();

// Export workflow execution function
export async function executeTableRecreationWorkflow(userQuery, config = {}) {
    try {
        console.log('Executing Table Recreation Workflow for:', userQuery);

        const result = await tableWorkflowGraph.invoke({
            userQuery: userQuery
        }, {
            configurable: {
                thread_id: `table-${Date.now()}`
            }
        });

        return {
            success: true,
            message: result.finalResponse || "Table workflow completed",
            workflowSteps: ['search_documents', 'format_table'],
            executedAt: new Date().toISOString()
        };

    } catch (error) {
        console.error('Table Recreation Workflow error:', error);
        return {
            success: false,
            error: 'Table workflow failed',
            message: error.message
        };
    }
}

// Workflow definition for tool registry
export const tableRecreationWorkflowDefinition = {
    name: 'recreate_table',
    description: 'Automatically search documents and format tables for clean presentation',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'What table or data to search for and recreate'
            }
        },
        required: ['query']
    }
};