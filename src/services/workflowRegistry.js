import configManager from './configManager.js';

// Workflow Registry - Bridges admin-created workflows to voice agent tools
class WorkflowRegistry {
    constructor() {
        this.workflows = new Map();
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            const workflows = await configManager.loadWorkflows();
            console.log('WorkflowRegistry: Loading workflows:', workflows.length);

            for (const workflow of workflows) {
                if (workflow.enabled && workflow.steps && workflow.steps.length > 0) {
                    this.registerWorkflow(workflow);
                }
            }

            this.initialized = true;
            console.log('WorkflowRegistry: Initialized with', this.workflows.size, 'active workflows');
        } catch (error) {
            console.error('WorkflowRegistry: Error initializing:', error);
        }
    }

    registerWorkflow(workflow) {
        // Create user-friendly tool name from workflow name
        const toolName = workflow.name
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

        const toolDefinition = {
            name: toolName,
            description: `${workflow.description} (Workflow: ${workflow.steps.join(' → ')})`,
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'User query or request'
                    }
                },
                required: ['query']
            }
        };

        const toolHandler = async (args) => {
            try {
                console.log(`Executing workflow: ${workflow.name}`);

                // Import and execute the generated workflow
                const workflowModule = await import(`../workflows/generated/${workflow.id}.js`);
                const result = await workflowModule.executeWorkflow(args.query);

                return {
                    success: true,
                    message: result.format_tableResult?.message || result.finalResponse || 'Workflow completed',
                    workflowName: workflow.name,
                    stepsExecuted: workflow.steps
                };
            } catch (error) {
                console.error(`Workflow ${workflow.name} execution error:`, error);
                return {
                    success: false,
                    error: `Workflow failed: ${error.message}`,
                    workflowName: workflow.name
                };
            }
        };

        this.workflows.set(toolName, {
            definition: toolDefinition,
            handler: toolHandler,
            workflow: workflow,
            triggers: workflow.triggers || [],
            workflowId: workflow.id
        });

        console.log(`Registered workflow tool: ${workflow.name} as "${toolName}" (${workflow.id})`);
    }

    getWorkflowTools() {
        const tools = {};

        for (const [workflowId, workflowTool] of this.workflows) {
            // Create user-friendly tool name from workflow name
            const toolName = workflowTool.workflow.name
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .replace(/\s+/g, '_');

            tools[toolName] = {
                definition: workflowTool.definition,
                handler: workflowTool.handler,
                endpoint: `/api/workflows/${workflowId}/execute`,
                category: 'workflow',
                enabled: true,
                description: workflowTool.workflow.description,
                instructions: this.generateWorkflowInstructions(workflowTool.workflow),
                isWorkflow: true,
                workflowId: workflowId
            };
        }

        return tools;
    }

    generateWorkflowInstructions(workflow) {
        const triggerList = workflow.triggers && workflow.triggers.length > 0 ?
            workflow.triggers.map(t => `"${t} from document"`).join(', ') :
            '"recreate table from document", "show table from document"';

        return `Use this workflow ONLY when users specifically ask to: ${triggerList} FROM UPLOADED DOCUMENTS.

This workflow automatically executes: ${workflow.steps.join(' → ')}

WHEN TO USE table_workflow:
- "Recreate the table from the document"
- "Show the table from the uploaded file"
- "Display the table data from the document"

DO NOT USE table_workflow for:
- Creating new tables from analysis or responses (use create_table instead)
- Presenting your own data or comparisons (use create_table instead)
- Organizing information you generate (use create_table instead)

This workflow is specifically for extracting and formatting tables from uploaded document content.`;
    }

    async reload() {
        this.workflows.clear();
        this.initialized = false;
        await this.initialize();
    }

    hasWorkflowForTrigger(userQuery) {
        const query = userQuery.toLowerCase();

        for (const [workflowId, workflowTool] of this.workflows) {
            const triggers = workflowTool.triggers || [];

            for (const trigger of triggers) {
                if (query.includes(trigger.toLowerCase())) {
                    return workflowId;
                }
            }
        }

        return null;
    }
}

// Create singleton instance
const workflowRegistry = new WorkflowRegistry();

export default workflowRegistry;