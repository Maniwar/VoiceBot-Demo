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
        if (typeof loadApiAndToolsData === 'function') {
            await loadApiAndToolsData();
        }
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
                    if (document.getElementById('openaiOrg')) document.getElementById('openaiOrg').value = apis.openai.organizationId || '';
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

                if (apis.openweather) {
                    if (document.getElementById('weatherKey')) {
                        document.getElementById('weatherKey').value = apis.openweather.apiKey ? '••••••••••••••••' : '';
                        document.getElementById('weatherKey').placeholder = apis.openweather.apiKey ? 'API Key Configured' : 'Enter Weather API Key';
                    }
                    if (document.getElementById('weatherUnits')) document.getElementById('weatherUnits').value = apis.openweather.units || 'metric';
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
}

// Initialize admin dashboard
const admin = new AdminDashboard();

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

// Fix 2: Enhanced Tools Display Function
async function loadApiAndTools() {
    const loadingElement = document.getElementById('api-tools-loading');
    const servicesContainer = document.getElementById('api-services-container');

    try {
        console.log('Loading API and Tools data...');

        // Ensure loading spinner is visible
        if (loadingElement) {
            loadingElement.style.display = 'block';
        }
        if (servicesContainer) {
            servicesContainer.style.display = 'none';
        }

        // Load API keys status
        const apiResponse = await fetch('/api/apikeys/status');
        if (!apiResponse.ok) {
            throw new Error(`API keys endpoint failed: ${apiResponse.status}`);
        }
        const apiData = await apiResponse.json();

        // Load comprehensive tools data
        const toolsResponse = await fetch('/api/tools/comprehensive');
        if (!toolsResponse.ok) {
            throw new Error(`Tools endpoint failed: ${toolsResponse.status}`);
        }
        const toolsData = await toolsResponse.json();

        console.log('Tools data loaded:', toolsData);

        // Render services in the new unified API & Tools section
        if (toolsData.success && toolsData.config) {
            renderUnifiedServices(apiData, toolsData);
        } else {
            // Handle API success but no config data
            console.warn('Tools API succeeded but no config data found');
            showApiToolsError('No tool configuration data available');
        }

        // Also populate the old tools list for backward compatibility
        updateToolsList(toolsData);

        // Ensure loading spinner is hidden on success
        hideApiToolsLoading();

    } catch (error) {
        console.error('Error loading API and Tools:', error);
        showApiToolsError(error.message || 'Failed to load API and tools configuration');
        hideApiToolsLoading();
    }
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

// Fix 7: Update Tools List for Legacy Support
function updateToolsList(toolsData) {
    const toolsListElement = document.getElementById('tools-list');
    if (toolsListElement && toolsData.success) {
        const tools = toolsData.config.toolsWithInstructions.tools;
        const toolsHTML = Object.entries(tools).map(([toolName, tool]) => `
            <div class="tool-item enhanced">
                <div class="tool-info">
                    <div class="tool-name">${toolName.replace(/_/g, ' ')}</div>
                    <div class="tool-description">${tool.description}</div>
                </div>
                <div class="tool-controls">
                    <button class="tool-edit-btn" onclick="editToolInstructions('${toolName}')">
                        📝 Instructions
                    </button>
                    <label style="margin-left: 12px;">
                        <input type="checkbox" ${tool.enabled ? 'checked' : ''}
                               onchange="toggleTool('${toolName}', this.checked)">
                        <span style="margin-left: 4px; font-size: 14px;">${tool.enabled ? 'Enabled' : 'Disabled'}</span>
                    </label>
                </div>
            </div>
        `).join('');

        toolsListElement.innerHTML = toolsHTML;
    }
}

// Add form submit handlers
document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin panel initializing...');

    // Auto-refresh document status every 30 seconds
    if (typeof refreshDocumentStatus === 'function') {
        refreshDocumentStatus();
        setInterval(refreshDocumentStatus, 30000);
    }

    // Load API and tools data
    if (typeof loadApiAndTools === 'function') {
        loadApiAndTools();

        // Safety timeout: hide loading spinner after 10 seconds regardless
        setTimeout(() => {
            const loadingElement = document.getElementById('api-tools-loading');
            if (loadingElement && loadingElement.style.display !== 'none') {
                console.warn('Loading spinner still visible after 10 seconds, forcing hide');
                hideApiToolsLoading();
                showApiToolsError('Loading timed out. Please refresh the page or check your connection.');
            }
        }, 10000);
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
    /* Force visibility for advanced panels */
    #advancedRagSettings {
        transition: all 0.3s ease !important;
        overflow: visible !important;
        max-height: none !important;
        opacity: 1 !important;
    }

    #advancedRagSettings[style*="display: block"] {
        display: block !important;
        visibility: visible !important;
        height: auto !important;
    }

    /* Ensure toggle button is clickable */
    #toggleAdvancedRag {
        pointer-events: auto !important;
        cursor: pointer !important;
        z-index: 100 !important;
        position: relative !important;
    }

    /* Make sure modal dialogs appear above everything */
    .modal {
        z-index: 10000 !important;
    }

    /* Fix any overflow issues that might hide content */
    .admin-container,
    .content,
    .section {
        overflow: visible !important;
    }

    .section.active {
        overflow-y: auto !important;
    }

    .service-content {
        overflow: visible !important;
    }

    /* Ensure service groups can expand */
    .service-group {
        overflow: visible !important;
        height: auto !important;
    }

    /* Fix tool items visibility */
    .tool-item.enhanced {
        display: flex !important;
        visibility: visible !important;
    }

    /* Ensure buttons work */
    button,
    .button,
    .tool-edit-btn {
        pointer-events: auto !important;
        cursor: pointer !important;
    }

    /* Make sure instruction editing modal is visible */
    div[style*="position: fixed"] {
        z-index: 10001 !important;
    }
`;
document.head.appendChild(advancedPanelCSS);
document.head.appendChild(style);

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