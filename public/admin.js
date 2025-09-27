// VoiceBot Admin Dashboard JavaScript
class AdminDashboard {
    constructor() {
        this.workflows = new Map();
        this.functions = new Map();
        this.endpoints = new Map();
        this.currentWorkflow = null;
        this.ws = null;
        
        this.initializeApp();
    }
    
    initializeApp() {
        this.initializeTabs();
        this.initializeDragAndDrop();
        // Single source of truth - load from server first
        this.loadConfigurations();
        this.startAnalyticsPolling();
    }
    
    connectToServer() {
        // Skip WebSocket - use HTTP API directly
        // WebSocket would be used for real-time updates if server supported it
        console.log('Using HTTP API for admin panel');
        // Removed duplicate loadConfigurations() call
        return;
        
        // WebSocket code preserved but disabled:
        /* 
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.hostname}:${window.location.port || '3000'}/ws`;
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('Connected to admin server via WebSocket');
                this.loadConfigurations();
            };
            
            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleServerMessage(message);
            };
            
            this.ws.onerror = (error) => {
                // WebSocket is optional - fallback to HTTP
                console.log('WebSocket not available - using HTTP API instead');
                this.loadConfigurations();
            };
            
            this.ws.onclose = () => {
                console.log('WebSocket connection closed');
                // Don't attempt reconnect - use HTTP instead
            };
        } catch (error) {
            // WebSocket not available - use HTTP API
            console.log('WebSocket not supported - using HTTP API');
            this.loadConfigurations();
        }
        */
    }
    
    handleServerMessage(message) {
        switch (message.type) {
            case 'configurations':
                this.loadConfigurationsData(message.data);
                break;
            case 'test_result':
                this.displayTestResult(message.result);
                break;
            case 'analytics':
                this.updateAnalytics(message.data);
                break;
            case 'workflow_saved':
                this.showNotification('Workflow saved successfully', 'success');
                break;
        }
    }
    
    initializeTabs() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                tab.classList.add('active');
                const tabId = tab.dataset.tab;
                document.getElementById(tabId).classList.add('active');
            });
        });
    }
    
    initializeDragAndDrop() {
        // Initialize draggable functions
        document.querySelectorAll('.function-item').forEach(item => {
            item.addEventListener('dragstart', this.handleDragStart.bind(this));
            item.addEventListener('dragend', this.handleDragEnd.bind(this));
        });
        
        // Initialize workflow canvas drop zone
        const canvas = document.getElementById('workflowCanvas');
        if (canvas) {
            canvas.addEventListener('dragover', this.handleDragOver.bind(this));
            canvas.addEventListener('drop', this.handleDrop.bind(this));
        }
    }
    
    handleDragStart(e) {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('function', e.target.dataset.function);
        e.target.classList.add('dragging');
    }
    
    handleDragEnd(e) {
        e.target.classList.remove('dragging');
    }
    
    handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'copy';
        return false;
    }
    
    handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }
        
        const functionType = e.dataTransfer.getData('function');
        this.addStepToWorkflow(functionType);
        
        return false;
    }
    
    addStepToWorkflow(functionType) {
        const canvas = document.getElementById('workflowCanvas');
        
        // Clear placeholder if first step
        if (!this.currentWorkflow) {
            canvas.innerHTML = '';
            this.currentWorkflow = {
                steps: [],
                connections: []
            };
        }
        
        const stepIndex = this.currentWorkflow.steps.length + 1;
        const stepId = `step-${stepIndex}`;
        
        // Create step element
        const stepDiv = document.createElement('div');
        stepDiv.className = 'workflow-step';
        stepDiv.id = stepId;
        stepDiv.innerHTML = `
            <div class="step-header">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="step-number">${stepIndex}</span>
                    <span class="step-type">${this.getFunctionLabel(functionType)}</span>
                </div>
                <div class="step-actions">
                    <button class="btn btn-small" onclick="admin.configureStep('${stepId}')">⚙️</button>
                    <button class="btn btn-danger btn-small" onclick="admin.removeStep('${stepId}')">×</button>
                </div>
            </div>
            <div class="step-config" id="${stepId}-config">
                ${this.getStepConfigForm(functionType)}
            </div>
        `;
        
        // Add connector if not first step
        if (stepIndex > 1) {
            const connector = document.createElement('div');
            connector.className = 'connector';
            connector.innerHTML = '↓';
            canvas.appendChild(connector);
        }
        
        canvas.appendChild(stepDiv);
        
        // Add to workflow
        this.currentWorkflow.steps.push({
            id: stepId,
            type: functionType,
            config: {},
            position: stepIndex
        });
    }
    
    getFunctionLabel(functionType) {
        const labels = {
            'api_call': '🔌 API Call',
            'database_query': '🗄️ Database Query',
            'send_notification': '📧 Send Notification',
            'condition_check': '🔀 Condition Check',
            'data_transform': '🔄 Transform Data',
            'llm_process': '🤖 LLM Process',
            'wait_timer': '⏱️ Wait/Timer',
            'log_activity': '📝 Log Activity'
        };
        return labels[functionType] || functionType;
    }
    
    getStepConfigForm(functionType) {
        const forms = {
            'api_call': `
                <div class="form-group">
                    <input type="text" class="form-control" placeholder="API Endpoint URL">
                </div>
                <div class="form-group">
                    <select class="form-control">
                        <option>GET</option>
                        <option>POST</option>
                        <option>PUT</option>
                        <option>DELETE</option>
                    </select>
                </div>
            `,
            'database_query': `
                <div class="form-group">
                    <input type="text" class="form-control" placeholder="Query or Collection">
                </div>
                <div class="form-group">
                    <textarea class="form-control" rows="2" placeholder="Filters (JSON)"></textarea>
                </div>
            `,
            'send_notification': `
                <div class="form-group">
                    <select class="form-control">
                        <option>Email</option>
                        <option>SMS</option>
                        <option>Push Notification</option>
                        <option>Webhook</option>
                    </select>
                </div>
                <div class="form-group">
                    <input type="text" class="form-control" placeholder="Recipient">
                </div>
            `,
            'condition_check': `
                <div class="form-group">
                    <input type="text" class="form-control" placeholder="Condition Expression">
                </div>
                <div class="form-group">
                    <input type="text" class="form-control" placeholder="True Branch → Step ID">
                </div>
                <div class="form-group">
                    <input type="text" class="form-control" placeholder="False Branch → Step ID">
                </div>
            `,
            'data_transform': `
                <div class="form-group">
                    <select class="form-control">
                        <option>JSON Transform</option>
                        <option>Text Format</option>
                        <option>Data Mapping</option>
                        <option>Custom Script</option>
                    </select>
                </div>
                <div class="form-group">
                    <textarea class="form-control" rows="3" placeholder="Transform Template"></textarea>
                </div>
            `,
            'llm_process': `
                <div class="form-group">
                    <textarea class="form-control" rows="3" placeholder="Prompt Template"></textarea>
                </div>
                <div class="form-group">
                    <select class="form-control">
                        <option>gpt-4-turbo</option>
                        <option>gpt-3.5-turbo</option>
                        <option>claude-3</option>
                    </select>
                </div>
            `,
            'wait_timer': `
                <div class="form-group">
                    <input type="number" class="form-control" placeholder="Duration (seconds)">
                </div>
                <div class="form-group">
                    <select class="form-control">
                        <option>Fixed Delay</option>
                        <option>Until Condition</option>
                        <option>Schedule</option>
                    </select>
                </div>
            `,
            'log_activity': `
                <div class="form-group">
                    <select class="form-control">
                        <option>Info</option>
                        <option>Warning</option>
                        <option>Error</option>
                        <option>Debug</option>
                    </select>
                </div>
                <div class="form-group">
                    <input type="text" class="form-control" placeholder="Log Message Template">
                </div>
            `
        };
        
        return forms[functionType] || '<p>No configuration needed</p>';
    }
    
    configureStep(stepId) {
        // Open configuration modal for step
        console.log('Configure step:', stepId);
    }
    
    removeStep(stepId) {
        const step = document.getElementById(stepId);
        if (step) {
            // Remove from DOM
            step.remove();
            
            // Remove from workflow
            if (this.currentWorkflow) {
                this.currentWorkflow.steps = this.currentWorkflow.steps.filter(s => s.id !== stepId);
                
                // Renumber remaining steps
                this.renumberSteps();
            }
        }
    }
    
    renumberSteps() {
        const steps = document.querySelectorAll('.workflow-step');
        steps.forEach((step, index) => {
            const numberEl = step.querySelector('.step-number');
            if (numberEl) {
                numberEl.textContent = index + 1;
            }
        });
    }
    
    saveWorkflow() {
        const name = document.getElementById('workflowName').value;
        const triggerType = document.getElementById('triggerType').value;
        const triggerPattern = document.getElementById('triggerPattern').value;
        
        if (!name || !this.currentWorkflow || this.currentWorkflow.steps.length === 0) {
            this.showNotification('Please complete the workflow configuration', 'error');
            return;
        }
        
        const workflow = {
            id: `wf-${Date.now()}`,
            name: name,
            trigger: {
                type: triggerType,
                pattern: triggerPattern
            },
            steps: this.currentWorkflow.steps,
            created_at: new Date().toISOString(),
            status: 'active'
        };
        
        // Save to server
        this.sendToServer({
            type: 'save_workflow',
            workflow: workflow
        });
        
        // Store locally
        this.workflows.set(workflow.id, workflow);
        
        this.showNotification('Workflow saved successfully', 'success');
    }
    
    loadWorkflow() {
        // Show workflow selection modal
        const workflowList = Array.from(this.workflows.values());
        console.log('Available workflows:', workflowList);
        // TODO: Implement workflow selection UI
    }
    
    testWorkflow() {
        if (!this.currentWorkflow || this.currentWorkflow.steps.length === 0) {
            this.showNotification('Please create a workflow first', 'error');
            return;
        }
        
        this.sendToServer({
            type: 'test_workflow',
            workflow: this.currentWorkflow,
            test_input: 'Test voice command'
        });
        
        this.showNotification('Testing workflow...', 'info');
    }
    
    // Functions Management
    
    createFunction() {
        document.getElementById('functionModal').classList.add('active');
    }
    
    deployFunction() {
        const name = document.getElementById('functionName').value;
        const description = document.getElementById('functionDescription').value;
        const implementation = document.getElementById('functionImplementation').value;
        
        if (!name || !implementation) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        const func = {
            id: `fn-${Date.now()}`,
            name: name,
            description: description,
            implementation: implementation,
            parameters: this.collectParameters(),
            created_at: new Date().toISOString(),
            status: 'deployed'
        };
        
        this.sendToServer({
            type: 'deploy_function',
            function: func
        });
        
        this.functions.set(func.id, func);
        this.updateFunctionsList();
        
        this.showNotification('Function deployed successfully', 'success');
    }
    
    testFunction() {
        const implementation = document.getElementById('functionImplementation').value;
        
        this.sendToServer({
            type: 'test_function',
            code: implementation,
            test_params: {}
        });
        
        this.showNotification('Testing function...', 'info');
    }
    
    collectParameters() {
        const params = [];
        document.querySelectorAll('.param-item').forEach(item => {
            const name = item.querySelector('input[type="text"]').value;
            const type = item.querySelector('.param-type').value;
            const required = item.querySelector('input[type="checkbox"]').checked;
            
            if (name) {
                params.push({ name, type, required });
            }
        });
        return params;
    }
    
    addParameter() {
        const paramBuilder = document.getElementById('paramBuilder');
        const newParam = document.createElement('div');
        newParam.className = 'param-item';
        newParam.innerHTML = `
            <input type="text" class="form-control" placeholder="Parameter name">
            <select class="form-control param-type">
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="object">Object</option>
                <option value="array">Array</option>
            </select>
            <input type="checkbox"> <label>Required</label>
            <button class="btn btn-danger btn-small" onclick="this.parentElement.remove()">×</button>
        `;
        paramBuilder.appendChild(newParam);
    }
    
    updateFunctionsList() {
        const list = document.getElementById('functionsList');
        list.innerHTML = '';
        
        this.functions.forEach(func => {
            const item = document.createElement('div');
            item.className = 'endpoint-item';
            item.innerHTML = `
                <h4>${func.name}</h4>
                <p>${func.description}</p>
                <span class="status-badge status-active">Deployed</span>
            `;
            list.appendChild(item);
        });
    }
    
    // Testing
    
    runTest() {
        const workflow = document.getElementById('testWorkflowSelect').value;
        const input = document.getElementById('testInput').value;
        const params = document.getElementById('testParams').value;
        
        try {
            const parsedParams = JSON.parse(params);
            
            this.sendToServer({
                type: 'run_test',
                workflow: workflow,
                input: input,
                params: parsedParams
            });
            
            this.logToConsole('info', `Starting test for workflow: ${workflow}`);
            this.logToConsole('info', `Input: ${input}`);
            
        } catch (e) {
            this.showNotification('Invalid JSON in test parameters', 'error');
        }
    }
    
    logToConsole(level, message) {
        const console = document.getElementById('testConsole');
        const line = document.createElement('div');
        line.className = 'console-line';
        
        const timestamp = new Date().toLocaleTimeString();
        line.innerHTML = `
            <span class="console-timestamp">${timestamp}</span>
            <span class="console-${level}">${message}</span>
        `;
        
        console.appendChild(line);
        console.scrollTop = console.scrollHeight;
    }
    
    displayTestResult(result) {
        if (result.success) {
            this.logToConsole('success', `Test completed successfully`);
            this.logToConsole('info', `Duration: ${result.duration}ms`);
            
            if (result.steps) {
                result.steps.forEach(step => {
                    this.logToConsole('info', `  ✓ ${step.name}: ${step.result}`);
                });
            }
        } else {
            this.logToConsole('error', `Test failed: ${result.error}`);
        }
    }
    
    // Analytics
    
    startAnalyticsPolling() {
        // Poll for analytics every 30 seconds
        setInterval(() => {
            this.sendToServer({ type: 'get_analytics' });
        }, 30000);
        
        // Initial load
        this.sendToServer({ type: 'get_analytics' });
    }
    
    updateAnalytics(data) {
        // Update stat cards
        if (data.total_executions !== undefined) {
            document.querySelector('.stat-value').textContent = data.total_executions;
        }
        
        // Update charts if implemented
        // this.updateCharts(data);
    }
    
    // Utilities
    
    sendToServer(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
    
    showNotification(message, type) {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 2000;
            animation: slideIn 0.3s;
        `;
        
        const colors = {
            success: 'linear-gradient(135deg, #28a745, #20c997)',
            error: 'linear-gradient(135deg, #dc3545, #c82333)',
            info: 'linear-gradient(135deg, #007bff, #0056b3)',
            warning: 'linear-gradient(135deg, #ffc107, #e0a800)'
        };
        
        notification.style.background = colors[type] || colors.info;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    showLoadingStates() {
        // Show loading indicators instead of hardcoded values
        const loadingElements = [
            'instructions', 'greeting', 'voice', 'model', 'temperature',
            'maxTokens', 'sessionTimeout', 'contextWindow',
            'openaiKey', 'openaiOrg', 'googleKey', 'googleSearchEngineId',
            'amadeusClientId', 'amadeusClientSecret', 'weatherKey', 'weatherUnits',
            'pineconeApiKey', 'pineconeEnvironment', 'pineconeIndexName'
        ];

        loadingElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                if (element.tagName === 'SELECT') {
                    element.innerHTML = '<option value="">Loading...</option>';
                } else if (element.type === 'password') {
                    element.placeholder = 'Loading...';
                    element.value = '';
                } else if (element.type === 'checkbox') {
                    // Don't change checkbox state during loading
                    element.disabled = true;
                } else {
                    element.placeholder = 'Loading...';
                    element.value = '';
                }
                element.disabled = true;
            }
        });
    }

    showLoadingError() {
        const errorElements = [
            'instructions', 'greeting', 'voice', 'model', 'temperature',
            'maxTokens', 'sessionTimeout', 'contextWindow'
        ];

        errorElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                if (element.tagName === 'SELECT') {
                    element.innerHTML = '<option value="">Error loading</option>';
                } else {
                    element.placeholder = 'Error loading settings';
                }
                element.disabled = false;
            }
        });
    }
    
    async loadConfigurations() {
        // Single source of truth: Load settings from server
        try {
            // Show loading indicators
            this.showLoadingStates();

            const response = await fetch('/api/settings');
            if (response.ok) {
                const settings = await response.json();

                // If no settings exist, load defaults from mainAgent.js and save them
                if (!settings || Object.keys(settings).length === 0) {
                    console.log('No saved settings found, loading defaults from mainAgent.js');
                    const defaultsResponse = await fetch('/api/settings/defaults');
                    if (defaultsResponse.ok) {
                        const defaults = await defaultsResponse.json();
                        // Apply defaults to UI
                        await this.applySettings(defaults);
                        // Save defaults to server so they persist
                        await this.saveSettingsToServer(defaults);
                        console.log('Defaults loaded and saved to server');
                    }
                } else {
                    console.log('Loading saved settings from server');
                    await this.applySettings(settings);
                }
            }
        } catch (error) {
            console.error('Error loading configurations:', error);
            this.showLoadingError();
        }

                // Load API & Tools data for the new unified section
        if (typeof loadApiAndTools === 'function') {
            await loadApiAndTools();
        }

        // Load workflows for the workflows section
        await this.loadWorkflows();

        // Load documents for the documents section
        await loadDocumentList();

        // Initialize upload functionality
        initializeUpload();
    }
    
    async applySettings(settings) {
        // Re-enable all form elements and populate with actual values
        const elements = [
            'instructions', 'greeting', 'voice', 'model', 'temperature',
            'maxTokens', 'sessionTimeout', 'contextWindow'
        ];

        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.disabled = false;

                // Restore select options if needed
                if (id === 'voice') {
                    element.innerHTML = `
                        <option value="alloy">Alloy (Neutral)</option>
                        <option value="shimmer">Shimmer (Expressive)</option>
                        <option value="echo">Echo (Smooth)</option>
                        <option value="ash">Ash</option>
                        <option value="ballad">Ballad</option>
                        <option value="coral">Coral</option>
                        <option value="sage">Sage</option>
                        <option value="verse">Verse</option>
                        <option value="marin">Marin</option>
                        <option value="cedar">Cedar</option>
                    `;
                } else if (id === 'model') {
                    element.innerHTML = `<option value="gpt-realtime">GPT Realtime</option>`;
                } else if (id === 'contextWindow') {
                    element.innerHTML = `
                        <option value="short">Short (2k tokens)</option>
                        <option value="medium">Medium (4k tokens)</option>
                        <option value="long">Long (8k tokens)</option>
                    `;
                }
            }
        });

        // Apply settings to UI with fallback defaults
        const settingsMap = {
            instructions: settings.instructions || '',
            greeting: settings.greeting || '',
            voice: settings.voice || 'shimmer',
            model: settings.model || 'gpt-realtime',
            temperature: settings.temperature || 0.8,
            maxTokens: settings.maxTokens || 4096,
            sessionTimeout: settings.sessionTimeout || 300,
            contextWindow: settings.contextWindow || 'medium'
        };

        Object.entries(settingsMap).forEach(([key, value]) => {
            const element = document.getElementById(key);
            if (element) {
                element.value = value;
            }
        });

        // Store for later use
        window.currentSettings = settings;

        // Also load API keys
        await this.loadApiKeys();
    }

    async loadApiKeys() {
        try {
            // FIXED: Use correct endpoint /api/apikeys/status
            const response = await fetch('/api/apikeys/status');
            if (response.ok) {
                const apis = await response.json();
                console.log('AdminDashboard: Loaded API keys status:', apis);

                // Restore API key fields and options
                const weatherUnits = document.getElementById('weatherUnits');
                if (weatherUnits) {
                    weatherUnits.innerHTML = `
                        <option value="metric">Metric (°C)</option>
                        <option value="imperial">Imperial (°F)</option>
                        <option value="kelvin">Kelvin</option>
                    `;
                }

                // Enable and populate API key fields
                const apiElements = [
                    'openaiKey', 'openaiOrg', 'googleKey', 'googleSearchEngineId',
                    'amadeusClientId', 'amadeusClientSecret', 'weatherKey', 'weatherUnits',
                    'pineconeApiKey', 'pineconeEnvironment', 'pineconeIndexName'
                ];

                apiElements.forEach(id => {
                    const element = document.getElementById(id);
                    if (element) {
                        element.disabled = false;
                        element.placeholder = '';
                    }
                });

                // FIXED: Show status indicators instead of actual API keys for security
                if (apis.openai) {
                    if (document.getElementById('openaiKey')) {
                        document.getElementById('openaiKey').value = apis.openai.apiKey ? '••••••••••••••••' : '';
                        document.getElementById('openaiKey').placeholder = apis.openai.apiKey ? 'API Key Configured' : 'Enter OpenAI API Key';
                    }
                    if (document.getElementById('openaiOrg')) document.getElementById('openaiOrg').value = apis.openai.organization || '';
                }

                if (apis.google) {
                    if (document.getElementById('googleKey')) {
                        document.getElementById('googleKey').value = apis.google.apiKey ? '••••••••••••••••' : '';
                        document.getElementById('googleKey').placeholder = apis.google.apiKey ? 'API Key Configured' : 'Enter Google API Key';
                    }
                    if (document.getElementById('googleSearchEngineId')) document.getElementById('googleSearchEngineId').value = apis.google.searchEngineId || '';
                }

                if (apis.amadeus) {
                    if (document.getElementById('amadeusClientId')) {
                        document.getElementById('amadeusClientId').value = apis.amadeus.clientId ? '••••••••••••••••' : '';
                        document.getElementById('amadeusClientId').placeholder = apis.amadeus.clientId ? 'Client ID Configured' : 'Enter Amadeus Client ID';
                    }
                    if (document.getElementById('amadeusClientSecret')) {
                        document.getElementById('amadeusClientSecret').value = apis.amadeus.clientSecret ? '••••••••••••••••' : '';
                        document.getElementById('amadeusClientSecret').placeholder = apis.amadeus.clientSecret ? 'Client Secret Configured' : 'Enter Amadeus Client Secret';
                    }
                    if (document.getElementById('amadeusSandbox')) document.getElementById('amadeusSandbox').checked = apis.amadeus.sandbox !== false;
                }

                if (apis.weather) {
                    if (document.getElementById('weatherKey')) {
                        document.getElementById('weatherKey').value = apis.weather.apiKey ? '••••••••••••••••' : '';
                        document.getElementById('weatherKey').placeholder = apis.weather.apiKey ? 'API Key Configured' : 'Enter Weather API Key';
                    }
                    if (document.getElementById('weatherUnits')) document.getElementById('weatherUnits').value = apis.weather.units || 'imperial';
                }

                if (apis.pinecone) {
                    if (document.getElementById('pineconeApiKey')) {
                        document.getElementById('pineconeApiKey').value = apis.pinecone.apiKey ? '••••••••••••••••' : '';
                        document.getElementById('pineconeApiKey').placeholder = apis.pinecone.apiKey ? 'API Key Configured' : 'Enter Pinecone API Key';
                    }
                    if (document.getElementById('pineconeEnvironment')) document.getElementById('pineconeEnvironment').value = apis.pinecone.environment || '';
                    if (document.getElementById('pineconeIndexName')) document.getElementById('pineconeIndexName').value = apis.pinecone.indexName || '';
                }

                // Update status indicators for each API
                this.updateApiStatusIndicators(apis);
            }
        } catch (error) {
            console.error('Error loading API keys:', error);
        }
    }

    // ADDED: Method to update API status indicators
    updateApiStatusIndicators(apis) {
        const statusMappings = {
            'openai': 'openaiStatus',
            'google': 'googleStatus',
            'amadeus': 'amadeusStatus',
            'openweather': 'weatherStatus',
            'pinecone': 'pineconeStatus'
        };

        Object.entries(statusMappings).forEach(([apiName, statusElementId]) => {
            const statusElement = document.getElementById(statusElementId);
            if (statusElement) {
                if (apis[apiName] && apis[apiName].enabled) {
                    statusElement.className = 'status valid';
                    statusElement.textContent = 'Configured';
                } else {
                    statusElement.className = 'status pending';
                    statusElement.textContent = 'Not configured';
                }
            }
        });
    }
    
    async saveSettingsToServer(settings) {
        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('Settings saved to server:', result);
                // Update current settings
                window.currentSettings = settings;
                return result;
            } else {
                console.error('Failed to save settings to server');
                return null;
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            return null;
        }
    }
    
    loadConfigurationsData(data) {
        if (data.workflows) {
            data.workflows.forEach(wf => this.workflows.set(wf.id, wf));
        }
        if (data.functions) {
            data.functions.forEach(fn => this.functions.set(fn.id, fn));
        }
        if (data.endpoints) {
            data.endpoints.forEach(ep => this.endpoints.set(ep.id, ep));
        }
        
        this.updateFunctionsList();
    }
    
    // API Endpoint Management
    
    addEndpoint() {
        // Show endpoint creation form
        console.log('Add new endpoint');
    }
    
    // Custom function management

    addCustomFunction() {
        // Show custom function creation dialog
        console.log('Add custom function');
    }

    // Workflow management integration
    async loadWorkflows() {
        try {
            console.log('AdminDashboard: Loading workflows...');

            // Call the external workflow loading function
            if (typeof loadLangGraphWorkflows === 'function') {
                await loadLangGraphWorkflows();
            } else {
                console.error('loadLangGraphWorkflows function not found');
            }
        } catch (error) {
            console.error('AdminDashboard: Error loading workflows:', error);
        }
    }
}

// Initialize admin dashboard
const admin = new AdminDashboard();
window.admin = admin; // Make globally available

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;

// Tools & Workflows Management
let tools = [];
let workflows = [];
let apiKeys = {}; // Store API keys loaded from server

// Load tools and workflows on section switch (updated for new navigation)
async function loadToolsAndWorkflows() {
    await loadApiKeys(); // Load API keys first
    await loadTools();
    await loadWorkflows();
}

// Updated function to work with new API & Tools section
async function loadApiAndToolsData() {
    await loadApiKeys();
    await loadTools();
    // This integrates with the new unified API & Tools section
    if (typeof loadApiAndTools === 'function') {
        await loadApiAndTools();
    }
}

// FIXED: Load API keys from server using correct endpoint
async function loadApiKeys() {
    try {
        const response = await fetch('/api/apikeys/status');
        if (response.ok) {
            apiKeys = await response.json();
            console.log('Loaded API keys status:', Object.keys(apiKeys));
        }
    } catch (error) {
        console.error('Failed to load API keys:', error);
    }
}

// Tools Management
async function loadTools() {
    try {
        // Fetch tools from the comprehensive API
        const response = await fetch('/api/tools/comprehensive');
        const data = await response.json();
        
        if (data.success && data.config) {
            // Convert the API response to our tools array format
            tools = [];
            const toolsWithInstructions = data.config.toolsWithInstructions;
            
            // Fetch details for each tool
            const toolsResponse = await fetch('/api/tools');
            const toolsData = await toolsResponse.json();
            
            if (toolsData.success && toolsData.tools) {
                toolsData.tools.forEach(tool => {
                    tools.push({
                        name: tool.name || tool.definition?.name,
                        type: tool.category || 'custom',
                        description: tool.description,
                        enabled: tool.enabled,
                        instructions: toolsWithInstructions?.instructions[tool.name] || tool.instructions || '',
                        parameters: tool.definition?.parameters || { type: 'object', properties: {} },
                        requiresApiKey: tool.requiresApiKey,
                        custom: tool.custom || false
                    });
                });
            }
        } else {
            // Fallback: No hardcoded tools - they should come from toolRegistry.js
            console.warn('Failed to load tools from API - please check toolRegistry.js and server endpoint');
            tools = [];
        }
        
        // Load custom tools from config
        const customTools = JSON.parse(localStorage.getItem('customTools') || '[]');
        tools = [...tools, ...customTools];
        
        renderToolsList();
    } catch (error) {
        console.error('Failed to load tools:', error);
    }
}

function renderToolsList() {
    const container = document.getElementById('tools-list');
    if (!container) return;
    
    container.innerHTML = tools.map(tool => `
        <div class="tool-card">
            <div class="tool-header">
                <div>
                    <span class="tool-name">${tool.name}</span>
                    <span class="tool-type">${tool.type}</span>
                    ${tool.requiresApiKey ? `<span class="tool-type" style="background: #ff6b6b;">Requires ${tool.requiresApiKey} API</span>` : ''}
                </div>
                <label class="switch">
                    <input type="checkbox" ${tool.enabled ? 'checked' : ''} 
                           onchange="toggleTool('${tool.name}', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="tool-description">${tool.description}</div>
            
            ${tool.requiresApiKey ? renderApiConfig(tool.requiresApiKey, tool.name) : ''}
            
            ${tool.instructions ? `
                <div class="tool-instructions" style="margin-top: 10px; padding: 10px; background: #f0f0f0; border-radius: 4px; font-size: 12px; color: #666;">
                    <strong>Instructions:</strong><br>
                    <pre style="white-space: pre-wrap; margin: 5px 0;">${tool.instructions}</pre>
                </div>
            ` : ''}
            <div class="tool-actions">
                <button class="button secondary small" onclick="editTool('${tool.name}')">View/Edit</button>
                ${tool.custom ? `<button class="button danger small" onclick="deleteTool('${tool.name}')">Delete</button>` : ''}
            </div>
        </div>
    `).join('');
}

function renderApiConfig(apiName, toolName) {
    const apiConfigs = {
        google: {
            fields: [
                { id: 'googleKey', label: 'API Key', type: 'password', placeholder: 'AIza...', key: 'apiKey' },
                { id: 'googleSearchEngineId', label: 'Search Engine ID', type: 'text', placeholder: 'cx:...', key: 'searchEngineId' }
            ]
        },
        amadeus: {
            fields: [
                { id: 'amadeusClientId', label: 'Client ID', type: 'text', placeholder: 'Client ID', key: 'clientId' },
                { id: 'amadeusClientSecret', label: 'Client Secret', type: 'password', placeholder: 'Client Secret', key: 'clientSecret' },
                { id: 'amadeusSandbox', label: 'Use Sandbox', type: 'checkbox', key: 'sandbox' }
            ]
        },
        openweather: {
            fields: [
                { id: 'weatherKey', label: 'API Key', type: 'password', placeholder: 'API Key', key: 'apiKey' },
                { id: 'weatherUnits', label: 'Units', type: 'select', options: ['metric', 'imperial', 'kelvin'], key: 'units' }
            ]
        },
        pinecone: {
            fields: [
                { id: 'pineconeKey', label: 'API Key', type: 'password', placeholder: 'pcsk_...', key: 'apiKey' },
                { id: 'pineconeEnvironment', label: 'Environment', type: 'text', placeholder: 'us-east-1', key: 'environment' },
                { id: 'pineconeIndexName', label: 'Index Name', type: 'text', placeholder: 'voicebot-documents', key: 'indexName' }
            ]
        }
    };
    
    const config = apiConfigs[apiName];
    if (!config) return '';
    
    // Get saved API configuration
    const savedApiConfig = apiKeys[apiName] || {};
    
    return `
        <div style="background: #2a2b2e; padding: 15px; margin-top: 10px; border-radius: 4px;">
            <h4 style="margin-top: 0; color: #4a9eff;">API Configuration</h4>
            ${config.fields.map(field => {
                const savedValue = savedApiConfig[field.key] || '';
                const fieldId = `${field.id}_${toolName.replace(/[^a-zA-Z0-9]/g, '_')}`; // Make IDs unique per tool
                
                if (field.type === 'checkbox') {
                    const checked = savedApiConfig[field.key] !== false ? 'checked' : '';
                    return `
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="${fieldId}" ${checked} 
                                       onchange="updateApiConfig('${apiName}', '${field.key}', this.checked)">
                                ${field.label}
                            </label>
                        </div>
                    `;
                } else if (field.type === 'select') {
                    return `
                        <div class="form-group">
                            <label>${field.label}</label>
                            <select id="${fieldId}" style="width: 100%; padding: 8px; border-radius: 4px;"
                                    onchange="updateApiConfig('${apiName}', '${field.key}', this.value)">
                                ${field.options.map(opt => 
                                    `<option value="${opt}" ${savedValue === opt ? 'selected' : ''}>${opt}</option>`
                                ).join('')}
                            </select>
                        </div>
                    `;
                }
                return `
                    <div class="form-group">
                        <label>${field.label}</label>
                        <input type="${field.type}" id="${fieldId}" 
                               placeholder="${field.placeholder}" 
                               value="${field.type === 'password' && savedValue ? '••••••••' : savedValue}"
                               onchange="updateApiConfig('${apiName}', '${field.key}', this.value)"
                               style="width: 100%; padding: 8px; border-radius: 4px;">
                    </div>
                `;
            }).join('')}
            <div style="display: flex; gap: 10px; align-items: center;">
                <button class="button secondary small" onclick="saveApiConfig('${apiName}')">Save</button>
                <button class="button secondary small" onclick="validateApi('${apiName}')">Validate</button>
                <span id="${apiName}Status_${toolName.replace(/[^a-zA-Z0-9]/g, '_')}" style="flex: 1;"></span>
            </div>
        </div>
    `;
}

// Update API configuration in memory
function updateApiConfig(apiName, key, value) {
    if (!apiKeys[apiName]) {
        apiKeys[apiName] = {};
    }
    apiKeys[apiName][key] = value;
}

// Save API configuration to server
async function saveApiConfig(apiName) {
    try {
        // Send all API keys, not just the one being saved
        const response = await fetch('/api/apikeys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiKeys)
        });
        
        if (response.ok) {
            showAlert(`${apiName} API configuration saved`, 'success');
            // Reload API keys to confirm they were saved
            await loadApiKeys();
        } else {
            const error = await response.json();
            showAlert(`Failed to save ${apiName} configuration: ${error.message || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('Error saving API config:', error);
        showAlert(`Error saving ${apiName} configuration`, 'error');
    }
}

// Validate API configuration
async function validateApi(apiName) {
    try {
        const statusSpan = document.querySelector(`[id^="${apiName}Status_"]`);
        if (statusSpan) {
            statusSpan.innerHTML = '<span style="color: #4a9eff;">Validating...</span>';
        }
        
        const response = await fetch(`/api/apikeys/validate/${apiName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiKeys[apiName] || {})
        });
        
        const result = await response.json();
        
        if (statusSpan) {
            if (result.valid) {
                statusSpan.innerHTML = '<span style="color: #00ff00;">✓ Valid</span>';
                showAlert(`${apiName} API validated successfully`, 'success');
            } else {
                statusSpan.innerHTML = `<span style="color: #ff6b6b;">✗ ${result.message || 'Invalid'}</span>`;
                showAlert(`${apiName} API validation failed: ${result.message || 'Invalid credentials'}`, 'error');
            }
        }
    } catch (error) {
        console.error('Error validating API:', error);
        const statusSpan = document.querySelector(`[id^="${apiName}Status_"]`);
        if (statusSpan) {
            statusSpan.innerHTML = '<span style="color: #ff6b6b;">✗ Error</span>';
        }
        showAlert(`Error validating ${apiName} API`, 'error');
    }
}

async function toggleTool(name, enabled) {
    // Find tool in current tools array or create minimal structure
    let tool = tools.find(t => t.name === name);
    if (!tool) {
        console.warn('Tool not found in local array, creating minimal structure:', name);
        tool = { name, enabled: !enabled }; // Store opposite to track change
        tools.push(tool);
    }

    // Store original state for revert
    const originalState = tool.enabled;
    tool.enabled = enabled;

    // Update UI immediately for responsive feedback
    const checkboxes = document.querySelectorAll(`input[onchange*="toggleTool('${name}'"]`);
    checkboxes.forEach(checkbox => {
        checkbox.disabled = true; // Prevent rapid clicking
    });

    try {
        const response = await fetch(`/api/tools/${name}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });

        if (response.ok) {
            const result = await response.json();
            console.log(`Tool ${name} ${enabled ? 'enabled' : 'disabled'} successfully`);

            // Show success feedback using new alert system
            if (typeof window.showAlert === 'function') {
                window.showAlert(`Tool "${name}" ${enabled ? 'enabled' : 'disabled'}`, 'success');
            } else if (typeof showAlert === 'function') {
                showAlert(`Tool "${name}" ${enabled ? 'enabled' : 'disabled'}`, 'success');
            }
        } else {
            console.error(`Failed to toggle tool ${name}: ${response.status}`);
            // Revert on failure
            tool.enabled = originalState;

            // Show error feedback
            if (typeof window.showAlert === 'function') {
                window.showAlert(`Failed to toggle tool "${name}"`, 'error');
            } else if (typeof showAlert === 'function') {
                showAlert(`Failed to toggle tool "${name}"`, 'error');
            }
        }
    } catch (error) {
        console.error('Error toggling tool:', error);
        // Revert on failure
        tool.enabled = originalState;

        // Show error feedback
        if (typeof window.showAlert === 'function') {
            window.showAlert(`Error toggling tool "${name}"`, 'error');
        } else if (typeof showAlert === 'function') {
            showAlert(`Error toggling tool "${name}"`, 'error');
        }
    }

    // Re-enable checkboxes
    checkboxes.forEach(checkbox => {
        checkbox.disabled = false;
        checkbox.checked = tool.enabled; // Ensure UI reflects current state
    });

    // Re-render old tools list if it exists
    if (typeof renderToolsList === 'function') {
        renderToolsList();
    }

    // Refresh new API & Tools section if active
    const apiToolsSection = document.getElementById('api-tools');
    if (apiToolsSection && apiToolsSection.classList.contains('active')) {
        if (typeof window.loadApiAndTools === 'function') {
            setTimeout(() => window.loadApiAndTools(), 500); // Small delay to let server update
        }
    }
}

function editTool(name) {
    const tool = tools.find(t => t.name === name);
    if (tool) {
        document.getElementById('tool-name').value = tool.name;
        document.getElementById('tool-description').value = tool.description;
        document.getElementById('tool-type').value = tool.type;
        document.getElementById('tool-parameters').value = JSON.stringify(tool.parameters, null, 2);
        document.getElementById('tool-enabled').checked = tool.enabled;
        
        updateToolTypeFields();
        document.getElementById('tool-editor-modal').style.display = 'block';
    }
}

function addNewTool() {
    document.getElementById('tool-form').reset();
    document.getElementById('tool-editor-modal').style.display = 'block';
}

function closeToolEditor() {
    document.getElementById('tool-editor-modal').style.display = 'none';
}

function updateToolTypeFields() {
    const type = document.getElementById('tool-type').value;
    const container = document.getElementById('tool-config-fields');
    
    let html = '';
    switch(type) {
        case 'api':
            html = `
                <div class="form-group">
                    <label>API Endpoint</label>
                    <input type="text" id="tool-endpoint" placeholder="https://api.example.com/endpoint">
                </div>
                <div class="form-group">
                    <label>HTTP Method</label>
                    <select id="tool-method">
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="DELETE">DELETE</option>
                    </select>
                </div>
            `;
            break;
        case 'rag':
            html = `
                <div class="form-group">
                    <label>Document Collection</label>
                    <select id="tool-collection">
                        <option value="all">All Documents</option>
                        <option value="recent">Recent Uploads</option>
                    </select>
                </div>
            `;
            break;
        case 'agent':
            html = `
                <div class="form-group">
                    <label>Target Agent</label>
                    <input type="text" id="tool-agent" placeholder="Agent name or ID">
                </div>
            `;
            break;
    }
    
    container.innerHTML = html;
}

async function saveTool(tool) {
    try {
        // Save to server
        const response = await fetch('/api/tools/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tool)
        });
        
        if (response.ok) {
            showAlert('Tool saved successfully', 'success');
            
            // Also save custom tools to localStorage as backup
            const builtInTools = ['search_documents', 'list_documents', 'get_document', 'process_document', 'search_google', 'get_weather', 'search_flights', 'analyze_image'];
            const customTools = tools.filter(t => !builtInTools.includes(t.name));
            localStorage.setItem('customTools', JSON.stringify(customTools));
        } else {
            showAlert('Failed to save tool', 'error');
        }
    } catch (error) {
        console.error('Error saving tool:', error);
        showAlert('Error saving tool', 'error');
    }
}

function deleteTool(name) {
    if (confirm(`Delete tool "${name}"?`)) {
        tools = tools.filter(t => t.name !== name);
        saveTool();
        renderToolsList();
    }
}

// Workflows Management
async function loadWorkflows() {
    try {
        workflows = JSON.parse(localStorage.getItem('workflows') || '[]');
        renderWorkflowsList();
    } catch (error) {
        console.error('Failed to load workflows:', error);
    }
}

function renderWorkflowsList() {
    const container = document.getElementById('workflows-list');
    if (!container) return;
    
    if (workflows.length === 0) {
        container.innerHTML = '<p style="color: #666;">No workflows created yet</p>';
        return;
    }
    
    container.innerHTML = workflows.map(workflow => `
        <div class="workflow-card">
            <div class="workflow-header">
                <span class="workflow-name">${workflow.name}</span>
                <span style="color: #666; font-size: 12px;">${workflow.steps?.length || 0} steps</span>
            </div>
            <div class="workflow-description">${workflow.description}</div>
            <div class="workflow-actions">
                <button class="button secondary small" onclick="editWorkflow('${workflow.id}')">Edit</button>
                <button class="button success small" onclick="testWorkflow('${workflow.id}')">Test</button>
                <button class="button danger small" onclick="deleteWorkflow('${workflow.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

let currentWorkflowSteps = [];

function createNewWorkflow() {
    document.getElementById('workflow-form').reset();
    currentWorkflowSteps = [];
    renderWorkflowSteps();
    document.getElementById('workflow-builder-modal').style.display = 'block';
}

function closeWorkflowBuilder() {
    document.getElementById('workflow-builder-modal').style.display = 'none';
}

function addWorkflowStep() {
    const stepNumber = currentWorkflowSteps.length + 1;
    currentWorkflowSteps.push({
        id: Date.now(),
        order: stepNumber,
        tool: '',
        params: {},
        condition: ''
    });
    renderWorkflowSteps();
}

function renderWorkflowSteps() {
    const container = document.getElementById('workflow-steps');
    
    if (currentWorkflowSteps.length === 0) {
        container.innerHTML = '<p style="color: #666;">No steps added yet</p>';
        return;
    }
    
    container.innerHTML = currentWorkflowSteps.map((step, index) => `
        <div class="workflow-step">
            <div class="workflow-step-header">
                <span class="step-number">${index + 1}</span>
                <select onchange="updateStepTool(${index}, this.value)" style="flex: 1;">
                    <option value="">Select a tool...</option>
                    ${tools.map(t => `<option value="${t.name}" ${step.tool === t.name ? 'selected' : ''}>${t.name}</option>`).join('')}
                </select>
                <span class="step-remove" onclick="removeWorkflowStep(${index})">✕</span>
            </div>
            <div style="margin-top: 10px;">
                <textarea placeholder="Parameters (JSON)" rows="3" 
                          onchange="updateStepParams(${index}, this.value)"
                          style="width: 100%; background: #1e1f21; border: 1px solid #333; color: #fff; padding: 8px; border-radius: 4px;">
${JSON.stringify(step.params, null, 2)}</textarea>
            </div>
        </div>
    `).join('');
}

function updateStepTool(index, toolName) {
    currentWorkflowSteps[index].tool = toolName;
}

function updateStepParams(index, params) {
    try {
        currentWorkflowSteps[index].params = JSON.parse(params);
    } catch (e) {
        console.error('Invalid JSON parameters');
    }
}

function removeWorkflowStep(index) {
    currentWorkflowSteps.splice(index, 1);
    renderWorkflowSteps();
}

function saveWorkflow() {
    const workflow = {
        id: Date.now().toString(),
        name: document.getElementById('workflow-name').value,
        description: document.getElementById('workflow-description').value,
        triggers: document.getElementById('workflow-triggers').value.split(',').map(t => t.trim()),
        steps: currentWorkflowSteps,
        created: new Date().toISOString()
    };
    
    workflows.push(workflow);
    localStorage.setItem('workflows', JSON.stringify(workflows));
    
    closeWorkflowBuilder();
    loadWorkflows();
    showAlert('Workflow saved successfully', 'success');
}

function editWorkflow(id) {
    const workflow = workflows.find(w => w.id === id);
    if (workflow) {
        document.getElementById('workflow-name').value = workflow.name;
        document.getElementById('workflow-description').value = workflow.description;
        document.getElementById('workflow-triggers').value = workflow.triggers.join(', ');
        currentWorkflowSteps = workflow.steps || [];
        renderWorkflowSteps();
        document.getElementById('workflow-builder-modal').style.display = 'block';
    }
}

function deleteWorkflow(id) {
    if (confirm('Delete this workflow?')) {
        workflows = workflows.filter(w => w.id !== id);
        localStorage.setItem('workflows', JSON.stringify(workflows));
        loadWorkflows();
    }
}

function testWorkflow(id) {
    const workflow = workflows.find(w => w.id === id);
    if (workflow) {
        alert(`Testing workflow: ${workflow.name}\nThis would execute ${workflow.steps.length} steps`);
    }
}

// EMERGENCY FIXES FOR CRITICAL ADMIN PANEL ISSUES

// Fix 1: Missing Vector Database Status Function
async function refreshDocumentStatus() {
    try {
        console.log('Refreshing document status...');

        // Update Pinecone status from health endpoint
        const healthResponse = await fetch('/health');
        const health = await healthResponse.json();

        const pineconeIcon = document.getElementById('pineconeStatusIcon');
        const pineconeText = document.getElementById('pineconeStatusText');
        const pineconeDetails = document.getElementById('pineconeDetails');

        if (health.details?.rag?.status === 'connected') {
            if (pineconeIcon) pineconeIcon.textContent = '✅';
            if (pineconeText) pineconeText.textContent = `Pinecone Vector Database Connected`;
            if (pineconeDetails) pineconeDetails.textContent = `Documents: ${health.details.rag.documentCount || 0} | Provider: ${health.details.rag.provider || 'Unknown'}`;
        } else {
            if (pineconeIcon) pineconeIcon.textContent = '❌';
            if (pineconeText) pineconeText.textContent = 'Vector Database Disconnected';
            if (pineconeDetails) pineconeDetails.textContent = 'Cannot connect to Pinecone';
        }

        // Update document statistics
        const docStatsText = document.getElementById('docStatsText');
        const docStatsDetails = document.getElementById('docStatsDetails');

        if (docStatsText) {
            docStatsText.textContent = `${health.details?.rag?.documentCount || 0} documents indexed`;
        }
        if (docStatsDetails) {
            docStatsDetails.textContent = `Vector provider: ${health.details?.rag?.provider || 'None'}`;
        }

        // Update search engine status
        const searchIcon = document.getElementById('searchStatusIcon');
        const searchText = document.getElementById('searchStatusText');
        const searchDetails = document.getElementById('searchStatusDetails');

        if (searchIcon) searchIcon.textContent = '✅';
        if (searchText) searchText.textContent = 'Search Engine Ready';
        if (searchDetails) searchDetails.textContent = 'RAG search functionality available';

        // Update last updated time
        const lastUpdatedText = document.getElementById('lastUpdatedText');
        if (lastUpdatedText) {
            lastUpdatedText.textContent = new Date().toLocaleTimeString();
        }

        // FIXED: Load document list
        await loadDocumentList();

        console.log('Document status refreshed successfully');
    } catch (error) {
        console.error('Error refreshing document status:', error);

        // Show error state
        const pineconeIcon = document.getElementById('pineconeStatusIcon');
        const pineconeText = document.getElementById('pineconeStatusText');

        if (pineconeIcon) pineconeIcon.textContent = '❌';
        if (pineconeText) pineconeText.textContent = 'Error checking status';
    }
}

// FIXED: Load and display document list
async function loadDocumentList() {
    try {
        console.log('Loading document list...');
        const response = await fetch('/api/documents');
        const data = await response.json();
        console.log('Document API response:', data);

        const documentList = document.getElementById('documentList');
        const documentCount = document.getElementById('documentCount');
        console.log('DOM elements found:', !!documentList, !!documentCount);

        if (data.success && data.documents) {
            if (documentCount) {
                documentCount.textContent = `${data.count} document${data.count !== 1 ? 's' : ''}`;
            }

            if (documentList) {
                if (data.documents.length === 0) {
                    documentList.innerHTML = '<p style="text-align: center; color: #666;">No documents uploaded yet</p>';
                } else {
                    const html = data.documents.map(doc => `
                        <div class="document-item">
                            <div class="document-info">
                                <div class="document-name">${doc.fileName}</div>
                                <div class="document-meta">
                                    ${doc.fileType} • ${(doc.size / 1024).toFixed(1)}KB •
                                    ${doc.chunks} chunk${doc.chunks !== 1 ? 's' : ''} •
                                    Uploaded ${new Date(doc.uploadedAt).toLocaleDateString()}
                                </div>
                            </div>
                            <div class="document-actions">
                                <button class="button small" onclick="downloadDocument('${doc.id}')">Download</button>
                                <button class="button small danger" onclick="deleteDocument('${doc.id}')">Delete</button>
                            </div>
                        </div>
                    `).join('');
                    documentList.innerHTML = html;
                }
            }
        }
    } catch (error) {
        console.error('Error loading document list:', error);
        const documentList = document.getElementById('documentList');
        if (documentList) {
            documentList.innerHTML = '<p style="text-align: center; color: #c33;">Error loading documents</p>';
        }
    }
}

// Download document function
async function downloadDocument(docId) {
    try {
        const response = await fetch(`/api/documents/${docId}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.success && data.document && data.document.content) {
            // Create and download file
            const blob = new Blob([data.document.content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.document.fileName || `document-${docId}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            throw new Error(data.error || 'Failed to get document content');
        }
    } catch (error) {
        console.error('Download error:', error);
        alert(`Failed to download document: ${error.message}`);
    }
}

// Delete document function
async function deleteDocument(docId) {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
        const response = await fetch(`/api/documents/${docId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadDocumentList(); // Refresh the list
            alert('Document deleted successfully');
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert(`Failed to delete document: ${error.message}`);
    }
}

// Clear all documents function
async function clearAllDocuments() {
    if (!confirm('Are you sure you want to delete ALL documents? This cannot be undone.')) return;

    try {
        const response = await fetch('/api/documents', {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadDocumentList(); // Refresh the list
            alert('All documents cleared successfully');
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('Clear all error:', error);
        alert(`Failed to clear documents: ${error.message}`);
    }
}

// Document upload functionality
function initializeUpload() {
    const fileInput = document.getElementById('fileInput');
    const uploadZone = document.getElementById('uploadZone');
    const uploadLoading = document.getElementById('uploadLoading');

    // File input change handler
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }

    // Drag and drop handlers
    if (uploadZone) {
        uploadZone.addEventListener('dragover', handleDragOver);
        uploadZone.addEventListener('dragleave', handleDragLeave);
        uploadZone.addEventListener('drop', handleDrop);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = e.dataTransfer.files;
    uploadFiles(files);
}

function handleFileSelect(e) {
    const files = e.target.files;
    uploadFiles(files);
}

async function uploadFiles(files) {
    const uploadLoading = document.getElementById('uploadLoading');

    if (files.length === 0) return;

    try {
        if (uploadLoading) {
            uploadLoading.style.display = 'block';
        }

        for (const file of files) {
            await uploadSingleFile(file);
        }

        // Refresh document list
        await loadDocumentList();
        alert(`Successfully uploaded ${files.length} file${files.length !== 1 ? 's' : ''}`);

    } catch (error) {
        console.error('Upload error:', error);
        alert(`Upload failed: ${error.message}`);
    } finally {
        if (uploadLoading) {
            uploadLoading.style.display = 'none';
        }
    }
}

async function uploadSingleFile(file) {
    const formData = new FormData();
    formData.append('document', file);

    const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Upload failed');
    }

    return result;
}

// Fix 2: Enhanced Tools Display Function
// FIXED: Clean API & Tools loading
async function loadApiAndTools() {
    try {
        console.log('Loading API and Tools data...');

        // Load API keys status
        const apiResponse = await fetch('/api/apikeys/status');
        if (!apiResponse.ok) {
            throw new Error(`API keys endpoint failed: ${apiResponse.status}`);
        }
        const apiData = await apiResponse.json();

        // Load tools data
        const toolsResponse = await fetch('/api/tools/comprehensive');
        if (!toolsResponse.ok) {
            throw new Error(`Tools endpoint failed: ${toolsResponse.status}`);
        }
        const toolsData = await toolsResponse.json();

        console.log('Received API data:', Object.keys(apiData));
        console.log('Received tools data:', toolsData.success ? 'SUCCESS' : 'FAILED');
        console.log('Number of tools:', toolsData.config?.toolsWithInstructions?.tools ? Object.keys(toolsData.config.toolsWithInstructions.tools).length : 0);

        // Populate API credentials AND tools list - RESTORED FUNCTIONALITY
        populateApiKeyFields(apiData);
        updateToolsList(toolsData);

        // Also call renderUnifiedServices for the service overview
        renderUnifiedServices(apiData, toolsData);

        console.log('API & Tools loaded successfully');

    } catch (error) {
        console.error('Error loading API and Tools:', error);
        showApiToolsError(error.message);
    }
}

// CLEAN: Populate API credentials interface
function populateApiCredentials(apiData) {
    const container = document.getElementById('api-credentials-container');
    if (!container) return;

    const apiProviders = [
        { key: 'openai', name: 'OpenAI', icon: '🤖', fields: ['apiKey', 'organization'] },
        { key: 'google', name: 'Google Search', icon: '🔍', fields: ['apiKey', 'searchEngineId'] },
        { key: 'amadeus', name: 'Amadeus Travel', icon: '✈️', fields: ['clientId', 'clientSecret'] },
        { key: 'weather', name: 'Weather API', icon: '🌤️', fields: ['apiKey'] },
        { key: 'pinecone', name: 'Pinecone Vector DB', icon: '🗂️', fields: ['apiKey', 'environment', 'indexName'] }
    ];

    const html = apiProviders.map(provider => {
        const data = apiData[provider.key] || {};
        const isConfigured = provider.fields.some(field =>
            field.includes('Key') || field.includes('Secret') || field.includes('Id') ? data[field] === true : data[field]
        );

        return `
            <div class="api-group" style="border: 2px solid ${isConfigured ? '#28a745' : '#e5e5e7'};">
                <div class="api-header">
                    <span class="api-title">${provider.icon} ${provider.name}</span>
                    <span class="status ${isConfigured ? 'valid' : 'pending'}">${isConfigured ? 'Configured' : 'Not configured'}</span>
                </div>
                <div class="form-group">
                    <small style="color: #666;">
                        ${isConfigured ? 'Loaded from .env file or encrypted storage' : 'Add API key to .env file or configure below'}
                    </small>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// CLEAN: Populate simple tools list
function populateSimpleToolsList(toolsData) {
    const container = document.getElementById('simple-tools-list');
    if (!container || !toolsData.success) return;

    const tools = toolsData.config.toolsWithInstructions.tools;
    const html = Object.entries(tools).map(([name, tool]) => `
        <div class="tool-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid #e5e5e7; border-radius: 8px; margin-bottom: 8px;">
            <div>
                <div style="font-weight: 500;">${name.replace(/_/g, ' ')}</div>
                <div style="font-size: 13px; color: #666;">${tool.description}</div>
            </div>
            <label style="margin: 0;">
                <input type="checkbox" ${tool.enabled ? 'checked' : ''} onchange="toggleTool('${name}', this.checked)">
                <span style="margin-left: 8px;">${tool.enabled ? 'Enabled' : 'Disabled'}</span>
            </label>
        </div>
    `).join('');

    container.innerHTML = html;
}

// LEGACY: Keep old function for compatibility
function populateApiKeyFields(apis) {
    console.log('Populating API key fields with data:', apis);

    // Enable and clear loading placeholders for API key fields
    const apiElements = [
        'openaiKey', 'openaiOrg', 'googleKey', 'googleSearchEngineId',
        'amadeusClientId', 'amadeusClientSecret', 'weatherKey', 'weatherUnits',
        'pineconeApiKey', 'pineconeEnvironment', 'pineconeIndexName'
    ];

    apiElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.disabled = false;
            element.placeholder = '';
        }
    });

    // Populate OpenAI fields
    if (apis.openai) {
        if (document.getElementById('openaiKey')) {
            document.getElementById('openaiKey').value = apis.openai.apiKey ? '••••••••••••••••' : '';
            document.getElementById('openaiKey').placeholder = apis.openai.apiKey ? 'API Key Configured' : 'Enter OpenAI API Key';
        }
        if (document.getElementById('openaiOrg')) document.getElementById('openaiOrg').value = apis.openai.organization || '';
    }

    // Populate Google fields
    if (apis.google) {
        if (document.getElementById('googleKey')) {
            document.getElementById('googleKey').value = apis.google.apiKey ? '••••••••••••••••' : '';
            document.getElementById('googleKey').placeholder = apis.google.apiKey ? 'API Key Configured' : 'Enter Google API Key';
        }
        if (document.getElementById('googleSearchEngineId')) {
            document.getElementById('googleSearchEngineId').value =
                (apis.google.searchEngineId === true) ? '••••••••••••••••' : (apis.google.searchEngineId || '');
        }
    }

    // Populate Amadeus fields
    if (apis.amadeus) {
        if (document.getElementById('amadeusClientId')) {
            document.getElementById('amadeusClientId').value = apis.amadeus.clientId ? '••••••••••••••••' : '';
            document.getElementById('amadeusClientId').placeholder = apis.amadeus.clientId ? 'Client ID Configured' : 'Enter Amadeus Client ID';
        }
        if (document.getElementById('amadeusClientSecret')) {
            document.getElementById('amadeusClientSecret').value = apis.amadeus.clientSecret ? '••••••••••••••••' : '';
            document.getElementById('amadeusClientSecret').placeholder = apis.amadeus.clientSecret ? 'Client Secret Configured' : 'Enter Amadeus Client Secret';
        }
        if (document.getElementById('amadeusSandbox')) document.getElementById('amadeusSandbox').checked = apis.amadeus.sandbox !== false;
    }

    // Populate Weather fields
    if (apis.weather) {
        if (document.getElementById('weatherKey')) {
            document.getElementById('weatherKey').value = apis.weather.apiKey ? '••••••••••••••••' : '';
            document.getElementById('weatherKey').placeholder = apis.weather.apiKey ? 'API Key Configured' : 'Enter Weather API Key';
        }
        if (document.getElementById('weatherUnits')) document.getElementById('weatherUnits').value = apis.weather.units || 'imperial';
    }

    // Populate Pinecone fields
    if (apis.pinecone) {
        if (document.getElementById('pineconeApiKey')) {
            document.getElementById('pineconeApiKey').value = apis.pinecone.apiKey ? '••••••••••••••••' : '';
            document.getElementById('pineconeApiKey').placeholder = apis.pinecone.apiKey ? 'API Key Configured' : 'Enter Pinecone API Key';
        }
        if (document.getElementById('pineconeEnvironment')) document.getElementById('pineconeEnvironment').value = apis.pinecone.environment || '';
        if (document.getElementById('pineconeIndexName')) document.getElementById('pineconeIndexName').value = apis.pinecone.indexName || '';
    }

    console.log('API key fields populated successfully');
}

// Centralized function to hide loading spinner
function hideApiToolsLoading() {
    const loadingElement = document.getElementById('api-tools-loading');
    const servicesContainer = document.getElementById('api-services-container');

    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
    if (servicesContainer) {
        servicesContainer.style.display = 'block';
    }
}

// Centralized function to show error state
function showApiToolsError(message) {
    const servicesContainer = document.getElementById('api-services-container');
    if (servicesContainer) {
        servicesContainer.innerHTML = `
            <div class="error-state" style="text-align: center; padding: 40px; background: #fee; border: 1px solid #fcc; border-radius: 8px; color: #c33;">
                <h3>⚠️ Unable to Load API & Tools</h3>
                <p>${message}</p>
                <button onclick="loadApiAndTools()" style="margin-top: 16px; padding: 8px 16px; background: #007aff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    🔄 Retry
                </button>
            </div>
        `;
        servicesContainer.style.display = 'block';
    }
}

// Fix 3: Enhanced Tool Instructions Interface - REPLACED WITH MODAL MANAGER VERSION
// This function is now handled by the modal manager system in admin-modal-fix.js

// Fix 4: Save Tool Instructions Function - REPLACED WITH MODAL MANAGER VERSION
// This function is now handled by the modal manager system in admin-modal-fix.js

// Fix 5: Render Unified Services (API & Tools combined)
function renderUnifiedServices(apiData, toolsData) {
    console.log('Rendering unified services...');

    const services = {
        openai: {
            name: 'OpenAI',
            icon: '🤖',
            connected: !!apiData.openai,
            tools: []
        },
        google: {
            name: 'Google APIs',
            icon: '🔍',
            connected: !!apiData.google,
            tools: []
        },
        weather: {
            name: 'Weather Service',
            icon: '🌤️',
            connected: true, // Weather is always available
            tools: []
        },
        rag: {
            name: 'Document Search',
            icon: '📚',
            connected: true, // RAG tools are built-in
            tools: []
        },
        vision: {
            name: 'Image Analysis',
            icon: '👁️',
            connected: !!apiData.openai, // Requires OpenAI for GPT-4 Vision
            tools: []
        },
        formatting: {
            name: 'Data Formatting',
            icon: '📊',
            connected: !!apiData.openai, // Requires OpenAI for GPT-4o-mini
            tools: []
        }
    };

    // Map tools to services
    if (toolsData.config.toolsWithInstructions.tools) {
        Object.entries(toolsData.config.toolsWithInstructions.tools).forEach(([toolName, tool]) => {
            const toolInfo = {
                name: toolName,
                description: tool.description,
                enabled: tool.enabled,
                category: tool.category
            };

            // Assign tools to appropriate services
            if (tool.category === 'rag') {
                services.rag.tools.push(toolInfo);
            } else if (tool.category === 'weather') {
                services.weather.tools.push(toolInfo);
            } else if (tool.category === 'vision') {
                services.vision.tools.push(toolInfo);
                // Also add to OpenAI since it uses GPT-4 Vision
                services.openai.tools.push({...toolInfo, category: 'vision'});
            } else if (tool.category === 'formatting') {
                services.formatting.tools.push(toolInfo);
                // Also add to OpenAI since it uses GPT-4o-mini
                services.openai.tools.push({...toolInfo, category: 'formatting'});
            } else if (tool.category === 'workflow') {
                // Skip workflow tools - they're managed in dedicated Workflows section
                console.log('Skipping workflow tool for API section:', toolName);
            } else {
                // Default to appropriate service
                if (toolName.includes('search') || toolName.includes('google')) {
                    services.google.tools.push(toolInfo);
                } else {
                    services.openai.tools.push(toolInfo);
                }
            }
        });
    }

    console.log('Services mapped:', services);

    // Update the service status overview if it exists
    updateServiceStatusDisplay(services);
}

// Fix 6: Update Service Status Display
function updateServiceStatusDisplay(services) {
    // Find the service status container - use the correct container for API tools section
    let statusContainer = document.getElementById('api-services-container');
    if (!statusContainer) {
        // Fallback: try to find other locations
        statusContainer = document.querySelector('#api-tools');
        if (statusContainer) {
            // Create the container if it doesn't exist
            const newContainer = document.createElement('div');
            newContainer.id = 'api-services-container';
            statusContainer.appendChild(newContainer);
            statusContainer = newContainer;
        }
    }

    if (statusContainer) {
        // Create service status cards
        const serviceHTML = Object.entries(services).map(([key, service]) => {
            const enabledTools = service.tools.filter(t => t.enabled).length;
            const totalTools = service.tools.length;

            return `
                <div class="service-group">
                    <div class="service-header">
                        <div class="service-title">
                            <span class="icon">${service.icon}</span>
                            ${service.name}
                        </div>
                        <div class="service-status">
                            <div class="status-indicator ${service.connected ? 'connected' : ''}"></div>
                            <span>${service.connected ? 'Connected' : 'Disconnected'}</span>
                        </div>
                    </div>
                    <div class="service-content">
                        <p>Tools: ${enabledTools}/${totalTools} enabled</p>
                        ${service.tools.length > 0 ? `
                            <div class="tools-list">
                                ${service.tools.map(tool => `
                                    <div class="tool-item enhanced">
                                        <div class="tool-info">
                                            <div class="tool-name">${tool.name.replace(/_/g, ' ')}</div>
                                            <div class="tool-description">${tool.description}</div>
                                        </div>
                                        <div class="tool-controls">
                                            <button class="tool-edit-btn" onclick="editToolInstructions('${tool.name}')">
                                                📝 Instructions
                                            </button>
                                            <label style="margin-left: 8px;">
                                                <input type="checkbox" ${tool.enabled ? 'checked' : ''}
                                                       onchange="toggleTool('${tool.name}', this.checked)">
                                                <span style="margin-left: 4px;">${tool.enabled ? 'Enabled' : 'Disabled'}</span>
                                            </label>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Insert the service status HTML
        const existingContent = statusContainer.innerHTML;
        if (!existingContent.includes('service-group')) {
            statusContainer.innerHTML = serviceHTML + existingContent;
        }

        // Hide the loading spinner after rendering using centralized function
        hideApiToolsLoading();

        console.log('Service status display updated successfully');
    } else {
        console.warn('Could not find API services container, hiding loading spinner anyway');
        hideApiToolsLoading();
    }
}

// FIXED: Update Tools List with proper error handling and debugging
function updateToolsList(toolsData) {
    console.log('updateToolsList called with:', toolsData);

    const toolsListElement = document.getElementById('tools-list');
    console.log('Found tools-list element:', !!toolsListElement);

    if (!toolsListElement) {
        console.error('tools-list element not found in DOM');
        return;
    }

    if (!toolsData || !toolsData.success) {
        console.error('Invalid tools data:', toolsData);
        toolsListElement.innerHTML = '<div style="color: #c33; padding: 20px; text-align: center;">Error loading tools data</div>';
        return;
    }

    const tools = toolsData.config?.toolsWithInstructions?.tools;
    if (!tools) {
        console.error('No tools found in data structure:', toolsData.config);
        toolsListElement.innerHTML = '<div style="color: #c33; padding: 20px; text-align: center;">No tools configuration found</div>';
        return;
    }

    console.log('Found tools:', Object.keys(tools));

    const toolsHTML = Object.entries(tools).map(([toolName, tool]) => {
        // Add category badge
        const categoryBadge = tool.category ? `<span class="tool-type" style="background: #667eea; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-left: 8px;">${tool.category}</span>` : '';

        return `
            <div class="tool-item enhanced" style="border: 1px solid #e5e5e7; border-radius: 8px; padding: 16px; margin-bottom: 12px; background: white;">
                <div class="tool-info">
                    <div class="tool-name" style="font-weight: 600; font-size: 16px; color: #1d1d1f; margin-bottom: 4px;">
                        ${toolName.replace(/_/g, ' ')}${categoryBadge}
                    </div>
                    <div class="tool-description" style="color: #666; font-size: 14px; margin-bottom: 8px;">${tool.description}</div>
                </div>
                <div class="tool-controls" style="display: flex; align-items: center; gap: 12px; justify-content: space-between;">
                    <button class="tool-edit-btn" onclick="editToolInstructions('${toolName}')"
                            style="background: #667eea; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        📝 Instructions
                    </button>
                    <label style="display: flex; align-items: center; gap: 6px; margin: 0;">
                        <input type="checkbox" ${tool.enabled ? 'checked' : ''}
                               onchange="toggleTool('${toolName}', this.checked)"
                               style="margin: 0;">
                        <span style="font-size: 14px; color: ${tool.enabled ? '#28a745' : '#6c757d'};">
                            ${tool.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </label>
                </div>
            </div>
        `;
    }).join('');

    console.log('Setting innerHTML with', Object.keys(tools).length, 'tools');
    toolsListElement.innerHTML = toolsHTML;

    // Verify the update worked
    console.log('Tools list updated. New innerHTML length:', toolsListElement.innerHTML.length);
}

// Add form submit handlers
document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin panel initializing...');

    // Auto-refresh document status every 30 seconds
    if (typeof refreshDocumentStatus === 'function') {
        refreshDocumentStatus();
        setInterval(refreshDocumentStatus, 30000);
    }

    // Load API and tools data immediately
    console.log('Calling loadApiAndTools from DOMContentLoaded...');
    if (typeof loadApiAndTools === 'function') {
        loadApiAndTools().catch(error => {
            console.error('Error in DOMContentLoaded loadApiAndTools:', error);
        });

        // Safety timeout: hide loading spinner after 10 seconds regardless
        setTimeout(() => {
            const loadingElement = document.getElementById('api-tools-loading');
            if (loadingElement && loadingElement.style.display !== 'none') {
                console.warn('Loading spinner still visible after 10 seconds, forcing hide');
                hideApiToolsLoading();
                showApiToolsError('Loading timed out. Please refresh the page or check your connection.');
            }
        }, 10000);
    } else {
        console.error('loadApiAndTools function not found!');
    }

    // FIXED: Load workflows data immediately
    console.log('Loading workflows from DOMContentLoaded...');
    if (typeof loadLangGraphWorkflows === 'function') {
        loadLangGraphWorkflows().catch(error => {
            console.error('Error loading workflows:', error);
        });
    } else {
        console.error('loadLangGraphWorkflows function not found!');
    }

    const toolForm = document.getElementById('tool-form');
    if (toolForm) {
        toolForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const tool = {
                name: document.getElementById('tool-name').value,
                description: document.getElementById('tool-description').value,
                type: document.getElementById('tool-type').value,
                parameters: JSON.parse(document.getElementById('tool-parameters').value),
                enabled: document.getElementById('tool-enabled').checked
            };

            const existingIndex = tools.findIndex(t => t.name === tool.name);
            if (existingIndex >= 0) {
                tools[existingIndex] = tool;
            } else {
                tools.push(tool);
            }

            saveTool(tool);
            renderToolsList();
            closeToolEditor();
        });
    }

    const workflowForm = document.getElementById('workflow-form');
    if (workflowForm) {
        workflowForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveWorkflow();
        });
    }
});

// EMERGENCY FIX FOR ADVANCED PANEL VISIBILITY
// Add CSS overrides to ensure advanced panels are visible when expanded
const advancedPanelCSS = document.createElement('style');
advancedPanelCSS.textContent = `
    /* ESSENTIAL FUNCTIONALITY - MINIMAL OVERRIDES */
    /* Ensure dynamic content displays properly */
    #advancedRagSettings {
        transition: all 0.3s ease;
    }

    #advancedRagSettings[style*="display: block"] {
        display: block !important;
        visibility: visible;
    }

    /* Ensure service containers display properly */
    .service-group {
        display: block;
        visibility: visible;
    }

    /* Ensure tool items display in flexbox layout */
    .tool-item.enhanced {
        display: flex !important;
        visibility: visible;
    }

    /* Ensure API services container shows when populated */
    #api-services-container[style*="display: block"] {
        display: block !important;
        visibility: visible;
    }

    /* Ensure buttons are interactive */
    button,
    .button,
    .tool-edit-btn {
        cursor: pointer;
        pointer-events: auto;
    }

    /* Ensure modals appear properly */
    .modal {
        z-index: 10000;
    }

    div[style*="position: fixed"] {
        z-index: 10001;
    }
`;
document.head.appendChild(advancedPanelCSS);
document.head.appendChild(style);

// Add missing global functions
window.switchSection = function(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Show target section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // Add active class to corresponding nav item
    const navItem = document.querySelector(`[onclick*="${sectionId}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }

    // Load section-specific data
    if (sectionId === 'workflows') {
        console.log('Switching to workflows section...');
        if (window.admin && typeof admin.loadWorkflows === 'function') {
            admin.loadWorkflows();
        } else {
            console.error('Admin dashboard not available for workflow loading');
        }
    } else if (sectionId === 'api-tools') {
        if (typeof loadApiAndTools === 'function') {
            loadApiAndTools();
        }
    }
};

window.saveSettings = function() {
    console.log('Saving settings...');
    // Implementation would go here
    alert('Settings saved! (Implementation pending)');
};

window.saveApiKeys = function() {
    console.log('Saving API keys...');
    // Implementation would go here
    alert('API keys saved! (Implementation pending)');
};

window.showAlert = function(message, type = 'info') {
    const alertElement = document.getElementById('alert');
    if (alertElement) {
        alertElement.textContent = message;
        alertElement.className = `alert ${type} show`;
        setTimeout(() => {
            alertElement.classList.remove('show');
        }, 3000);
    }
};

// COMPLETE LANGGRAPH WORKFLOW MANAGEMENT SYSTEM

// Global workflow state
let langGraphWorkflows = [];
let availableToolsForWorkflows = {};

// Load LangGraph workflows from server
async function loadLangGraphWorkflows() {
    console.log('Loading LangGraph workflows...');

    const container = document.getElementById('langgraph-workflows-list');
    if (!container) {
        console.error('langgraph-workflows-list container not found');
        return;
    }

    try {
        console.log('Fetching workflows from /api/workflows...');
        const response = await fetch('/api/workflows');

        if (response.ok) {
            const data = await response.json();
            console.log('Workflows loaded:', data);

            langGraphWorkflows = data.workflows || [];
            console.log('Number of workflows:', langGraphWorkflows.length);

            renderLangGraphWorkflowsList();
            updateWorkflowStats();

            console.log('Workflows rendering completed');
        } else {
            console.error('Failed to load workflows:', response.status);
            container.innerHTML = '<div style="color: #c33; padding: 20px; text-align: center;">Failed to load workflows (HTTP ' + response.status + ')</div>';
        }
    } catch (error) {
        console.error('Error loading workflows:', error);
        container.innerHTML = '<div style="color: #c33; padding: 20px; text-align: center;">Error loading workflows: ' + error.message + '</div>';
    }
}

// Render workflows list
function renderLangGraphWorkflowsList() {
    const container = document.getElementById('langgraph-workflows-list');
    if (!container) return;

    if (langGraphWorkflows.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <div style="font-size: 48px; margin-bottom: 16px;">🔗</div>
                <p>No LangGraph workflows created yet</p>
                <p style="font-size: 14px;">Create your first workflow to chain tools together automatically</p>
            </div>
        `;
        return;
    }

    const html = langGraphWorkflows.map(workflow => {
        const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
        const triggers = Array.isArray(workflow.triggers) ? workflow.triggers : [];
        const stepCount = steps.length;
        const isValid = stepCount > 0;

        return `
            <div class="workflow-item" style="border-left: 4px solid ${isValid ? '#28a745' : '#ffc107'};">
                <div class="workflow-header">
                    <div class="workflow-name">${workflow.name || 'Unnamed Workflow'}</div>
                    <div class="workflow-status">
                        <span class="status-indicator ${workflow.enabled && isValid ? 'connected' : ''}"></span>
                        <span>${workflow.enabled && isValid ? 'Enabled' : (isValid ? 'Disabled' : 'Incomplete')}</span>
                    </div>
                </div>
                <div class="workflow-description" style="margin-bottom: 12px; color: #666;">${workflow.description || 'No description'}</div>
                <div class="workflow-steps">
                    <strong>Steps (${stepCount}):</strong> ${stepCount > 0 ? steps.join(' → ') : '⚠️ No steps defined'}
                </div>
                <div class="workflow-triggers" style="margin-bottom: 12px;">
                    <strong>Triggers:</strong> ${triggers.length > 0 ? triggers.join(', ') : '⚠️ No triggers set'}
                </div>
                <div class="workflow-meta" style="font-size: 12px; color: #999; margin-bottom: 12px;">
                    Created: ${workflow.createdAt ? new Date(workflow.createdAt).toLocaleDateString() : 'Unknown'}
                    ${workflow.updatedAt && workflow.updatedAt !== workflow.createdAt ?
                        ` • Updated: ${new Date(workflow.updatedAt).toLocaleDateString()}` : ''}
                </div>
                <div class="workflow-actions">
                    <button class="button small" onclick="editLangGraphWorkflow('${workflow.id}')">Edit</button>
                    <button class="button small ${isValid ? '' : 'secondary'}" onclick="testLangGraphWorkflow('${workflow.id}')"
                            ${!isValid ? 'disabled title="Add steps to enable testing"' : ''}>Test</button>
                    <button class="button small ${workflow.enabled ? 'secondary' : 'success'}"
                            onclick="toggleLangGraphWorkflow('${workflow.id}', ${!workflow.enabled})"
                            ${!isValid ? 'disabled title="Add steps to enable workflow"' : ''}>
                        ${workflow.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button class="button small danger" onclick="deleteLangGraphWorkflow('${workflow.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// Edit existing LangGraph workflow
async function editLangGraphWorkflow(workflowId) {
    const workflow = langGraphWorkflows.find(w => w.id === workflowId);
    if (!workflow) {
        showAlert('Workflow not found', 'error');
        return;
    }

    console.log('Starting to edit workflow:', workflow.name, 'with steps:', workflow.steps);

    // SET EDITING STATE FIRST (before any other operations)
    window.editingWorkflowId = workflowId;
    console.log('EDIT STATE SET:', window.editingWorkflowId);

    // Reset form manually (don't call createNewLangGraphWorkflow which clears edit state)
    document.getElementById('langgraph-workflow-form').reset();
    currentWorkflowSteps = [];

    // Update modal title for editing
    const modalTitle = document.querySelector('#langgraph-workflow-modal h2');
    if (modalTitle) {
        modalTitle.textContent = `Edit Workflow: ${workflow.name}`;
    }

    // Load available tools
    await loadAvailableToolsForWorkflow();

    // Pre-fill form
    document.getElementById('workflow-name').value = workflow.name || '';
    document.getElementById('workflow-description').value = workflow.description || '';
    document.getElementById('workflow-triggers').value = (workflow.triggers || []).join(', ');

    // Reset workflow canvas
    const canvas = document.getElementById('workflow-canvas');
    if (canvas) {
        canvas.innerHTML = '<div class="workflow-placeholder">Loading workflow steps...</div>';
    }

    // Load workflow steps
    console.log('Loading workflow steps:', workflow.steps);
    (workflow.steps || []).forEach((toolName, index) => {
        console.log(`Adding step ${index + 1}: ${toolName}`);
        if (availableToolsForWorkflows[toolName]) {
            setTimeout(() => addToolToWorkflow(toolName), index * 100);
        } else {
            console.warn(`Tool ${toolName} not found in available tools`);
        }
    });

    // Show modal
    document.getElementById('langgraph-workflow-modal').style.display = 'block';

    console.log('Editing workflow setup complete - editingWorkflowId:', window.editingWorkflowId);
}

// Create new LangGraph workflow
async function createNewLangGraphWorkflow() {
    // Reset form
    document.getElementById('langgraph-workflow-form').reset();
    currentWorkflowSteps = [];

    // Clear editing state
    delete window.editingWorkflowId;

    // Update modal title
    const modalTitle = document.querySelector('#langgraph-workflow-modal h2');
    if (modalTitle) {
        modalTitle.textContent = 'Create LangGraph Workflow';
    }

    // Load available tools
    await loadAvailableToolsForWorkflow();

    // Clear workflow canvas
    document.getElementById('workflow-canvas').innerHTML =
        '<div class="workflow-placeholder"><div style="font-size: 32px; margin-bottom: 8px;">🔗</div><div>Add tools to build your workflow</div><div style="font-size: 12px; color: #999; margin-top: 4px;">Start with a search or data collection tool</div></div>';

    // Show modal
    document.getElementById('langgraph-workflow-modal').style.display = 'block';
}

// Close workflow builder
function closeLangGraphWorkflowBuilder() {
    document.getElementById('langgraph-workflow-modal').style.display = 'none';

    // Clear editing state
    delete window.editingWorkflowId;

    // Reset workflow steps
    currentWorkflowSteps = [];
}

// Load available tools for workflow building
async function loadAvailableToolsForWorkflow() {
    try {
        const response = await fetch('/api/tools/comprehensive');
        const data = await response.json();

        if (data.success && data.config.toolsWithInstructions.tools) {
            availableToolsForWorkflows = data.config.toolsWithInstructions.tools;
            renderToolsPalette();
        }
    } catch (error) {
        console.error('Error loading tools for workflow:', error);
    }
}

// Render tools palette for workflow builder
function renderToolsPalette() {
    const container = document.getElementById('available-tools');
    if (!container) return;

    const html = Object.entries(availableToolsForWorkflows).map(([toolName, tool]) => `
        <div class="tool-palette-item" draggable="true"
             ondragstart="dragTool(event, '${toolName}')"
             onclick="addToolToWorkflow('${toolName}')">
            <div class="tool-icon">${getCategoryIcon(tool.category)}</div>
            <div class="tool-info">
                <div class="tool-name">${toolName.replace(/_/g, ' ')}</div>
                <div class="tool-category">${tool.category}</div>
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
}

// Get category icon for tools
function getCategoryIcon(category) {
    const icons = {
        'rag': '📚',
        'weather': '🌤️',
        'vision': '👁️',
        'formatting': '📊',
        'workflow': '🔗',
        'search': '🔍',
        'travel': '✈️'
    };
    return icons[category] || '🔧';
}

// Add tool to workflow with validation and variable management
function addToolToWorkflow(toolName) {
    const canvas = document.getElementById('workflow-canvas');
    const placeholder = canvas.querySelector('.workflow-placeholder');

    if (placeholder) {
        placeholder.remove();
    }

    const stepNumber = currentWorkflowSteps.length + 1;
    const stepId = `workflow-step-${Date.now()}`;
    const tool = availableToolsForWorkflows[toolName];

    const stepElement = document.createElement('div');
    stepElement.className = 'workflow-step-item';
    stepElement.id = stepId;
    stepElement.innerHTML = `
        <div class="step-header" style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
            <div class="step-number" style="background: #667eea; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;">${stepNumber}</div>
            <div class="step-content" style="flex: 1;">
                <div class="step-tool-name" style="font-weight: 600; color: #1d1d1f;">${getCategoryIcon(tool?.category)} ${toolName.replace(/_/g, ' ')}</div>
                <div class="step-tool-description" style="font-size: 12px; color: #666;">${tool?.description || 'No description'}</div>
            </div>
            <button class="step-remove" onclick="removeWorkflowStep('${stepId}')" style="background: #dc3545; color: white; border: none; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 12px;">×</button>
        </div>
        <div class="step-variables" style="background: #f8f9fa; padding: 8px; border-radius: 4px; font-size: 12px; color: #666;">
            <strong>Input:</strong> ${getToolInputDescription(toolName, stepNumber)}
            <br><strong>Output:</strong> ${getToolOutputDescription(toolName)}
        </div>
        ${stepNumber < 10 ? '<div class="step-arrow" style="text-align: center; color: #667eea; font-size: 18px; margin: 4px 0;">↓</div>' : ''}
    `;

    canvas.appendChild(stepElement);

    currentWorkflowSteps.push({
        id: stepId,
        toolName: toolName,
        order: stepNumber,
        tool: tool
    });

    // Update variable configuration and validation
    updateWorkflowVariablesConfig();
    validateWorkflow();
}

// Get tool input description based on position in workflow
function getToolInputDescription(toolName, stepNumber) {
    if (stepNumber === 1) {
        return "User's voice query";
    }

    const previousStep = currentWorkflowSteps[stepNumber - 2];
    if (!previousStep) return "Unknown";

    const inputMappings = {
        'search_documents': 'Text query or keywords',
        'format_table': 'Raw data from previous step',
        'get_weather': 'Location from query or previous step',
        'analyze_image': 'Image data or URL',
        'unified_flight_search': 'Travel details from query'
    };

    return inputMappings[toolName] || `Output from ${previousStep.toolName}`;
}

// Get tool output description
function getToolOutputDescription(toolName) {
    const outputMappings = {
        'search_documents': 'Raw document text and search results',
        'format_table': 'Clean markdown table',
        'get_weather': 'Weather information (temperature, conditions, forecast)',
        'analyze_image': 'Image analysis and description',
        'unified_flight_search': 'Flight options and booking information',
        'list_documents': 'List of available documents',
        'get_document': 'Full document content'
    };

    return outputMappings[toolName] || 'Tool execution result';
}

// Update variable configuration based on current workflow
function updateWorkflowVariablesConfig() {
    const container = document.getElementById('workflow-variables-config');
    if (!container) return;

    if (currentWorkflowSteps.length === 0) {
        container.innerHTML = '<div style="color: #666; font-style: italic;">Add tools to see variable configuration options</div>';
        return;
    }

    const html = currentWorkflowSteps.map((step, index) => {
        const isFirst = index === 0;
        const isLast = index === currentWorkflowSteps.length - 1;

        return `
            <div class="variable-step" style="border: 1px solid #e5e7eb; border-radius: 4px; padding: 12px; margin-bottom: 8px;">
                <div style="font-weight: 600; margin-bottom: 4px;">${step.order}. ${step.toolName.replace(/_/g, ' ')}</div>
                <div style="font-size: 12px; color: #666;">
                    ${isFirst ?
                        '📥 <strong>Input:</strong> User voice query (automatic)' :
                        `📥 <strong>Input:</strong> Result from step ${step.order - 1}`
                    }
                    <br>📤 <strong>Output:</strong> ${getToolOutputDescription(step.toolName)}
                    ${!isLast ? '<br>🔗 <strong>Flows to:</strong> Next step automatically' : '<br>✅ <strong>Final Result:</strong> Returned to user'}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// Validate workflow configuration
function validateWorkflow() {
    const validationContainer = document.getElementById('workflow-validation');
    if (!validationContainer) return;

    const errors = [];
    const warnings = [];

    // Check for empty workflow
    if (currentWorkflowSteps.length === 0) {
        validationContainer.style.display = 'none';
        return;
    }

    // Check for logical workflow patterns
    const firstTool = currentWorkflowSteps[0]?.toolName;
    const lastTool = currentWorkflowSteps[currentWorkflowSteps.length - 1]?.toolName;

    // Validate first tool is appropriate
    const goodFirstTools = ['search_documents', 'list_documents', 'get_weather', 'unified_flight_search'];
    if (firstTool && !goodFirstTools.includes(firstTool)) {
        warnings.push(`⚠️ "${firstTool}" might not be ideal as first step. Consider starting with search_documents or get_weather.`);
    }

    // Check for format_table without data source
    const hasFormatTable = currentWorkflowSteps.some(s => s.toolName === 'format_table');
    const hasDataSource = currentWorkflowSteps.some(s => ['search_documents', 'get_document'].includes(s.toolName));

    if (hasFormatTable && !hasDataSource) {
        errors.push('❌ format_table requires data input. Add search_documents or get_document first.');
    }

    // Check for analyze_image without image source
    const hasAnalyzeImage = currentWorkflowSteps.some(s => s.toolName === 'analyze_image');
    if (hasAnalyzeImage) {
        warnings.push('⚠️ analyze_image needs image input. Ensure previous steps provide image data.');
    }

    // Display validation results
    if (errors.length === 0 && warnings.length === 0) {
        validationContainer.innerHTML = '<div style="color: #28a745;">✅ Workflow looks good!</div>';
        validationContainer.style.background = '#d4edda';
        validationContainer.style.border = '1px solid #c3e6cb';
    } else {
        const messages = [...errors, ...warnings];
        validationContainer.innerHTML = messages.join('<br>');
        validationContainer.style.background = errors.length > 0 ? '#f8d7da' : '#fff3cd';
        validationContainer.style.border = errors.length > 0 ? '1px solid #f5c6cb' : '1px solid #ffeaa7';
    }

    validationContainer.style.display = 'block';
}

// Remove workflow step
function removeWorkflowStep(stepId) {
    const stepElement = document.getElementById(stepId);
    if (stepElement) {
        stepElement.remove();
        currentWorkflowSteps = currentWorkflowSteps.filter(s => s.id !== stepId);
        renumberWorkflowSteps();
    }
}

// Renumber workflow steps
function renumberWorkflowSteps() {
    const canvas = document.getElementById('workflow-canvas');
    const steps = canvas.querySelectorAll('.workflow-step-item');

    steps.forEach((step, index) => {
        const numberEl = step.querySelector('.step-number');
        if (numberEl) {
            numberEl.textContent = index + 1;
        }

        // Only update if the array element exists
        if (currentWorkflowSteps[index]) {
            currentWorkflowSteps[index].order = index + 1;
        }
    });

    // Clean up array to match DOM
    currentWorkflowSteps = currentWorkflowSteps.slice(0, steps.length);
}

// Save LangGraph workflow (create or update)
async function saveLangGraphWorkflow(event) {
    event.preventDefault();

    console.log('=== SAVE WORKFLOW DEBUG ===');
    console.log('editingWorkflowId at start:', window.editingWorkflowId);

    const workflowData = {
        name: document.getElementById('workflow-name').value,
        description: document.getElementById('workflow-description').value,
        triggers: document.getElementById('workflow-triggers').value.split(',').map(t => t.trim()).filter(t => t),
        steps: currentWorkflowSteps.map(s => s.toolName),
        enabled: true,
        type: 'langgraph'
    };

    console.log('Workflow data to save:', workflowData);

    // Validate workflow
    if (!workflowData.name) {
        showAlert('Please enter a workflow name', 'error');
        return;
    }

    if (workflowData.steps.length === 0) {
        showAlert('Please add at least one tool to the workflow', 'error');
        return;
    }

    try {
        const isEditing = !!window.editingWorkflowId;
        const editingId = window.editingWorkflowId;

        console.log('=== SAVE MODE DETECTION ===');
        console.log('isEditing:', isEditing);
        console.log('editingWorkflowId:', editingId);

        const url = isEditing ? `/api/workflows/${editingId}` : '/api/workflows';
        const method = isEditing ? 'PUT' : 'POST';

        console.log(`Saving workflow via ${method} to ${url}`);

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(workflowData)
        });

        console.log('Save response status:', response.status, response.ok);

        if (response.ok) {
            const savedWorkflow = await response.json();

            if (isEditing) {
                // Update existing workflow in array
                const index = langGraphWorkflows.findIndex(w => w.id === window.editingWorkflowId);
                if (index >= 0) {
                    langGraphWorkflows[index] = savedWorkflow.workflow;
                }
                showAlert('Workflow updated successfully!', 'success');
            } else {
                // Add new workflow to array
                langGraphWorkflows.push(savedWorkflow.workflow);
                showAlert('LangGraph workflow created successfully!', 'success');
            }

            renderLangGraphWorkflowsList();
            updateWorkflowStats();
            closeLangGraphWorkflowBuilder();

            // Clear editing state
            delete window.editingWorkflowId;

        } else {
            const error = await response.json();
            showAlert(`Failed to save workflow: ${error.message}`, 'error');
        }
    } catch (error) {
        console.error('Error saving workflow:', error);
        showAlert('Error saving workflow', 'error');
    }
}

// Test current workflow being built (in modal)
async function testCurrentWorkflow() {
    if (currentWorkflowSteps.length === 0) {
        showAlert('Please add some tools to the workflow first', 'error');
        return;
    }

    const workflowData = {
        name: document.getElementById('workflow-name').value || 'Test Workflow',
        steps: currentWorkflowSteps.map(s => s.toolName)
    };

    try {
        showAlert('Testing workflow...', 'info');

        // Test workflow by creating temporary workflow and testing it
        const tempWorkflow = {
            ...workflowData,
            id: `temp_${Date.now()}`,
            enabled: true,
            type: 'langgraph',
            createdAt: new Date().toISOString()
        };

        // Create temporary workflow
        const createResponse = await fetch('/api/workflows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tempWorkflow)
        });

        if (!createResponse.ok) {
            throw new Error('Failed to create temporary workflow for testing');
        }

        const createdWorkflow = await createResponse.json();
        const tempId = createdWorkflow.workflow.id;

        // Test the workflow
        const response = await fetch(`/api/workflows/${tempId}/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'test workflow execution' })
        });

        // Clean up temporary workflow
        await fetch(`/api/workflows/${tempId}`, { method: 'DELETE' });

        if (response.ok) {
            const result = await response.json();
            showAlert(`Workflow test ${result.success ? 'passed' : 'failed'}`, result.success ? 'success' : 'error');
        } else {
            showAlert('Workflow test failed', 'error');
        }
    } catch (error) {
        console.error('Error testing workflow:', error);
        showAlert('Error testing workflow', 'error');
    }
}

// Test saved LangGraph workflow
async function testLangGraphWorkflow(workflowId) {
    const workflow = langGraphWorkflows.find(w => w.id === workflowId);
    if (!workflow) {
        showAlert('Workflow not found', 'error');
        return;
    }

    // Check if workflow has steps
    if (!workflow.steps || workflow.steps.length === 0) {
        showAlert('Cannot test empty workflow. Please edit and add steps first.', 'error');
        return;
    }

    try {
        console.log('Testing workflow ID:', workflowId);
        showAlert('Testing workflow...', 'info');

        const response = await fetch(`/api/workflows/${workflowId}/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'show me the table from the document' })
        });

        console.log('Test response status:', response.status, response.ok);

        if (response.ok) {
            const result = await response.json();
            console.log('Full workflow test response:', result);

            if (result.success) {
                console.log('✅ WORKFLOW TEST PASSED!');
                console.log('Workflow execution result:', result.result);

                // Show alert with fallback
                try {
                    showAlert('✅ Workflow test passed! Created perfect table.', 'success');
                } catch (alertError) {
                    alert('✅ Workflow test passed! Created perfect table.');
                }

                // Show additional details if available
                if (result.result && result.result.format_tableResult && result.result.format_tableResult.message) {
                    console.log('Generated table:', result.result.format_tableResult.message);
                }
            } else {
                console.log('❌ WORKFLOW TEST FAILED:', result);
                try {
                    showAlert(`❌ Workflow test failed: ${result.message || result.error || 'Unknown error'}`, 'error');
                } catch (alertError) {
                    alert(`❌ Workflow test failed: ${result.message || result.error || 'Unknown error'}`);
                }
                console.error('Workflow test error details:', result);
            }
        } else {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorData.error || errorMessage;
            } catch (e) {
                // Response might not be JSON
            }
            showAlert(`❌ Workflow test failed: ${errorMessage}`, 'error');
        }
    } catch (error) {
        console.error('Error testing workflow:', error);
        showAlert('❌ Error testing workflow: ' + error.message, 'error');
    }
}

// Toggle workflow enabled/disabled
async function toggleLangGraphWorkflow(workflowId, enabled) {
    try {
        const response = await fetch(`/api/workflows/${workflowId}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });

        if (response.ok) {
            const workflow = langGraphWorkflows.find(w => w.id === workflowId);
            if (workflow) {
                workflow.enabled = enabled;
                renderLangGraphWorkflowsList();
                updateWorkflowStats();
            }
            showAlert(`Workflow ${enabled ? 'enabled' : 'disabled'}`, 'success');
        } else {
            showAlert(`Failed to ${enabled ? 'enable' : 'disable'} workflow`, 'error');
        }
    } catch (error) {
        console.error('Error toggling workflow:', error);
        showAlert('Error updating workflow', 'error');
    }
}

// Delete LangGraph workflow
async function deleteLangGraphWorkflow(workflowId) {
    if (!confirm('Are you sure you want to delete this workflow?')) return;

    try {
        const response = await fetch(`/api/workflows/${workflowId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            langGraphWorkflows = langGraphWorkflows.filter(w => w.id !== workflowId);
            renderLangGraphWorkflowsList();
            updateWorkflowStats();
            showAlert('Workflow deleted successfully', 'success');
        } else {
            showAlert('Failed to delete workflow', 'error');
        }
    } catch (error) {
        console.error('Error deleting workflow:', error);
        showAlert('Error deleting workflow', 'error');
    }
}

// Create workflow from template
function createFromTemplate(templateType) {
    const templates = {
        'table-recreation': {
            name: 'Table Recreation Workflow',
            description: 'Automatically search documents and format tables for clean presentation',
            triggers: ['recreate table', 'show me the table', 'format this data'],
            steps: ['search_documents', 'format_table']
        },
        'research-summary': {
            name: 'Research Summary Workflow',
            description: 'Search multiple documents and create comprehensive summaries',
            triggers: ['summarize research', 'create summary', 'research overview'],
            steps: ['search_documents', 'format_table']
        },
        'travel-planner': {
            name: 'Travel Planning Workflow',
            description: 'Get weather, search flights, and find hotels automatically',
            triggers: ['plan my trip', 'travel planning', 'book travel'],
            steps: ['get_weather', 'unified_flight_search']
        }
    };

    const template = templates[templateType];
    if (!template) return;

    // Pre-fill form with template data
    createNewLangGraphWorkflow();
    document.getElementById('workflow-name').value = template.name;
    document.getElementById('workflow-description').value = template.description;
    document.getElementById('workflow-triggers').value = template.triggers.join(', ');

    // Add template steps to workflow
    template.steps.forEach(toolName => {
        if (availableToolsForWorkflows[toolName]) {
            addToolToWorkflow(toolName);
        }
    });
}

// Update workflow statistics
function updateWorkflowStats() {
    const totalWorkflows = langGraphWorkflows.length;
    const activeWorkflows = langGraphWorkflows.filter(w => w.enabled).length;

    const totalEl = document.getElementById('total-workflows');
    const activeEl = document.getElementById('active-workflows');

    if (totalEl) totalEl.textContent = totalWorkflows;
    if (activeEl) activeEl.textContent = activeWorkflows;
}

// Drag and drop functions for workflow builder
function dragTool(event, toolName) {
    console.log('Dragging tool:', toolName);
    event.dataTransfer.setData('text/plain', toolName);
    event.dataTransfer.effectAllowed = 'copy';
}

// Enable drop zone for workflow canvas
function enableWorkflowDropZone() {
    const canvas = document.getElementById('workflow-canvas');
    if (!canvas) return;

    canvas.addEventListener('dragover', function(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        canvas.classList.add('drag-over');
    });

    canvas.addEventListener('dragleave', function(event) {
        canvas.classList.remove('drag-over');
    });

    canvas.addEventListener('drop', function(event) {
        event.preventDefault();
        canvas.classList.remove('drag-over');

        const toolName = event.dataTransfer.getData('text/plain');
        if (toolName) {
            addToolToWorkflow(toolName);
        }
    });
}

// Load workflows when switching to workflows section
function loadWorkflowsSection() {
    console.log('Loading workflows section...');
    loadLangGraphWorkflows();
    enableWorkflowDropZone();
}

// Toggle Advanced RAG Settings function
window.toggleAdvancedRagSettings = function() {
    const advancedSection = document.getElementById('advancedRagSettings');
    const toggleBtn = document.getElementById('toggleAdvancedRag');

    if (!advancedSection) return;

    // Toggle visibility
    if (advancedSection.style.display === 'none' || !advancedSection.style.display) {
        advancedSection.style.display = 'block';
        if (toggleBtn) {
            toggleBtn.innerHTML = '<span style="margin-right: 8px;">⚙️</span><span>Hide Advanced Settings</span>';
        }
    } else {
        advancedSection.style.display = 'none';
        if (toggleBtn) {
            toggleBtn.innerHTML = '<span style="margin-right: 8px;">⚙️</span><span>Show Advanced Settings</span>';
        }
    }
};