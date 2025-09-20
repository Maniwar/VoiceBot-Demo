# How to Demo the RAG System with Product Catalog

## Quick Setup

1. **Start the server** (if not running):
```bash
source venv/bin/activate
python src/server.py
```

2. **Open browser**: http://localhost:3000

## Demo Steps

### Step 1: Upload the Product Catalog
1. In the main interface, look for the **Knowledge Base** section (left side)
2. Click "Drop files here or click to upload"
3. Navigate to: `data/sample_docs/product_catalog.json`
4. Upload the file
5. You should see:
   - File appear in the list
   - Chunk count increase
   - Success message: "📄 Uploaded: product_catalog.json"

### Step 2: Test RAG with Voice Commands

Try these voice commands (click microphone or hold spacebar):

#### Product Queries:
- "What products do you have?"
- "Tell me about the Smart Home Hub"
- "What security products are available?"
- "What's the price of the Robot Vacuum?"
- "Which products are out of stock?"
- "What are the shipping options?"

#### Specific Information:
- "What features does the Smart Door Lock have?"
- "Tell me about the warranty for the Smart Thermostat"
- "What's the most expensive product?"
- "Do you have any products under 100 dollars?"

### Step 3: Test with Text Input

Type these questions in the text box:

1. "Search for all products in the Security category"
2. "What are the features of PRD001?"
3. "Compare the warranties of all products"
4. "What payment and shipping options are available?"

## What's Happening Behind the Scenes

When you ask about products:

1. **Speech Recognition**: Your voice is converted to text
2. **Function Call**: The AI calls `search_knowledge_base`
3. **RAG Search**: The system searches the uploaded product catalog
4. **Response Generation**: AI formulates an answer based on the found information
5. **Voice Response**: The answer is spoken back to you

## Console Output to Watch

Open browser console (F12) to see:
- `Server message: function_call` - AI calling search function
- `Function result: {results: Array(...)}` - Search results from RAG
- `Transcript complete:` - The AI's response

## Troubleshooting

### If "no products found":
1. Make sure you uploaded `product_catalog.json`
2. Check the chunk count increased after upload
3. Try refreshing the page and re-uploading

### If voice doesn't work:
1. Check microphone permissions
2. Make sure you see "Recording..." when holding spacebar
3. Speak clearly after clicking the microphone

## Additional Documents to Upload

You can also upload:
- `data/sample_docs/voicebot_manual.txt` - System documentation
- Any PDF with product specifications
- Text files with FAQs
- JSON files with additional data

## Demo Script

"Let me show you our AI assistant with document search capabilities:

1. **Upload Knowledge Base** - [Upload product_catalog.json]
   'I've just uploaded our product catalog'

2. **Voice Query** - [Click microphone]
   'What security products do you have?'
   [AI searches and responds with Smart Door Lock and Security Camera]

3. **Specific Information** - 
   'Tell me about the Robot Vacuum features'
   [AI provides detailed features from the catalog]

4. **Complex Query** -
   'What products are under 200 dollars and in stock?'
   [AI searches and filters results]

This demonstrates how the AI can instantly search through uploaded documents and provide accurate information using RAG technology."