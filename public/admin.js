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
        this.connectToServer();
        this.initializeTabs();
        this.initializeDragAndDrop();
        this.loadStoredConfigurations();
        this.startAnalyticsPolling();
    }
    
    connectToServer() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:${window.location.port || '3000'}/ws`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('Connected to admin server');
            this.loadConfigurations();
        };
        
        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleServerMessage(message);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
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
        canvas.addEventListener('dragover', this.handleDragOver.bind(this));
        canvas.addEventListener('drop', this.handleDrop.bind(this));
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
    
    loadStoredConfigurations() {
        // Load from localStorage for persistence
        const stored = localStorage.getItem('voicebot_workflows');
        if (stored) {
            const workflows = JSON.parse(stored);
            workflows.forEach(wf => this.workflows.set(wf.id, wf));
        }
    }
    
    loadConfigurations() {
        // Request configurations from server
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ 
                type: 'get_configurations' 
            }));
        }
        // Also load API endpoints
        if (typeof loadApiEndpoints === 'function') {
            loadApiEndpoints();
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
document.head.appendChild(style);