import https from 'https';

export class GoogleSearchTool {
    constructor(config = {}) {
        this.apiKey = config.apiKey || process.env.GOOGLE_API_KEY;
        this.searchEngineId = config.searchEngineId || process.env.GOOGLE_SEARCH_ENGINE_ID;
        this.enabled = config.enabled !== false;
    }

    async search(query, options = {}) {
        if (!this.enabled) {
            throw new Error('Google Search is disabled');
        }

        if (!this.apiKey || !this.searchEngineId) {
            throw new Error('Google Search API credentials not configured');
        }

        const params = new URLSearchParams({
            key: this.apiKey,
            cx: this.searchEngineId,
            q: query,
            num: options.num || 5,
            searchType: options.searchType || 'web', // Can be 'image' for image search
            ...options.additionalParams
        });

        return new Promise((resolve, reject) => {
            const url = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
            
            https.get(url, (res) => {
                let data = '';
                
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        
                        if (result.error) {
                            reject(new Error(result.error.message));
                            return;
                        }

                        // Format response with rich media
                        const formattedResults = this.formatSearchResults(result);
                        resolve(formattedResults);
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', reject);
        });
    }

    formatSearchResults(googleResponse) {
        const results = {
            query: googleResponse.queries?.request?.[0]?.searchTerms,
            totalResults: googleResponse.searchInformation?.totalResults,
            searchTime: googleResponse.searchInformation?.searchTime,
            items: []
        };

        if (googleResponse.items) {
            results.items = googleResponse.items.map(item => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet,
                displayLink: item.displayLink,
                // Rich media
                image: item.pagemap?.cse_image?.[0]?.src || item.pagemap?.imageobject?.[0]?.url,
                thumbnail: item.pagemap?.cse_thumbnail?.[0],
                video: item.pagemap?.videoobject?.[0],
                // Metadata
                metatags: item.pagemap?.metatags?.[0],
                // For rendering
                htmlSnippet: item.htmlSnippet,
                formattedUrl: item.formattedUrl
            }));
        }

        return results;
    }

    async searchImages(query, options = {}) {
        return this.search(query, {
            ...options,
            searchType: 'image',
            imgSize: options.size || 'medium',
            imgType: options.type || 'photo'
        });
    }

    async searchVideos(query, options = {}) {
        // Search with video-specific parameters
        const results = await this.search(`${query} site:youtube.com OR site:vimeo.com`, options);
        
        // Filter for video results
        results.items = results.items.filter(item => 
            item.link.includes('youtube.com') || 
            item.link.includes('vimeo.com') ||
            item.video
        );

        return results;
    }

    // Generate markdown response with rich media
    formatAsMarkdown(results) {
        let markdown = `## Search Results for: "${results.query}"\n\n`;
        markdown += `*Found ${results.totalResults} results in ${results.searchTime}s*\n\n`;

        results.items.forEach((item, index) => {
            markdown += `### ${index + 1}. [${item.title}](${item.link})\n`;
            markdown += `*${item.displayLink}*\n\n`;
            
            if (item.image) {
                markdown += `![Image](${item.image})\n\n`;
            }
            
            markdown += `${item.snippet}\n\n`;
            
            if (item.video) {
                markdown += `📹 [Watch Video](${item.link})\n\n`;
            }
            
            markdown += `---\n\n`;
        });

        return markdown;
    }

    // Generate HTML response with rich media
    formatAsHTML(results) {
        let html = `
        <div class="search-results">
            <h2>Search Results for: "${results.query}"</h2>
            <p class="search-meta">Found ${results.totalResults} results in ${results.searchTime}s</p>
            <div class="results-list">
        `;

        results.items.forEach(item => {
            html += `
            <div class="result-item">
                <h3><a href="${item.link}" target="_blank">${item.title}</a></h3>
                <cite>${item.displayLink}</cite>
            `;
            
            if (item.thumbnail) {
                html += `<img src="${item.thumbnail.src}" width="${item.thumbnail.width}" height="${item.thumbnail.height}" alt="${item.title}" class="result-thumbnail">`;
            }
            
            html += `<p>${item.snippet}</p>`;
            
            if (item.video) {
                html += `<div class="video-indicator">📹 Video Available</div>`;
            }
            
            html += `</div>`;
        });

        html += `</div></div>`;
        return html;
    }
}

// Tool definition for OpenAI Realtime API
export const googleSearchToolDefinition = {
    name: 'search_google',
    description: 'Search Google for information, images, videos, and web content',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The search query'
            },
            searchType: {
                type: 'string',
                enum: ['web', 'image', 'video'],
                description: 'Type of search to perform',
                default: 'web'
            },
            num: {
                type: 'number',
                description: 'Number of results to return',
                default: 5
            }
        },
        required: ['query']
    }
};

export default GoogleSearchTool;