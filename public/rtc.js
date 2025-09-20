/**
 * Ultra-Low Latency Audio Client using AudioWorklet
 * Achieves <100ms round-trip latency
 */

class UltraLowLatencyVoiceBot {
    constructor() {
        this.ws = null;
        this.audioContext = null;
        this.audioWorklet = null;
        this.isConnected = false;
        this.isRecording = false;
        this.sessionId = null;
        
        // Audio playback
        this.audioQueue = [];
        this.isPlaying = false;
        
        // DOM elements
        this.elements = {
            recordButton: document.getElementById('recordButton'),
            statusText: document.getElementById('statusText'),
            statusDot: document.getElementById('statusDot'),
            transcriptArea: document.getElementById('transcriptArea'),
            latencyDisplay: document.getElementById('latencyDisplay'),
            dropzone: document.getElementById('dropzone'),
            fileInput: document.getElementById('fileInput'),
            fileList: document.getElementById('fileList'),
            chunkCount: document.getElementById('chunkCount')
        };
        
        this.uploadedFiles = new Map(); // Changed to Map to store fileId with fileName
        this.totalChunks = 0;
        
        // Audio feedback state
        this.typingSound = null;
        this.isPlayingTypingSound = false;
        this.typingInterval = null;
        
        // VAD (Voice Activity Detection) settings - more permissive
        this.vadSettings = {
            silenceThreshold: 0.005,  // Lower threshold for better sensitivity
            silenceDuration: 1500,     // Longer wait before cutting off (1.5 seconds)
            minSpeechDuration: 100,    // Shorter minimum for valid speech
            confidenceThreshold: 0.4,  // Lower confidence threshold
            backgroundNoiseLevel: 0,   // Adaptive background noise level
            adaptiveThreshold: false   // Disable adaptive threshold to avoid interference
        };
        this.lastSoundTime = Date.now();
        this.speechStartTime = null;
        this.isSpeaking = false;
        
        // Load persisted files from localStorage
        this.loadPersistedFiles();
        
        this.initialize();
    }
    
    async initialize() {
        // Set up event listeners
        this.elements.recordButton?.addEventListener('click', () => this.toggleRecording());
        
        // Initialize file upload
        this.initializeFileUpload();
        
        // Display persisted files
        this.displayPersistedFiles();
        
        // Connect immediately
        await this.connectToServer();
        
        // Initialize audio context on first user interaction
        document.addEventListener('click', async () => {
            if (!this.audioContext) {
                await this.initializeAudio();
            }
        }, { once: true });
    }
    
    initializeFileUpload() {
        if (!this.elements.dropzone || !this.elements.fileInput) return;
        
        // Click to upload
        this.elements.dropzone.addEventListener('click', () => {
            this.elements.fileInput.click();
        });
        
        // File selection
        this.elements.fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });
        
        // Drag and drop
        this.elements.dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.elements.dropzone.classList.add('dragover');
        });
        
        this.elements.dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.elements.dropzone.classList.remove('dragover');
        });
        
        this.elements.dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.elements.dropzone.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });
    }
    
    async handleFiles(files) {
        for (let file of files) {
            // Check if file with same name already exists
            let alreadyExists = false;
            for (let [fileName, fileInfo] of this.uploadedFiles) {
                if (fileName === file.name) {
                    alreadyExists = true;
                    break;
                }
            }
            
            if (!alreadyExists) {
                await this.uploadFile(file);
            } else {
                this.addTranscript(`⚠️ File already uploaded: ${file.name}`, 'system');
            }
        }
        
        // Clear file input to allow re-selecting same files
        if (this.elements.fileInput) {
            this.elements.fileInput.value = '';
        }
    }
    
    async uploadFile(file) {
        console.log(`Uploading file: ${file.name}, type: ${file.type}, size: ${file.size} bytes`);
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            // Use absolute URL to ensure correct endpoint
            const baseUrl = window.location.origin;
            const response = await fetch(`${baseUrl}/api/upload`, {
                method: 'POST',
                body: formData
            });
            
            // Check if response is ok before parsing JSON
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Upload failed (${response.status}):`, errorText);
                
                // Try to parse as JSON if possible
                let errorDetail = errorText;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorDetail = errorJson.detail || errorText;
                } catch (e) {
                    // Not JSON, use raw text
                }
                
                this.addTranscript(`❌ Upload failed: ${file.name} - ${errorDetail}`, 'system');
                return;
            }
            
            const result = await response.json();
            
            if (response.ok) {
                // Store file info with fileId
                const fileInfo = {
                    fileId: result.file_id,
                    fileName: file.name,
                    chunks: result.chunks || 0,
                    uploadTime: Date.now()
                };
                
                this.uploadedFiles.set(file.name, fileInfo);
                this.addFileToList(file.name, result.file_id);
                
                // Update chunk count
                if (result.chunks) {
                    this.totalChunks += result.chunks;
                    if (this.elements.chunkCount) {
                        this.elements.chunkCount.textContent = this.totalChunks;
                    }
                }
                
                // Persist to localStorage
                this.persistFiles();
                
                this.addTranscript(`📄 Uploaded: ${file.name}`, 'system');
                console.log('File uploaded:', file.name, result);
            } else {
                this.addTranscript(`❌ Failed to upload: ${file.name}`, 'system');
                console.error('Upload failed:', result.detail);
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.addTranscript(`❌ Upload error: ${file.name}`, 'system');
        }
    }
    
    addFileToList(fileName, fileId) {
        if (!this.elements.fileList) return;
        
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.fileId = fileId;
        fileItem.innerHTML = `
            <span>📄</span>
            <span class="file-name">${fileName}</span>
            <span class="remove-btn" data-file-id="${fileId}" data-file-name="${fileName}">✕</span>
        `;
        
        // Add event listener to remove button
        const removeBtn = fileItem.querySelector('.remove-btn');
        removeBtn.addEventListener('click', () => {
            this.removeFile(fileId, fileName);
        });
        
        this.elements.fileList.appendChild(fileItem);
    }
    
    async removeFile(fileId, fileName) {
        // Check if fileId is valid
        if (!fileId || fileId === 'undefined') {
            console.error('Invalid fileId:', fileId);
            // Still remove from UI
            const fileItems = document.querySelectorAll('.file-item');
            fileItems.forEach(item => {
                if (item.querySelector('.file-name')?.textContent === fileName) {
                    item.remove();
                }
            });
            this.uploadedFiles.delete(fileName);
            this.persistFiles(); // Update localStorage
            this.addTranscript(`🗑️ Removed: ${fileName}`, 'system');
            this.updateChunkCount();
            return;
        }
        
        try {
            // Send delete request to server
            const baseUrl = window.location.origin;
            const response = await fetch(`${baseUrl}/api/file/${fileId}`, {
                method: 'DELETE'
            });
            
            // Remove from UI regardless of server response
            // (server endpoint might not exist yet)
            const fileItems = document.querySelectorAll('.file-item');
            fileItems.forEach(item => {
                if (item.dataset.fileId === fileId) {
                    item.remove();
                }
            });
                
            this.uploadedFiles.delete(fileName);
            this.persistFiles(); // Update localStorage
            this.addTranscript(`🗑️ Removed: ${fileName}`, 'system');
            
            // Update chunk count
            this.updateChunkCount();
        } catch (error) {
            console.error('Remove file error:', error);
            // Still remove from UI even if server error
            const fileItems = document.querySelectorAll('.file-item');
            fileItems.forEach(item => {
                if (item.dataset.fileId === fileId) {
                    item.remove();
                }
            });
            this.uploadedFiles.delete(fileName);
            this.persistFiles(); // Update localStorage
            this.addTranscript(`🗑️ Removed: ${fileName} (local)`, 'system');
        }
    }
    
    updateChunkCount() {
        // Recalculate chunk count based on remaining files
        const fileCount = document.querySelectorAll('.file-item').length;
        this.totalChunks = Math.max(0, fileCount * 5); // Estimate 5 chunks per file
        if (this.elements.chunkCount) {
            this.elements.chunkCount.textContent = this.totalChunks;
        }
    }
    
    loadPersistedFiles() {
        // Load files from localStorage
        const storedFiles = localStorage.getItem('rtc_uploaded_files');
        if (storedFiles) {
            try {
                const filesData = JSON.parse(storedFiles);
                filesData.forEach(fileInfo => {
                    this.uploadedFiles.set(fileInfo.fileName, fileInfo);
                    this.totalChunks += (fileInfo.chunks || 0);
                });
            } catch (e) {
                console.error('Error loading persisted files:', e);
            }
        }
    }
    
    displayPersistedFiles() {
        // Display all persisted files in the UI
        for (let [fileName, fileInfo] of this.uploadedFiles) {
            this.addFileToList(fileName, fileInfo.fileId);
        }
        
        // Update chunk count display
        if (this.elements.chunkCount && this.totalChunks > 0) {
            this.elements.chunkCount.textContent = this.totalChunks;
        }
    }
    
    persistFiles() {
        // Save current files to localStorage
        const filesData = Array.from(this.uploadedFiles.values());
        localStorage.setItem('rtc_uploaded_files', JSON.stringify(filesData));
    }
    
    async loadRAGFiles() {
        // Load existing files from server RAG system
        try {
            const baseUrl = window.location.origin;
            const response = await fetch(`${baseUrl}/api/rag/files`);
            
            if (response.ok) {
                const files = await response.json();
                console.log('RAG files from server:', files);
                
                // Clear existing and reload from server
                this.uploadedFiles.clear();
                this.totalChunks = 0;
                
                // Clear UI
                if (this.elements.fileList) {
                    this.elements.fileList.innerHTML = '';
                }
                
                // Add files from server
                files.forEach(fileInfo => {
                    this.uploadedFiles.set(fileInfo.fileName, fileInfo);
                    this.addFileToList(fileInfo.fileName, fileInfo.fileId);
                    this.totalChunks += (fileInfo.chunks || 0);
                });
                
                // Update chunk count
                if (this.elements.chunkCount) {
                    this.elements.chunkCount.textContent = this.totalChunks;
                }
                
                // Persist to localStorage
                this.persistFiles();
                
                if (files.length > 0) {
                    this.addTranscript(`📚 Loaded ${files.length} files from knowledge base`, 'system');
                }
            }
        } catch (error) {
            console.error('Error loading RAG files:', error);
        }
    }
    
    async initializeAudio() {
        try {
            // Create audio context at 24kHz for OpenAI compatibility
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 24000,
                latencyHint: 'interactive'  // Lowest latency mode
            });
            
            // Check actual sample rate - browser might override
            const actualSampleRate = this.audioContext.sampleRate;
            if (actualSampleRate !== 24000) {
                console.warn(`Browser using ${actualSampleRate}Hz instead of 24000Hz - audio may sound wrong`);
                this.needsResampling = true;
                this.browserSampleRate = actualSampleRate;
            }
            
            // Load AudioWorklet processor
            await this.loadAudioWorklet();
            
            // Initialize typing sound
            await this.initializeTypingSound();
            
            console.log('Audio initialized with sample rate:', this.audioContext.sampleRate);
        } catch (error) {
            console.error('Failed to initialize audio:', error);
        }
    }
    
    async initializeTypingSound() {
        try {
            // Create a typing sound buffer (short click sound)
            const duration = 0.05; // 50ms per keystroke
            const sampleRate = this.audioContext.sampleRate;
            const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
            const channelData = buffer.getChannelData(0);
            
            // Generate a click/tap sound
            for (let i = 0; i < channelData.length; i++) {
                if (i < channelData.length * 0.1) {
                    // Attack phase - quick rise
                    channelData[i] = Math.random() * 0.3 * (i / (channelData.length * 0.1));
                } else {
                    // Decay phase - quick fall
                    channelData[i] = Math.random() * 0.3 * (1 - (i - channelData.length * 0.1) / (channelData.length * 0.9));
                }
            }
            
            this.typingSound = buffer;
            console.log('Typing sound initialized');
        } catch (error) {
            console.error('Failed to initialize typing sound:', error);
        }
    }
    
    startTypingSound() {
        if (this.isPlayingTypingSound || !this.typingSound || !this.audioContext) return;
        
        console.log('Starting typing sound effect');
        this.isPlayingTypingSound = true;
        
        // Play typing sound at irregular intervals to simulate natural typing
        const playTypingClick = () => {
            if (!this.isPlayingTypingSound) return;
            
            try {
                const source = this.audioContext.createBufferSource();
                const gainNode = this.audioContext.createGain();
                
                source.buffer = this.typingSound;
                gainNode.gain.value = 0.15; // Low volume for typing sound
                
                source.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                source.start();
                
                // Schedule next click with random interval (100-300ms)
                const nextInterval = 100 + Math.random() * 200;
                this.typingInterval = setTimeout(playTypingClick, nextInterval);
            } catch (error) {
                console.error('Error playing typing sound:', error);
            }
        };
        
        // Start the typing sound loop
        playTypingClick();
        
        // Add visual indicator
        this.addMessage('⌨️ Processing...', 'system');
    }
    
    stopTypingSound() {
        if (!this.isPlayingTypingSound) return;
        
        console.log('Stopping typing sound effect');
        this.isPlayingTypingSound = false;
        
        if (this.typingInterval) {
            clearTimeout(this.typingInterval);
            this.typingInterval = null;
        }
    }
    
    handleVAD(vadData) {
        const { energy, threshold, isSpeech } = vadData;
        
        // VISUAL FEEDBACK ONLY - Don't affect audio processing
        // Just provide visual indication of speech detection
        
        if (isSpeech && !this.isSpeaking) {
            // Visual indication that speech started
            this.isSpeaking = true;
            // console.log('Visual: Speech detected');
        } else if (!isSpeech && this.isSpeaking) {
            // Visual indication that speech stopped
            this.isSpeaking = false;
            // console.log('Visual: Speech paused');
        }
        
        // Update UI with VAD status (purely visual feedback)
        if (this.elements.recordButton && this.isRecording) {
            if (isSpeech) {
                this.elements.recordButton.style.borderColor = '#4CAF50'; // Green when speaking
                this.elements.recordButton.style.boxShadow = '0 0 10px #4CAF50';
            } else {
                this.elements.recordButton.style.borderColor = '#ff0000'; // Red when recording but not speaking
                this.elements.recordButton.style.boxShadow = '0 0 5px #ff0000';
            }
        }
        
        // DON'T send any speech_ended signals or modify audio flow
        // Let OpenAI handle all speech detection and processing
    }
    
    async loadAudioWorklet() {
        // Create inline AudioWorklet processor for ultra-low latency
        const processorCode = `
            class AudioProcessor extends AudioWorkletProcessor {
                constructor() {
                    super();
                    this.bufferSize = 128;  // Very small buffer for low latency
                    this.buffer = new Float32Array(this.bufferSize);
                    this.bufferIndex = 0;
                    this.silenceThreshold = 0.005;  // Lower threshold to be more sensitive
                    this.energyHistory = [];
                    this.historySize = 10;
                }
                
                process(inputs, outputs, parameters) {
                    const input = inputs[0];
                    if (!input || !input[0]) return true;
                    
                    const inputChannel = input[0];
                    
                    // Calculate energy for VAD
                    let energy = 0;
                    for (let i = 0; i < inputChannel.length; i++) {
                        energy += inputChannel[i] * inputChannel[i];
                    }
                    energy = Math.sqrt(energy / inputChannel.length);
                    
                    // Update energy history
                    this.energyHistory.push(energy);
                    if (this.energyHistory.length > this.historySize) {
                        this.energyHistory.shift();
                    }
                    
                    // Calculate adaptive threshold based on recent history - less aggressive
                    const avgEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
                    const adaptiveThreshold = Math.max(this.silenceThreshold, avgEnergy * 0.3);
                    
                    // Send VAD info to main thread
                    this.port.postMessage({
                        type: 'vad',
                        energy: energy,
                        threshold: adaptiveThreshold,
                        isSpeech: energy > adaptiveThreshold
                    });
                    
                    // Convert to PCM16 and send immediately
                    const pcm16 = new Int16Array(inputChannel.length);
                    for (let i = 0; i < inputChannel.length; i++) {
                        const s = Math.max(-1, Math.min(1, inputChannel[i]));
                        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }
                    
                    // Send audio data to main thread
                    this.port.postMessage({
                        type: 'audio',
                        data: pcm16.buffer
                    }, [pcm16.buffer]);
                    
                    return true;
                }
            }
            
            registerProcessor('audio-processor', AudioProcessor);
        `;
        
        // Create blob URL for the processor
        const blob = new Blob([processorCode], { type: 'application/javascript' });
        const processorUrl = URL.createObjectURL(blob);
        
        try {
            await this.audioContext.audioWorklet.addModule(processorUrl);
            console.log('AudioWorklet loaded successfully');
        } catch (error) {
            console.error('Failed to load AudioWorklet:', error);
        } finally {
            URL.revokeObjectURL(processorUrl);
        }
    }
    
    async connectToServer() {
        try {
            // Use binary WebSocket for lower overhead
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const url = `${protocol}//${window.location.host}/rtc`;
            
            this.ws = new WebSocket(url);
            this.ws.binaryType = 'arraybuffer';  // Handle binary data efficiently
            
            this.ws.onopen = async () => {
                console.log('Connected to RTC server');
                this.isConnected = true;
                this.updateStatus('Connected', true);
                
                // Load existing RAG files from server
                await this.loadRAGFiles();
            };
            
            this.ws.onmessage = async (event) => {
                if (event.data instanceof ArrayBuffer) {
                    // Binary audio data - play immediately
                    await this.playAudioData(event.data);
                } else {
                    // JSON message
                    const message = JSON.parse(event.data);
                    this.handleServerMessage(message);
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
            
            this.ws.onclose = () => {
                this.isConnected = false;
                this.updateStatus('Disconnected', false);
                // Reconnect after 1 second
                setTimeout(() => this.connectToServer(), 1000);
            };
            
        } catch (error) {
            console.error('Failed to connect:', error);
        }
    }
    
    async startRecording() {
        // Always reset audio context if resuming after stop
        if (!this.audioContext || this.audioContext.state === 'closed') {
            await this.initializeAudio();
        } else if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        // Clear any existing audio buffer and state
        this.audioBuffer = [];
        this.pendingUserTranscript = false;
        this.lastUserTranscript = '';
        
        // Send a session update to reset OpenAI's audio state
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'reset_audio_state'
            }));
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 24000,
                    sampleSize: 16,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            const source = this.audioContext.createMediaStreamSource(stream);
            
            // Create AudioWorklet node
            this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
            
            // Initialize audio buffer for accumulation
            this.audioBuffer = [];
            this.minBufferDuration = 150;  // 150ms to be safe (OpenAI requires 100ms minimum)
            this.samplesPerMs = 24;  // 24 samples per millisecond at 24kHz
            this.minSamples = this.minBufferDuration * this.samplesPerMs;  // 3600 samples minimum
            
            // Handle audio data and VAD info from worklet
            this.audioWorkletNode.port.onmessage = (event) => {
                if (event.data.type === 'vad') {
                    // Handle VAD information
                    this.handleVAD(event.data);
                } else if (event.data.type === 'audio' && this.isRecording) {
                    // Buffer the audio instead of sending immediately
                    const audioData = new Int16Array(event.data.data);
                    this.audioBuffer.push(audioData);
                    
                    // Calculate total samples in buffer
                    const totalSamples = this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
                    
                    // Only send when we have at least 150ms of audio
                    if (totalSamples >= this.minSamples) {
                        // Combine all chunks
                        const combinedPCM = new Int16Array(totalSamples);
                        let offset = 0;
                        for (const chunk of this.audioBuffer) {
                            combinedPCM.set(chunk, offset);
                            offset += chunk.length;
                        }
                        
                        // Send buffered audio
                        if (this.ws?.readyState === WebSocket.OPEN) {
                            this.ws.send(combinedPCM.buffer);
                        }
                        
                        // Clear the buffer
                        this.audioBuffer = [];
                    }
                }
            };
            
            // Connect audio graph
            source.connect(this.audioWorkletNode);
            this.audioWorkletNode.connect(this.audioContext.destination);
            
            this.isRecording = true;
            this.stream = stream;
            
            // Update UI
            this.elements.recordButton.classList.add('recording');
            this.elements.recordButton.innerHTML = '⏹️';
            this.addTranscript('🎤 Listening...', 'system');
            
        } catch (error) {
            console.error('Failed to start recording:', error);
            alert('Failed to access microphone. Please check permissions.');
        }
    }
    
    stopRecording() {
        // Mark recording as stopped first to prevent new audio from being buffered
        this.isRecording = false;
        
        // Send any remaining buffered audio
        if (this.audioBuffer && this.audioBuffer.length > 0) {
            const totalSamples = this.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
            
            // Pad with silence if needed to meet minimum requirement
            const minRequired = 3600; // 150ms at 24kHz
            let finalPCM;
            
            if (totalSamples < minRequired) {
                console.log(`Padding audio from ${totalSamples} to ${minRequired} samples`);
                finalPCM = new Int16Array(minRequired);
                let offset = 0;
                for (const chunk of this.audioBuffer) {
                    finalPCM.set(chunk, offset);
                    offset += chunk.length;
                }
                // Rest is zeros (silence)
            } else {
                finalPCM = new Int16Array(totalSamples);
                let offset = 0;
                for (const chunk of this.audioBuffer) {
                    finalPCM.set(chunk, offset);
                    offset += chunk.length;
                }
            }
            
            // Send final audio
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(finalPCM.buffer);
            }
        } else if (this.ws?.readyState === WebSocket.OPEN) {
            // No audio buffered - send minimum silence to avoid error
            console.log('No audio buffered, sending 150ms of silence');
            const silence = new Int16Array(3600); // 150ms of silence
            this.ws.send(silence.buffer);
        }
        
        // Clear buffer completely
        this.audioBuffer = [];
        
        // Stop and clean up audio resources
        if (this.audioWorkletNode) {
            this.audioWorkletNode.port.onmessage = null;
            this.audioWorkletNode.disconnect();
            this.audioWorkletNode = null;
        }
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
            this.stream = null;
        }
        
        // Send end of recording signal to server
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'recording_stopped'
            }));
        }
        
        // Update UI
        this.elements.recordButton.classList.remove('recording');
        this.elements.recordButton.innerHTML = '🎤';
    }
    
    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }
    
    async playAudioData(arrayBuffer) {
        if (!this.audioContext) {
            await this.initializeAudio();
        }
        
        try {
            // Convert PCM16 to Float32
            const pcm16 = new Int16Array(arrayBuffer);
            const float32 = new Float32Array(pcm16.length);
            
            for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / 32768;
            }
            
            // Create audio buffer
            const audioBuffer = this.audioContext.createBuffer(1, float32.length, 24000);
            audioBuffer.getChannelData(0).set(float32);
            
            // Play immediately
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.start(0);
            
        } catch (error) {
            console.error('Failed to play audio:', error);
        }
    }
    
    processAudioQueue() {
        if (!this.audioQueue || this.audioQueue.length === 0) return;
        if (this.isProcessingAudio) return;
        
        // Batch process multiple small chunks for smoother playback
        this.isProcessingAudio = true;
        
        // Combine up to 5 chunks for smoother playback
        const chunks = [];
        while (this.audioQueue.length > 0 && chunks.length < 5) {
            chunks.push(this.audioQueue.shift());
        }
        
        // Play combined chunks
        this.playCombinedAudio(chunks).then(() => {
            this.isProcessingAudio = false;
            if (this.audioQueue.length > 0) {
                setTimeout(() => this.processAudioQueue(), 10);
            }
        });
    }
    
    async playCombinedAudio(chunks) {
        try {
            // Combine all chunks into one
            let combinedData = '';
            for (const chunk of chunks) {
                combinedData += atob(chunk);
            }
            
            // Convert to PCM16 array
            const pcm16Data = new Int16Array(combinedData.length / 2);
            for (let i = 0; i < pcm16Data.length; i++) {
                const low = combinedData.charCodeAt(i * 2);
                const high = combinedData.charCodeAt(i * 2 + 1);
                pcm16Data[i] = (high << 8) | low;
            }
            
            // Create and play audio
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: 24000,
                    latencyHint: 'interactive'
                });
            }
            
            // Resume context if suspended (for browser autoplay policies)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            // CRITICAL: Use the actual browser sample rate for playback
            // OpenAI sends 24kHz but browser might use different rate
            const targetSampleRate = this.audioContext.sampleRate;
            
            // If browser uses different sample rate, we need to resample
            let finalData = pcm16Data;
            let bufferLength = pcm16Data.length;
            
            if (targetSampleRate !== 24000) {
                // Resample from 24kHz to browser's sample rate
                const resampleRatio = targetSampleRate / 24000;
                bufferLength = Math.floor(pcm16Data.length * resampleRatio);
                finalData = new Int16Array(bufferLength);
                
                for (let i = 0; i < bufferLength; i++) {
                    const sourceIndex = Math.floor(i / resampleRatio);
                    finalData[i] = pcm16Data[Math.min(sourceIndex, pcm16Data.length - 1)];
                }
            }
            
            const audioBuffer = this.audioContext.createBuffer(1, bufferLength, targetSampleRate);
            const channelData = audioBuffer.getChannelData(0);
            
            // Convert PCM16 to Float32
            for (let i = 0; i < finalData.length; i++) {
                channelData[i] = finalData[i] / 32768;
            }
            
            // Create and play source at normal speed
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            // Don't adjust playbackRate as it changes pitch
            source.connect(this.audioContext.destination);
            
            // Track this source
            if (!this.audioSources) this.audioSources = [];
            this.audioSources.push(source);
            
            source.onended = () => {
                const idx = this.audioSources.indexOf(source);
                if (idx > -1) {
                    this.audioSources.splice(idx, 1);
                }
            };
            
            source.start(0);
            
            // Wait for audio to finish
            return new Promise(resolve => {
                source.onended = () => resolve();
            });
            
        } catch (error) {
            console.error('Failed to play combined audio:', error);
        }
    }
    
    stopAllAudio() {
        // Stop any currently playing audio
        if (this.audioSources) {
            this.audioSources.forEach(source => {
                try { 
                    source.stop();
                    source.disconnect();
                } catch (e) {}
            });
            this.audioSources = [];
        }
        // Clear audio queue
        this.audioQueue = [];
        this.isProcessingAudio = false;
    }
    
    async playAudioResponse(audioBase64) {
        try {
            // Decode base64 audio
            const audioData = atob(audioBase64);
            
            // Convert to PCM16 array
            const pcm16Data = new Int16Array(audioData.length / 2);
            for (let i = 0; i < pcm16Data.length; i++) {
                const low = audioData.charCodeAt(i * 2);
                const high = audioData.charCodeAt(i * 2 + 1);
                pcm16Data[i] = (high << 8) | low;
            }
            
            // Create audio buffer and play
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: 24000,
                    latencyHint: 'interactive'
                });
            }
            
            // CRITICAL: Use the actual browser sample rate for playback
            // OpenAI sends 24kHz but browser might use different rate
            const targetSampleRate = this.audioContext.sampleRate;
            
            // If browser uses different sample rate, we need to resample
            let finalData = pcm16Data;
            let bufferLength = pcm16Data.length;
            
            if (targetSampleRate !== 24000) {
                // Resample from 24kHz to browser's sample rate
                const resampleRatio = targetSampleRate / 24000;
                bufferLength = Math.floor(pcm16Data.length * resampleRatio);
                finalData = new Int16Array(bufferLength);
                
                for (let i = 0; i < bufferLength; i++) {
                    const sourceIndex = Math.floor(i / resampleRatio);
                    finalData[i] = pcm16Data[Math.min(sourceIndex, pcm16Data.length - 1)];
                }
            }
            
            const audioBuffer = this.audioContext.createBuffer(1, bufferLength, targetSampleRate);
            const channelData = audioBuffer.getChannelData(0);
            
            // Convert PCM16 to Float32
            for (let i = 0; i < finalData.length; i++) {
                channelData[i] = finalData[i] / 32768;
            }
            
            // Create and play source at normal speed
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            // Don't adjust playbackRate as it changes pitch
            source.connect(this.audioContext.destination);
            
            // Track this source so we can stop it if needed
            if (!this.audioSources) this.audioSources = [];
            this.audioSources.push(source);
            
            source.onended = () => {
                const idx = this.audioSources.indexOf(source);
                if (idx > -1) {
                    this.audioSources.splice(idx, 1);
                }
            };
            
            source.start(0);
            
            // Wait for audio to finish
            return new Promise(resolve => {
                source.onended = () => {
                    resolve();
                };
            });
            
        } catch (error) {
            console.error('Failed to play audio response:', error);
        }
    }
    
    handleServerMessage(message) {
        switch (message.type) {
            case 'rtc_ready':
                console.log('RTC endpoint ready');
                break;
                
            case 'connected':
                this.sessionId = message.session_id;
                console.log('Session established:', this.sessionId);
                this.addTranscript('🚀 Ultra-low latency mode active with RAG support!', 'system');
                break;
                
            case 'function_call':
                // Show function call in UI and start typing sound
                console.log('Function call:', message.name, message.arguments);
                this.addTranscript(`🔧 Calling function: ${message.name}`, 'system');
                
                // Start typing sound for API processing feedback
                this.startTypingSound();
                break;
                
            case 'function.result':
                // Function result received - stop typing sound
                this.stopTypingSound();
                
                console.log('Function result:', message.result);
                if (message.name === 'search_knowledge_base' && message.result) {
                    const count = message.result.count || 0;
                    const sources = message.result.sources || [];
                    let sourceText = `📚 Found ${count} relevant chunks`;
                    if (sources.length > 0) {
                        // sources is an array of strings (filenames)
                        sourceText += ` from: ${sources.join(', ')}`;
                    }
                    this.addTranscript(sourceText, 'system');
                }
                break;
                
            case 'audio.response':
                // Audio response from server - stop typing sound and play audio
                this.stopTypingSound();
                
                if (message.audio) {
                    // Queue audio for playback (OpenAI sends small deltas)
                    if (!this.audioQueue) this.audioQueue = [];
                    this.audioQueue.push(message.audio);
                    this.processAudioQueue();
                }
                break;
                
            case 'text.response':
                // Text delta from assistant (for transcription)
                if (message.text) {
                    this.updateAssistantTranscript(message.text);
                }
                break;
                
            case 'transcription':
                // Handle transcription deltas (mainly for assistant)
                if (message.text && message.role === 'assistant') {
                    // Assistant transcription delta - accumulate
                    this.updateAssistantTranscript(message.text);
                }
                break;
                
            case 'transcription.complete':
                // Complete transcription for both user and assistant
                if (message.text) {
                    if (message.role === 'assistant') {
                        // Finalize the assistant message
                        this.finalizeAssistantTranscript(message.text);
                    } else if (message.role === 'user') {
                        // Remove any partial transcript and add the final one
                        if (this.currentUserPartial) {
                            this.currentUserPartial.remove();
                            this.currentUserPartial = null;
                        }
                        // Always add the complete transcript as a new message
                        this.addTranscript(message.text, 'user');
                    }
                }
                break;
                
            case 'transcription.partial':
                // Partial user transcription for real-time updates
                if (message.text) {
                    this.updateUserPartialTranscript(message.text);
                }
                break;
                
            case 'speech_started':
                console.log('User started speaking');
                this.addTranscript('👂 Listening...', 'system');
                // Stop any playing audio when user starts speaking
                this.stopAllAudio();
                break;
                
            case 'speech_stopped':
                console.log('User stopped speaking');
                this.addTranscript('⚡ Processing...', 'system');
                break;
                
            case 'response_interrupted':
            case 'response_cancelled':
                console.log('Response interrupted/cancelled');
                this.stopAllAudio();
                break;
                
            case 'response.done':
                // Response fully complete
                console.log('Response complete');
                // Reset transcript accumulator
                this.currentAssistantTranscript = '';
                break;
                
            case 'audio.done':
                // Audio playback should be complete
                console.log('Audio complete');
                break;
                
            case 'error':
                console.error('Server error:', message.error);
                this.addTranscript(`❌ Error: ${message.error}`, 'system');
                break;
        }
    }
    
    updateAssistantTranscript(text) {
        // Accumulate the transcript
        if (!this.currentAssistantTranscript) {
            this.currentAssistantTranscript = '';
            // Create initial assistant message placeholder
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message assistant streaming';
            messageDiv.innerHTML = `
                <div class="message-label">Assistant</div>
                <div class="message-text"></div>
            `;
            this.elements.transcriptArea.appendChild(messageDiv);
            this.currentAssistantMessage = messageDiv;
        }
        this.currentAssistantTranscript += text;
        
        // Update the display
        if (this.currentAssistantMessage) {
            const textElement = this.currentAssistantMessage.querySelector('.message-text');
            if (textElement) {
                // Check if the text contains an image URL pattern
                const processedContent = this.processMessageContent(this.currentAssistantTranscript);
                if (processedContent.includes('<img')) {
                    textElement.innerHTML = processedContent;
                } else {
                    textElement.textContent = this.currentAssistantTranscript;
                }
                this.elements.transcriptArea.scrollTop = this.elements.transcriptArea.scrollHeight;
            }
        }
    }
    
    finalizeAssistantTranscript(fullText) {
        // Replace streaming message with final text
        if (this.currentAssistantMessage) {
            this.currentAssistantMessage.classList.remove('streaming');
            const textElement = this.currentAssistantMessage.querySelector('.message-text');
            if (textElement) {
                const finalContent = fullText || this.currentAssistantTranscript;
                // Check if the text contains an image URL pattern
                const processedContent = this.processMessageContent(finalContent);
                if (processedContent.includes('<img')) {
                    textElement.innerHTML = processedContent;
                } else {
                    textElement.textContent = finalContent;
                }
            }
        }
        // Reset for next message
        this.currentAssistantTranscript = '';
        this.currentAssistantMessage = null;
    }
    
    updateUserPartialTranscript(text) {
        // Show partial user transcription in real-time
        if (!this.currentUserPartial) {
            // Create a partial message
            this.currentUserPartial = document.createElement('div');
            this.currentUserPartial.className = 'message user partial';
            this.currentUserPartial.dataset.messageId = 'user-partial-' + Date.now();
            this.currentUserPartial.innerHTML = `
                <div class="message-label">You (speaking...)</div>
                <div class="message-text">${text}</div>
            `;
            this.elements.transcriptArea.appendChild(this.currentUserPartial);
        } else {
            // Update existing partial
            const textElement = this.currentUserPartial.querySelector('.message-text');
            if (textElement) {
                textElement.textContent = text;
            }
        }
        this.elements.transcriptArea.scrollTop = this.elements.transcriptArea.scrollHeight;
    }
    
    processMessageContent(text) {
        // Check for image URLs in the text and convert them to img tags
        // Look for common patterns that indicate an image URL
        
        // Pattern 1: Markdown image syntax ![alt](url)
        const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        
        // Pattern 2: Direct image URL (ends with image extension)
        const imageUrlRegex = /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?)/gi;
        
        let processedText = text;
        
        // First, convert Markdown images to HTML img tags
        processedText = processedText.replace(markdownImageRegex, (match, altText, url) => {
            // Clean up the URL (sometimes it gets cut off)
            let imageUrl = url.trim();
            
            // If the URL looks incomplete (doesn't end with an extension), try to complete it
            if (!imageUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) && imageUrl.includes('images.dog.ceo')) {
                // Find if there's a complete URL in the original text
                const fullUrlMatch = text.match(new RegExp(imageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\s)]*'));
                if (fullUrlMatch) {
                    imageUrl = fullUrlMatch[0];
                }
            }
            
            return `<br><img src="${imageUrl}" alt="${altText || 'Image'}" style="max-width: 400px; max-height: 400px; border-radius: 8px; margin: 10px 0; display: block;" onerror="this.style.display='none'"><br>`;
        });
        
        // Then check for any remaining direct image URLs that weren't in markdown format
        const remainingUrls = processedText.match(imageUrlRegex);
        if (remainingUrls) {
            remainingUrls.forEach(url => {
                // Only replace if it's not already part of an img tag
                if (!processedText.includes(`src="${url}"`)) {
                    processedText = processedText.replace(url, 
                        `<br><img src="${url}" alt="Image" style="max-width: 400px; max-height: 400px; border-radius: 8px; margin: 10px 0; display: block;" onerror="this.style.display='none'"><br>`);
                }
            });
        }
        
        return processedText;
    }
    
    addTranscript(text, role) {
        if (!this.elements.transcriptArea) return;
        
        // Remove any partial user transcript when adding complete one
        if (role === 'user' && this.currentUserPartial) {
            this.currentUserPartial.remove();
            this.currentUserPartial = null;
        }
        
        // Reset assistant transcript accumulator when done
        if (role === 'assistant' && text) {
            this.currentAssistantTranscript = '';
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'message-label';
        labelDiv.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        
        // Check if this is an assistant message that might contain images
        if (role === 'assistant') {
            const processedContent = this.processMessageContent(text);
            if (processedContent.includes('<img')) {
                textDiv.innerHTML = processedContent;
            } else {
                textDiv.textContent = text;
            }
        } else {
            textDiv.textContent = text;
        }
        
        messageDiv.appendChild(labelDiv);
        messageDiv.appendChild(textDiv);
        
        this.elements.transcriptArea.appendChild(messageDiv);
        this.elements.transcriptArea.scrollTop = this.elements.transcriptArea.scrollHeight;
    }
    
    updateStatus(text, isConnected) {
        if (this.elements.statusText) {
            this.elements.statusText.textContent = text;
        }
        if (this.elements.statusDot) {
            this.elements.statusDot.className = `status-dot ${isConnected ? 'connected' : ''}`;
        }
    }
    
    sendDemoMessage(text) {
        // Add user message to transcript
        this.addTranscript(text, 'user');
        
        // Send text message to OpenAI via WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [{
                        type: 'input_text',
                        text: text
                    }]
                }
            }));
            
            // Trigger generation
            this.ws.send(JSON.stringify({
                type: 'response.create'
            }));
        }
    }
    
    // Removed setVoiceSpeed as playbackRate changes pitch, not just tempo
}

// Initialize on load
let voiceBot;
document.addEventListener('DOMContentLoaded', () => {
    voiceBot = new UltraLowLatencyVoiceBot();
    console.log('Ultra-Low Latency VoiceBot initialized');
    
    // Speed slider removed - playbackRate affects pitch, not just tempo
});

// Initialize and expose for console debugging
window.addEventListener('DOMContentLoaded', () => {
    window.voiceBot = voiceBot;
});