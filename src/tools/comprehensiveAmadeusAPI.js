import https from 'https';

/**
 * Comprehensive Amadeus API integration with all available endpoints
 * Includes: Flights, Hotels, Cars, Trains, Travel Insights, and more
 */
export class ComprehensiveAmadeusAPI {
    constructor(config = {}) {
        this.clientId = config.clientId || process.env.AMADEUS_CLIENT_ID;
        this.clientSecret = config.clientSecret || process.env.AMADEUS_CLIENT_SECRET;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.enabled = config.enabled !== false;
        this.sandbox = config.sandbox === true; // Use production by default
        this.baseUrl = this.sandbox ? 'test.api.amadeus.com' : 'api.amadeus.com';
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
    // FLIGHT SEARCH & BOOKING APIs
    // ============================================

    // 1. Flight Offers Search - Main flight search
    async searchFlightOffers(params) {
        const queryParams = new URLSearchParams({
            originLocationCode: params.origin,
            destinationLocationCode: params.destination,
            departureDate: params.departureDate,
            adults: params.adults || 1,
            ...params
        });
        return this.makeRequest('GET', `/v2/shopping/flight-offers`, queryParams);
    }

    // 2. Flight Offers Price - Confirm price with additional services
    async confirmFlightPrice(flightOffer) {
        return this.makeRequest('POST', `/v1/shopping/flight-offers/pricing`, null, {
            data: {
                type: 'flight-offers-pricing',
                flightOffers: [flightOffer]
            }
        });
    }

    // 3. Flight Create Orders - Book the flight
    async bookFlight(pricedOffer, travelers) {
        return this.makeRequest('POST', `/v1/booking/flight-orders`, null, {
            data: {
                type: 'flight-order',
                flightOffers: [pricedOffer],
                travelers: travelers
            }
        });
    }

    // 4. Flight Order Management - Retrieve booking
    async getFlightOrder(orderId) {
        return this.makeRequest('GET', `/v1/booking/flight-orders/${orderId}`);
    }

    // 5. Flight Availabilities Search - Check real-time availability
    async checkFlightAvailability(params) {
        return this.makeRequest('POST', `/v1/shopping/flight-availabilities`, null, {
            originDestinations: params.routes,
            travelers: params.travelers,
            sources: ['GDS']
        });
    }

    // 6. Branded Fares Upsell - Get branded fare options
    async getBrandedFares(flightOffers) {
        return this.makeRequest('POST', `/v1/shopping/flight-offers/upselling`, null, {
            data: {
                type: 'flight-offers-upselling',
                flightOffers: flightOffers
            }
        });
    }

    // 7. Seatmaps Display - Get available seats
    async getSeatmap(flightOfferId) {
        return this.makeRequest('GET', `/v1/shopping/seatmaps`, {
            'flight-offer-id': flightOfferId
        });
    }

    // 8. Flight Choice Prediction - AI prediction of best flight
    async predictFlightChoice(flightOffers) {
        return this.makeRequest('POST', `/v2/shopping/flight-offers/prediction`, null, flightOffers);
    }

    // 9. Flight Delay Prediction - Predict flight delays
    async predictFlightDelay(params) {
        return this.makeRequest('GET', `/v1/travel/predictions/flight-delay`, {
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
    }

    // ============================================
    // TRAVEL INSIGHTS & ANALYTICS APIs
    // ============================================

    // 10. Flight Inspiration Search - Find cheapest destinations
    async searchFlightInspiration(params) {
        return this.makeRequest('GET', `/v1/shopping/flight-destinations`, {
            origin: params.origin,
            maxPrice: params.maxPrice,
            ...params
        });
    }

    // 11. Flight Cheapest Date Search
    async findCheapestDates(params) {
        return this.makeRequest('GET', `/v1/shopping/flight-dates`, {
            origin: params.origin,
            destination: params.destination,
            ...params
        });
    }

    // 12. Flight Most Booked Destinations
    async getMostBookedDestinations(params) {
        return this.makeRequest('GET', `/v1/travel/analytics/air-traffic/booked`, {
            originCityCode: params.origin,
            period: params.period
        });
    }

    // 13. Flight Most Traveled Destinations
    async getMostTraveledDestinations(params) {
        return this.makeRequest('GET', `/v1/travel/analytics/air-traffic/traveled`, {
            originCityCode: params.origin,
            period: params.period
        });
    }

    // 14. Flight Busiest Traveling Period
    async getBusiestPeriods(params) {
        return this.makeRequest('GET', `/v1/travel/analytics/air-traffic/busiest-period`, {
            cityCode: params.city,
            period: params.year,
            direction: params.direction
        });
    }

    // 15. Flight Price Analysis - Historical price metrics
    async analyzePrices(params) {
        return this.makeRequest('GET', `/v1/analytics/itinerary-price-metrics`, {
            originIataCode: params.origin,
            destinationIataCode: params.destination,
            departureDate: params.date,
            ...params
        });
    }

    // ============================================
    // HOTEL SEARCH & BOOKING APIs
    // ============================================

    // 16. Hotel List - Search hotels by city
    async searchHotelsByCity(params) {
        return this.makeRequest('GET', `/v1/reference-data/locations/hotels/by-city`, {
            cityCode: params.cityCode,
            radius: params.radius || 5,
            radiusUnit: params.radiusUnit || 'KM',
            hotelSource: 'ALL'
        });
    }

    // 17. Hotel Search - Search hotels with availability
    async searchHotels(params) {
        return this.makeRequest('GET', `/v3/shopping/hotel-offers`, {
            hotelIds: params.hotelIds,
            checkInDate: params.checkIn,
            checkOutDate: params.checkOut,
            adults: params.adults || 1,
            ...params
        });
    }

    // 18. Hotel Offers Search - Detailed hotel offers
    async getHotelOffers(hotelId, params) {
        return this.makeRequest('GET', `/v3/shopping/hotel-offers`, {
            hotelIds: hotelId,
            checkInDate: params.checkIn,
            checkOutDate: params.checkOut,
            adults: params.adults || 1,
            ...params
        });
    }

    // 19. Hotel Booking - Book a hotel
    async bookHotel(offer, guests) {
        return this.makeRequest('POST', `/v1/booking/hotel-bookings`, null, {
            data: {
                type: 'hotel-booking',
                hotelOffer: offer,
                guests: guests
            }
        });
    }

    // 20. Hotel Ratings - Get hotel sentiments/ratings
    async getHotelRatings(hotelIds) {
        return this.makeRequest('GET', `/v2/e-reputation/hotel-sentiments`, {
            hotelIds: hotelIds.join(',')
        });
    }

    // ============================================
    // CAR RENTAL & TRANSFER APIs
    // ============================================

    // 21. Car Rental Search
    async searchCarRentals(params) {
        return this.makeRequest('GET', `/v1/shopping/cars`, {
            pickUpLocationCode: params.pickupLocation,
            dropOffLocationCode: params.dropoffLocation || params.pickupLocation,
            pickUpDate: params.pickupDate,
            pickUpTime: params.pickupTime,
            dropOffDate: params.dropoffDate,
            dropOffTime: params.dropoffTime,
            ...params
        });
    }

    // 22. Transfer Search - Airport transfers, etc.
    async searchTransfers(params) {
        return this.makeRequest('GET', `/v1/shopping/transfer-offers`, {
            originLocationCode: params.origin,
            destinationLocationCode: params.destination,
            transferType: params.type || 'PRIVATE',
            startDateTime: params.dateTime,
            passengers: params.passengers || 1,
            ...params
        });
    }

    // 23. Transfer Booking
    async bookTransfer(offer, passengers) {
        return this.makeRequest('POST', `/v1/booking/transfer-orders`, null, {
            data: {
                type: 'transfer-order',
                transferOffer: offer,
                passengers: passengers
            }
        });
    }

    // ============================================
    // RAIL & TRAIN APIs
    // ============================================

    // 24. Rail Station Search
    async searchRailStations(params) {
        return this.makeRequest('GET', `/v1/reference-data/locations`, {
            subType: 'RAIL_STATION',
            keyword: params.keyword,
            countryCode: params.countryCode
        });
    }

    // ============================================
    // DESTINATION CONTENT APIs
    // ============================================

    // 25. Points of Interest - Find attractions
    async searchPointsOfInterest(params) {
        return this.makeRequest('GET', `/v1/reference-data/locations/pois`, {
            latitude: params.lat,
            longitude: params.lng,
            radius: params.radius || 1,
            'page[limit]': params.limit || 10,
            categories: params.categories
        });
    }

    // 26. Points of Interest by Square - Search in area
    async searchPOIBySquare(params) {
        return this.makeRequest('GET', `/v1/reference-data/locations/pois/by-square`, {
            north: params.north,
            west: params.west,
            south: params.south,
            east: params.east,
            'page[limit]': params.limit || 10
        });
    }

    // 27. Tours and Activities
    async searchActivities(params) {
        return this.makeRequest('GET', `/v1/shopping/activities`, {
            latitude: params.lat,
            longitude: params.lng,
            radius: params.radius || 1,
            ...params
        });
    }

    // 28. Safe Place - COVID/Safety ratings
    async getSafetyRating(params) {
        return this.makeRequest('GET', `/v1/duty-of-care/diseases/covid19-area-report`, {
            countryCode: params.countryCode,
            cityCode: params.cityCode,
            latitude: params.lat,
            longitude: params.lng
        });
    }

    // ============================================
    // REFERENCE DATA APIs
    // ============================================

    // 29. Airport & City Search
    async searchLocations(params) {
        return this.makeRequest('GET', `/v1/reference-data/locations`, {
            subType: params.subType || 'CITY,AIRPORT',
            keyword: params.keyword,
            'page[limit]': params.limit || 10
        });
    }

    // 30. Airport Nearest Relevant - Find nearest airport
    async findNearestAirport(params) {
        return this.makeRequest('GET', `/v1/reference-data/locations/airports`, {
            latitude: params.lat,
            longitude: params.lng,
            radius: params.radius || 100,
            'page[limit]': params.limit || 5
        });
    }

    // 31. Airlines - Get airline information
    async getAirlineInfo(airlineCode) {
        return this.makeRequest('GET', `/v1/reference-data/airlines`, {
            airlineCodes: airlineCode
        });
    }

    // 32. Aircraft - Get aircraft information
    async getAircraftInfo(aircraftCode) {
        return this.makeRequest('GET', `/v1/reference-data/aircraft`, {
            aircraftCodes: aircraftCode
        });
    }

    // ============================================
    // TRAVEL RECOMMENDATIONS
    // ============================================

    // 33. Recommended Locations
    async getRecommendedLocations(params) {
        return this.makeRequest('GET', `/v1/reference-data/recommended-locations`, {
            cityCodes: params.cityCodes,
            travelerCountryCode: params.travelerCountry
        });
    }

    // 34. Travel Recommendations
    async getTravelRecommendations(params) {
        return this.makeRequest('GET', `/v1/shopping/recommendations`, {
            cityCodes: params.origins,
            destinationCityCodes: params.destinations,
            travelerCountryCode: params.travelerCountry
        });
    }

    // ============================================
    // FLIGHT STATUS & SCHEDULES
    // ============================================

    // 35. On-Demand Flight Status
    async getFlightStatus(params) {
        return this.makeRequest('GET', `/v2/schedule/flights`, {
            carrierCode: params.carrier,
            flightNumber: params.flightNumber,
            scheduledDepartureDate: params.date
        });
    }

    // 36. Airport On-Time Performance
    async getAirportPerformance(params) {
        return this.makeRequest('GET', `/v1/airport/predictions/on-time`, {
            airportCode: params.airport,
            date: params.date
        });
    }

    // 37. Airport Routes - Direct destinations from airport
    async getAirportRoutes(params) {
        return this.makeRequest('GET', `/v1/airport/direct-destinations`, {
            departureAirportCode: params.origin,
            max: params.max || 100
        });
    }

    // ============================================
    // TRIP PLANNING APIs
    // ============================================

    // 38. Trip Parser - Parse trip details from text
    async parseTripDetails(text) {
        return this.makeRequest('POST', `/v3/travel/trip-parser`, null, {
            data: {
                type: 'trip',
                text: text
            }
        });
    }

    // 39. Trip Purpose Prediction
    async predictTripPurpose(params) {
        return this.makeRequest('GET', `/v1/travel/predictions/trip-purpose`, {
            originLocationCode: params.origin,
            destinationLocationCode: params.destination,
            departureDate: params.departureDate,
            returnDate: params.returnDate,
            ...params
        });
    }

    // ============================================
    // HELPER METHOD FOR API REQUESTS
    // ============================================

    async makeRequest(method, path, queryParams = null, body = null) {
        const token = await this.authenticate();
        
        let fullPath = path;
        if (queryParams) {
            // Clean up empty params
            Object.keys(queryParams).forEach(key => {
                if (queryParams[key] === undefined || queryParams[key] === null || queryParams[key] === '') {
                    delete queryParams[key];
                }
            });
            const params = new URLSearchParams(queryParams);
            fullPath = `${path}?${params.toString()}`;
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

    // ============================================
    // FORMATTING METHODS
    // ============================================

    formatAsMarkdown(data, type) {
        let markdown = '';
        
        switch(type) {
            case 'flights':
                return this.formatFlightsAsMarkdown(data);
            case 'hotels':
                return this.formatHotelsAsMarkdown(data);
            case 'activities':
                return this.formatActivitiesAsMarkdown(data);
            case 'locations':
                return this.formatLocationsAsMarkdown(data);
            default:
                return JSON.stringify(data, null, 2);
        }
    }

    formatFlightsAsMarkdown(data) {
        let markdown = '## ✈️ Flight Results\n\n';
        
        if (data.data && Array.isArray(data.data)) {
            data.data.forEach((item, index) => {
                if (item.type === 'flight-offer') {
                    markdown += `### Option ${index + 1}\n`;
                    markdown += `**Price:** ${item.price.currency} ${item.price.total}\n`;
                    markdown += `**Airlines:** ${item.validatingAirlineCodes?.join(', ') || 'Various'}\n\n`;
                    
                    item.itineraries?.forEach((itin, i) => {
                        markdown += `**${i === 0 ? 'Outbound' : 'Return'}:**\n`;
                        itin.segments?.forEach(seg => {
                            markdown += `- ${seg.departure.iataCode} → ${seg.arrival.iataCode}\n`;
                            markdown += `  ${seg.carrierCode}${seg.number} | ${new Date(seg.departure.at).toLocaleString()}\n`;
                        });
                    });
                    markdown += '\n---\n\n';
                }
            });
        }
        
        return markdown;
    }

    formatHotelsAsMarkdown(data) {
        let markdown = '## 🏨 Hotel Results\n\n';
        
        if (data.data && Array.isArray(data.data)) {
            data.data.forEach((hotel, index) => {
                markdown += `### ${index + 1}. ${hotel.hotel.name}\n`;
                markdown += `**Location:** ${hotel.hotel.address?.lines?.join(', ')}\n`;
                markdown += `**Rating:** ${hotel.hotel.rating || 'N/A'}\n`;
                
                hotel.offers?.forEach(offer => {
                    markdown += `- **Price:** ${offer.price.currency} ${offer.price.total}\n`;
                    markdown += `  Room: ${offer.room.type} | ${offer.room.description?.text || 'Standard Room'}\n`;
                });
                markdown += '\n';
            });
        }
        
        return markdown;
    }

    formatActivitiesAsMarkdown(data) {
        let markdown = '## 🎯 Activities & Tours\n\n';
        
        if (data.data && Array.isArray(data.data)) {
            data.data.forEach((activity, index) => {
                markdown += `### ${index + 1}. ${activity.name}\n`;
                markdown += `**Description:** ${activity.shortDescription}\n`;
                markdown += `**Price:** From ${activity.price?.currency} ${activity.price?.amount}\n`;
                markdown += `**Duration:** ${activity.duration}\n`;
                markdown += `**Rating:** ${activity.rating || 'N/A'}\n\n`;
            });
        }
        
        return markdown;
    }

    formatLocationsAsMarkdown(data) {
        let markdown = '## 📍 Locations\n\n';
        
        if (data.data && Array.isArray(data.data)) {
            data.data.forEach(loc => {
                markdown += `- **${loc.name}** (${loc.iataCode || loc.id})\n`;
                markdown += `  ${loc.address?.cityName || ''}, ${loc.address?.countryName || ''}\n`;
                if (loc.geoCode) {
                    markdown += `  Coordinates: ${loc.geoCode.latitude}, ${loc.geoCode.longitude}\n`;
                }
            });
        }
        
        return markdown;
    }
}

// Export comprehensive tool definition
export const comprehensiveAmadeusToolDefinition = {
    name: 'amadeus_travel',
    description: 'Comprehensive travel search including flights, hotels, cars, activities, and travel insights',
    parameters: {
        type: 'object',
        properties: {
            category: {
                type: 'string',
                enum: [
                    'flight_search', 'flight_inspiration', 'flight_status', 'flight_prediction',
                    'hotel_search', 'hotel_ratings', 
                    'car_rental', 'transfers',
                    'activities', 'points_of_interest',
                    'travel_insights', 'airport_info', 'airline_info',
                    'safety_ratings', 'recommendations'
                ],
                description: 'Category of travel service to search'
            },
            action: {
                type: 'string',
                description: 'Specific action within the category'
            },
            params: {
                type: 'object',
                description: 'Parameters specific to the selected category and action'
            }
        },
        required: ['category', 'params']
    }
};

export default ComprehensiveAmadeusAPI;