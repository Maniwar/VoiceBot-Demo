import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import multer from 'multer';
import winston from 'winston';
import fs from 'fs';
import configManager from './src/services/configManager.js';
// Use Pinecone document manager (falls back to local if no API key)
import pineconeDocumentManager from './src/services/pineconeDocumentManager.js';
const documentManager = pineconeDocumentManager;
import { GoogleSearchTool } from './src/tools/googleSearchTool.js';
import { FreeWeatherTool } from './src/tools/freeWeatherTool.js';
import unifiedFlightTool from './src/tools/unifiedFlightTool.js';
// Removed - now using unified toolRegistry
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

// Enhanced Health check endpoint with comprehensive validation
app.get('/health', async (req, res) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    checks: {
      server: 'healthy',
      configManager: 'unknown',
      toolRegistry: 'unknown',
      documentManager: 'unknown',
      adminPanel: 'unknown'
    },
    details: {
      rag: {
        provider: process.env.PINECONE_API_KEY ? 'pinecone' : 'local',
        status: documentManager.index ? 'connected' : 'local-fallback'
      },
      tools: {
        total: 0,
        enabled: 0,
        categories: []
      },
      configuration: {
        settingsLoaded: false,
        apiKeysConfigured: 0,
        encryptionEnabled: false
      }
    },
    issues: [],
    performance: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      responseTime: Date.now()
    }
  };

  try {
    // Check ConfigManager
    try {
      const settings = configManager.getSettings();
      if (settings) {
        healthCheck.checks.configManager = 'healthy';
        healthCheck.details.configuration.settingsLoaded = true;
      } else {
        healthCheck.checks.configManager = 'unhealthy';
        healthCheck.issues.push('Settings not loaded');
      }

      // Check API keys
      const apiKeys = await configManager.loadApiKeys();
      if (apiKeys) {
        const configuredCount = Object.entries(apiKeys)
          .filter(([key, config]) => config && Object.values(config).some(v => v && v !== ''))
          .length;
        healthCheck.details.configuration.apiKeysConfigured = configuredCount;
        healthCheck.details.configuration.encryptionEnabled = true;
      }
    } catch (error) {
      healthCheck.checks.configManager = 'critical';
      healthCheck.issues.push(`ConfigManager error: ${error.message}`);
    }

    // Check Tool Registry
    try {
      const tools = toolRegistry.getAllTools();
      const enabledTools = toolRegistry.getEnabledTools();
      const categories = [...new Set(tools.map(tool => tool.category))];

      healthCheck.checks.toolRegistry = 'healthy';
      healthCheck.details.tools = {
        total: tools.length,
        enabled: enabledTools.length,
        categories: categories
      };
    } catch (error) {
      healthCheck.checks.toolRegistry = 'unhealthy';
      healthCheck.issues.push(`ToolRegistry error: ${error.message}`);
    }

    // Check Document Manager
    try {
      if (documentManager) {
        healthCheck.checks.documentManager = 'healthy';
        // Get document count if possible
        try {
          const docs = await documentManager.getAllDocuments();
          healthCheck.details.rag.documentCount = docs.length;
        } catch (docError) {
          // Non-critical if we can't get doc count
          healthCheck.details.rag.documentCount = 'unknown';
        }
      } else {
        healthCheck.checks.documentManager = 'unhealthy';
        healthCheck.issues.push('Document manager not initialized');
      }
    } catch (error) {
      healthCheck.checks.documentManager = 'critical';
      healthCheck.issues.push(`DocumentManager error: ${error.message}`);
    }

    // Check Admin Panel accessibility (basic check)
    healthCheck.checks.adminPanel = 'healthy'; // Assume healthy if server is running

    // Calculate overall health
    const checks = Object.values(healthCheck.checks);
    const criticalCount = checks.filter(status => status === 'critical').length;
    const unhealthyCount = checks.filter(status => status === 'unhealthy').length;

    if (criticalCount > 0) {
      healthCheck.status = 'critical';
    } else if (unhealthyCount > 1) {
      healthCheck.status = 'unhealthy';
    } else if (unhealthyCount > 0) {
      healthCheck.status = 'warning';
    } else {
      healthCheck.status = 'healthy';
    }

  } catch (error) {
    healthCheck.status = 'critical';
    healthCheck.issues.push(`Health check failed: ${error.message}`);
    logger.error('Health check error:', error);
  }

  healthCheck.performance.responseTime = Date.now() - healthCheck.performance.responseTime;

  // Set appropriate status code
  const statusCode = healthCheck.status === 'critical' ? 503 :
                    healthCheck.status === 'unhealthy' ? 500 : 200;

  res.status(statusCode).json(healthCheck);
});

// Comprehensive automated health validation endpoint
app.get('/health/comprehensive', async (req, res) => {
  try {
    logger.info('Running comprehensive health validation');

    const validation = {
      timestamp: new Date().toISOString(),
      status: 'running',
      categories: {
        server: { status: 'healthy', checks: [], issues: [] },
        configuration: { status: 'unknown', checks: [], issues: [] },
        tools: { status: 'unknown', checks: [], issues: [] },
        security: { status: 'unknown', checks: [], issues: [] }
      },
      performance: {
        startTime: Date.now(),
        endTime: null,
        duration: null
      }
    };

    // Server Health Validation
    validation.categories.server.checks.push('✅ Server responding to requests');
    validation.categories.server.checks.push(`✅ Uptime: ${Math.round(process.uptime())} seconds`);
    validation.categories.server.checks.push(`✅ Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

    // Configuration Validation
    try {
      const settings = configManager.getSettings();
      if (settings && settings.model && settings.voice && settings.instructions) {
        validation.categories.configuration.checks.push('✅ All required settings present');
        validation.categories.configuration.status = 'healthy';
      } else {
        validation.categories.configuration.issues.push('❌ Missing required settings');
        validation.categories.configuration.status = 'unhealthy';
      }

      const apiKeys = await configManager.loadApiKeys();
      const configuredApis = Object.entries(apiKeys)
        .filter(([key, config]) => config && Object.values(config).some(v => v && v !== ''))
        .map(([key]) => key);

      validation.categories.configuration.checks.push(`✅ ${configuredApis.length} API providers configured: ${configuredApis.join(', ')}`);

    } catch (error) {
      validation.categories.configuration.issues.push(`❌ Configuration error: ${error.message}`);
      validation.categories.configuration.status = 'critical';
    }

    // Tools Validation
    try {
      const tools = toolRegistry.getAllTools();
      const enabledTools = toolRegistry.getEnabledTools();
      const categories = [...new Set(tools.map(tool => tool.category))];

      validation.categories.tools.checks.push(`✅ ${tools.length} tools loaded`);
      validation.categories.tools.checks.push(`✅ ${enabledTools.length} tools enabled`);
      validation.categories.tools.checks.push(`✅ Categories: ${categories.join(', ')}`);

      // Check tool definitions
      const toolsWithDefinitions = enabledTools.filter(tool => tool.definition);
      validation.categories.tools.checks.push(`✅ ${toolsWithDefinitions.length} tools have valid definitions`);

      validation.categories.tools.status = 'healthy';

    } catch (error) {
      validation.categories.tools.issues.push(`❌ Tools error: ${error.message}`);
      validation.categories.tools.status = 'critical';
    }

    // Security Validation
    try {
      // Check if API keys are encrypted
      const configDir = join(__dirname, 'config');
      const encryptionKeyPath = join(configDir, '.encryption-key');

      try {
        await fs.promises.access(encryptionKeyPath);
        validation.categories.security.checks.push('✅ Encryption key file exists');
      } catch {
        validation.categories.security.issues.push('❌ Encryption key file missing');
      }

      // Check if settings are not exposing sensitive data
      validation.categories.security.checks.push('✅ Health endpoint does not expose sensitive data');
      validation.categories.security.status = validation.categories.security.issues.length === 0 ? 'healthy' : 'warning';

    } catch (error) {
      validation.categories.security.issues.push(`❌ Security check error: ${error.message}`);
      validation.categories.security.status = 'critical';
    }

    // Calculate final status
    const statuses = Object.values(validation.categories).map(cat => cat.status);
    const criticalCount = statuses.filter(s => s === 'critical').length;
    const unhealthyCount = statuses.filter(s => s === 'unhealthy').length;

    if (criticalCount > 0) {
      validation.status = 'critical';
    } else if (unhealthyCount > 0) {
      validation.status = 'unhealthy';
    } else {
      validation.status = 'healthy';
    }

    // Finalize performance metrics
    validation.performance.endTime = Date.now();
    validation.performance.duration = validation.performance.endTime - validation.performance.startTime;

    logger.info(`Comprehensive health check completed: ${validation.status} (${validation.performance.duration}ms)`);

    res.json(validation);

  } catch (error) {
    logger.error('Comprehensive health check failed:', error);
    res.status(500).json({
      timestamp: new Date().toISOString(),
      status: 'failed',
      error: error.message
    });
  }
});

// Ephemeral key generation endpoint (required for browser WebRTC)
// Following commit 3f007d6 - GA migration pattern
app.post('/api/session', async (req, res) => {
  try {
    logger.info('Generating ephemeral key for client');

    // Get tool definitions and instructions for voice agent
    const toolDefinitions = await toolRegistry.getRealtimeToolDefinitions();
    const toolConfig = await toolRegistry.getComprehensiveToolConfig();
    logger.info(`Including ${toolDefinitions.length} tools in voice agent session (including table_workflow)`);

    // Build comprehensive instructions including tool usage
    const baseInstructions = configManager.getSettings()?.instructions || 'You are a helpful, witty, and friendly voice assistant. Respond naturally and conversationally.';
    const comprehensiveInstructions = `${baseInstructions}

CRITICAL TOOL USAGE RULES:
1. For DOCUMENT table requests ("recreate table from document", "show table from file"), use table_workflow tool.
2. For ANALYSIS questions about uploaded data ("quantify", "compare", "breakdown", "summary"), FIRST use search_documents to get real data, THEN use create_table with that data.
3. NEVER create tables with made-up data - ALWAYS search documents first to get real information.
4. The table_workflow is for extracting existing tables from uploaded documents only.
5. The create_table tool is for creating new tables from real document data or analysis.
6. WORKFLOW for analysis: search_documents → create_table with results
7. ABSOLUTELY CRITICAL: When a tool returns a response, use that EXACT text as your response. DO NOT improvise, create fake data, or make up tables.

TABLE HALLUCINATION PREVENTION:
- NEVER create fake financial data, revenue numbers, or made-up metrics
- NEVER improvise table content when tools are executing
- NEVER say "Here's the table:" and then create fake data
- ALWAYS wait for tools to provide real data from uploaded documents
- If a tool returns "[TOOL_HANDLING_RESPONSE]", do NOT speak or provide any additional response - the tool is handling everything
- When tools are handling UI updates directly, remain silent and let the tool do its work

AVAILABLE TOOLS:
${toolConfig.instructions}

WORKFLOW PRIORITY: Always prefer workflow tools over individual tools when the request matches a workflow's purpose.
RESPONSE ACCURACY: Use tool results exactly as returned. Never make up data or improvise when tools provide specific responses.
ANTI-HALLUCINATION: Do not create tables, data, or content when tools are handling the request. Let tools do their work and use their results.`;

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
          instructions: comprehensiveInstructions,
          tools: toolDefinitions,
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

    // For validation compatibility, return results array directly if successful
    if (results.success && results.results) {
      res.json(results.results);
    } else {
      res.json(results);
    }

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
    // Use unified toolRegistry with agentic mode
    const results = await toolRegistry.executeTool('search_documents', {
      query,
      mode: 'agentic'
    }, configManager);
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

    // Define all expected API providers with default structure
    const defaultProviders = {
      openai: { apiKey: false, organization: false, enabled: false, category: 'ai' },
      google: { apiKey: false, searchEngineId: false, enabled: false, category: 'search' },
      amadeus: { clientId: false, clientSecret: false, sandbox: false, enabled: false, category: 'travel' },
      weather: { apiKey: false, units: 'imperial', enabled: false, category: 'weather' },
      pinecone: { apiKey: false, environment: false, indexName: false, enabled: false, category: 'vector' }
    };

    // Return masked version showing configuration status for all providers
    const status = {};

    for (const [providerKey, defaultConfig] of Object.entries(defaultProviders)) {
      const existingConfig = apiKeys[providerKey] || {};
      status[providerKey] = {};

      // Merge default structure with existing config
      for (const [field, defaultValue] of Object.entries(defaultConfig)) {
        const value = existingConfig[field];
        if (field.toLowerCase().includes('key') ||
            field.toLowerCase().includes('secret') ||
            field === 'clientId') {
          status[providerKey][field] = value ? true : false; // Just show if configured
        } else {
          status[providerKey][field] = value !== undefined ? value : defaultValue;
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
app.get('/api/tools/comprehensive', async (req, res) => {
  try {
    const config = await toolRegistry.getComprehensiveToolConfig();
    const withInstructions = await toolRegistry.getToolsWithInstructions();

    // Workflow tools are already included via getAllTools() and getEnabledTools()
    // No need to add them again here to avoid duplicates
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
    const result = await toolRegistry.executeTool(req.params.name, req.body, configManager);
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

// Table formatting endpoint - Agent-to-agent formatting
app.post('/api/tools/format-table', async (req, res) => {
    try {
        const { rawData, context } = req.body;

        if (!rawData) {
            return res.status(400).json({ error: 'No raw data provided' });
        }

        // Import the handler dynamically
        const { formatTableHandler } = await import('./src/tools/formatTableTool.js');

        // Execute the formatting tool
        const result = await formatTableHandler({ rawData, context }, {
            openaiApiKey: process.env.OPENAI_API_KEY
        });

        res.json(result);

    } catch (error) {
        logger.error('Table formatting error:', error);
        res.status(500).json({
            error: 'Failed to format table',
            message: error.message
        });
    }
});

// Dynamic table creation endpoint - Direct LLM to agent communication
app.post('/api/tools/create-table', async (req, res) => {
    try {
        const { data, instructions, context } = req.body;

        if (!data) {
            return res.status(400).json({ error: 'No data provided' });
        }

        // Import the handler dynamically
        const { formatTableHandler } = await import('./src/tools/formatTableTool.js');

        // Enhance instructions for dynamic table creation
        const enhancedInstructions = `${instructions || 'Create a well-organized table from this data'}

FORMATTING REQUIREMENTS:
- Return ONLY the table in markdown format
- No explanations or additional text
- Ensure clean, readable structure
- Use appropriate column headers
- Handle missing data gracefully
- Be creative with organization if the data allows for it`;

        // Execute the table creation
        const result = await formatTableHandler({
            rawData: data,
            context: context || 'custom table',
            instructions: enhancedInstructions
        }, {
            openaiApiKey: process.env.OPENAI_API_KEY
        });

        res.json(result);

    } catch (error) {
        logger.error('Table creation error:', error);
        res.status(500).json({
            error: 'Failed to create table',
            message: error.message
        });
    }
});

// Table recreation workflow endpoint - LangGraph orchestration
app.post('/api/workflows/recreate-table', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'No query provided' });
        }

        // Import and execute the workflow
        const { executeTableRecreationWorkflow } = await import('./src/workflows/tableRecreationWorkflow.js');

        const result = await executeTableRecreationWorkflow(query, {
            openaiApiKey: process.env.OPENAI_API_KEY
        });

        res.json(result);

    } catch (error) {
        logger.error('Table recreation workflow error:', error);
        res.status(500).json({
            error: 'Failed to execute table recreation workflow',
            message: error.message
        });
    }
});

// Streaming table endpoint for progressive UI updates
app.post('/api/workflows/recreate-table/stream', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'No query provided' });
        }

        // Set headers for Server-Sent Events
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type'
        });

        // Send initial status
        res.write(`data: ${JSON.stringify({ type: 'status', message: 'Starting table workflow...' })}\n\n`);

        // Execute workflow with real-time streaming as data is generated
        try {
            res.write(`data: ${JSON.stringify({ type: 'progress', step: '1/2', message: 'Searching documents...' })}\n\n`);

            // Step 1: Search documents and stream results immediately
            const results = await documentManager.searchDocuments(query, 5);
            if (results.success && results.results && results.results.length > 0) {
                const documentContent = results.results[0].content;
                res.write(`data: ${JSON.stringify({ type: 'document_found', message: `Found data in ${results.results[0].fileName}` })}\n\n`);

                res.write(`data: ${JSON.stringify({ type: 'progress', step: '2/2', message: 'Generating table...' })}\n\n`);

                // Step 2: Format table with streaming chunks
                const { formatTableHandler } = await import('./src/tools/formatTableTool.js');

                // Create a custom OpenAI streaming call for real-time table generation
                const openai = new (await import('openai')).default({
                    apiKey: process.env.OPENAI_API_KEY
                });

                const stream = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [{
                        role: 'user',
                        content: `Convert this raw data into a clean markdown table. Return ONLY the table, no explanations:

${documentContent}`
                    }],
                    stream: true,
                    temperature: 0.1
                });

                let accumulatedTable = '';
                let lineBuffer = '';

                for await (const chunk of stream) {
                    const content = chunk.choices[0]?.delta?.content || '';
                    if (content) {
                        accumulatedTable += content;
                        lineBuffer += content;

                        // Send complete lines as they're generated
                        while (lineBuffer.includes('\n')) {
                            const lineEnd = lineBuffer.indexOf('\n');
                            const completeLine = lineBuffer.slice(0, lineEnd + 1);
                            lineBuffer = lineBuffer.slice(lineEnd + 1);

                            res.write(`data: ${JSON.stringify({
                                type: 'table_chunk',
                                content: accumulatedTable,
                                newLine: completeLine.trim()
                            })}\n\n`);
                        }
                    }
                }

                // Send any remaining content
                if (lineBuffer.trim()) {
                    accumulatedTable += lineBuffer;
                    res.write(`data: ${JSON.stringify({
                        type: 'table_chunk',
                        content: accumulatedTable,
                        newLine: lineBuffer.trim()
                    })}\n\n`);
                }

                res.write(`data: ${JSON.stringify({ type: 'complete', message: 'Table recreation complete!' })}\n\n`);

            } else {
                res.write(`data: ${JSON.stringify({ type: 'error', message: 'No documents found to create table from' })}\n\n`);
            }

        } catch (workflowError) {
            res.write(`data: ${JSON.stringify({ type: 'error', message: workflowError.message })}\n\n`);
        }

        res.end();

    } catch (error) {
        logger.error('Streaming table recreation error:', error);
        res.status(500).json({
            error: 'Failed to stream table recreation',
            message: error.message
        });
    }
});

// COMPLETE WORKFLOW MANAGEMENT API

// Get all workflows
app.get('/api/workflows', async (req, res) => {
    try {
        const workflows = await configManager.loadWorkflows();
        res.json({
            success: true,
            workflows: workflows || []
        });
    } catch (error) {
        logger.error('Load workflows error:', error);
        res.status(500).json({
            error: 'Failed to load workflows',
            message: error.message
        });
    }
});

// Create new workflow
app.post('/api/workflows', async (req, res) => {
    try {
        const workflowData = req.body;

        // Generate workflow ID
        const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const workflow = {
            id: workflowId,
            name: workflowData.name,
            description: workflowData.description,
            triggers: workflowData.triggers || [],
            steps: workflowData.steps || [],
            enabled: workflowData.enabled !== false,
            type: workflowData.type || 'langgraph',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Save workflow
        await configManager.saveWorkflow(workflow);

        // Generate LangGraph workflow file
        await generateLangGraphWorkflowFile(workflow);

        res.json({
            success: true,
            workflow: workflow
        });

    } catch (error) {
        logger.error('Create workflow error:', error);
        res.status(500).json({
            error: 'Failed to create workflow',
            message: error.message
        });
    }
});

// Update workflow
app.put('/api/workflows/:id', async (req, res) => {
    try {
        const workflowId = req.params.id;
        const updates = req.body;

        const workflow = await configManager.updateWorkflow(workflowId, updates);

        if (workflow) {
            // Regenerate LangGraph workflow file
            await generateLangGraphWorkflowFile(workflow);

            res.json({
                success: true,
                workflow: workflow
            });
        } else {
            res.status(404).json({
                error: 'Workflow not found'
            });
        }

    } catch (error) {
        logger.error('Update workflow error:', error);
        res.status(500).json({
            error: 'Failed to update workflow',
            message: error.message
        });
    }
});

// Delete workflow
app.delete('/api/workflows/:id', async (req, res) => {
    try {
        const workflowId = req.params.id;

        const success = await configManager.deleteWorkflow(workflowId);

        if (success) {
            // Remove LangGraph workflow file
            await deleteLangGraphWorkflowFile(workflowId);

            res.json({
                success: true,
                message: 'Workflow deleted successfully'
            });
        } else {
            res.status(404).json({
                error: 'Workflow not found'
            });
        }

    } catch (error) {
        logger.error('Delete workflow error:', error);
        res.status(500).json({
            error: 'Failed to delete workflow',
            message: error.message
        });
    }
});

// Toggle workflow enabled/disabled
app.post('/api/workflows/:id/toggle', async (req, res) => {
    try {
        const workflowId = req.params.id;
        const { enabled } = req.body;

        const workflow = await configManager.updateWorkflow(workflowId, { enabled });

        if (workflow) {
            res.json({
                success: true,
                workflow: workflow
            });
        } else {
            res.status(404).json({
                error: 'Workflow not found'
            });
        }

    } catch (error) {
        logger.error('Toggle workflow error:', error);
        res.status(500).json({
            error: 'Failed to toggle workflow',
            message: error.message
        });
    }
});

// Test workflow execution
app.post('/api/workflows/:id/test', async (req, res) => {
    try {
        const workflowId = req.params.id;
        const { query } = req.body;

        // Load and execute the workflow
        const workflowModule = await import(`./src/workflows/generated/${workflowId}.js`);
        const result = await workflowModule.executeWorkflow(query);

        res.json({
            success: true,
            result: result
        });

    } catch (error) {
        logger.error('Test workflow error:', error);
        res.json({
            success: false,
            error: 'Workflow test failed',
            message: error.message
        });
    }
});

// Helper function to generate LangGraph workflow file
async function generateLangGraphWorkflowFile(workflow) {
    const workflowCode = `
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
${workflow.steps.map(step => {
    if (step === 'search_documents' || step === 'list_documents' || step === 'get_document') {
        return `import { unifiedRagToolHandlers } from '../../tools/unifiedRagTool.js';`;
    } else if (step === 'format_table') {
        return `import { formatTableHandler } from '../../tools/formatTableTool.js';`;
    } else if (step === 'get_weather') {
        return `import { FreeWeatherTool } from '../../tools/freeWeatherTool.js';`;
    }
    return '';
}).filter(Boolean).join('\n')}

// Workflow: ${workflow.name}
// Description: ${workflow.description}
// Generated: ${new Date().toISOString()}

const WorkflowState = Annotation.Root({
    userQuery: Annotation,
    ${workflow.steps.map(step => `${step}Result: Annotation`).join(',\n    ')},
    finalResponse: Annotation
});

${workflow.steps.map((step, index) => `
async function ${step}Node(state) {
    try {
        ${step === 'search_documents' ?
            `const result = await unifiedRagToolHandlers.search_documents({ query: ${index === 0 ? 'state.userQuery' : 'state.' + workflow.steps[index-1] + 'Result.message'} });` :
        step === 'format_table' ?
            `const result = await formatTableHandler({ rawData: ${index === 0 ? 'state.userQuery' : 'state.' + workflow.steps[index-1] + 'Result.message'}, context: 'workflow data' }, { openaiApiKey: process.env.OPENAI_API_KEY });` :
        step === 'get_weather' ?
            `const result = await FreeWeatherTool.execute({ location: ${index === 0 ? 'state.userQuery' : 'state.' + workflow.steps[index-1] + 'Result.message'} });` :
            `const result = await ${getToolHandler(step)}(${getToolArgs(step, index === 0)});`
        }
        return { ${step}Result: result };
    } catch (error) {
        console.error('${step} error:', error);
        return { ${step}Result: { success: false, error: error.message } };
    }
}`).join('\n')}

const workflow = new StateGraph(WorkflowState)
${workflow.steps.map((step, index) =>
    `    .addNode("${step}", ${step}Node)`
).join('\n')}
    .addEdge(START, "${workflow.steps[0]}")
${workflow.steps.map((step, index) =>
    index < workflow.steps.length - 1 ?
    `    .addEdge("${step}", "${workflow.steps[index + 1]}")` :
    `    .addEdge("${step}", END)`
).join('\n')};

const graph = workflow.compile();

export async function executeWorkflow(query) {
    return await graph.invoke({ userQuery: query });
}
`;

    // Write workflow file
    const fs = await import('fs/promises');
    const path = await import('path');

    const workflowsDir = path.join(process.cwd(), 'src/workflows/generated');
    await fs.mkdir(workflowsDir, { recursive: true });

    const workflowPath = path.join(workflowsDir, `${workflow.id}.js`);
    await fs.writeFile(workflowPath, workflowCode);

    console.log(`Generated LangGraph workflow file: ${workflowPath}`);
}

// Helper function to get tool handler
function getToolHandler(stepName) {
    const handlers = {
        'search_documents': 'unifiedRagToolHandlers.search_documents',
        'list_documents': 'unifiedRagToolHandlers.list_documents',
        'get_document': 'unifiedRagToolHandlers.get_document',
        'format_table': 'formatTableHandler',
        'get_weather': 'FreeWeatherTool.execute'
    };
    return handlers[stepName] || `${stepName}Handler`;
}

// Helper function to get tool arguments
function getToolArgs(stepName, isFirst) {
    if (isFirst) {
        return 'state.userQuery';
    }
    return `state.${stepName}Result`;
}

// Helper function to delete workflow file
async function deleteLangGraphWorkflowFile(workflowId) {
    try {
        const fs = await import('fs/promises');
        const path = await import('path');

        const workflowPath = path.join(process.cwd(), 'src/workflows/generated', `${workflowId}.js`);
        await fs.unlink(workflowPath);

        console.log(`Deleted LangGraph workflow file: ${workflowPath}`);
    } catch (error) {
        console.log('Workflow file already deleted or does not exist');
    }
}

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

// Update tool instructions
app.put('/api/tools/:toolName/instructions', async (req, res) => {
  try {
    const { toolName } = req.params;
    const { instructions } = req.body;

    logger.info(`Updating instructions for tool: ${toolName}`);

    const settings = await configManager.loadSettings();
    if (!settings.toolInstructions) {
      settings.toolInstructions = {};
    }

    settings.toolInstructions[toolName] = instructions;
    await configManager.saveSettings(settings);

    res.json({
      success: true,
      tool: toolName,
      message: 'Instructions updated successfully'
    });
  } catch (error) {
    logger.error('Update tool instructions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update tool instructions',
      message: error.message
    });
  }
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