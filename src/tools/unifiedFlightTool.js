import https from 'https';

/**
 * Unified Flight Tool - Comprehensive Amadeus API Integration
 * Consolidates functionality from flightSearchTool, enhancedFlightSearchTool, and comprehensiveAmadeusAPI
 *
 * Features:
 * - Flight search with advanced filtering
 * - Price prediction and analysis
 * - Flight inspiration and cheapest dates
 * - Flight status and airline information
 * - Airport search and route information
 * - Travel insights and analytics
 * - Hotels, cars, activities, and complete travel ecosystem
 */
export class UnifiedFlightTool {
    constructor(config = {}) {
        this.clientId = config.clientId || process.env.AMADEUS_CLIENT_ID;
        this.clientSecret = config.clientSecret || process.env.AMADEUS_CLIENT_SECRET;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.enabled = config.enabled !== false;
        this.sandbox = config.sandbox === true; // Use production by default
        this.baseUrl = this.sandbox ? 'test.api.amadeus.com' : 'api.amadeus.com';
    }

    // ============================================
    // AUTHENTICATION
    // ============================================

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
                hostname: this.baseUrl,
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

    // ============================================
    // MAIN EXECUTION METHOD
    // ============================================

    async execute(params) {
        if (!this.enabled) {
            throw new Error('Flight tool is disabled');
        }

        if (!this.clientId || !this.clientSecret) {
            throw new Error('Amadeus API credentials not configured');
        }

        const { action, ...args } = params;

        // Route to appropriate method based on action
        switch (action) {
            // Flight search actions
            case 'search':
            case 'search_flights':
                return this.searchFlights(args);
            case 'price_prediction':
            case 'predict_price':
                return this.predictFlightPrice(args);
            case 'inspiration':
            case 'find_destinations':
                return this.searchFlightInspiration(args);
            case 'cheapest_dates':
            case 'find_cheapest_dates':
                return this.findCheapestDates(args);
            case 'status':
            case 'flight_status':
                return this.getFlightStatus(args);
            case 'confirm_price':
                return this.confirmFlightPrice(args);

            // Analytics and insights
            case 'analytics':
            case 'price_analytics':
                return this.analyzePrices(args);
            case 'most_booked':
                return this.getMostBookedDestinations(args);
            case 'busiest_periods':
                return this.getBusiestPeriods(args);
            case 'delay_prediction':
                return this.predictFlightDelay(args);

            // Airport and airline information
            case 'airport_search':
            case 'search_airports':
                return this.searchAirports(args);
            case 'airport_info':
                return this.getAirportInfo(args);
            case 'airline_info':
                return this.getAirlineInfo(args);
            case 'airport_routes':
                return this.getAirportRoutes(args);

            // Extended travel services
            case 'hotel_search':
                return this.searchHotels(args);
            case 'car_rental':
                return this.searchCarRentals(args);
            case 'activities':
                return this.searchActivities(args);
            case 'points_of_interest':
                return this.searchPointsOfInterest(args);

            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }

    // ============================================
    // FLIGHT SEARCH METHODS
    // ============================================

    async searchFlights(params) {
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
            nonStop: params.nonStop || false
        });

        // Add optional parameters
        if (params.returnDate) queryParams.append('returnDate', params.returnDate);
        if (params.maxPrice) queryParams.append('maxPrice', params.maxPrice);
        if (params.airlines) queryParams.append('includedAirlineCodes', params.airlines);

        // Clean up empty params
        this.cleanEmptyParams(queryParams);

        const result = await this.makeRequest('GET', `/v2/shopping/flight-offers`, queryParams);
        return this.formatFlightData(result, 'flights');
    }

    async confirmFlightPrice(flightOffer) {
        return this.makeRequest('POST', `/v1/shopping/flight-offers/pricing`, null, {
            data: {
                type: 'flight-offers-pricing',
                flightOffers: [flightOffer]
            }
        });
    }

    async predictFlightPrice(params) {
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

        const result = await this.makeRequest('GET', `/v1/analytics/itinerary-price-metrics`, queryParams);
        return this.formatFlightData(result, 'price-metrics');
    }

    async searchFlightInspiration(params) {
        const queryParams = new URLSearchParams({
            origin: params.origin,
            maxPrice: params.maxPrice || '',
            departureDate: params.departureDate || '',
            oneWay: params.oneWay || false,
            duration: params.duration || '',
            nonStop: params.nonStop || false,
            viewBy: params.viewBy || 'DESTINATION'
        });

        this.cleanEmptyParams(queryParams);
        const result = await this.makeRequest('GET', `/v1/shopping/flight-destinations`, queryParams);
        return this.formatFlightData(result, 'destinations');
    }

    async findCheapestDates(params) {
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

        const result = await this.makeRequest('GET', `/v1/shopping/flight-dates`, queryParams);
        return this.formatFlightData(result, 'dates');
    }

    async getFlightStatus(params) {
        const queryParams = new URLSearchParams({
            carrierCode: params.carrierCode || params.carrier,
            flightNumber: params.flightNumber,
            scheduledDepartureDate: params.date || params.departureDate
        });

        const result = await this.makeRequest('GET', `/v2/schedule/flights`, queryParams);
        return this.formatFlightData(result, 'status');
    }

    // ============================================
    // ANALYTICS AND INSIGHTS
    // ============================================

    async analyzePrices(params) {
        const queryParams = new URLSearchParams({
            originIataCode: params.origin,
            destinationIataCode: params.destination,
            departureDate: params.date || params.departureDate,
            currencyCode: params.currency || 'USD'
        });

        const result = await this.makeRequest('GET', `/v1/analytics/itinerary-price-metrics`, queryParams);
        return this.formatFlightData(result, 'price-metrics');
    }

    async getMostBookedDestinations(params) {
        const queryParams = new URLSearchParams({
            originCityCode: params.origin,
            period: params.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
        });

        const result = await this.makeRequest('GET', `/v1/travel/analytics/air-traffic/booked`, queryParams);
        return this.formatFlightData(result, 'air-traffic');
    }

    async getBusiestPeriods(params) {
        const queryParams = new URLSearchParams({
            cityCode: params.city,
            period: params.year || new Date().getFullYear().toString(),
            direction: params.direction || 'ARRIVING'
        });

        const result = await this.makeRequest('GET', `/v1/travel/analytics/air-traffic/busiest-period`, queryParams);
        return this.formatFlightData(result, 'air-traffic');
    }

    async predictFlightDelay(params) {
        const queryParams = new URLSearchParams({
            originLocationCode: params.origin,
            destinationLocationCode: params.destination,
            departureDate: params.date,
            departureTime: params.time,
            arrivalDate: params.arrivalDate,
            arrivalTime: params.arrivalTime,
            aircraftCode: params.aircraft,
            carrierCode: params.carrier,
            flightNumber: params.flightNumber,
            duration: params.duration
        });

        this.cleanEmptyParams(queryParams);
        const result = await this.makeRequest('GET', `/v1/travel/predictions/flight-delay`, queryParams);
        return this.formatFlightData(result, 'predictions');
    }

    // ============================================
    // AIRPORT AND AIRLINE INFORMATION
    // ============================================

    async searchAirports(params) {
        const keyword = params.keyword || params.query;
        const queryParams = new URLSearchParams({
            subType: 'CITY,AIRPORT',
            keyword: keyword,
            'page[limit]': params.limit || 10
        });

        const result = await this.makeRequest('GET', `/v1/reference-data/locations`, queryParams);
        return this.formatFlightData(result, 'locations');
    }

    async getAirportInfo(params) {
        const code = params.code || params.airport;
        const queryParams = new URLSearchParams({
            subType: 'AIRPORT',
            keyword: code
        });

        const result = await this.makeRequest('GET', `/v1/reference-data/locations`, queryParams);
        return this.formatFlightData(result, 'locations');
    }

    async getAirlineInfo(params) {
        const code = params.code || params.airline;
        const queryParams = new URLSearchParams({
            airlineCodes: code
        });

        const result = await this.makeRequest('GET', `/v1/reference-data/airlines`, queryParams);
        return this.formatFlightData(result, 'airlines');
    }

    async getAirportRoutes(params) {
        const queryParams = new URLSearchParams({
            departureAirportCode: params.origin || params.airport,
            max: params.max || 100
        });

        const result = await this.makeRequest('GET', `/v1/airport/direct-destinations`, queryParams);
        return this.formatFlightData(result, 'routes');
    }

    // ============================================
    // EXTENDED TRAVEL SERVICES
    // ============================================

    async searchHotels(params) {
        if (params.cityCode) {
            // Search hotels by city first
            const cityQueryParams = new URLSearchParams({
                cityCode: params.cityCode,
                radius: params.radius || 5,
                radiusUnit: 'KM',
                hotelSource: 'ALL'
            });

            const hotelList = await this.makeRequest('GET', `/v1/reference-data/locations/hotels/by-city`, cityQueryParams);

            if (hotelList.data && hotelList.data.length > 0) {
                const hotelIds = hotelList.data.slice(0, 20).map(h => h.hotelId).join(',');

                const queryParams = new URLSearchParams({
                    hotelIds: hotelIds,
                    checkInDate: params.checkIn,
                    checkOutDate: params.checkOut,
                    adults: params.adults || 1
                });

                const result = await this.makeRequest('GET', `/v3/shopping/hotel-offers`, queryParams);
                return this.formatFlightData(result, 'hotels');
            }
        }

        // Direct hotel search with IDs
        const queryParams = new URLSearchParams({
            hotelIds: params.hotelIds,
            checkInDate: params.checkIn,
            checkOutDate: params.checkOut,
            adults: params.adults || 1
        });

        if (params.children) queryParams.append('children', params.children);
        if (params.rooms) queryParams.append('rooms', params.rooms);
        if (params.currency) queryParams.append('currency', params.currency);

        const result = await this.makeRequest('GET', `/v3/shopping/hotel-offers`, queryParams);
        return this.formatFlightData(result, 'hotels');
    }

    async searchCarRentals(params) {
        const queryParams = new URLSearchParams({
            pickUpLocationCode: params.pickupLocation,
            dropOffLocationCode: params.dropoffLocation || params.pickupLocation,
            pickUpDate: params.pickupDate,
            pickUpTime: params.pickupTime || '10:00',
            dropOffDate: params.dropoffDate,
            dropOffTime: params.dropoffTime || '10:00'
        });

        if (params.currency) queryParams.append('currency', params.currency);
        if (params.provider) queryParams.append('provider', params.provider);

        const result = await this.makeRequest('GET', `/v1/shopping/cars`, queryParams);
        return this.formatFlightData(result, 'cars');
    }

    async searchActivities(params) {
        const queryParams = new URLSearchParams({
            latitude: params.lat || params.latitude,
            longitude: params.lng || params.longitude,
            radius: params.radius || 1
        });

        if (params.category) queryParams.append('category', params.category);
        if (params.limit) queryParams.append('page[limit]', params.limit);

        const result = await this.makeRequest('GET', `/v1/shopping/activities`, queryParams);
        return this.formatFlightData(result, 'activities');
    }

    async searchPointsOfInterest(params) {
        const queryParams = new URLSearchParams({
            latitude: params.lat || params.latitude,
            longitude: params.lng || params.longitude,
            radius: params.radius || 1,
            'page[limit]': params.limit || 10
        });

        if (params.categories) queryParams.append('categories', params.categories);

        const result = await this.makeRequest('GET', `/v1/reference-data/locations/pois`, queryParams);
        return this.formatFlightData(result, 'poi');
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    async makeRequest(method, path, queryParams = null, body = null) {
        const token = await this.authenticate();

        let fullPath = path;
        if (queryParams) {
            fullPath = `${path}?${queryParams.toString()}`;
        }

        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.baseUrl,
                path: fullPath,
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            };

            if (method === 'POST' && body) {
                const bodyStr = JSON.stringify(body);
                options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
            }

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);

                        if (res.statusCode === 200 || res.statusCode === 201) {
                            resolve(result);
                        } else {
                            reject(new Error(result.errors?.[0]?.detail || `API error: ${res.statusCode}`));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', reject);

            if (method === 'POST' && body) {
                req.write(JSON.stringify(body));
            }

            req.end();
        });
    }

    cleanEmptyParams(queryParams) {
        Array.from(queryParams.entries()).forEach(([key, value]) => {
            if (!value || value === '' || value === 'undefined') {
                queryParams.delete(key);
            }
        });
    }

    // ============================================
    // DATA FORMATTING METHODS
    // ============================================

    formatFlightData(data, type) {
        if (!data || !data.data) return data;

        switch (type) {
            case 'flights':
                return this.formatFlightOffers(data);
            case 'destinations':
                return this.formatDestinations(data);
            case 'dates':
                return this.formatCheapestDates(data);
            case 'price-metrics':
                return this.formatPriceMetrics(data);
            case 'locations':
                return this.formatLocations(data);
            case 'hotels':
                return this.formatHotels(data);
            case 'activities':
                return this.formatActivities(data);
            default:
                return data;
        }
    }

    formatFlightOffers(data) {
        if (!data.data || data.data[0]?.type !== 'flight-offer') return data;

        return {
            type: 'flights',
            count: data.meta?.count || data.data.length,
            flights: data.data.map(offer => ({
                id: offer.id,
                bookingUrl: this.generateBookingUrl(offer),
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
                        numberOfStops: segment.numberOfStops || 0
                    }))
                })),
                travelers: offer.travelerPricings?.length || 1,
                bookingClass: offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin,
                validatingAirlineCodes: offer.validatingAirlineCodes,
                instantTicketingRequired: offer.instantTicketingRequired,
                lastTicketingDate: offer.lastTicketingDate
            }))
        };
    }

    formatDestinations(data) {
        if (!data.data || data.data[0]?.type !== 'flight-destination') return data;

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
    }

    formatCheapestDates(data) {
        if (!data.data || data.data[0]?.type !== 'flight-date') return data;

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
    }

    formatPriceMetrics(data) {
        if (!data.data || data.data[0]?.type !== 'itinerary-price-metric') return data;

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
    }

    formatLocations(data) {
        if (!data.data || data.data[0]?.type !== 'location') return data;

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

    formatHotels(data) {
        if (!data.data) return data;

        return {
            type: 'hotels',
            count: data.data.length,
            hotels: data.data.map(hotel => ({
                id: hotel.hotel.hotelId,
                name: hotel.hotel.name,
                rating: hotel.hotel.rating,
                address: hotel.hotel.address,
                contact: hotel.hotel.contact,
                offers: hotel.offers?.map(offer => ({
                    id: offer.id,
                    checkInDate: offer.checkInDate,
                    checkOutDate: offer.checkOutDate,
                    room: offer.room,
                    price: offer.price,
                    policies: offer.policies
                }))
            }))
        };
    }

    formatActivities(data) {
        if (!data.data) return data;

        return {
            type: 'activities',
            count: data.data.length,
            activities: data.data.map(activity => ({
                id: activity.id,
                name: activity.name,
                description: activity.shortDescription,
                price: activity.price,
                duration: activity.duration,
                rating: activity.rating,
                pictures: activity.pictures,
                bookingLink: activity.bookingLink
            }))
        };
    }

    generateBookingUrl(offer) {
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

    // ============================================
    // MARKDOWN FORMATTING
    // ============================================

    formatAsMarkdown(results) {
        if (!results || !results.type) {
            return 'No results to display.';
        }

        switch (results.type) {
            case 'flights':
                return this.formatFlightsAsMarkdown(results);
            case 'destinations':
                return this.formatDestinationsAsMarkdown(results);
            case 'dates':
                return this.formatDatesAsMarkdown(results);
            case 'price-metrics':
                return this.formatPriceMetricsAsMarkdown(results);
            case 'locations':
                return this.formatLocationsAsMarkdown(results);
            case 'hotels':
                return this.formatHotelsAsMarkdown(results);
            case 'activities':
                return this.formatActivitiesAsMarkdown(results);
            default:
                return JSON.stringify(results, null, 2);
        }
    }

    formatFlightsAsMarkdown(results) {
        let markdown = `## ✈️ Flight Search Results\n\n`;
        markdown += `*Found ${results.count} flights*\n\n`;

        results.flights.slice(0, 5).forEach((flight, index) => {
            markdown += `### Option ${index + 1}: ${flight.price.currency} ${flight.price.total}\n\n`;

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
                if (flight.price.taxes) {
                    flight.price.taxes.forEach(tax => {
                        markdown += `  - ${tax.code}: ${flight.price.currency} ${tax.amount}\n`;
                    });
                }
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

        return markdown;
    }

    formatDestinationsAsMarkdown(results) {
        let markdown = `## 🌍 Flight Inspiration - Cheapest Destinations\n\n`;

        results.destinations.forEach(dest => {
            markdown += `- **${dest.destination}**: ${dest.price.total} ${dest.price.currency || 'USD'}\n`;
            markdown += `  Departure: ${dest.departureDate}`;
            if (dest.returnDate) {
                markdown += ` | Return: ${dest.returnDate}`;
            }
            markdown += `\n`;
        });

        return markdown;
    }

    formatDatesAsMarkdown(results) {
        let markdown = `## 📅 Cheapest Travel Dates\n\n`;

        results.dates.forEach(date => {
            markdown += `- **${date.departureDate}`;
            if (date.returnDate) {
                markdown += ` - ${date.returnDate}`;
            }
            markdown += `**: ${date.price.total} ${date.price.currency || 'USD'}\n`;
        });

        return markdown;
    }

    formatPriceMetricsAsMarkdown(results) {
        let markdown = `## 📊 Price Analysis\n\n`;

        results.data.forEach(metric => {
            markdown += `### ${metric.origin} → ${metric.destination}\n`;
            markdown += `Departure: ${metric.departureDate}\n\n`;
            markdown += `Price ranges (${metric.currency}):\n`;

            metric.priceMetrics.forEach(price => {
                markdown += `- ${price.quartileRanking}: ${price.amount}\n`;
            });
            markdown += '\n';
        });

        return markdown;
    }

    formatLocationsAsMarkdown(results) {
        let markdown = `## 📍 Airport Search Results\n\n`;

        results.locations.forEach(loc => {
            markdown += `- **${loc.name}** (${loc.iataCode})\n`;
            markdown += `  ${loc.cityName}, ${loc.countryName}`;
            if (loc.timeZone) {
                markdown += ` | Timezone: ${loc.timeZone}`;
            }
            markdown += `\n`;
        });

        return markdown;
    }

    formatHotelsAsMarkdown(results) {
        let markdown = `## 🏨 Hotel Search Results\n\n`;

        results.hotels.forEach((hotel, index) => {
            markdown += `### ${index + 1}. ${hotel.name}\n`;
            markdown += `**Rating:** ${hotel.rating || 'N/A'} stars\n`;
            if (hotel.address) {
                markdown += `**Address:** ${hotel.address.lines?.join(', ')}\n`;
            }

            if (hotel.offers && hotel.offers.length > 0) {
                markdown += `**Available Offers:**\n`;
                hotel.offers.slice(0, 3).forEach(offer => {
                    markdown += `- ${offer.room.type}: ${offer.price.currency} ${offer.price.total}\n`;
                    if (offer.room.description) {
                        markdown += `  ${offer.room.description.text}\n`;
                    }
                });
            }
            markdown += '\n';
        });

        return markdown;
    }

    formatActivitiesAsMarkdown(results) {
        let markdown = `## 🎯 Activities & Tours\n\n`;

        results.activities.forEach((activity, index) => {
            markdown += `### ${index + 1}. ${activity.name}\n`;
            if (activity.description) {
                markdown += `**Description:** ${activity.description}\n`;
            }
            if (activity.price) {
                markdown += `**Price:** From ${activity.price.currency} ${activity.price.amount}\n`;
            }
            if (activity.duration) {
                markdown += `**Duration:** ${activity.duration}\n`;
            }
            if (activity.rating) {
                markdown += `**Rating:** ${activity.rating}\n`;
            }
            markdown += '\n';
        });

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

// ============================================
// TOOL DEFINITION FOR OPENAI REALTIME API
// ============================================

export const unifiedFlightToolDefinition = {
    name: 'unified_flight_search',
    description: 'Comprehensive flight and travel search with all Amadeus API features including flights, hotels, cars, and activities',
    parameters: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: [
                    // Flight actions
                    'search', 'search_flights', 'price_prediction', 'predict_price',
                    'inspiration', 'find_destinations', 'cheapest_dates', 'find_cheapest_dates',
                    'status', 'flight_status', 'confirm_price',
                    // Analytics
                    'analytics', 'price_analytics', 'most_booked', 'busiest_periods', 'delay_prediction',
                    // Airport/airline info
                    'airport_search', 'search_airports', 'airport_info', 'airline_info', 'airport_routes',
                    // Extended travel
                    'hotel_search', 'car_rental', 'activities', 'points_of_interest'
                ],
                description: 'Type of search or operation to perform'
            },
            // Flight search parameters
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
            currency: {
                type: 'string',
                description: 'Currency code (e.g., "USD", "EUR")',
                default: 'USD'
            },
            // Status check parameters
            carrierCode: {
                type: 'string',
                description: 'Airline code for flight status (e.g., "AA")'
            },
            flightNumber: {
                type: 'string',
                description: 'Flight number for status check'
            },
            date: {
                type: 'string',
                description: 'Date for status check or analytics (YYYY-MM-DD)'
            },
            // Search parameters
            keyword: {
                type: 'string',
                description: 'Search keyword for airports/cities/locations'
            },
            code: {
                type: 'string',
                description: 'Airport or airline code to get information about'
            },
            // Hotel parameters
            cityCode: {
                type: 'string',
                description: 'City code for hotel search'
            },
            hotelIds: {
                type: 'string',
                description: 'Comma-separated hotel IDs'
            },
            checkIn: {
                type: 'string',
                description: 'Hotel check-in date (YYYY-MM-DD)'
            },
            checkOut: {
                type: 'string',
                description: 'Hotel check-out date (YYYY-MM-DD)'
            },
            // Car rental parameters
            pickupLocation: {
                type: 'string',
                description: 'Car pickup location code'
            },
            dropoffLocation: {
                type: 'string',
                description: 'Car dropoff location code'
            },
            pickupDate: {
                type: 'string',
                description: 'Car pickup date (YYYY-MM-DD)'
            },
            dropoffDate: {
                type: 'string',
                description: 'Car dropoff date (YYYY-MM-DD)'
            },
            pickupTime: {
                type: 'string',
                description: 'Car pickup time (HH:MM)'
            },
            dropoffTime: {
                type: 'string',
                description: 'Car dropoff time (HH:MM)'
            },
            // Location parameters
            latitude: {
                type: 'number',
                description: 'Latitude for location-based searches'
            },
            longitude: {
                type: 'number',
                description: 'Longitude for location-based searches'
            },
            radius: {
                type: 'number',
                description: 'Search radius in km',
                default: 1
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results',
                default: 10
            }
        },
        required: ['action']
    }
};

// Tool execution wrapper for compatibility
export async function executeUnifiedFlightTool(params) {
    const tool = new UnifiedFlightTool();
    const result = await tool.execute(params);

    // Format as markdown for voice-friendly output
    if (result && typeof result === 'object') {
        const markdown = tool.formatAsMarkdown(result);
        return {
            success: true,
            data: result,
            formatted: markdown,
            summary: `Found ${result.count || 0} results for ${params.action}`
        };
    }

    return {
        success: true,
        data: result,
        formatted: JSON.stringify(result, null, 2)
    };
}

export default {
    UnifiedFlightTool,
    definition: unifiedFlightToolDefinition,
    execute: executeUnifiedFlightTool
};