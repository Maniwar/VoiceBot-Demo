// Voice Settings Control Panel
class VoiceSettings {
    constructor() {
        this.settings = {
            voice: localStorage.getItem('voice') || 'alloy',
            temperature: parseFloat(localStorage.getItem('temperature')) || 0.7,
            instructions: localStorage.getItem('instructions') || '',
            speed: localStorage.getItem('speed') || 'normal'
        };
        
        // Available voices in OpenAI Realtime API
        this.voices = {
            'alloy': 'Alloy (Balanced, neutral)',
            'echo': 'Echo (Smooth, conversational)', 
            'shimmer': 'Shimmer (Warm, friendly)'
        };
        
        // Speed presets that will be added to instructions
        this.speedPresets = {
            'slow': 'Speak slowly and clearly, taking your time with each word.',
            'normal': '',
            'fast': 'Speak quickly and energetically at a brisk pace.',
            'very-fast': 'Speak very quickly and rapidly.'
        };
    }
    
    createSettingsPanel() {
        const panel = document.createElement('div');
        panel.id = 'voiceSettingsPanel';
        panel.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            padding: 20px;
            z-index: 999;
            display: none;
            width: 300px;
        `;
        
        panel.innerHTML = `
            <h3 style="margin: 0 0 15px 0; color: #333;">🎙️ Voice Settings</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #666; font-size: 14px;">Voice</label>
                <select id="voiceSelect" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                    ${Object.entries(this.voices).map(([value, label]) => 
                        `<option value="${value}" ${this.settings.voice === value ? 'selected' : ''}>${label}</option>`
                    ).join('')}
                </select>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #666; font-size: 14px;">
                    Temperature (Creativity): <span id="tempValue">${this.settings.temperature}</span>
                </label>
                <input type="range" id="temperatureSlider" 
                       min="0" max="1" step="0.1" value="${this.settings.temperature}"
                       style="width: 100%;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #666; font-size: 14px;">Speaking Speed</label>
                <select id="speedSelect" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                    <option value="slow" ${this.settings.speed === 'slow' ? 'selected' : ''}>Slow</option>
                    <option value="normal" ${this.settings.speed === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="fast" ${this.settings.speed === 'fast' ? 'selected' : ''}>Fast</option>
                    <option value="very-fast" ${this.settings.speed === 'very-fast' ? 'selected' : ''}>Very Fast</option>
                </select>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #666; font-size: 14px;">Custom Instructions (Optional)</label>
                <textarea id="instructionsInput" 
                          style="width: 100%; height: 80px; padding: 8px; border: 1px solid #ddd; border-radius: 5px; resize: vertical;"
                          placeholder="e.g., Speak slowly and clearly...">${this.settings.instructions}</textarea>
            </div>
            
            <button onclick="voiceSettings.applySettings()" 
                    style="width: 100%; padding: 10px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                           color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600;">
                Apply Settings
            </button>
            
            <div style="margin-top: 10px; padding: 10px; background: #f0f0f0; border-radius: 5px; font-size: 12px; color: #666;">
                💡 Changes apply to new conversations
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // Add toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'voiceSettingsToggle';
        toggleBtn.innerHTML = '⚙️';
        toggleBtn.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: white;
            border: 2px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            cursor: pointer;
            z-index: 998;
            font-size: 20px;
            transition: all 0.3s;
        `;
        toggleBtn.onclick = () => this.togglePanel();
        document.body.appendChild(toggleBtn);
        
        // Add event listeners
        document.getElementById('temperatureSlider').addEventListener('input', (e) => {
            document.getElementById('tempValue').textContent = e.target.value;
        });
    }
    
    togglePanel() {
        const panel = document.getElementById('voiceSettingsPanel');
        const toggle = document.getElementById('voiceSettingsToggle');
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            toggle.style.background = '#667eea';
            toggle.style.color = 'white';
        } else {
            panel.style.display = 'none';
            toggle.style.background = 'white';
            toggle.style.color = 'black';
        }
    }
    
    applySettings() {
        // Get values from controls
        this.settings.voice = document.getElementById('voiceSelect').value;
        this.settings.temperature = parseFloat(document.getElementById('temperatureSlider').value);
        this.settings.speed = document.getElementById('speedSelect').value;
        
        // Combine speed preset with custom instructions
        const customInstructions = document.getElementById('instructionsInput').value;
        const speedInstruction = this.speedPresets[this.settings.speed] || '';
        this.settings.instructions = speedInstruction + (customInstructions ? ' ' + customInstructions : '');
        
        // Save to localStorage
        localStorage.setItem('voice', this.settings.voice);
        localStorage.setItem('temperature', this.settings.temperature);
        localStorage.setItem('speed', this.settings.speed);
        localStorage.setItem('instructions', customInstructions);
        
        // Send to server via WebSocket
        if (window.voiceBot && window.voiceBot.ws && window.voiceBot.ws.readyState === WebSocket.OPEN) {
            // For standard mode
            window.voiceBot.ws.send(JSON.stringify({
                type: 'update_settings',
                settings: this.settings
            }));
        } else if (window.rtcVoiceBot && window.rtcVoiceBot.ws && window.rtcVoiceBot.ws.readyState === WebSocket.OPEN) {
            // For RTC mode - send update_settings message to server
            window.rtcVoiceBot.ws.send(JSON.stringify({
                type: 'update_settings',
                settings: this.settings
            }));
        }
        
        // Show confirmation
        const panel = document.getElementById('voiceSettingsPanel');
        const confirmMsg = document.createElement('div');
        confirmMsg.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #4CAF50;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            font-weight: 600;
        `;
        confirmMsg.textContent = '✅ Settings Applied!';
        panel.appendChild(confirmMsg);
        
        setTimeout(() => {
            confirmMsg.remove();
            this.togglePanel();
        }, 1500);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.voiceSettings = new VoiceSettings();
        window.voiceSettings.createSettingsPanel();
    });
} else {
    window.voiceSettings = new VoiceSettings();
    window.voiceSettings.createSettingsPanel();
}