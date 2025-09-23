import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import multer from 'multer';
import winston from 'winston';
import configManager from './src/services/configManager.js';
// Use Pinecone document manager (falls back to local if no API key)
import pineconeDocumentManager from './src/services/pineconeDocumentManager.js';
const documentManager = pineconeDocumentManager;
import { GoogleSearchTool } from './src/tools/googleSearchTool.js';
import { FreeWeatherTool } from './src/tools/freeWeatherTool.js';
import unifiedFlightTool from './src/tools/unifiedFlightTool.js';
import agenticRagTool from './src/tools/agenticRagTool.js';
import toolRegistry from './src/tools/toolRegistry.js';
import mainAgent from './src/agents/mainAgent.js';
import OpenAI from 'openai';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    new winston.transports.File({ filename: 'logs/app.log' })
  ]
});

// Initialize Express app
const app = express();

// Initialize managers
await configManager.initialize();
await documentManager.initialize();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(join(__dirname, 'public')));

// Serve OpenAI SDK bundle
app.use('/sdk', express.static(join(__dirname, 'node_modules/@openai/agents-realtime/dist/bundle')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    rag: {
      provider: process.env.PINECONE_API_KEY ? 'pinecone' : 'local',
      status: documentManager.index ? 'connected' : 'local-fallback'
    }
  });
});

// Ephemeral key generation endpoint (required for browser WebRTC)
// Following commit 3f007d6 - GA migration pattern
app.post('/api/session', async (req, res) => {
  try {
    logger.info('Generating ephemeral key for client');
    
    // Using the GA endpoint pattern from commit 3f007d6
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: configManager.getSettings()?.model || 'gpt-realtime',
          instructions: configManager.getSettings()?.instructions || 'You are a helpful, witty, and friendly voice assistant. Respond naturally and conversationally.',
          audio: {
            output: {
              voice: configManager.getSettings()?.voice || 'shimmer'
            }
          }
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('OpenAI API error:', { status: response.status, error });
      return res.status(response.status).json({ 
        error: 'Failed to generate session key',
        details: error 
      });
    }

    const data = await response.json();
    logger.info(`Ephemeral key generated: ${data.value.substring(0, 10)}...`);
    
    // Return the ephemeral key in format expected by SDK clients
    res.json({
      ephemeralKey: data.value,  // Primary field expected by clients
      value: data.value,  // Also include direct value
      expires_at: data.expires_at,
      model: 'gpt-realtime',
      voice: req.body.voice || 'alloy'
    });
    
  } catch (error) {
    logger.error('Session creation error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Document upload endpoint for RAG
app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    logger.info(`File uploaded: ${req.file.originalname}`);
    
    // Process document with document manager
    const result = await documentManager.processDocument(
      req.file.path,
      req.file.originalname,
      req.file.mimetype
    );
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
    
  } catch (error) {
    logger.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed',
      message: error.message 
    });
  }
});

// Search documents endpoint
app.post('/api/documents/search', async (req, res) => {
  try {
    const { query, limit } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    const results = await documentManager.searchDocuments(query, limit);
    res.json(results);
    
  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({ 
      error: 'Search failed',
      message: error.message 
    });
  }
});

// Agentic search endpoint - uses reasoning and multiple retrieval attempts
app.post('/api/documents/agentic-search', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    logger.info('Agentic search for:', query);
    const results = await agenticRagTool.handler({ query });
    res.json(results);
    
  } catch (error) {
    logger.error('Agentic search error:', error);
    res.status(500).json({ 
      error: 'Agentic search failed',
      message: error.message 
    });
  }
});

// Get all documents endpoint
app.get('/api/documents', async (req, res) => {
  try {
    const documents = await documentManager.getAllDocuments();
    res.json({ 
      success: true,
      documents,
      count: documents.length
    });
  } catch (error) {
    logger.error('Get documents error:', error);
    res.status(500).json({ 
      error: 'Failed to get documents',
      message: error.message 
    });
  }
});

// Get document content endpoint
app.get('/api/documents/:id', async (req, res) => {
  try {
    const result = await documentManager.getDocumentContent(req.params.id);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error('Get document error:', error);
    res.status(500).json({ 
      error: 'Failed to get document',
      message: error.message 
    });
  }
});

// Delete document endpoint
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const result = await documentManager.deleteDocument(req.params.id);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error('Delete document error:', error);
    res.status(500).json({ 
      error: 'Failed to delete document',
      message: error.message 
    });
  }
});

// Clear all documents endpoint
app.delete('/api/documents', async (req, res) => {
  try {
    const result = await documentManager.clearAllDocuments();
    res.json(result);
  } catch (error) {
    logger.error('Clear documents error:', error);
    res.status(500).json({ 
      error: 'Failed to clear documents',
      message: error.message 
    });
  }
});

// Settings endpoints
app.get('/api/settings', (req, res) => {
  const settings = configManager.getSettings();
  res.json(settings);
});

// Get default settings from mainAgent.js
app.get('/api/settings/defaults', (req, res) => {
  try {
    // Extract configuration from mainAgent
    const defaults = {
      name: mainAgent.name || 'VoiceAssistant',
      instructions: mainAgent.instructions || '',
      voice: mainAgent.voice || 'alloy',
      model: 'gpt-4o-realtime-preview',
      temperature: 0.8,
      maxResponseOutputTokens: 4096,
      tools: mainAgent.tools?.map(tool => ({
        name: tool.name || tool.definition?.name,
        enabled: true
      })) || [],
      handoffs: mainAgent.handoffs || [],
      inputGuardrails: mainAgent.inputGuardrails || [],
      outputGuardrails: mainAgent.outputGuardrails || []
    };
    
    res.json(defaults);
  } catch (error) {
    logger.error('Error getting default settings:', error);
    res.status(500).json({ 
      error: 'Failed to get default settings',
      message: error.message 
    });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const settings = await configManager.saveSettings(req.body);
    res.json({ success: true, settings });
  } catch (error) {
    logger.error('Save settings error:', error);
    res.status(500).json({ 
      error: 'Failed to save settings',
      message: error.message 
    });
  }
});

// RAG Settings endpoint
app.post('/api/settings/rag', async (req, res) => {
  try {
    const { ragSettings, toolInstructions } = req.body;
    
    // Update document manager settings
    if (ragSettings) {
      // Store RAG settings in configManager
      await configManager.updateSetting('ragConfig', ragSettings);
      
      // Apply settings to document manager
      if (documentManager.setConfig) {
        documentManager.setConfig(ragSettings);
      }
    }
    
    // Update tool instructions if provided
    if (toolInstructions) {
      await configManager.updateSetting('toolInstructions', toolInstructions);
    }
    
    res.json({ 
      success: true, 
      message: 'RAG settings updated successfully',
      settings: {
        ragConfig: ragSettings,
        toolInstructions: toolInstructions
      }
    });
  } catch (error) {
    logger.error('Save RAG settings error:', error);
    res.status(500).json({ 
      error: 'Failed to save RAG settings',
      message: error.message 
    });
  }
});

// Get RAG settings endpoint
app.get('/api/settings/rag', (req, res) => {
  const settings = configManager.getSettings();
  res.json({
    ragConfig: settings.ragConfig || {
      chunkSize: 4000,
      chunkOverlap: 500,
      maxChunksPerDoc: 100,
      relevanceThreshold: 0.05,
      hybridSearchWeight: 0.7,
      maxSearchResults: 50,
      embeddingModel: 'text-embedding-ada-002',
      useSemanticChunking: false
    },
    toolInstructions: settings.toolInstructions || {}
  });
});

// API keys endpoints
app.get('/api/apikeys', async (req, res) => {
  try {
    const apiKeys = await configManager.loadApiKeys();
    // Return actual keys for admin panel (this is a local admin interface)
    // In production, you'd want proper authentication here
    res.json(apiKeys);
  } catch (error) {
    logger.error('Get API keys error:', error);
    res.status(500).json({ 
      error: 'Failed to get API keys',
      message: error.message 
    });
  }
});

// Get masked API keys (for display purposes)
app.get('/api/apikeys/status', async (req, res) => {
  try {
    const apiKeys = await configManager.loadApiKeys();
    // Return masked version showing only configuration status
    const status = {};
    for (const [key, config] of Object.entries(apiKeys)) {
      status[key] = {};
      for (const [field, value] of Object.entries(config || {})) {
        if (field.toLowerCase().includes('key') || 
            field.toLowerCase().includes('secret')) {
          status[key][field] = value ? true : false; // Just show if configured
        } else {
          status[key][field] = value;
        }
      }
    }
    res.json(status);
  } catch (error) {
    logger.error('Get API keys status error:', error);
    res.status(500).json({ 
      error: 'Failed to get API keys status',
      message: error.message 
    });
  }
});

app.post('/api/apikeys', async (req, res) => {
  try {
    await configManager.saveApiKeys(req.body);
    res.json({ success: true, message: 'API keys saved' });
  } catch (error) {
    logger.error('Save API keys error:', error);
    res.status(500).json({ 
      error: 'Failed to save API keys',
      message: error.message 
    });
  }
});

app.post('/api/apikeys/validate/:apiName', async (req, res) => {
  try {
    const result = await configManager.validateApiKey(req.params.apiName);
    res.json(result);
  } catch (error) {
    logger.error('Validate API key error:', error);
    res.status(500).json({ 
      error: 'Validation failed',
      message: error.message 
    });
  }
});

// Get all available tools with their definitions and status
app.get('/api/tools', async (req, res) => {
  try {
    const tools = toolRegistry.getAllTools();
    const settings = configManager.getSettings();
    
    // Add custom tools from settings
    if (settings.customTools) {
      for (const tool of Object.values(settings.customTools)) {
        tools.push(tool);
      }
    }
    
    // Merge with user settings for enabled/disabled status
    const toolsWithStatus = tools.map(tool => ({
      ...tool,
      enabled: settings.tools?.[tool.name] !== false && tool.enabled,
      userConfigured: settings.tools?.[tool.name] !== undefined,
      custom: !!settings.customTools?.[tool.name]
    }));
    
    res.json({
      success: true,
      tools: toolsWithStatus,
      categories: ['rag', 'search', 'weather', 'travel', 'vision', 'custom']
    });
  } catch (error) {
    logger.error('Get tools error:', error);
    res.status(500).json({ 
      error: 'Failed to get tools',
      message: error.message 
    });
  }
});

// Get comprehensive tool configuration with merged instructions
app.get('/api/tools/comprehensive', (req, res) => {
  try {
    const config = toolRegistry.getComprehensiveToolConfig();
    const withInstructions = toolRegistry.getToolsWithInstructions();
    
    res.json({
      success: true,
      config: {
        ...config,
        toolsWithInstructions: withInstructions
      }
    });
  } catch (error) {
    logger.error('Get comprehensive tools error:', error);
    res.status(500).json({ 
      error: 'Failed to get comprehensive tool configuration',
      message: error.message 
    });
  }
});

// Get tool by name
app.get('/api/tools/:name', (req, res) => {
  try {
    const settings = configManager.getSettings();
    const tool = toolRegistry.getToolByName(req.params.name) || 
                 settings.customTools?.[req.params.name];
    
    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }
    res.json({ success: true, tool });
  } catch (error) {
    logger.error('Get tool error:', error);
    res.status(500).json({ 
      error: 'Failed to get tool',
      message: error.message 
    });
  }
});

// Create or update a custom tool
app.post('/api/tools', async (req, res) => {
  try {
    const { name, description, parameters, endpoint, category, enabled } = req.body;
    
    if (!name || !description || !parameters) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, description, parameters' 
      });
    }
    
    // Save to custom tools in settings
    const settings = configManager.getSettings();
    if (!settings.customTools) {
      settings.customTools = {};
    }
    
    settings.customTools[name] = {
      name,
      description,
      parameters,
      endpoint,
      category: category || 'custom',
      enabled: enabled !== false,
      createdAt: settings.customTools[name]?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await configManager.saveSettings(settings);
    
    res.json({ 
      success: true, 
      message: 'Tool saved successfully',
      tool: settings.customTools[name]
    });
  } catch (error) {
    logger.error('Save tool error:', error);
    res.status(500).json({ 
      error: 'Failed to save tool',
      message: error.message 
    });
  }
});

// Update tool (enable/disable or edit)
app.patch('/api/tools/:name', async (req, res) => {
  try {
    const settings = configManager.getSettings();
    const { enabled, description, parameters, endpoint, category } = req.body;
    
    // Check if it's a custom tool that needs full update
    if (settings.customTools?.[req.params.name]) {
      if (description || parameters || endpoint || category) {
        // Full update for custom tool
        const tool = settings.customTools[req.params.name];
        if (description) tool.description = description;
        if (parameters) tool.parameters = parameters;
        if (endpoint) tool.endpoint = endpoint;
        if (category) tool.category = category;
        if (enabled !== undefined) tool.enabled = enabled;
        tool.updatedAt = new Date().toISOString();
      }
    } else {
      // Just update enabled status for built-in tools
      if (!settings.tools) {
        settings.tools = {};
      }
      settings.tools[req.params.name] = enabled;
    }
    
    await configManager.saveSettings(settings);
    
    res.json({ 
      success: true, 
      message: `Tool ${req.params.name} updated`,
      tool: req.params.name,
      enabled 
    });
  } catch (error) {
    logger.error('Update tool error:', error);
    res.status(500).json({ 
      error: 'Failed to update tool',
      message: error.message 
    });
  }
});

// Delete a custom tool
app.delete('/api/tools/:name', async (req, res) => {
  try {
    const settings = configManager.getSettings();
    
    if (!settings.customTools || !settings.customTools[req.params.name]) {
      return res.status(404).json({ error: 'Custom tool not found' });
    }
    
    delete settings.customTools[req.params.name];
    await configManager.saveSettings(settings);
    
    res.json({ 
      success: true, 
      message: 'Tool deleted successfully' 
    });
  } catch (error) {
    logger.error('Delete tool error:', error);
    res.status(500).json({ 
      error: 'Failed to delete tool',
      message: error.message 
    });
  }
});

// Execute a tool (for testing from admin panel)
app.post('/api/tools/:name/execute', async (req, res) => {
  try {
    const result = await toolRegistry.executeTool(req.params.name, req.body);
    res.json({ 
      success: true,
      result 
    });
  } catch (error) {
    logger.error('Execute tool error:', error);
    res.status(500).json({ 
      error: 'Failed to execute tool',
      message: error.message 
    });
  }
});

// Image analysis endpoint
app.post('/api/analyze-image', async (req, res) => {
    try {
        const { image, prompt } = req.body;
        
        if (!image) {
            return res.status(400).json({ error: 'No image provided' });
        }
        
        // Use OpenAI Vision API to analyze the image
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: prompt || 'Describe what you see in this image in detail'
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: image,
                            detail: 'low'
                        }
                    }
                ]
            }],
            max_tokens: 500,
            temperature: 0.7
        });
        
        const description = response.choices[0]?.message?.content || 'Unable to analyze image';
        
        res.json({
            success: true,
            description: description
        });
        
    } catch (error) {
        logger.error('Image analysis error:', error);
        res.status(500).json({
            error: 'Failed to analyze image',
            message: error.message
        });
    }
});

// Save tool configuration
app.post('/api/tools/save', async (req, res) => {
  try {
    const tool = req.body;
    
    // Save to settings
    const settings = configManager.getSettings();
    if (!settings.customTools) {
      settings.customTools = {};
    }
    settings.customTools[tool.name] = tool;
    await configManager.saveSettings(settings);
    
    res.json({ success: true, tool });
  } catch (error) {
    logger.error('Save tool error:', error);
    res.status(500).json({ 
      error: 'Failed to save tool',
      message: error.message 
    });
  }
});

// Legacy toggle endpoint (kept for backward compatibility)
app.post('/api/tools/:toolName/toggle', async (req, res) => {
  const { toolName } = req.params;
  const { enabled } = req.body;
  
  logger.info(`Tool ${toolName} ${enabled ? 'enabled' : 'disabled'}`);
  
  // Use the new PATCH endpoint internally
  const settings = configManager.getSettings();
  if (!settings.tools) {
    settings.tools = {};
  }
  settings.tools[toolName] = enabled;
  await configManager.saveSettings(settings);
  
  res.json({ 
    tool: toolName,
    enabled: enabled 
  });
});

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Express error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info('OpenAI API key configured:', !!process.env.OPENAI_API_KEY);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  app.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});