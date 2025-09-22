import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import multer from 'multer';
import winston from 'winston';
import configManager from './src/services/configManager.js';
import documentManager from './src/services/documentManager.js';
import { GoogleSearchTool } from './src/tools/googleSearchTool.js';
import { WeatherTool } from './src/tools/weatherTool.js';
import { FlightSearchTool } from './src/tools/flightSearchTool.js';

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
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Serve OpenAI SDK bundles
app.use('/sdk', express.static(join(__dirname, 'node_modules/@openai/agents-realtime/dist/bundle')));
app.use('/sdk/agents', express.static(join(__dirname, 'node_modules/@openai/agents/dist/bundle')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
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
          model: configManager.getSettings()?.model || 'gpt-4o-realtime-preview',
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

// Tool configuration endpoint
app.get('/api/tools', (req, res) => {
  // Return available tools configuration
  res.json({
    tools: [
      {
        name: 'search_documents',
        description: 'Search uploaded documents using RAG',
        enabled: true
      },
      {
        name: 'process_document',
        description: 'Process and index uploaded documents',
        enabled: true
      }
    ]
  });
});

// Tool management endpoint
app.post('/api/tools/:toolName/toggle', (req, res) => {
  const { toolName } = req.params;
  const { enabled } = req.body;
  
  logger.info(`Tool ${toolName} ${enabled ? 'enabled' : 'disabled'}`);
  
  // TODO: Implement tool state management
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