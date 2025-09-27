import OpenAI from 'openai';

// Table formatting tool using GPT-4o-mini for clean presentation
export const formatTableToolDefinition = {
    name: 'format_table',
    description: 'Format raw data into clean markdown tables suitable for chat display',
    parameters: {
        type: 'object',
        properties: {
            rawData: {
                type: 'string',
                description: 'Raw data content that needs to be formatted as a table'
            },
            context: {
                type: 'string',
                description: 'Brief context about what this data represents (optional)',
                default: 'data table'
            }
        },
        required: ['rawData']
    }
};

export async function formatTableHandler(args, config) {
    try {
        const { rawData, context = 'data table' } = args;

        // Get OpenAI client from config
        const openai = new OpenAI({
            apiKey: config.openaiApiKey || process.env.OPENAI_API_KEY
        });

        // Use GPT-4o-mini for efficient table formatting
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a data formatting specialist. Convert raw data into clean, readable markdown tables.

INSTRUCTIONS:
1. Identify the table structure in the raw data
2. Create a proper markdown table with | separators
3. Include headers if present
4. Format data consistently
5. Respond ONLY with the markdown table, no explanations
6. If data contains multiple tables, format each separately
7. Keep all data intact - do not summarize or omit rows

EXAMPLE OUTPUT:
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |`
                },
                {
                    role: 'user',
                    content: `Please format this ${context} into a clean markdown table:\n\n${rawData}`
                }
            ],
            temperature: 0.1, // Low temperature for consistent formatting
            max_tokens: 2000
        });

        const formattedTable = completion.choices[0]?.message?.content;

        if (!formattedTable) {
            throw new Error('Failed to generate table format');
        }

        return {
            success: true,
            message: formattedTable.trim(),
            rawData: rawData,
            context: context
        };

    } catch (error) {
        console.error('Format table error:', error);
        return {
            success: false,
            error: 'Failed to format table',
            message: `Error formatting table: ${error.message}`
        };
    }
}