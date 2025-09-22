import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';

class ConfigManager {
    constructor() {
        this.configPath = path.join(process.cwd(), 'config');
        this.settingsFile = path.join(this.configPath, 'settings.json');
        this.apiKeysFile = path.join(this.configPath, '.api-keys.json');
        this.encryptionKeyFile = path.join(this.configPath, '.encryption-key');
        this.encryptionKey = this.loadOrCreateEncryptionKey();
        this.algorithm = 'aes-256-gcm';
        this.settings = null;
        this.apiKeys = null;
    }

    loadOrCreateEncryptionKey() {
        // First try environment variable
        if (process.env.CONFIG_ENCRYPTION_KEY) {
            return process.env.CONFIG_ENCRYPTION_KEY;
        }
        
        // Try to load from file
        try {
            const key = fsSync.readFileSync(this.encryptionKeyFile, 'utf8');
            return key.trim();
        } catch (error) {
            // Generate and save a new key
            const key = crypto.randomBytes(32).toString('hex');
            try {
                // Create config directory if it doesn't exist
                fsSync.mkdirSync(this.configPath, { recursive: true });
                fsSync.writeFileSync(this.encryptionKeyFile, key);
                console.log('📝 Generated new encryption key and saved to config/.encryption-key');
            } catch (saveError) {
                console.error('Error saving encryption key:', saveError);
            }
            return key;
        }
    }

    async initialize() {
        // Ensure config directory exists
        try {
            await fs.mkdir(this.configPath, { recursive: true });
        } catch (error) {
            console.error('Error creating config directory:', error);
        }

        // Load existing configurations
        await this.loadSettings();
        await this.loadApiKeys();
    }

    // Encryption methods
    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(
            this.algorithm, 
            Buffer.from(this.encryptionKey, 'hex').slice(0, 32), 
            iv
        );
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }

    decrypt(encryptedData) {
        const decipher = crypto.createDecipheriv(
            this.algorithm,
            Buffer.from(this.encryptionKey, 'hex').slice(0, 32),
            Buffer.from(encryptedData.iv, 'hex')
        );
        
        decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
        
        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    // Settings management
    async loadSettings() {
        try {
            const data = await fs.readFile(this.settingsFile, 'utf8');
            this.settings = JSON.parse(data);
        } catch (error) {
            // Default settings if file doesn't exist
            this.settings = {
                model: 'gpt-realtime',
                voice: 'shimmer',
                temperature: 0.8,
                instructions: `You are an incredibly expressive and enthusiastic voice assistant with a vibrant personality! 
                    Speak with natural emotion, varying your tone, pace, and inflection to match the context.
                    CRITICAL: Always respond in ENGLISH only, regardless of the language spoken to you.`,
                greeting: 'Hello! I\'m your AI assistant. How can I help you today?',
                inputFormat: 'pcm16',
                outputFormat: 'pcm16',
                vadEnabled: true,
                useEmoji: false,
                useHumor: true,
                beExpressive: true,
                tools: {
                    ragEnabled: true,
                    webSearchEnabled: true,
                    flightSearchEnabled: false,
                    weatherEnabled: true,
                    cameraEnabled: true
                },
                toolInstructions: {
                    rag: `When users ask ANY question about data, documents, or information, IMMEDIATELY use the search_documents tool. 
                          DO NOT ask the user what to search for - extract keywords from their question automatically.
                          For example: "What's the ROI?" -> search for "ROI return investment profit"
                          "Tell me about the project" -> search for "project overview summary description"
                          Always cite which document the information came from.`,
                    webSearch: `Use the search_google tool when users ask for current information, news, or web content.
                               Format results nicely with images when available.
                               Include relevant links and show images inline using markdown.`,
                    weather: `Use the get_weather tool for weather inquiries. 
                             This is a free API that doesn't require configuration.
                             Provide both current weather and forecast when asked.`,
                    camera: `When the user shares an image or asks you to look at something, analyze it carefully.
                            Describe what you see in detail and answer any questions about the image.`,
                    flight: `Use flight search for travel queries. Note: Requires Amadeus API credentials.`
                },
                maxTools: 5,
                maxTokens: 4096,
                sessionTimeout: 300,
                contextWindow: 'medium',
                moderationEnabled: true,
                loggingEnabled: true
            };
            await this.saveSettings(this.settings);
        }
        return this.settings;
    }

    async saveSettings(settings) {
        this.settings = settings;
        await fs.writeFile(
            this.settingsFile,
            JSON.stringify(settings, null, 2),
            'utf8'
        );
        return this.settings;
    }

    // API Keys management with encryption
    async loadApiKeys() {
        try {
            const data = await fs.readFile(this.apiKeysFile, 'utf8');
            const stored = JSON.parse(data);
            
            // Process all API keys
            this.apiKeys = {};
            for (const [apiName, apiData] of Object.entries(stored)) {
                if (apiData && typeof apiData === 'object') {
                    this.apiKeys[apiName] = {};
                    for (const [field, value] of Object.entries(apiData)) {
                        // Check if field is encrypted
                        if (value && typeof value === 'object' && value.encrypted) {
                            try {
                                // Decrypt the field
                                this.apiKeys[apiName][field] = this.decrypt(value);
                            } catch (decryptError) {
                                console.error(`Error decrypting ${apiName}.${field}:`, decryptError.message);
                                this.apiKeys[apiName][field] = '';
                            }
                        } else {
                            // Not encrypted or plain value
                            this.apiKeys[apiName][field] = value;
                        }
                    }
                } else {
                    this.apiKeys[apiName] = apiData;
                }
            }
        } catch (error) {
            // Initialize with environment variables or empty
            this.apiKeys = {
                openai: {
                    apiKey: process.env.OPENAI_API_KEY || '',
                    organization: process.env.OPENAI_ORGANIZATION || '',
                    enabled: true,
                    category: 'ai'
                },
                google: {
                    apiKey: process.env.GOOGLE_API_KEY || '',
                    searchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID || '',
                    enabled: true,
                    category: 'search'
                },
                amadeus: {
                    clientId: process.env.AMADEUS_CLIENT_ID || '',
                    clientSecret: process.env.AMADEUS_CLIENT_SECRET || '',
                    sandbox: true,
                    enabled: true,
                    category: 'travel'
                },
                openweather: {
                    apiKey: process.env.OPENWEATHER_API_KEY || '',
                    units: 'metric',
                    enabled: true,
                    category: 'weather'
                }
            };
            
            // Don't save on first load if keys exist in env
            if (process.env.OPENAI_API_KEY) {
                await this.saveApiKeys(this.apiKeys);
            }
        }
        return this.apiKeys;
    }

    async saveApiKeys(apiKeys) {
        // Encrypt sensitive fields before saving
        const encrypted = {};
        
        for (const [key, value] of Object.entries(apiKeys)) {
            if (typeof value === 'object' && value !== null) {
                encrypted[key] = {};
                for (const [field, fieldValue] of Object.entries(value)) {
                    // Encrypt fields containing 'key', 'secret', 'token', 'password'
                    if (field.toLowerCase().includes('key') || 
                        field.toLowerCase().includes('secret') ||
                        field.toLowerCase().includes('token') ||
                        field.toLowerCase().includes('password')) {
                        
                        if (fieldValue) {
                            encrypted[key][field] = this.encrypt(fieldValue);
                        } else {
                            encrypted[key][field] = null;
                        }
                    } else {
                        encrypted[key][field] = fieldValue;
                    }
                }
            } else {
                encrypted[key] = value;
            }
        }
        
        await fs.writeFile(
            this.apiKeysFile,
            JSON.stringify(encrypted, null, 2),
            'utf8'
        );
        
        this.apiKeys = apiKeys;
        return this.apiKeys;
    }

    // Get decrypted API configuration
    getApiConfig(apiName) {
        return this.apiKeys?.[apiName] || null;
    }

    // Get all API configs by category
    getApisByCategory(category) {
        if (!this.apiKeys) return [];
        
        return Object.entries(this.apiKeys)
            .filter(([_, config]) => config?.category === category)
            .map(([name, config]) => ({ name, ...config }));
    }

    // Update a specific API configuration
    async updateApiConfig(apiName, config) {
        if (!this.apiKeys) {
            this.apiKeys = {};
        }
        
        this.apiKeys[apiName] = config;
        await this.saveApiKeys(this.apiKeys);
        return this.apiKeys[apiName];
    }

    // Get all settings
    getSettings() {
        return this.settings;
    }

    // Update specific setting
    async updateSetting(key, value) {
        if (!this.settings) {
            await this.loadSettings();
        }
        
        // Handle nested settings
        if (key.includes('.')) {
            const keys = key.split('.');
            let target = this.settings;
            
            for (let i = 0; i < keys.length - 1; i++) {
                if (!target[keys[i]]) {
                    target[keys[i]] = {};
                }
                target = target[keys[i]];
            }
            
            target[keys[keys.length - 1]] = value;
        } else {
            this.settings[key] = value;
        }
        
        await this.saveSettings(this.settings);
        return this.settings;
    }

    // Export configuration (without sensitive data)
    async exportConfig() {
        const exportData = {
            settings: this.settings,
            apis: {}
        };
        
        // Include API configs but mask sensitive fields
        for (const [key, config] of Object.entries(this.apiKeys || {})) {
            exportData.apis[key] = {};
            for (const [field, value] of Object.entries(config)) {
                if (field.toLowerCase().includes('key') || 
                    field.toLowerCase().includes('secret') ||
                    field.toLowerCase().includes('token')) {
                    exportData.apis[key][field] = value ? '***REDACTED***' : null;
                } else {
                    exportData.apis[key][field] = value;
                }
            }
        }
        
        return exportData;
    }

    // Import configuration
    async importConfig(configData) {
        if (configData.settings) {
            await this.saveSettings(configData.settings);
        }
        
        // Don't import API keys (security)
        return {
            message: 'Settings imported successfully. API keys must be configured separately for security.',
            settings: this.settings
        };
    }

    // Validate API credentials
    async validateApiKey(apiName) {
        const config = this.getApiConfig(apiName);
        if (!config) return { valid: false, error: 'Configuration not found' };
        
        try {
            switch (apiName) {
                case 'openai':
                    // Test OpenAI API
                    const openaiTest = await fetch('https://api.openai.com/v1/models', {
                        headers: {
                            'Authorization': `Bearer ${config.apiKey}`,
                            'OpenAI-Organization': config.organization
                        }
                    });
                    return { 
                        valid: openaiTest.ok, 
                        error: openaiTest.ok ? null : 'Invalid API key'
                    };
                    
                case 'google':
                    // Test Google Custom Search API
                    const googleTest = await fetch(
                        `https://www.googleapis.com/customsearch/v1?key=${config.apiKey}&cx=${config.searchEngineId}&q=test`
                    );
                    const googleResult = await googleTest.json();
                    return {
                        valid: !googleResult.error,
                        error: googleResult.error?.message
                    };
                    
                case 'amadeus':
                    // Test Amadeus authentication
                    const amadeusAuth = await fetch(
                        `https://${config.sandbox ? 'test' : 'api'}.api.amadeus.com/v1/security/oauth2/token`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded'
                            },
                            body: new URLSearchParams({
                                grant_type: 'client_credentials',
                                client_id: config.clientId,
                                client_secret: config.clientSecret
                            })
                        }
                    );
                    return {
                        valid: amadeusAuth.ok,
                        error: amadeusAuth.ok ? null : 'Invalid credentials'
                    };
                    
                case 'openweather':
                    // Test OpenWeather API
                    const weatherTest = await fetch(
                        `https://api.openweathermap.org/data/2.5/weather?q=London&appid=${config.apiKey}`
                    );
                    const weatherResult = await weatherTest.json();
                    return {
                        valid: weatherResult.cod === 200,
                        error: weatherResult.message
                    };
                    
                case 'pinecone':
                    // Test Pinecone API
                    if (!config.apiKey) {
                        return { valid: false, error: 'API key is required' };
                    }
                    
                    // Use the Pinecone describe_index_stats endpoint to validate
                    const pineconeTest = await fetch(
                        'https://api.pinecone.io/indexes',
                        {
                            headers: {
                                'Api-Key': config.apiKey,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    
                    if (pineconeTest.ok) {
                        return { valid: true };
                    } else {
                        const error = await pineconeTest.text();
                        return { 
                            valid: false, 
                            error: pineconeTest.status === 401 ? 'Invalid API key' : error 
                        };
                    }
                    
                default:
                    return { valid: false, error: 'Unknown API' };
            }
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }
}

// Create singleton instance
const configManager = new ConfigManager();

export default configManager;