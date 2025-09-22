import https from 'https';

export class EnhancedFlightSearchTool {
    constructor(config = {}) {
        this.clientId = config.clientId || process.env.AMADEUS_CLIENT_ID;
        this.clientSecret = config.clientSecret || process.env.AMADEUS_CLIENT_SECRET;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.enabled = config.enabled !== false;
        this.sandbox = config.sandbox === true; // Use production by default
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

    // Enhanced flight search with more options
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
            max: params.maxResults || 10,
            nonStop: params.nonStop || false,
            includedAirlineCodes: params.airlines || '',
            maxPrice: params.maxPrice || ''
        });

        // Clean up empty params
        Array.from(queryParams.entries()).forEach(([key, value]) => {
            if (!value || value === '') {
                queryParams.delete(key);
            }
        });

        if (params.returnDate) {
            queryParams.append('returnDate', params.returnDate);
        }

        return this.makeAuthenticatedRequest(
            `/v2/shopping/flight-offers?${queryParams}`,
            token
        );
    }

    // Flight price prediction
    async predictFlightPrice(params) {
        const token = await this.authenticate();
        
        const queryParams = new URLSearchParams({
            originIataCode: params.origin,
            destinationIataCode: params.destination,
            departureDate: params.departureDate,
            currencyCode: params.currency || 'USD',
            oneWay: params.oneWay !== false
        });

        if (params.returnDate && !params.oneWay) {
            queryParams.append('returnDate', params.returnDate);
        }

        return this.makeAuthenticatedRequest(
            `/v1/analytics/itinerary-price-metrics?${queryParams}`,
            token
        );
    }

    // Most booked destinations
    async getMostBookedDestinations(params) {
        const token = await this.authenticate();
        
        const queryParams = new URLSearchParams({
            originCityCode: params.origin,
            period: params.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
        });

        return this.makeAuthenticatedRequest(
            `/v1/travel/analytics/air-traffic/booked?${queryParams}`,
            token
        );
    }

    // Busiest travel periods
    async getBusiestPeriods(params) {
        const token = await this.authenticate();
        
        const queryParams = new URLSearchParams({
            cityCode: params.city,
            period: params.year || new Date().getFullYear().toString(),
            direction: params.direction || 'ARRIVING'
        });

        return this.makeAuthenticatedRequest(
            `/v1/travel/analytics/air-traffic/busiest-period?${queryParams}`,
            token
        );
    }

    // Flight inspiration search (find cheapest destinations)
    async searchFlightInspiration(params) {
        const token = await this.authenticate();
        
        const queryParams = new URLSearchParams({
            origin: params.origin,
            maxPrice: params.maxPrice || '',
            departureDate: params.departureDate || '',
            oneWay: params.oneWay || false,
            duration: params.duration || '',
            nonStop: params.nonStop || false,
            viewBy: params.viewBy || 'DESTINATION'
        });

        // Clean up empty params
        Array.from(queryParams.entries()).forEach(([key, value]) => {
            if (!value || value === '') {
                queryParams.delete(key);
            }
        });

        return this.makeAuthenticatedRequest(
            `/v1/shopping/flight-destinations?${queryParams}`,
            token
        );
    }

    // Flight cheapest date search
    async findCheapestDates(params) {
        const token = await this.authenticate();
        
        const queryParams = new URLSearchParams({
            origin: params.origin,
            destination: params.destination,
            oneWay: params.oneWay || false,
            nonStop: params.nonStop || false,
            viewBy: params.viewBy || 'DATE'
        });

        if (params.departureDate) {
            queryParams.append('departureDate', params.departureDate);
        }

        return this.makeAuthenticatedRequest(
            `/v1/shopping/flight-dates?${queryParams}`,
            token
        );
    }

    // Flight status
    async getFlightStatus(params) {
        const token = await this.authenticate();
        
        const queryParams = new URLSearchParams({
            carrierCode: params.carrierCode,
            flightNumber: params.flightNumber,
            scheduledDepartureDate: params.date
        });

        return this.makeAuthenticatedRequest(
            `/v2/schedule/flights?${queryParams}`,
            token
        );
    }

    // Airport and city search
    async searchAirports(keyword) {
        const token = await this.authenticate();
        return this.makeAuthenticatedRequest(
            `/v1/reference-data/locations/cities?keyword=${encodeURIComponent(keyword)}&max=10`,
            token
        );
    }

    // Get detailed airport information
    async getAirportInfo(code) {
        const token = await this.authenticate();
        return this.makeAuthenticatedRequest(
            `/v1/reference-data/locations?subType=AIRPORT&keyword=${code}`,
            token
        );
    }

    // Airlines information
    async getAirlineInfo(code) {
        const token = await this.authenticate();
        return this.makeAuthenticatedRequest(
            `/v1/reference-data/airlines?airlineCodes=${code}`,
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
        // Handle different response types
        if (data.data?.[0]?.type === 'flight-offer') {
            // Flight search results
            return {
                type: 'flights',
                count: data.meta?.count || data.data.length,
                flights: data.data.map(offer => {
                    // Generate booking link
                    const bookingUrl = this.generateBookingUrl(offer);
                    
                    return {
                        id: offer.id,
                        bookingUrl: bookingUrl,
                        price: {
                            total: offer.price.total,
                            base: offer.price.base,
                            currency: offer.price.currency,
                            grandTotal: offer.price.grandTotal,
                            fees: offer.price.fees,
                            taxes: offer.price.taxes
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
                                numberOfStops: segment.numberOfStops || 0,
                                blacklistedInEU: segment.blacklistedInEU || false
                            }))
                        })),
                        travelers: offer.travelerPricings?.length || 1,
                        bookingClass: offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin,
                        validatingAirlineCodes: offer.validatingAirlineCodes,
                        instantTicketingRequired: offer.instantTicketingRequired,
                        lastTicketingDate: offer.lastTicketingDate
                    };
                })
            };
        } else if (data.data?.[0]?.type === 'flight-destination') {
            // Flight inspiration/destination results
            return {
                type: 'destinations',
                count: data.data.length,
                destinations: data.data.map(dest => ({
                    origin: dest.origin,
                    destination: dest.destination,
                    departureDate: dest.departureDate,
                    returnDate: dest.returnDate,
                    price: dest.price,
                    links: dest.links
                }))
            };
        } else if (data.data?.[0]?.type === 'flight-date') {
            // Cheapest dates results
            return {
                type: 'dates',
                count: data.data.length,
                dates: data.data.map(date => ({
                    origin: date.origin,
                    destination: date.destination,
                    departureDate: date.departureDate,
                    returnDate: date.returnDate,
                    price: date.price,
                    links: date.links
                }))
            };
        } else if (data.data?.[0]?.type === 'itinerary-price-metric') {
            // Price prediction results
            return {
                type: 'price-metrics',
                data: data.data.map(metric => ({
                    origin: metric.origin.iataCode,
                    destination: metric.destination.iataCode,
                    departureDate: metric.departureDate,
                    oneWay: metric.oneWay,
                    priceMetrics: metric.priceMetrics,
                    currency: metric.currencyCode
                }))
            };
        } else if (data.data?.[0]?.type === 'air-traffic') {
            // Air traffic analytics
            return {
                type: 'air-traffic',
                data: data.data
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
                    coordinates: loc.geoCode,
                    timeZone: loc.timeZone
                }))
            };
        }
        
        return data;
    }

    generateBookingUrl(offer) {
        // Generate deep link to airline or booking site
        const firstSegment = offer.itineraries[0]?.segments[0];
        const carrier = firstSegment?.carrierCode;
        const origin = firstSegment?.departure?.iataCode;
        const destination = offer.itineraries[0]?.segments[offer.itineraries[0].segments.length - 1]?.arrival?.iataCode;
        const depDate = firstSegment?.departure?.at?.split('T')[0];
        
        // Map common airline codes to booking URLs
        const airlineUrls = {
            'AA': 'https://www.aa.com',
            'DL': 'https://www.delta.com',
            'UA': 'https://www.united.com',
            'BA': 'https://www.britishairways.com',
            'LH': 'https://www.lufthansa.com',
            'AF': 'https://www.airfrance.com',
            'EK': 'https://www.emirates.com',
            'QR': 'https://www.qatarairways.com'
        };

        const baseUrl = airlineUrls[carrier] || 'https://www.google.com/flights';
        
        // For Google Flights fallback
        if (!airlineUrls[carrier]) {
            return `${baseUrl}?hl=en#search;f=${origin};t=${destination};d=${depDate};tt=o`;
        }
        
        return baseUrl;
    }

    formatAsMarkdown(results) {
        let markdown = '';
        
        if (results.type === 'flights') {
            markdown += `## ✈️ Flight Search Results\n\n`;
            markdown += `*Found ${results.count} flights*\n\n`;
            
            results.flights.slice(0, 5).forEach((flight, index) => {
                markdown += `### Option ${index + 1}: ${flight.price.currency} ${flight.price.total}\n\n`;
                
                // Add booking link
                if (flight.bookingUrl) {
                    markdown += `[🔗 Book this flight](${flight.bookingUrl})\n\n`;
                }
                
                flight.itineraries.forEach((itinerary, itinIndex) => {
                    markdown += `**${itinIndex === 0 ? 'Outbound' : 'Return'}** (Duration: ${this.formatDuration(itinerary.duration)})\n`;
                    
                    itinerary.segments.forEach(segment => {
                        const depTime = new Date(segment.departure.at);
                        const arrTime = new Date(segment.arrival.at);
                        
                        markdown += `- 🛫 **${segment.departure.airport}** `;
                        if (segment.departure.terminal) {
                            markdown += `(Terminal ${segment.departure.terminal}) `;
                        }
                        markdown += `${depTime.toLocaleString()} → `;
                        markdown += `🛬 **${segment.arrival.airport}** `;
                        if (segment.arrival.terminal) {
                            markdown += `(Terminal ${segment.arrival.terminal}) `;
                        }
                        markdown += `${arrTime.toLocaleString()}\n`;
                        markdown += `  Flight: ${segment.carrierCode}${segment.flightNumber}`;
                        if (segment.aircraft) {
                            markdown += ` | Aircraft: ${segment.aircraft}`;
                        }
                        markdown += ` | Duration: ${this.formatDuration(segment.duration)}`;
                        if (segment.numberOfStops > 0) {
                            markdown += ` | ${segment.numberOfStops} stop(s)`;
                        }
                        markdown += `\n`;
                    });
                    markdown += '\n';
                });
                
                markdown += `**Total Price:** ${flight.price.currency} ${flight.price.grandTotal}\n`;
                if (flight.price.base !== flight.price.grandTotal) {
                    markdown += `  - Base fare: ${flight.price.currency} ${flight.price.base}\n`;
                    markdown += `  - Taxes & fees: ${flight.price.currency} ${(parseFloat(flight.price.grandTotal) - parseFloat(flight.price.base)).toFixed(2)}\n`;
                }
                markdown += `**Class:** ${flight.bookingClass || 'Economy'}\n`;
                if (flight.instantTicketingRequired) {
                    markdown += `⚠️ **Instant ticketing required**\n`;
                }
                if (flight.lastTicketingDate) {
                    markdown += `📅 **Book by:** ${new Date(flight.lastTicketingDate).toLocaleDateString()}\n`;
                }
                markdown += `\n---\n\n`;
            });
        } else if (results.type === 'destinations') {
            markdown += `## 🌍 Flight Inspiration - Cheapest Destinations\n\n`;
            
            results.destinations.forEach(dest => {
                markdown += `- **${dest.destination}**: ${dest.price.total} ${dest.price.currency || 'USD'}\n`;
                markdown += `  Departure: ${dest.departureDate}`;
                if (dest.returnDate) {
                    markdown += ` | Return: ${dest.returnDate}`;
                }
                markdown += `\n`;
                if (dest.links?.flightOffers) {
                    markdown += `  [View flights](${dest.links.flightOffers})\n`;
                }
            });
        } else if (results.type === 'dates') {
            markdown += `## 📅 Cheapest Travel Dates\n\n`;
            
            results.dates.forEach(date => {
                markdown += `- **${date.departureDate}`;
                if (date.returnDate) {
                    markdown += ` - ${date.returnDate}`;
                }
                markdown += `**: ${date.price.total} ${date.price.currency || 'USD'}\n`;
            });
        } else if (results.type === 'price-metrics') {
            markdown += `## 📊 Price Analysis\n\n`;
            
            results.data.forEach(metric => {
                markdown += `### ${metric.origin} → ${metric.destination}\n`;
                markdown += `Departure: ${metric.departureDate}\n\n`;
                markdown += `Price ranges (${metric.currency}):\n`;
                
                metric.priceMetrics.forEach(price => {
                    markdown += `- ${price.quartileRanking}: ${price.amount}\n`;
                });
                markdown += '\n';
            });
        } else if (results.type === 'locations') {
            markdown += `## 📍 Airport Search Results\n\n`;
            
            results.locations.forEach(loc => {
                markdown += `- **${loc.name}** (${loc.iataCode})\n`;
                markdown += `  ${loc.cityName}, ${loc.countryName}`;
                if (loc.timeZone) {
                    markdown += ` | Timezone: ${loc.timeZone}`;
                }
                markdown += `\n`;
            });
        }
        
        return markdown;
    }

    formatDuration(isoDuration) {
        // Convert ISO 8601 duration to readable format
        const matches = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
        if (!matches) return isoDuration;
        
        const hours = matches[1] || 0;
        const minutes = matches[2] || 0;
        
        if (hours && minutes) {
            return `${hours}h ${minutes}m`;
        } else if (hours) {
            return `${hours}h`;
        } else {
            return `${minutes}m`;
        }
    }
}

// Export enhanced tool definition for OpenAI Realtime API
export const enhancedFlightSearchToolDefinition = {
    name: 'search_flights',
    description: 'Search for flights, find cheapest dates, get price predictions, and discover destinations',
    parameters: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['search', 'cheapest_dates', 'price_prediction', 'inspiration', 'status', 'airport_search'],
                description: 'Type of flight search to perform'
            },
            origin: {
                type: 'string',
                description: 'Origin airport or city code (e.g., "JFK", "NYC")'
            },
            destination: {
                type: 'string',
                description: 'Destination airport or city code'
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
            children: {
                type: 'number',
                description: 'Number of child passengers',
                default: 0
            },
            travelClass: {
                type: 'string',
                enum: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'],
                default: 'ECONOMY'
            },
            nonStop: {
                type: 'boolean',
                description: 'Only show non-stop flights',
                default: false
            },
            maxPrice: {
                type: 'number',
                description: 'Maximum price filter'
            },
            airlines: {
                type: 'string',
                description: 'Comma-separated airline codes (e.g., "AA,DL,UA")'
            },
            carrierCode: {
                type: 'string',
                description: 'Airline code for flight status'
            },
            flightNumber: {
                type: 'string',
                description: 'Flight number for status check'
            },
            keyword: {
                type: 'string',
                description: 'Search keyword for airports/cities'
            }
        },
        required: ['action']
    }
};

export default EnhancedFlightSearchTool;