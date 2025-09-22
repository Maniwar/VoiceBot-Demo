import https from 'https';

export class FlightSearchTool {
    constructor(config = {}) {
        this.clientId = config.clientId || process.env.AMADEUS_CLIENT_ID;
        this.clientSecret = config.clientSecret || process.env.AMADEUS_CLIENT_SECRET;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.enabled = config.enabled !== false;
        this.sandbox = config.sandbox !== false; // Use sandbox by default
    }

    async authenticate() {
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        const data = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.clientId,
            client_secret: this.clientSecret
        }).toString();

        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.sandbox ? 'test.api.amadeus.com' : 'api.amadeus.com',
                path: '/v1/security/oauth2/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': data.length
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                
                res.on('data', chunk => responseData += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(responseData);
                        
                        if (result.access_token) {
                            this.accessToken = result.access_token;
                            this.tokenExpiry = Date.now() + (result.expires_in * 1000);
                            resolve(this.accessToken);
                        } else {
                            reject(new Error('Failed to authenticate with Amadeus'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    async searchFlights(params) {
        if (!this.enabled) {
            throw new Error('Flight search is disabled');
        }

        if (!this.clientId || !this.clientSecret) {
            throw new Error('Amadeus API credentials not configured');
        }

        const token = await this.authenticate();
        
        const queryParams = new URLSearchParams({
            originLocationCode: params.origin,
            destinationLocationCode: params.destination,
            departureDate: params.departureDate,
            adults: params.adults || 1,
            children: params.children || 0,
            infants: params.infants || 0,
            travelClass: params.travelClass || 'ECONOMY',
            currencyCode: params.currency || 'USD',
            max: params.maxResults || 10
        });

        if (params.returnDate) {
            queryParams.append('returnDate', params.returnDate);
        }

        return this.makeAuthenticatedRequest(
            `/v2/shopping/flight-offers?${queryParams}`,
            token
        );
    }

    async getAirportInfo(code) {
        const token = await this.authenticate();
        return this.makeAuthenticatedRequest(
            `/v1/reference-data/locations?subType=AIRPORT&keyword=${code}`,
            token
        );
    }

    async searchAirports(keyword) {
        const token = await this.authenticate();
        return this.makeAuthenticatedRequest(
            `/v1/reference-data/locations/cities?keyword=${keyword}`,
            token
        );
    }

    makeAuthenticatedRequest(path, token) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.sandbox ? 'test.api.amadeus.com' : 'api.amadeus.com',
                path: path,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            };

            https.get(options, (res) => {
                let data = '';
                
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        
                        if (res.statusCode === 200) {
                            resolve(this.formatFlightData(result));
                        } else {
                            reject(new Error(result.errors?.[0]?.detail || 'Amadeus API error'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', reject);
        });
    }

    formatFlightData(data) {
        if (data.data?.[0]?.type === 'flight-offer') {
            // Flight search results
            return {
                type: 'flights',
                count: data.meta?.count || data.data.length,
                flights: data.data.map(offer => ({
                    id: offer.id,
                    price: {
                        total: offer.price.total,
                        base: offer.price.base,
                        currency: offer.price.currency,
                        grandTotal: offer.price.grandTotal
                    },
                    itineraries: offer.itineraries.map(itinerary => ({
                        duration: itinerary.duration,
                        segments: itinerary.segments.map(segment => ({
                            departure: {
                                airport: segment.departure.iataCode,
                                terminal: segment.departure.terminal,
                                at: segment.departure.at
                            },
                            arrival: {
                                airport: segment.arrival.iataCode,
                                terminal: segment.arrival.terminal,
                                at: segment.arrival.at
                            },
                            carrierCode: segment.carrierCode,
                            flightNumber: segment.number,
                            aircraft: segment.aircraft?.code,
                            duration: segment.duration,
                            numberOfStops: segment.numberOfStops || 0
                        }))
                    })),
                    travelers: offer.travelerPricings?.length || 1,
                    bookingClass: offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin
                }))
            };
        } else if (data.data?.[0]?.type === 'location') {
            // Airport/location search results
            return {
                type: 'locations',
                count: data.data.length,
                locations: data.data.map(loc => ({
                    type: loc.subType,
                    name: loc.name,
                    iataCode: loc.iataCode,
                    cityName: loc.address?.cityName,
                    countryName: loc.address?.countryName,
                    countryCode: loc.address?.countryCode,
                    coordinates: loc.geoCode
                }))
            };
        }
        
        return data;
    }

    formatAsMarkdown(results) {
        let markdown = '';
        
        if (results.type === 'flights') {
            markdown += `## ✈️ Flight Search Results\n\n`;
            markdown += `*Found ${results.count} flights*\n\n`;
            
            results.flights.slice(0, 5).forEach((flight, index) => {
                markdown += `### Option ${index + 1}: ${flight.price.currency} ${flight.price.total}\n\n`;
                
                flight.itineraries.forEach((itinerary, itinIndex) => {
                    markdown += `**${itinIndex === 0 ? 'Outbound' : 'Return'}** (Duration: ${itinerary.duration})\n`;
                    
                    itinerary.segments.forEach(segment => {
                        const depTime = new Date(segment.departure.at);
                        const arrTime = new Date(segment.arrival.at);
                        
                        markdown += `- 🛫 **${segment.departure.airport}** `;
                        markdown += `${depTime.toLocaleTimeString()} → `;
                        markdown += `🛬 **${segment.arrival.airport}** `;
                        markdown += `${arrTime.toLocaleTimeString()}\n`;
                        markdown += `  Flight: ${segment.carrierCode}${segment.flightNumber}`;
                        if (segment.aircraft) {
                            markdown += ` | Aircraft: ${segment.aircraft}`;
                        }
                        markdown += `\n`;
                    });
                    markdown += '\n';
                });
                
                markdown += `**Total Price:** ${flight.price.currency} ${flight.price.grandTotal}\n`;
                markdown += `**Class:** ${flight.bookingClass || 'Economy'}\n\n`;
                markdown += `---\n\n`;
            });
        } else if (results.type === 'locations') {
            markdown += `## 📍 Airport Search Results\n\n`;
            
            results.locations.forEach(loc => {
                markdown += `- **${loc.name}** (${loc.iataCode})\n`;
                markdown += `  ${loc.cityName}, ${loc.countryName}\n`;
            });
        }
        
        return markdown;
    }

    formatAsHTML(results) {
        let html = '<div class="flight-results">';
        
        if (results.type === 'flights') {
            html += `
                <h2>✈️ Flight Search Results</h2>
                <p class="results-count">Found ${results.count} flights</p>
                <div class="flights-list">
            `;
            
            results.flights.slice(0, 5).forEach((flight, index) => {
                html += `
                    <div class="flight-card">
                        <div class="flight-header">
                            <span class="flight-number">Option ${index + 1}</span>
                            <span class="flight-price">${flight.price.currency} ${flight.price.total}</span>
                        </div>
                `;
                
                flight.itineraries.forEach((itinerary, itinIndex) => {
                    html += `
                        <div class="itinerary">
                            <h4>${itinIndex === 0 ? 'Outbound' : 'Return'}</h4>
                            <div class="segments">
                    `;
                    
                    itinerary.segments.forEach(segment => {
                        const depTime = new Date(segment.departure.at);
                        const arrTime = new Date(segment.arrival.at);
                        
                        html += `
                            <div class="segment">
                                <div class="segment-time">
                                    <span class="airport">${segment.departure.airport}</span>
                                    <span class="time">${depTime.toLocaleTimeString()}</span>
                                </div>
                                <div class="segment-flight">
                                    <span class="carrier">${segment.carrierCode}${segment.flightNumber}</span>
                                    <span class="duration">${segment.duration}</span>
                                </div>
                                <div class="segment-time">
                                    <span class="airport">${segment.arrival.airport}</span>
                                    <span class="time">${arrTime.toLocaleTimeString()}</span>
                                </div>
                            </div>
                        `;
                    });
                    
                    html += '</div></div>';
                });
                
                html += `
                        <div class="flight-footer">
                            <span class="total-price">Total: ${flight.price.currency} ${flight.price.grandTotal}</span>
                            <span class="cabin-class">${flight.bookingClass || 'Economy'}</span>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
        }
        
        html += '</div>';
        return html;
    }
}

// Tool definition for OpenAI Realtime API
export const flightSearchToolDefinition = {
    name: 'search_flights',
    description: 'Search for flights between airports',
    parameters: {
        type: 'object',
        properties: {
            origin: {
                type: 'string',
                description: 'Origin airport code (e.g., "JFK", "LAX")'
            },
            destination: {
                type: 'string',
                description: 'Destination airport code (e.g., "LHR", "CDG")'
            },
            departureDate: {
                type: 'string',
                description: 'Departure date in YYYY-MM-DD format'
            },
            returnDate: {
                type: 'string',
                description: 'Return date in YYYY-MM-DD format (optional for one-way)'
            },
            adults: {
                type: 'number',
                description: 'Number of adult passengers',
                default: 1
            },
            travelClass: {
                type: 'string',
                enum: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'],
                default: 'ECONOMY'
            }
        },
        required: ['origin', 'destination', 'departureDate']
    }
};

export default FlightSearchTool;