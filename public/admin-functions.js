// API Endpoint Management Functions
let apiEndpoints = [];

async function loadApiEndpoints() {
    console.log('Loading API endpoints from server...');
    
    // Clear localStorage first to prevent stale data
    localStorage.removeItem('apiEndpoints');
    
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
                id: api.id || index + 1,
                category: api.category || 'Uncategorized',
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
                example: api.example || '',
                api_key: api.api_key,
                client_id: api.client_id,
                client_secret: api.client_secret,
                api_token: api.api_token,
                marker_id: api.marker_id,
                auth_type: api.auth_type || (api.requires_auth ? 'header' : 'none'),
                auth_param: api.auth_param || api.auth_header_name || api.auth_param_name || 'Authorization',
                search_engine_id: api.search_engine_id || '',
                requires_auth: api.requires_auth
            })) : [];
            
            console.log(`Loaded ${apiEndpoints.length} endpoints from server with credentials preserved`);
            
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

function displayApiEndpoints(filterCategory = 'all', filterStatus = 'all') {
    const endpointList = document.getElementById('endpointList');
    if (!endpointList) {
        console.log('endpointList element not found');
        return;
    }
    
    // Add filter controls if they don't exist
    if (!document.getElementById('api-filters')) {
        const filterHtml = `
            <div id="api-filters" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
                    <div>
                        <label style="font-weight: bold; margin-right: 5px;">Category:</label>
                        <select id="category-filter" onchange="displayApiEndpoints(this.value, document.getElementById('status-filter').value)" style="padding: 5px 10px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="all">All Categories</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-weight: bold; margin-right: 5px;">Status:</label>
                        <select id="status-filter" onchange="displayApiEndpoints(document.getElementById('category-filter').value, this.value)" style="padding: 5px 10px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="all">All APIs</option>
                            <option value="enabled">Enabled Only</option>
                            <option value="disabled">Disabled Only</option>
                            <option value="no-creds">Missing Credentials</option>
                            <option value="with-creds">Has Credentials</option>
                        </select>
                    </div>
                    <div style="margin-left: auto;">
                        <span id="api-count" style="color: #666; font-size: 14px;"></span>
                    </div>
                </div>
            </div>
        `;
        endpointList.insertAdjacentHTML('beforebegin', filterHtml);
    }
    
    // Update category filter options
    const categoryFilter = document.getElementById('category-filter');
    const categories = [...new Set(apiEndpoints.map(ep => ep.category || 'Uncategorized'))].sort();
    categoryFilter.innerHTML = '<option value="all">All Categories</option>' + 
        categories.map(cat => `<option value="${cat}" ${cat === filterCategory ? 'selected' : ''}>${cat}</option>`).join('');
    
    // Apply filters
    let filteredEndpoints = [...apiEndpoints];
    
    if (filterCategory !== 'all') {
        filteredEndpoints = filteredEndpoints.filter(ep => (ep.category || 'Uncategorized') === filterCategory);
    }
    
    // Check if endpoint has credentials
    const hasCredentials = (endpoint) => {
        if (endpoint.auth_type === 'oauth2') {
            return endpoint.client_id && endpoint.client_secret;
        } else if (endpoint.auth_type === 'custom' && endpoint.id === 'travelpayouts_affiliate') {
            return endpoint.api_token && endpoint.marker_id;
        } else if ((endpoint.auth_type && endpoint.auth_type !== 'none') || endpoint.requires_auth) {
            return endpoint.api_key;
        }
        return true; // APIs that don't need auth always have "credentials"
    };
    
    // Check if endpoint needs credentials
    const needsCredentials = (endpoint) => {
        return (endpoint.auth_type && endpoint.auth_type !== 'none') || 
               endpoint.requires_auth || 
               endpoint.client_id !== undefined || 
               endpoint.api_token !== undefined;
    };
    
    if (filterStatus === 'enabled') {
        filteredEndpoints = filteredEndpoints.filter(ep => ep.active);
    } else if (filterStatus === 'disabled') {
        filteredEndpoints = filteredEndpoints.filter(ep => !ep.active);
    } else if (filterStatus === 'no-creds') {
        filteredEndpoints = filteredEndpoints.filter(ep => needsCredentials(ep) && !hasCredentials(ep));
    } else if (filterStatus === 'with-creds') {
        filteredEndpoints = filteredEndpoints.filter(ep => !needsCredentials(ep) || hasCredentials(ep));
    }
    
    // Update count
    document.getElementById('api-count').textContent = `Showing ${filteredEndpoints.length} of ${apiEndpoints.length} APIs`;
    
    console.log(`Displaying ${filteredEndpoints.length} endpoints`);
    
    if (filteredEndpoints.length === 0) {
        endpointList.innerHTML = '<p>No API endpoints match the selected filters.</p>';
        return;
    }
    
    // Group filtered endpoints by category
    const categorizedEndpoints = {};
    filteredEndpoints.forEach(endpoint => {
        const category = endpoint.category || 'Uncategorized';
        if (!categorizedEndpoints[category]) {
            categorizedEndpoints[category] = [];
        }
        categorizedEndpoints[category].push(endpoint);
    });
    
    // Sort categories for consistent display
    const sortedCategories = Object.keys(categorizedEndpoints).sort();
    
    // Generate HTML for categorized endpoints
    endpointList.innerHTML = sortedCategories.map(category => `
        <div class="category-section">
            <h3 class="category-header" style="color: #667eea; margin: 20px 0 10px 0; font-size: 18px; border-bottom: 2px solid #e0e0e0; padding-bottom: 5px;">${category}</h3>
            ${categorizedEndpoints[category].map(endpoint => `
                <div class="endpoint-item ${endpoint.active ? 'active' : 'inactive'}" data-id="${endpoint.id}">
                    <div class="endpoint-header">
                        <div class="endpoint-info">
                            <span class="endpoint-name">${endpoint.name}</span>
                            <span class="method-badge method-${endpoint.method.toLowerCase()}">${endpoint.method}</span>
                            ${(() => {
                                const needsCreds = (endpoint.auth_type && endpoint.auth_type !== 'none') || endpoint.requires_auth || endpoint.client_id !== undefined || endpoint.api_token !== undefined;
                                if (!needsCreds) return '';
                                
                                let hasCreds = false;
                                if (endpoint.auth_type === 'oauth2') {
                                    hasCreds = endpoint.client_id && endpoint.client_secret;
                                } else if (endpoint.auth_type === 'custom' && endpoint.id === 'travelpayouts_affiliate') {
                                    hasCreds = endpoint.api_token && endpoint.marker_id;
                                } else if ((endpoint.auth_type && endpoint.auth_type !== 'none') || endpoint.requires_auth) {
                                    hasCreds = endpoint.api_key;
                                }
                                
                                return hasCreds ? 
                                    `<span class="auth-badge" style="background: #4caf50; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">✅ CONFIGURED</span>` :
                                    `<span class="auth-badge" style="background: #ff9800; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">🔑 NEEDS KEY</span>`;
                            })()}
                            <span class="status-badge ${endpoint.active ? 'active' : 'inactive'}">
                                ${endpoint.active ? '✓ Active' : '✗ Inactive'}
                    </span>
                </div>
                <div class="endpoint-actions">
                    <button onclick="editEndpoint('${endpoint.endpoint_key || endpoint.id}')" class="btn btn-sm">✏️ Edit</button>
                    <button onclick="toggleEndpoint('${endpoint.endpoint_key || endpoint.id}')" class="btn btn-sm">
                        ${endpoint.active ? '🔒 Disable' : '🔓 Enable'}
                    </button>
                    <button onclick="testEndpoint('${endpoint.endpoint_key || endpoint.id}')" class="btn btn-sm btn-test">🧪 Test</button>
                    <button onclick="deleteEndpoint('${endpoint.endpoint_key || endpoint.id}')" class="btn btn-sm btn-danger">🗑️</button>
                </div>
            </div>
            <div class="endpoint-details">
                <div class="endpoint-url">${endpoint.url}</div>
                ${endpoint.description ? `<div class="endpoint-description">${endpoint.description}</div>` : ''}
                ${endpoint.example ? `<div class="endpoint-example">Example: "${endpoint.example}"</div>` : ''}
                ${(endpoint.requires_auth || (endpoint.auth_type && endpoint.auth_type !== 'none')) ? 
                    `<div class="api-key-help" style="background: #ffeeba; padding: 8px; border-radius: 4px; margin-top: 8px; font-size: 12px; border-left: 3px solid #ffc107;">
                        ${endpoint.name === 'NASA API' ? 
                            '<strong>📍 How to get key:</strong> Visit <a href="https://api.nasa.gov/" target="_blank">api.nasa.gov</a> → Fill form → Get instant key via email (FREE, no card)' :
                        endpoint.name === 'News API' ? 
                            '<strong>📍 How to get key:</strong> Visit <a href="https://newsapi.org/register" target="_blank">newsapi.org</a> → Sign up → Get key instantly (100 calls/day FREE)' :
                        endpoint.name === 'YouTube Search API' ? 
                            '<strong>📍 How to get key:</strong> <a href="https://console.cloud.google.com/" target="_blank">Google Cloud</a> → Enable YouTube API → Create credentials (10K units/day FREE)' :
                        endpoint.name === 'Google Maps Geocoding API' ? 
                            '<strong>📍 How to get key:</strong> <a href="https://console.cloud.google.com/" target="_blank">Google Cloud</a> → Enable Geocoding API → Add billing ($200/mo FREE credit)' :
                        endpoint.name === 'Google Translate API' ? 
                            '<strong>📍 How to get key:</strong> <a href="https://console.cloud.google.com/" target="_blank">Google Cloud</a> → Enable Translation API (500K chars/mo FREE)' :
                        endpoint.name === 'Google Custom Search API' ? 
                            '<strong>📍 How to get key:</strong> <a href="https://console.cloud.google.com/" target="_blank">Google Cloud</a> + <a href="https://cse.google.com" target="_blank">Create Search Engine</a> (100/day FREE)' :
                        endpoint.name === 'Google Gemini API' ? 
                            '<strong>📍 How to get key:</strong> Visit <a href="https://makersuite.google.com/" target="_blank">makersuite.google.com</a> → Get API key (60 req/min FREE)' :
                        endpoint.name === 'Amadeus Flight Search API' ?
                            '<strong>📍 How to get credentials:</strong> Visit <a href="https://developers.amadeus.com/" target="_blank">developers.amadeus.com</a> → Register (Self-Service) → Get Client ID & Secret (1K calls/mo FREE in test)' :
                        endpoint.name === 'Travelpayouts Affiliate API' ?
                            '<strong>📍 How to get credentials:</strong> Visit <a href="https://www.travelpayouts.com/" target="_blank">travelpayouts.com</a> → Sign up as affiliate → Get Token & Marker ID from dashboard (commission-based, FREE)' :
                        '<strong>📍 API Key Required:</strong> Check provider documentation for key setup'
                        }
                    </div>` : 
                    ''
                }
            </div>
        </div>
            `).join('')}
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
    
    // Add event listener for auth type changes
    const setupAuthTypeListener = () => {
        setTimeout(() => {
            const authTypeSelect = document.getElementById('edit-auth-type');
            const authDetails = document.getElementById('auth-details');
            const authLabel = document.getElementById('auth-detail-label');
            
            if (authTypeSelect) {
                authTypeSelect.addEventListener('change', (e) => {
                    if (e.target.value === 'none') {
                        authDetails.style.display = 'none';
                    } else {
                        authDetails.style.display = 'block';
                        if (e.target.value === 'header') {
                            authLabel.textContent = 'Auth Header Name:';
                            document.getElementById('edit-auth-param').placeholder = 'e.g., Authorization, X-API-Key';
                        } else if (e.target.value === 'query') {
                            authLabel.textContent = 'Query Parameter Name:';
                            document.getElementById('edit-auth-param').placeholder = 'e.g., api_key, key';
                        }
                    }
                });
            }
        }, 100);
    };
    
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
            ${
                // Dynamic credential fields based on auth type
                endpoint.auth_type === 'oauth2' ? `
                <div class="form-group">
                    <label>OAuth2 Client ID:</label>
                    <input type="text" id="edit-client-id" value="${endpoint.client_id || ''}" placeholder="Enter OAuth2 Client ID">
                    ${endpoint.name === 'Amadeus Flight Search API' ? 
                        '<small>🔑 Get credentials at <a href="https://developers.amadeus.com/" target="_blank">developers.amadeus.com</a> (free tier available)</small>' :
                        '<small>🔑 OAuth2 Client ID required</small>'
                    }
                </div>
                <div class="form-group">
                    <label>OAuth2 Client Secret:</label>
                    <input type="password" id="edit-client-secret" value="${endpoint.client_secret || ''}" placeholder="Enter OAuth2 Client Secret">
                    <small>🔐 Keep this secret secure</small>
                </div>
                ` : endpoint.auth_type === 'custom' && endpoint.id === 'travelpayouts_affiliate' ? `
                <div class="form-group">
                    <label>API Token:</label>
                    <input type="password" id="edit-api-token" value="${endpoint.api_token || ''}" placeholder="Enter Travelpayouts API Token">
                    <small>🔑 Get token at <a href="https://www.travelpayouts.com/" target="_blank">travelpayouts.com</a> (free affiliate program)</small>
                </div>
                <div class="form-group">
                    <label>Marker ID (Affiliate ID):</label>
                    <input type="text" id="edit-marker-id" value="${endpoint.marker_id || ''}" placeholder="Enter your Travelpayouts Marker ID">
                    <small>📊 Your unique affiliate tracking ID from Travelpayouts</small>
                </div>
                ` : `
                <div class="form-group">
                    <label>API Key (if required):</label>
                    <input type="password" id="edit-api-key" value="${endpoint.api_key || ''}" placeholder="Enter API key if this endpoint requires authentication">
                    <small>${
                        endpoint.name === 'NASA API' ? '🔑 Get free key at <a href="https://api.nasa.gov/" target="_blank">api.nasa.gov</a> (instant, no credit card)' :
                        endpoint.name === 'News API' ? '🔑 Get free key at <a href="https://newsapi.org/register" target="_blank">newsapi.org</a> (100 requests/day free)' :
                        endpoint.name === 'YouTube Search API' ? '🔑 Get key at <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a> (10,000 units/day free)' :
                        endpoint.name === 'Google Maps Geocoding API' ? '🔑 Get key at <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a> ($200/month free credit)' :
                        endpoint.name === 'Google Translate API' ? '🔑 Get key at <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a> (500K chars/month free)' :
                        endpoint.name === 'Google Custom Search API' ? '🔑 Get key at <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a> + <a href="https://cse.google.com" target="_blank">Search Engine ID</a>' :
                        endpoint.name === 'Google Gemini API' ? '🔑 Get free key at <a href="https://makersuite.google.com/" target="_blank">makersuite.google.com</a> (60 req/min free)' :
                        endpoint.requires_auth || (endpoint.auth_type && endpoint.auth_type !== 'none') ? 
                            '🔑 API key required - check provider documentation' :
                        '✅ No API key needed - this is a free public API'
                    }</small>
                </div>
                `
            }
            ${(endpoint.requires_auth || (endpoint.auth_type && endpoint.auth_type !== 'none')) ? 
                '<div style="margin-top: 10px; padding: 10px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; font-size: 12px;">' +
                '<strong>📖 Need help?</strong> See <a href="/docs-viewer.html?doc=API_KEYS_GUIDE.md" target="_blank">API Keys Setup Guide</a> for step-by-step instructions' +
                '</div>' : ''
            }
            ${endpoint.name === 'Google Custom Search API' ? `
            <div class="form-group">
                <label>Search Engine ID (cx):</label>
                <input type="text" id="edit-search-engine-id" value="${endpoint.search_engine_id || ''}" placeholder="Your Search Engine ID (cx parameter)">
                <small>🔑 Get your Search Engine ID at <a href="https://cse.google.com/cse/" target="_blank">cse.google.com</a> → Create search engine → Get ID</small>
            </div>
            ` : ''}
            <div class="form-group">
                <label>Authentication Type:</label>
                <select id="edit-auth-type">
                    <option value="none" ${!endpoint.auth_type || endpoint.auth_type === 'none' ? 'selected' : ''}>None</option>
                    <option value="header" ${endpoint.auth_type === 'header' ? 'selected' : ''}>Header (Bearer/API-Key)</option>
                    <option value="query" ${endpoint.auth_type === 'query' ? 'selected' : ''}>Query Parameter</option>
                    <option value="oauth2" ${endpoint.auth_type === 'oauth2' ? 'selected' : ''}>OAuth2 Client Credentials</option>
                    <option value="custom" ${endpoint.auth_type === 'custom' ? 'selected' : ''}>Custom Authentication</option>
                </select>
            </div>
            <div class="form-group" id="auth-details" style="${endpoint.auth_type && endpoint.auth_type !== 'none' ? '' : 'display:none'}">
                <label id="auth-detail-label">Auth Header Name:</label>
                <input type="text" id="edit-auth-param" value="${endpoint.auth_param || 'Authorization'}" placeholder="e.g., Authorization, X-API-Key">
            </div>
            ${endpoint.method === 'POST' ? `
            <div class="form-group">
                <label>Body Template (JSON):</label>
                <textarea id="edit-body-template">${JSON.stringify(endpoint.body_template || {}, null, 2)}</textarea>
            </div>
            ` : ''}
            <div class="form-buttons">
                <button onclick="saveEndpoint('${id}')" class="btn btn-primary">💾 Save</button>
                <button onclick="displayApiEndpoints()" class="btn">Cancel</button>
            </div>
        </div>
    `;
    
    // Replace the endpoint item with the edit form
    const endpointItem = document.querySelector(`[data-id="${id}"]`);
    if (endpointItem) {
        endpointItem.innerHTML = form;
        setupAuthTypeListener();
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
    endpoint.auth_type = document.getElementById('edit-auth-type').value;
    endpoint.auth_param = document.getElementById('edit-auth-param').value;
    
    // Save credentials based on auth type
    if (endpoint.auth_type === 'oauth2') {
        const clientIdEl = document.getElementById('edit-client-id');
        const clientSecretEl = document.getElementById('edit-client-secret');
        if (clientIdEl) endpoint.client_id = clientIdEl.value;
        if (clientSecretEl) endpoint.client_secret = clientSecretEl.value;
    } else if (endpoint.auth_type === 'custom' && endpoint.id === 'travelpayouts_affiliate') {
        const apiTokenEl = document.getElementById('edit-api-token');
        const markerIdEl = document.getElementById('edit-marker-id');
        if (apiTokenEl) endpoint.api_token = apiTokenEl.value;
        if (markerIdEl) endpoint.marker_id = markerIdEl.value;
    } else {
        const apiKeyEl = document.getElementById('edit-api-key');
        if (apiKeyEl) endpoint.api_key = apiKeyEl.value;
    }
    
    // Handle Google Custom Search Engine ID
    if (endpoint.name === 'Google Custom Search API') {
        const searchEngineIdEl = document.getElementById('edit-search-engine-id');
        if (searchEngineIdEl) {
            endpoint.search_engine_id = searchEngineIdEl.value;
        }
    }
    
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
        // Handle server-side APIs (like flight search)
        if (endpoint.url === 'HANDLED_BY_SERVER') {
            // These are handled by the server's function calling
            if (endpoint.id === 'amadeus_flight_search') {
                alert(`ℹ️ Amadeus Flight Search API\n\nThis API is integrated with the voice bot.\nTo test:\n1. Ensure you've entered your Client ID and Secret\n2. Start a voice conversation\n3. Say: "Search for flights from JFK to London tomorrow"\n\nThe API uses the test environment (free, no charges).`);
            } else if (endpoint.id === 'travelpayouts_affiliate') {
                alert(`ℹ️ Travelpayouts Affiliate API\n\nThis API is integrated with the voice bot.\nTo test:\n1. Ensure you've entered your Token and Marker ID\n2. Start a voice conversation\n3. Say: "Find cheap flights to Paris"\n\nThe API provides affiliate links for bookings.`);
            } else {
                alert(`ℹ️ This is a server-side API\n\nIt's handled internally by the voice bot during conversations.`);
            }
            return;
        }
        
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
    
    apiEndpoints = apiEndpoints.filter(ep => ep.endpoint_key !== id && ep.id !== id);
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
                api_key: ep.api_key,
                client_id: ep.client_id,
                client_secret: ep.client_secret,
                api_token: ep.api_token,
                marker_id: ep.marker_id,
                auth_type: ep.auth_type,
                auth_param: ep.auth_param,
                search_engine_id: ep.search_engine_id,
                category: ep.category,
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