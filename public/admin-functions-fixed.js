// API Endpoint Management Functions
let apiEndpoints = [];

async function loadApiEndpoints() {
    console.log('Loading API endpoints from server...');
    
    // Always load from server first - this is the source of truth
    try {
        const response = await fetch('/api/endpoints?t=' + Date.now(), {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        
        if (response.ok) {
            const config = await response.json();
            console.log('Loaded from server:', config);
            
            // Transform server format to admin panel format
            apiEndpoints = config.endpoints ? config.endpoints.map((api, index) => ({
                id: index + 1,
                name: api.name || api.id,
                method: api.method || 'GET',
                url: api.url,
                headers: api.headers || {},
                description: api.description,
                endpoint_key: api.id,
                active: api.active !== false,
                body_template: api.body_template,
                params: api.params,
                params_required: api.params_required,
                trigger_phrases: api.trigger_phrases || [],
                example: api.example || ''
            })) : [];
            
            console.log(`Loaded ${apiEndpoints.length} endpoints from server`);
            
            // Update localStorage with server data
            localStorage.setItem('apiEndpoints', JSON.stringify(apiEndpoints));
            displayApiEndpoints();
            return;
        }
    } catch (error) {
        console.error('Could not load from server:', error);
    }
    
    // Only fall back to localStorage if server is unavailable
    console.log('Server unavailable, checking localStorage...');
    const savedEndpoints = localStorage.getItem('apiEndpoints');
    
    if (savedEndpoints) {
        try {
            apiEndpoints = JSON.parse(savedEndpoints);
            console.log(`Loaded ${apiEndpoints.length} endpoints from localStorage`);
            displayApiEndpoints();
            return;
        } catch (e) {
            console.error('Failed to parse saved endpoints:', e);
        }
    }
    
    console.log('No saved endpoints found, using defaults');
    // If no server and no localStorage, use empty array
    apiEndpoints = [];
    displayApiEndpoints();
}

function displayApiEndpoints() {
    const endpointList = document.getElementById('endpointList');
    if (!endpointList) {
        console.log('endpointList element not found');
        return;
    }
    
    console.log(`Displaying ${apiEndpoints.length} endpoints`);
    
    if (apiEndpoints.length === 0) {
        endpointList.innerHTML = '<p>No API endpoints configured. Click "Add New Endpoint" to get started.</p>';
        return;
    }
    
    endpointList.innerHTML = apiEndpoints.map(endpoint => `
        <div class="endpoint-item ${endpoint.active ? 'active' : 'inactive'}" data-id="${endpoint.id}">
            <div class="endpoint-header">
                <div class="endpoint-info">
                    <span class="endpoint-name">${endpoint.name}</span>
                    <span class="method-badge method-${endpoint.method.toLowerCase()}">${endpoint.method}</span>
                    <span class="status-badge ${endpoint.active ? 'active' : 'inactive'}">
                        ${endpoint.active ? '✓ Active' : '✗ Inactive'}
                    </span>
                </div>
                <div class="endpoint-actions">
                    <button onclick="editEndpoint(${endpoint.id})" class="btn btn-sm">✏️ Edit</button>
                    <button onclick="toggleEndpoint(${endpoint.id})" class="btn btn-sm">
                        ${endpoint.active ? '🔒 Disable' : '🔓 Enable'}
                    </button>
                    <button onclick="testEndpoint(${endpoint.id})" class="btn btn-sm btn-test">🧪 Test</button>
                    <button onclick="deleteEndpoint(${endpoint.id})" class="btn btn-sm btn-danger">🗑️</button>
                </div>
            </div>
            <div class="endpoint-details">
                <div class="endpoint-url">${endpoint.url}</div>
                ${endpoint.description ? `<div class="endpoint-description">${endpoint.description}</div>` : ''}
                ${endpoint.example ? `<div class="endpoint-example">Example: "${endpoint.example}"</div>` : ''}
            </div>
        </div>
    `).join('');
}

window.addNewEndpoint = function() {
    const newEndpoint = {
        id: Math.max(...apiEndpoints.map(e => e.id), 0) + 1,
        name: 'New API Endpoint',
        method: 'GET',
        url: 'https://api.example.com/endpoint',
        headers: {},
        description: 'Configure this endpoint',
        endpoint_key: 'new_endpoint_' + Date.now(),
        active: true,
        trigger_phrases: [],
        example: ''
    };
    
    apiEndpoints.push(newEndpoint);
    displayApiEndpoints();
    editEndpoint(newEndpoint.id);
    
    if (typeof admin !== 'undefined' && admin.showNotification) {
        admin.showNotification('New endpoint added - configure it below', 'success');
    }
};

window.toggleEndpoint = async function(id) {
    const endpoint = apiEndpoints.find(ep => ep.id === id);
    if (endpoint) {
        endpoint.active = !endpoint.active;
        localStorage.setItem('apiEndpoints', JSON.stringify(apiEndpoints));
        displayApiEndpoints();
        
        // Sync with server
        await syncApiEndpointsToServer();
        
        if (typeof admin !== 'undefined' && admin.showNotification) {
            admin.showNotification(`${endpoint.name} ${endpoint.active ? 'enabled' : 'disabled'}`, 'info');
        }
    }
};

window.editEndpoint = function(id) {
    const endpoint = apiEndpoints.find(ep => ep.id === id);
    if (!endpoint) return;
    
    const form = `
        <div class="edit-form">
            <h3>Edit API Endpoint</h3>
            <div class="form-group">
                <label>Name:</label>
                <input type="text" id="edit-name" value="${endpoint.name}">
            </div>
            <div class="form-group">
                <label>Method:</label>
                <select id="edit-method">
                    <option value="GET" ${endpoint.method === 'GET' ? 'selected' : ''}>GET</option>
                    <option value="POST" ${endpoint.method === 'POST' ? 'selected' : ''}>POST</option>
                    <option value="PUT" ${endpoint.method === 'PUT' ? 'selected' : ''}>PUT</option>
                    <option value="DELETE" ${endpoint.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                </select>
            </div>
            <div class="form-group">
                <label>URL:</label>
                <input type="text" id="edit-url" value="${endpoint.url}">
            </div>
            <div class="form-group">
                <label>Description:</label>
                <textarea id="edit-description">${endpoint.description || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Example:</label>
                <input type="text" id="edit-example" value="${endpoint.example || ''}">
            </div>
            <div class="form-group">
                <label>Headers (JSON):</label>
                <textarea id="edit-headers">${JSON.stringify(endpoint.headers || {}, null, 2)}</textarea>
            </div>
            ${endpoint.method === 'POST' ? `
            <div class="form-group">
                <label>Body Template (JSON):</label>
                <textarea id="edit-body-template">${JSON.stringify(endpoint.body_template || {}, null, 2)}</textarea>
            </div>
            ` : ''}
            <div class="form-buttons">
                <button onclick="saveEndpoint(${id})" class="btn btn-primary">💾 Save</button>
                <button onclick="displayApiEndpoints()" class="btn">Cancel</button>
            </div>
        </div>
    `;
    
    // Replace the endpoint item with the edit form
    const endpointItem = document.querySelector(`[data-id="${id}"]`);
    if (endpointItem) {
        endpointItem.innerHTML = form;
    }
};

window.saveEndpoint = async function(id) {
    const endpoint = apiEndpoints.find(ep => ep.id === id);
    if (!endpoint) return;
    
    // Get form values
    endpoint.name = document.getElementById('edit-name').value;
    endpoint.method = document.getElementById('edit-method').value;
    endpoint.url = document.getElementById('edit-url').value;
    endpoint.description = document.getElementById('edit-description').value;
    endpoint.example = document.getElementById('edit-example').value;
    
    try {
        endpoint.headers = JSON.parse(document.getElementById('edit-headers').value);
    } catch (e) {
        console.error('Invalid JSON in headers');
    }
    
    if (endpoint.method === 'POST') {
        const bodyTemplateEl = document.getElementById('edit-body-template');
        if (bodyTemplateEl) {
            try {
                endpoint.body_template = JSON.parse(bodyTemplateEl.value);
            } catch (e) {
                console.error('Invalid JSON in body template');
            }
        }
    }
    
    // Save to localStorage
    localStorage.setItem('apiEndpoints', JSON.stringify(apiEndpoints));
    
    // Sync with server
    await syncApiEndpointsToServer();
    
    displayApiEndpoints();
    
    if (typeof admin !== 'undefined' && admin.showNotification) {
        admin.showNotification('Endpoint saved successfully', 'success');
    }
};

window.testEndpoint = async function(id) {
    const endpoint = apiEndpoints.find(ep => ep.id === id);
    if (!endpoint) return;
    
    try {
        let url = endpoint.url;
        
        // For demo, replace placeholders with sample values
        if (url.includes('{city}')) {
            url = url.replace('{city}', 'London');
        }
        if (url.includes('{number}')) {
            url = url.replace('{number}', '42');
        }
        
        const response = await fetch(url, {
            method: endpoint.method,
            headers: endpoint.headers || {}
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log(`Test successful for ${endpoint.name}:`, data);
            alert(`✅ Test successful!\n\nResponse preview:\n${JSON.stringify(data, null, 2).substring(0, 500)}...`);
        } else {
            alert(`❌ Test failed: HTTP ${response.status}`);
        }
    } catch (error) {
        alert(`❌ Test failed: ${error.message}`);
    }
};

window.deleteEndpoint = async function(id) {
    if (!confirm('Are you sure you want to delete this endpoint?')) {
        return;
    }
    
    apiEndpoints = apiEndpoints.filter(ep => ep.id !== id);
    displayApiEndpoints();
    
    // Update localStorage
    localStorage.setItem('apiEndpoints', JSON.stringify(apiEndpoints));
    
    // Sync with server
    await syncApiEndpointsToServer();
    
    if (typeof admin !== 'undefined' && admin.showNotification) {
        admin.showNotification('Endpoint deleted', 'info');
    }
};

// Helper function to sync endpoints to server
async function syncApiEndpointsToServer() {
    try {
        // Transform admin panel format back to server format
        const config = {
            endpoints: apiEndpoints.map(ep => ({
                id: ep.endpoint_key || ep.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                name: ep.name,
                description: ep.description || '',
                url: ep.url,
                method: ep.method || 'GET',
                headers: ep.headers || {},
                trigger_phrases: ep.trigger_phrases || [],
                example: ep.example || '',
                params: ep.params || [],
                body_template: ep.body_template,
                params_required: ep.params_required,
                active: ep.active !== false
            }))
        };
        
        const response = await fetch('/api/endpoints', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        if (!response.ok) {
            console.error('Failed to sync with server');
        } else {
            console.log('Successfully synced with server');
        }
    } catch (error) {
        console.error('Error syncing to server:', error);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadApiEndpoints);
} else {
    loadApiEndpoints();
}

// Export for admin panel
window.loadApiEndpoints = loadApiEndpoints;
window.displayApiEndpoints = displayApiEndpoints;