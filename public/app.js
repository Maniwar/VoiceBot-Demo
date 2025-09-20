// VoiceBot RAG Demo - Client Application
class VoiceBotClient {
    constructor() {
        this.ws = null;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.audioQueue = [];
        this.isRecording = false;
        this.isConnected = false;
        this.knowledgeBase = new Map();
        this.audioChunks = [];
        
        // API orchestration tracking
        this.activeWorkflows = [];
        this.apiCallHistory = [];
        
        this.initializeElements();
        this.initializeEventListeners();
        this.initializeVisualizer();
        this.connectToServer();
    }
    
    initializeElements() {
        this.elements = {
            statusDot: document.getElementById('statusDot'),
            statusText: document.getElementById('statusText'),
            uploadArea: document.getElementById('uploadArea'),
            fileInput: document.getElementById('fileInput'),
            fileList: document.getElementById('fileList'),
            transcriptArea: document.getElementById('transcriptArea'),
            recordButton: document.getElementById('recordButton'),
            visualizer: document.getElementById('visualizer'),
            docCount: document.getElementById('docCount'),
            chunkCount: document.getElementById('chunkCount'),
            errorModal: document.getElementById('errorModal'),
            errorMessage: document.getElementById('errorMessage')
        };
        
        // Fix NaN issue on page load
        if (this.elements.chunkCount && this.elements.chunkCount.textContent === 'NaN') {
            this.elements.chunkCount.textContent = '0';
        }
    }
    
    initializeEventListeners() {
        // File upload
        this.elements.uploadArea.addEventListener('click', () => {
            this.elements.fileInput.click();
        });
        
        this.elements.fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
        });
        
        // Drag and drop
        this.elements.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.uploadArea.classList.add('dragover');
        });
        
        this.elements.uploadArea.addEventListener('dragleave', () => {
            this.elements.uploadArea.classList.remove('dragover');
        });
        
        this.elements.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.uploadArea.classList.remove('dragover');
            this.handleFileUpload(e.dataTransfer.files);
        });
        
        // Voice recording
        this.elements.recordButton.addEventListener('click', () => {
            this.toggleRecording();
        });
        
        // Keyboard shortcut for recording (spacebar)
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                if (!this.isRecording) {
                    this.startRecording();
                }
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                if (this.isRecording) {
                    this.stopRecording();
                }
            }
        });
    }
    
    initializeVisualizer() {
        // Create visualizer bars
        for (let i = 0; i < 20; i++) {
            const bar = document.createElement('div');
            bar.className = 'visualizer-bar';
            bar.style.height = '5px';
            this.elements.visualizer.appendChild(bar);
        }
        
        // Animate bars
        this.animateVisualizer();
    }
    
    animateVisualizer() {
        const bars = this.elements.visualizer.querySelectorAll('.visualizer-bar');
        
        setInterval(() => {
            if (this.isRecording || this.audioQueue.length > 0) {
                bars.forEach(bar => {
                    const height = Math.random() * 40 + 5;
                    bar.style.height = `${height}px`;
                });
            } else {
                bars.forEach(bar => {
                    bar.style.height = '5px';
                });
            }
        }, 100);
    }
    
    async connectToServer() {
        try {
            // Connect to backend WebSocket proxy on same port as HTTP server
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.hostname}:${window.location.port || '3000'}/ws`;
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                this.isConnected = true;
                this.updateStatus('Connected', true);
                console.log('WebSocket connected successfully');
                
                // Request demo functions
                this.sendMessage({
                    type: 'get_demo_functions'
                });
            };
            
            this.ws.onmessage = (event) => {
                this.handleServerMessage(JSON.parse(event.data));
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                // Don't show error modal for reconnection attempts
            };
            
            this.ws.onclose = (event) => {
                console.log('WebSocket disconnected:', event.code, event.reason);
                this.isConnected = false;
                this.updateStatus('Disconnected', false);
                // Only reconnect if not a deliberate close
                if (event.code !== 1000 && event.code !== 1001 && !this.reconnectAttempt) {
                    this.reconnectAttempt = true;
                    setTimeout(() => {
                        this.reconnectAttempt = false;
                        if (!this.isConnected) {
                            this.connectToServer();
                        }
                    }, 3000);
                }
            };
            
        } catch (error) {
            console.error('Failed to connect:', error);
            this.showError('Failed to connect to server');
        }
    }
    
    getAvailableFunctions() {
        // Define available functions for API orchestration
        return [
            {
                name: 'searchDatabase',
                description: 'Search customer database for information',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Search query' },
                        filters: { type: 'object', description: 'Optional filters' }
                    },
                    required: ['query']
                }
            },
            {
                name: 'createTicket',
                description: 'Create a support ticket in the system',
                parameters: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'Ticket title' },
                        description: { type: 'string', description: 'Issue description' },
                        priority: { type: 'string', enum: ['low', 'medium', 'high'] }
                    },
                    required: ['title', 'description']
                }
            },
            {
                name: 'scheduleAppointment',
                description: 'Schedule an appointment or callback',
                parameters: {
                    type: 'object',
                    properties: {
                        date: { type: 'string', description: 'Appointment date' },
                        time: { type: 'string', description: 'Appointment time' },
                        duration: { type: 'integer', description: 'Duration in minutes' },
                        type: { type: 'string', enum: ['phone', 'video', 'in-person'] }
                    },
                    required: ['date', 'time']
                }
            },
            {
                name: 'getOrderStatus',
                description: 'Check the status of an order',
                parameters: {
                    type: 'object',
                    properties: {
                        orderId: { type: 'string', description: 'Order ID' }
                    },
                    required: ['orderId']
                }
            },
            {
                name: 'processPayment',
                description: 'Process a payment transaction',
                parameters: {
                    type: 'object',
                    properties: {
                        amount: { type: 'number', description: 'Payment amount' },
                        method: { type: 'string', enum: ['credit', 'debit', 'bank'] },
                        reference: { type: 'string', description: 'Payment reference' }
                    },
                    required: ['amount', 'method']
                }
            }
        ];
    }
    
    handleServerMessage(message) {
        // Only log important messages, not audio/transcript deltas
        if (!message.type.includes('.delta') && !message.type.includes('audio.response')) {
            console.log('Server message:', message.type);
        }
        
        switch (message.type) {
            case 'connected':
                this.addTranscript('🎙️ Connected to OpenAI Realtime API! You can speak or type. Try: "What\'s the weather in Paris?" or "Tell me a joke"', 'system');
                break;
                
            case 'connection_established':
                this.addTranscript('🤖 Connected! Available demos: weather, jokes, facts, quotes. Try saying "tell me a joke" or "what\'s the weather in London"', 'system');
                if (message.workflows) {
                    console.log('Available workflows:', message.workflows);
                }
                break;
                
            case 'workflow_result':
                if (message.result.success) {
                    this.addTranscript(message.result.result, 'assistant');
                } else {
                    this.addTranscript('Error: ' + message.result.error, 'system');
                }
                break;
                
            case 'chat_response':
                this.addTranscript(message.message, 'assistant');
                break;
                
            case 'search_results':
                if (message.results && message.results.length > 0) {
                    this.addTranscript(`Found ${message.results.length} results: ${message.results[0].excerpt}`, 'assistant');
                } else {
                    this.addTranscript('No results found in knowledge base', 'assistant');
                }
                break;
                
            case 'demo_functions':
                console.log('Demo functions available:', message.functions);
                break;
                
            case 'function_call':
                this.addTranscript(`🔧 Calling API: ${message.function}`, 'system');
                if (message.result) {
                    console.log('Function result:', message.result);
                }
                break;
                
            case 'response.text.delta':
                // OpenAI text response
                if (!this.currentResponse) this.currentResponse = '';
                this.currentResponse += message.delta || '';
                // Update last assistant message
                const messages = this.elements.transcriptArea.querySelectorAll('.message.assistant');
                if (messages.length > 0 && this.isStreamingResponse) {
                    messages[messages.length - 1].lastElementChild.textContent = this.currentResponse;
                } else {
                    this.addTranscript(this.currentResponse, 'assistant');
                    this.isStreamingResponse = true;
                }
                break;
                
            case 'response.done':
                this.currentResponse = '';
                this.isStreamingResponse = false;
                break;
                
            case 'response.audio.delta':
                // OpenAI audio response - collect audio chunks
                if (message.delta) {
                    // Initialize if needed
                    if (!this.audioResponseChunks) {
                        this.audioResponseChunks = [];
                    }
                    // Check if we should be collecting audio (not interrupted)
                    if (!this.isInterrupted) {
                        this.audioResponseChunks.push(message.delta);
                    }
                }
                break;
                
            case 'response.audio.done':
                // Play collected audio - but first stop any existing audio
                console.log('Audio response complete, chunks:', this.audioResponseChunks?.length);
                if (this.audioResponseChunks && this.audioResponseChunks.length > 0) {
                    // Stop any currently playing audio to prevent overlap
                    this.stopAllAudio();
                    // Small delay to ensure clean transition
                    setTimeout(() => {
                        this.playAudioResponse(this.audioResponseChunks);
                        this.audioResponseChunks = [];
                    }, 50);
                }
                break;
                
            case 'response.audio_transcript.delta':
                // Show transcript of AI's speech
                // Transcript delta received - accumulating text
                if (message.delta) {
                    if (!this.currentTranscript) {
                        this.currentTranscript = '';
                        this.currentTranscriptMessageId = 'transcript-' + Date.now();
                    }
                    this.currentTranscript += message.delta;
                    this.updateStreamingTranscript(this.currentTranscript, 'assistant');
                }
                break;
                
            case 'response.audio_transcript.done':
                // Finalize transcript
                console.log('Transcript complete:', this.currentTranscript);
                if (this.currentTranscript) {
                    this.finalizeStreamingTranscript(this.currentTranscript, 'assistant');
                    this.currentTranscript = '';
                    this.currentTranscriptMessageId = null;
                }
                break;
                
            case 'speech_started':
                console.log('User started speaking - interrupting assistant');
                // Mark as interrupted to prevent new audio from playing
                this.isInterrupted = true;
                // Stop any ongoing audio playback immediately
                this.stopAllAudio();
                // Clear any pending audio
                this.audioResponseChunks = [];
                this.addTranscript('🎤 Listening...', 'system');
                break;
                
            case 'response_interrupted':
                console.log('Assistant response interrupted');
                // Mark as interrupted
                this.isInterrupted = true;
                // Clear any pending audio
                this.stopAllAudio();
                this.audioResponseChunks = [];
                this.currentResponse = '';
                this.isStreamingResponse = false;
                // Reset interrupted flag after a delay
                setTimeout(() => {
                    this.isInterrupted = false;
                }, 500);
                break;
                
            case 'input_audio_buffer.speech_started':
                console.log('Speech detected');
                this.addTranscript('🎤 Listening...', 'system');
                break;
                
            case 'input_audio_buffer.speech_stopped':
                console.log('Speech stopped');
                this.addTranscript('⏸️ Processing...', 'system');
                break;
                
            // Removed duplicate - handled above
            
            case 'conversation.item.input_audio_transcription.completed':
                // User's speech transcription
                this.addTranscript(message.transcript || '', 'user');
                break;
                
            case 'transcription':
                // Handle both user and assistant transcriptions
                if (message.role === 'user' && message.text) {
                    this.addTranscript(message.text, 'user');
                    
                    // Visual feedback that we heard the user
                    const indicator = document.getElementById('listeningIndicator');
                    if (!indicator) {
                        const newIndicator = document.createElement('div');
                        newIndicator.id = 'listeningIndicator';
                        newIndicator.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #4CAF50; color: white; padding: 10px 20px; border-radius: 20px; display: none;';
                        newIndicator.textContent = '👂 Heard you!';
                        document.body.appendChild(newIndicator);
                    }
                    const listeningIndicator = document.getElementById('listeningIndicator');
                    listeningIndicator.style.display = 'block';
                    setTimeout(() => {
                        listeningIndicator.style.display = 'none';
                    }, 2000);
                } else if (message.role === 'assistant' && message.text) {
                    // Handle assistant transcription deltas
                    if (!this.assistantTranscriptMessageId) {
                        this.assistantTranscriptMessageId = 'assistant-' + Date.now();
                        this.assistantTranscriptText = '';
                    }
                    this.assistantTranscriptText += message.text;
                    this.updateStreamingTranscript(this.assistantTranscriptText, 'assistant');
                    this.currentTranscriptMessageId = this.assistantTranscriptMessageId;
                }
                break;
            
            case 'transcription.complete':
                // Finalize assistant transcription
                if (this.assistantTranscriptText) {
                    this.finalizeStreamingTranscript(this.assistantTranscriptText, 'assistant');
                    this.assistantTranscriptText = '';
                    this.assistantTranscriptMessageId = null;
                    this.currentTranscriptMessageId = null;
                }
                break;
                
            case 'transcription.partial':
                // Show partial transcription in real-time
                if (message.role === 'user') {
                    this.updatePartialTranscript(message.text, message.role);
                }
                // Assistant partials are handled by 'transcription' case
                break;
                
            case 'audio.response':
                this.playAudio(message.audio);
                break;
                
            case 'text.response':
                this.addTranscript(message.text, 'assistant');
                break;
                
            case 'function.calling':
                this.handleFunctionCall(message);
                break;
                
            case 'function.result':
                this.handleFunctionResult(message);
                break;
                
            case 'workflow.started':
                this.handleWorkflowStart(message);
                break;
                
            case 'workflow.completed':
                this.handleWorkflowComplete(message);
                break;
                
            case 'rag.search':
                this.addTranscript(`🔍 Searching knowledge base: "${message.query}"`, 'system');
                break;
                
            case 'rag.results':
                this.addTranscript(`📚 Found ${message.count} relevant documents`, 'system');
                break;
                
            case 'error':
                console.error('Server error:', message);
                // Only show user-facing errors, not internal ones
                if (message.error && !message.internal) {
                    this.showError(message.error);
                }
                break;
        }
    }
    
    handleFunctionCall(message) {
        // Display function call in UI
        const functionDisplay = document.createElement('div');
        functionDisplay.className = 'message system';
        functionDisplay.innerHTML = `
            <div class="message-label">API Call</div>
            <div style="background: #fff3cd; padding: 10px; border-radius: 5px; border-left: 4px solid #ffc107;">
                <strong>🔧 ${message.function}</strong><br>
                <small style="color: #666;">Parameters: ${JSON.stringify(message.parameters, null, 2)}</small>
            </div>
        `;
        this.elements.transcriptArea.appendChild(functionDisplay);
        this.scrollToBottom();
        
        // Track API call
        this.apiCallHistory.push({
            function: message.function,
            parameters: message.parameters,
            timestamp: new Date(),
            status: 'pending'
        });
        
        // Simulate API execution (in production, this would call real APIs)
        this.executeFunction(message.function, message.parameters);
    }
    
    handleFunctionResult(message) {
        // Check if this is a Google search result with images
        if (message.function === 'call_external_api' && 
            message.result && 
            message.result.response && 
            message.result.response.items && 
            message.result.response.searchType === 'image') {
            
            // Display image search results with clickable links
            const resultDisplay = document.createElement('div');
            resultDisplay.className = 'message system';
            
            const items = message.result.response.items;
            let imagesHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-top: 10px;">';
            
            items.forEach((item, index) => {
                if (index < 6) { // Show max 6 images
                    const imageUrl = item.pagemap?.cse_image?.[0]?.src || item.link;
                    const contextLink = item.image?.contextLink || item.link;
                    const title = item.title || 'Image';
                    
                    imagesHtml += `
                        <a href="${contextLink}" target="_blank" style="text-decoration: none; color: inherit;">
                            <div style="border: 1px solid #ddd; border-radius: 5px; overflow: hidden; cursor: pointer; transition: transform 0.2s;">
                                <img src="${imageUrl}" alt="${title}" style="width: 100%; height: 150px; object-fit: cover;" 
                                     onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22150%22 height=%22150%22%3E%3Crect width=%22150%22 height=%22150%22 fill=%22%23ddd%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22%3EImage%3C/text%3E%3C/svg%3E'">
                                <div style="padding: 5px; font-size: 11px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                    ${title}
                                </div>
                            </div>
                        </a>
                    `;
                }
            });
            
            imagesHtml += '</div>';
            
            resultDisplay.innerHTML = `
                <div class="message-label">Google Image Search Results</div>
                <div style="background: #d4edda; padding: 10px; border-radius: 5px; border-left: 4px solid #28a745;">
                    <strong>✅ Found ${items.length} images</strong>
                    ${imagesHtml}
                    <div style="margin-top: 10px; font-size: 12px; color: #666;">Click any image to view the source page</div>
                </div>
            `;
            this.elements.transcriptArea.appendChild(resultDisplay);
            this.scrollToBottom();
            
        } else {
            // Display regular function result
            const resultDisplay = document.createElement('div');
            resultDisplay.className = 'message system';
            resultDisplay.innerHTML = `
                <div class="message-label">API Result</div>
                <div style="background: #d4edda; padding: 10px; border-radius: 5px; border-left: 4px solid #28a745;">
                    <strong>✅ ${message.function} completed</strong><br>
                    <small style="color: #666;">Result: ${JSON.stringify(message.result, null, 2)}</small>
                </div>
            `;
            this.elements.transcriptArea.appendChild(resultDisplay);
            this.scrollToBottom();
        }
        
        // Update API call history
        const lastCall = this.apiCallHistory.find(call => 
            call.function === message.function && call.status === 'pending'
        );
        if (lastCall) {
            lastCall.status = 'completed';
            lastCall.result = message.result;
        }
    }
    
    handleWorkflowStart(message) {
        const workflowDisplay = document.createElement('div');
        workflowDisplay.className = 'message system';
        workflowDisplay.innerHTML = `
            <div class="message-label">Workflow Started</div>
            <div style="background: #cfe2ff; padding: 10px; border-radius: 5px; border-left: 4px solid #0d6efd;">
                <strong>🔄 ${message.workflow}</strong><br>
                <small>Steps: ${message.steps.join(' → ')}</small>
            </div>
        `;
        this.elements.transcriptArea.appendChild(workflowDisplay);
        this.scrollToBottom();
        
        this.activeWorkflows.push({
            id: message.workflowId,
            name: message.workflow,
            steps: message.steps,
            startTime: new Date()
        });
    }
    
    handleWorkflowComplete(message) {
        const workflowDisplay = document.createElement('div');
        workflowDisplay.className = 'message system';
        workflowDisplay.innerHTML = `
            <div class="message-label">Workflow Completed</div>
            <div style="background: #d1ecf1; padding: 10px; border-radius: 5px; border-left: 4px solid #0c5460;">
                <strong>✅ ${message.workflow} finished</strong><br>
                <small>Duration: ${message.duration}ms | Steps completed: ${message.completedSteps}</small>
            </div>
        `;
        this.elements.transcriptArea.appendChild(workflowDisplay);
        this.scrollToBottom();
        
        // Remove from active workflows
        this.activeWorkflows = this.activeWorkflows.filter(w => w.id !== message.workflowId);
    }
    
    async executeFunction(functionName, parameters) {
        // Simulate API execution with mock responses
        setTimeout(() => {
            let result = {};
            
            switch (functionName) {
                case 'searchDatabase':
                    result = {
                        found: 3,
                        results: [
                            { id: 1, name: 'John Doe', status: 'Active' },
                            { id: 2, name: 'Jane Smith', status: 'Active' },
                            { id: 3, name: 'Bob Johnson', status: 'Inactive' }
                        ]
                    };
                    break;
                    
                case 'createTicket':
                    result = {
                        ticketId: 'TK-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
                        status: 'Created',
                        assignedTo: 'Support Team'
                    };
                    break;
                    
                case 'scheduleAppointment':
                    result = {
                        appointmentId: 'APT-' + Date.now(),
                        confirmed: true,
                        reminder: 'Email sent'
                    };
                    break;
                    
                case 'getOrderStatus':
                    result = {
                        orderId: parameters.orderId,
                        status: 'In Transit',
                        estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString()
                    };
                    break;
                    
                case 'processPayment':
                    result = {
                        transactionId: 'TXN-' + Date.now(),
                        status: 'Approved',
                        confirmationCode: Math.random().toString(36).substr(2, 9).toUpperCase()
                    };
                    break;
            }
            
            // Send result back to server
            this.sendMessage({
                type: 'function.result',
                function: functionName,
                result: result
            });
            
        }, 1000 + Math.random() * 1000); // Simulate API latency
    }
    
    async handleFileUpload(files) {
        for (const file of files) {
            if (this.validateFile(file)) {
                await this.uploadFile(file);
            }
        }
    }
    
    validateFile(file) {
        const allowedTypes = ['application/pdf', 'text/plain', 'text/markdown', 'application/json'];
        const allowedExtensions = ['.pdf', '.txt', '.md', '.json'];
        
        const extension = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(extension)) {
            this.showError(`Invalid file type: ${file.name}`);
            return false;
        }
        
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            this.showError(`File too large: ${file.name}`);
            return false;
        }
        
        return true;
    }
    
    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                const result = await response.json();
                this.addFileToList(file.name, result.fileId);
                const chunks = parseInt(result.chunks) || 0;
                this.updateStats(chunks);
                
                // Notify server to update RAG index
                this.sendMessage({
                    type: 'rag.index',
                    fileId: result.fileId,
                    fileName: file.name
                });
                
                this.addTranscript(`📄 Uploaded: ${file.name} (${chunks} chunks)`, 'system');
            } else {
                // Try to get error details from response
                let errorMessage = 'Upload failed';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorMessage;
                } catch {
                    // If response is not JSON, use status text
                    errorMessage = response.statusText || errorMessage;
                }
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showError(`Failed to upload ${file.name}: ${error.message}`);
        }
    }
    
    addFileToList(fileName, fileId) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.fileId = fileId;
        fileItem.innerHTML = `
            <div class="file-name">
                <span>📄</span>
                <span>${fileName}</span>
            </div>
            <span class="file-remove" onclick="voiceBot.removeFile('${fileId}')">×</span>
        `;
        this.elements.fileList.appendChild(fileItem);
        
        this.knowledgeBase.set(fileId, fileName);
        this.elements.docCount.textContent = this.knowledgeBase.size;
    }
    
    removeFile(fileId) {
        const fileItem = document.querySelector(`[data-file-id="${fileId}"]`);
        if (fileItem) {
            fileItem.remove();
            this.knowledgeBase.delete(fileId);
            this.elements.docCount.textContent = this.knowledgeBase.size;
            
            // Notify server to remove from RAG index
            this.sendMessage({
                type: 'rag.remove',
                fileId: fileId
            });
        }
    }
    
    updateStats(chunks) {
        const currentChunks = parseInt(this.elements.chunkCount.textContent) || 0;
        const newChunks = parseInt(chunks) || 0;
        this.elements.chunkCount.textContent = currentChunks + newChunks;
    }
    
    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }
    
    async startRecording() {
        try {
            // Clear and initialize audio buffer
            this.audioBuffer = [];
            this.recordingStartTime = Date.now();
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 24000,  // OpenAI requires 24kHz
                    sampleSize: 16,      // 16-bit audio
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            
            // Initialize audio context at 24kHz for OpenAI compatibility
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            const source = this.audioContext.createMediaStreamSource(stream);
            
            // Create script processor to capture raw PCM data
            // Use 2048 buffer size for better compatibility
            const bufferSize = 2048;
            this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
            this.audioBuffer = [];  // Buffer to accumulate audio
            this.minBufferDuration = 150;  // Use 150ms to be safe (OpenAI requires 100ms minimum)
            this.samplesPerMs = 24;  // 24 samples per millisecond at 24kHz
            this.minSamples = this.minBufferDuration * this.samplesPerMs;  // 3600 samples minimum
            
            this.scriptProcessor.onaudioprocess = (event) => {
                if (!this.isRecording) return;
                
                const inputData = event.inputBuffer.getChannelData(0);
                
                // Convert Float32 to PCM16
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                
                // Add to buffer
                this.audioBuffer.push(pcm16);
                
                // Calculate total samples in buffer
                const totalSamples = this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
                
                // Send when we have more than 200ms of audio (keep 50ms buffer)
                const sendThreshold = this.minSamples + 1200; // 200ms at 24kHz
                if (totalSamples >= sendThreshold) {
                    // Calculate how much to send (leave minSamples in buffer)
                    const samplesToSend = totalSamples - this.minSamples;
                    const pcmToSend = new Int16Array(samplesToSend);
                    
                    // Combine chunks to send
                    let offset = 0;
                    let chunksToRemove = 0;
                    for (let i = 0; i < this.audioBuffer.length; i++) {
                        const chunk = this.audioBuffer[i];
                        if (offset + chunk.length <= samplesToSend) {
                            pcmToSend.set(chunk, offset);
                            offset += chunk.length;
                            chunksToRemove++;
                        } else {
                            // Partial chunk - split it
                            const remaining = samplesToSend - offset;
                            pcmToSend.set(chunk.slice(0, remaining), offset);
                            // Keep the rest in buffer
                            this.audioBuffer[i] = chunk.slice(remaining);
                            break;
                        }
                    }
                    
                    // Remove sent chunks
                    if (chunksToRemove > 0) {
                        this.audioBuffer.splice(0, chunksToRemove);
                    }
                    
                    // Convert to base64
                    const bytes = new Uint8Array(pcmToSend.buffer, pcmToSend.byteOffset, pcmToSend.byteLength);
                    
                    // Create base64 string in chunks to avoid call stack issues
                    let binary = '';
                    const chunkSize = 8192;
                    for (let i = 0; i < bytes.length; i += chunkSize) {
                        const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.length));
                        binary += String.fromCharCode.apply(null, chunk);
                    }
                    const base64Audio = btoa(binary);
                    
                    // Send buffered audio
                    this.sendMessage({
                        type: 'audio.input',
                        audio: base64Audio,
                        format: 'pcm16'  // Specify we're sending PCM16 at 24kHz
                    });
                }
            };
            
            // Connect audio nodes
            source.connect(this.scriptProcessor);
            this.scriptProcessor.connect(this.audioContext.destination);
            
            // We're using ScriptProcessor for PCM16, no need for MediaRecorder
            
            this.isRecording = true;
            this.elements.recordButton.classList.add('recording');
            this.elements.recordButton.innerHTML = '⏹️';
            
            this.addTranscript('🎤 Recording...', 'system');
            
        } catch (error) {
            console.error('Failed to start recording:', error);
            this.showError('Failed to access microphone. Please check permissions.');
        }
    }
    
    async stopRecording() {
        this.isRecording = false;
        this.elements.recordButton.classList.remove('recording');
        this.elements.recordButton.innerHTML = '🎤';
        
        // Check recording duration
        const recordingDuration = this.recordingStartTime ? Date.now() - this.recordingStartTime : 0;
        console.log(`Recording duration: ${recordingDuration}ms`);
        
        // Always ensure we have at least 150ms of audio
        const minRequired = 3600; // 150ms at 24kHz
        let finalPCM;
        
        // Check if we have any buffered audio
        const hasBufferedAudio = this.audioBuffer && this.audioBuffer.length > 0;
        const totalSamples = hasBufferedAudio ? this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0) : 0;
        
        // If recording was very short (< 150ms), we need to ensure minimum buffer
        if (recordingDuration < 150) {
            console.log(`Short recording (${recordingDuration}ms), padding to 150ms`);
            finalPCM = new Int16Array(minRequired);
            if (hasBufferedAudio) {
                let offset = 0;
                for (const chunk of this.audioBuffer) {
                    if (offset + chunk.length <= minRequired) {
                        finalPCM.set(chunk, offset);
                        offset += chunk.length;
                    } else {
                        // Partial copy to not exceed minRequired
                        const remaining = minRequired - offset;
                        finalPCM.set(chunk.slice(0, remaining), offset);
                        break;
                    }
                }
            }
        } else if (totalSamples < minRequired) {
            // Pad with silence to meet minimum requirement
            finalPCM = new Int16Array(minRequired);
            let offset = 0;
            for (const chunk of this.audioBuffer) {
                finalPCM.set(chunk, offset);
                offset += chunk.length;
            }
        } else {
            // Combine all chunks as-is
            finalPCM = new Int16Array(totalSamples);
            let offset = 0;
            for (const chunk of this.audioBuffer) {
                finalPCM.set(chunk, offset);
                offset += chunk.length;
            }
        }
        
        // Convert to base64
        const bytes = new Uint8Array(finalPCM.buffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.length));
            binary += String.fromCharCode.apply(null, chunk);
        }
        const base64Audio = btoa(binary);
        
        // Send final audio (always has at least 150ms)
        this.sendMessage({
            type: 'audio.input',
            audio: base64Audio,
            format: 'pcm16'
        });
        
        // Clear buffer
        this.audioBuffer = [];
        
        // Commit the audio buffer
        this.sendMessage({
            type: 'input_audio_buffer.commit'
        });
        
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
            this.scriptProcessor = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
    
    async sendAudio(audioBlob) {
        // Convert audio to base64
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Audio = reader.result.split(',')[1];
            
            this.sendMessage({
                type: 'audio.input',
                audio: base64Audio,
                format: 'webm'
            });
        };
        reader.readAsDataURL(audioBlob);
    }
    
    updateAssistantTranscript(text) {
        // Update the last assistant message in real-time
        const messages = this.elements.transcriptArea.querySelectorAll('.message.assistant');
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            const textElement = lastMessage.querySelector('div:last-child');
            if (textElement) {
                textElement.textContent = text;
            }
        } else {
            // Create new assistant message
            this.addTranscript(text, 'assistant');
        }
    }
    
    async playAudioResponse(base64Chunks) {
        try {
            // Combine all base64 chunks
            const combinedBase64 = base64Chunks.join('');
            const audioData = atob(combinedBase64);
            
            // Convert to PCM16 array buffer
            const pcm16Data = new Int16Array(audioData.length / 2);
            for (let i = 0; i < pcm16Data.length; i++) {
                const low = audioData.charCodeAt(i * 2);
                const high = audioData.charCodeAt(i * 2 + 1);
                pcm16Data[i] = (high << 8) | low;
            }
            
            // Create or reuse audio context
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            }
            const audioBuffer = this.audioContext.createBuffer(1, pcm16Data.length, 24000);
            const channelData = audioBuffer.getChannelData(0);
            
            // Convert PCM16 to Float32 for Web Audio
            for (let i = 0; i < pcm16Data.length; i++) {
                channelData[i] = pcm16Data[i] / 32768;
            }
            
            // Play the audio
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            
            // Store the source so we can stop it if needed
            if (!this.audioSources) {
                this.audioSources = [];
            }
            this.audioSources.push(source);
            
            source.onended = () => {
                // Remove from active sources when done
                const index = this.audioSources.indexOf(source);
                if (index > -1) {
                    this.audioSources.splice(index, 1);
                }
            };
            
            source.start(0);
            console.log('Playing audio response');
            
        } catch (error) {
            console.error('Failed to play audio response:', error);
        }
    }
    
    stopAllAudio() {
        // Stop all active audio sources
        if (this.audioSources && this.audioSources.length > 0) {
            console.log('Stopping', this.audioSources.length, 'audio sources');
            this.audioSources.forEach(source => {
                try {
                    source.stop();
                } catch (e) {
                    // Source might have already ended
                }
            });
            this.audioSources = [];
        }
        
        // Clear any pending audio chunks
        this.audioResponseChunks = [];
        
        // Send interruption message to server
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendMessage({
                type: 'response.cancel'
            });
        }
    }
    
    async playAudio(base64Audio) {
        // Skip empty or invalid audio
        if (!base64Audio || base64Audio.length < 100) {
            console.log('Skipping invalid/empty audio');
            return;
        }
        
        try {
            // Use the existing playAudioResponse method which handles PCM16 properly
            this.playAudioResponse([base64Audio]);
        } catch (error) {
            console.error('Failed to play audio:', error);
        }
    }
    
    addTranscript(text, role) {
        const message = document.createElement('div');
        message.className = `message ${role}`;
        
        if (role !== 'system') {
            const label = document.createElement('div');
            label.className = 'message-label';
            label.textContent = role === 'user' ? 'You' : 'Assistant';
            message.appendChild(label);
        }
        
        const content = document.createElement('div');
        content.textContent = text;
        message.appendChild(content);
        
        this.elements.transcriptArea.appendChild(message);
        this.scrollToBottom();
    }
    
    scrollToBottom() {
        this.elements.transcriptArea.scrollTop = this.elements.transcriptArea.scrollHeight;
    }
    
    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
    
    sendTextMessage() {
        const input = document.getElementById('textInput');
        const message = input.value.trim();
        
        if (!message) return;
        
        // Add user message to transcript
        this.addTranscript(message, 'user');
        
        // Send to server (for OpenAI Realtime API)
        this.sendMessage({
            type: 'text.input',
            text: message
        });
        
        // Clear input
        input.value = '';
    }
    
    sendDemoMessage(message) {
        // Add user message to transcript
        this.addTranscript(message, 'user');
        
        // Send to server (for OpenAI Realtime API)
        this.sendMessage({
            type: 'text.input',
            text: message
        });
    }
    
    updateStreamingTranscript(text, role) {
        // Find or create streaming message
        let messageEl = document.querySelector(`[data-message-id="${this.currentTranscriptMessageId}"]`);
        
        if (!messageEl) {
            // Create new message element for streaming
            messageEl = document.createElement('div');
            messageEl.className = `message ${role} streaming`;
            messageEl.dataset.messageId = this.currentTranscriptMessageId;
            
            const label = document.createElement('div');
            label.className = 'message-label';
            label.textContent = role === 'user' ? 'You' : 'Assistant';
            messageEl.appendChild(label);
            
            const content = document.createElement('div');
            content.className = 'message-content';
            content.textContent = text;
            messageEl.appendChild(content);
            
            this.elements.transcriptArea.appendChild(messageEl);
        } else {
            // Update existing message
            const content = messageEl.querySelector('.message-content');
            if (content) {
                content.textContent = text;
            }
        }
        
        this.scrollToBottom();
    }
    
    finalizeStreamingTranscript(text, role) {
        // Remove streaming message and add final one
        let messageEl = document.querySelector(`[data-message-id="${this.currentTranscriptMessageId}"]`);
        if (messageEl) {
            messageEl.remove();
        }
        // Add final message
        this.addTranscript(text, role);
    }
    
    updateAssistantTranscript() {
        // Legacy method - kept for compatibility
        const messages = this.elements.transcriptArea.querySelectorAll('.message.assistant');
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (!lastMessage.dataset.transcriptMessage) {
                lastMessage.dataset.transcriptMessage = true;
                lastMessage.lastElementChild.textContent = this.assistantTranscript;
            } else {
                lastMessage.lastElementChild.textContent = this.assistantTranscript;
            }
        } else {
            this.addTranscript(this.assistantTranscript, 'assistant');
        }
    }
    
    updateStatus(text, connected) {
        this.elements.statusText.textContent = text;
        if (connected) {
            this.elements.statusDot.classList.add('connected');
        } else {
            this.elements.statusDot.classList.remove('connected');
        }
    }
    
    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorModal.style.display = 'flex';
        
        setTimeout(() => {
            this.elements.errorModal.style.display = 'none';
        }, 5000);
    }
}

// Initialize the application
const voiceBot = new VoiceBotClient();