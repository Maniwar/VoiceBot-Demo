#!/usr/bin/env python3
"""
Enhanced flight search handler with better voice integration and error handling
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from amadeus import Client, ResponseError

logger = logging.getLogger(__name__)

class FlightSearchHandler:
    """Enhanced flight search handler for voice bot integration"""
    
    # City to airport code mapping
    CITY_AIRPORT_MAP = {
        # US Cities
        'new york': 'NYC', 'nyc': 'NYC', 'manhattan': 'JFK', 'brooklyn': 'JFK', 'queens': 'JFK',
        'newark': 'EWR', 'new jersey': 'EWR',
        'los angeles': 'LAX', 'la': 'LAX', 'hollywood': 'LAX',
        'chicago': 'ORD', 'ohare': 'ORD', "o'hare": 'ORD',
        'san francisco': 'SFO', 'sf': 'SFO', 'bay area': 'SFO',
        'miami': 'MIA', 'south beach': 'MIA',
        'seattle': 'SEA',
        'boston': 'BOS',
        'washington': 'DCA', 'dc': 'DCA', 'washington dc': 'DCA', 'washington d.c.': 'DCA',
        'atlanta': 'ATL',
        'dallas': 'DFW', 'fort worth': 'DFW',
        'denver': 'DEN',
        'phoenix': 'PHX',
        'las vegas': 'LAS', 'vegas': 'LAS',
        'orlando': 'MCO', 'disney': 'MCO', 'disney world': 'MCO',
        'houston': 'IAH',
        'philadelphia': 'PHL', 'philly': 'PHL',
        'san diego': 'SAN',
        'austin': 'AUS',
        'nashville': 'BNA',
        'detroit': 'DTW',
        'minneapolis': 'MSP', 'st paul': 'MSP',
        'portland': 'PDX',
        'salt lake city': 'SLC', 'salt lake': 'SLC',
        
        # International Cities
        'london': 'LON', 'heathrow': 'LHR', 'gatwick': 'LGW',
        'paris': 'CDG', 'charles de gaulle': 'CDG',
        'tokyo': 'NRT', 'narita': 'NRT', 'haneda': 'HND',
        'dubai': 'DXB',
        'singapore': 'SIN',
        'hong kong': 'HKG',
        'bangkok': 'BKK',
        'amsterdam': 'AMS', 'schiphol': 'AMS',
        'frankfurt': 'FRA',
        'madrid': 'MAD',
        'rome': 'FCO', 'fiumicino': 'FCO',
        'milan': 'MXP', 'malpensa': 'MXP',
        'barcelona': 'BCN',
        'munich': 'MUC',
        'zurich': 'ZRH',
        'vienna': 'VIE',
        'berlin': 'BER',
        'manila': 'MNL',
        'sydney': 'SYD',
        'melbourne': 'MEL',
        'toronto': 'YYZ', 'pearson': 'YYZ',
        'vancouver': 'YVR',
        'montreal': 'YUL',
        'mexico city': 'MEX', 'mexico': 'MEX',
        'cancun': 'CUN',
        'rio': 'GIG', 'rio de janeiro': 'GIG',
        'sao paulo': 'GRU',
        'buenos aires': 'EZE',
        'delhi': 'DEL', 'new delhi': 'DEL',
        'mumbai': 'BOM', 'bombay': 'BOM',
        'beijing': 'PEK',
        'shanghai': 'PVG', 'pudong': 'PVG',
        'seoul': 'ICN', 'incheon': 'ICN',
        'taipei': 'TPE',
        'jakarta': 'CGK',
        'kuala lumpur': 'KUL',
        'cairo': 'CAI',
        'istanbul': 'IST',
        'athens': 'ATH',
        'lisbon': 'LIS',
    }
    
    # Airline code to name mapping for better voice output
    AIRLINE_NAMES = {
        'AA': 'American Airlines',
        'DL': 'Delta',
        'UA': 'United',
        'SW': 'Southwest',
        'B6': 'JetBlue',
        'AS': 'Alaska Airlines',
        'NK': 'Spirit',
        'F9': 'Frontier',
        'WN': 'Southwest',
        'BA': 'British Airways',
        'AF': 'Air France',
        'LH': 'Lufthansa',
        'EK': 'Emirates',
        'QR': 'Qatar Airways',
        'SQ': 'Singapore Airlines',
        'NH': 'All Nippon Airways',
        'JL': 'Japan Airlines',
        'AC': 'Air Canada',
        'TP': 'TAP Air Portugal',
        'VS': 'Virgin Atlantic',
        'KL': 'KLM',
        'IB': 'Iberia',
        'AZ': 'Alitalia',
        'TK': 'Turkish Airlines',
        'EY': 'Etihad',
        'CX': 'Cathay Pacific',
        'QF': 'Qantas',
        'LA': 'LATAM',
        'AM': 'AeroMexico',
    }
    
    def __init__(self, client_id: str, client_secret: str, test_mode: bool = True):
        """Initialize the flight search handler"""
        self.amadeus_client = None
        self.test_mode = test_mode
        
        if client_id and client_secret:
            try:
                self.amadeus_client = Client(
                    client_id=client_id,
                    client_secret=client_secret,
                    hostname='test' if test_mode else 'production'
                )
                logger.info("Amadeus client initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Amadeus client: {e}")
                raise
    
    def map_location_to_airport(self, location: str) -> str:
        """Map city name or location to airport code"""
        # Clean and normalize input
        location = location.lower().strip()
        
        # Remove common words
        location = location.replace('airport', '').replace('city', '').strip()
        
        # Check if it's already an airport code (3 letters, all uppercase)
        if len(location) == 3 and location.isupper():
            return location
        
        # Try to find in mapping
        if location in self.CITY_AIRPORT_MAP:
            return self.CITY_AIRPORT_MAP[location]
        
        # Check partial matches
        for city, code in self.CITY_AIRPORT_MAP.items():
            if city in location or location in city:
                return code
        
        # Default: return uppercase first 3 letters (might be airport code)
        return location.upper()[:3]
    
    def parse_date(self, date_str: str) -> Optional[str]:
        """Parse various date formats from voice input"""
        try:
            # Handle relative dates
            date_str_lower = date_str.lower()
            
            if 'today' in date_str_lower:
                return datetime.now().strftime('%Y-%m-%d')
            elif 'tomorrow' in date_str_lower:
                return (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
            elif 'day after tomorrow' in date_str_lower:
                return (datetime.now() + timedelta(days=2)).strftime('%Y-%m-%d')
            elif 'next week' in date_str_lower:
                return (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
            elif 'next month' in date_str_lower:
                return (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d')
            
            # Try parsing absolute dates
            # Common formats from voice: "January 15th", "Jan 15", "1/15", "15th of January"
            formats = [
                '%Y-%m-%d',  # ISO format
                '%m/%d/%Y', '%m/%d',  # US format
                '%d/%m/%Y', '%d/%m',  # European format
                '%B %d', '%B %dth', '%B %dst', '%B %dnd', '%B %drd',  # January 15th
                '%b %d',  # Jan 15
                '%d %B', '%dth of %B', '%dst of %B', '%dnd of %B', '%drd of %B',  # 15th of January
            ]
            
            # Add current year if not specified
            current_year = datetime.now().year
            
            for fmt in formats:
                try:
                    if '%Y' not in fmt:
                        parsed_date = datetime.strptime(date_str, fmt).replace(year=current_year)
                    else:
                        parsed_date = datetime.strptime(date_str, fmt)
                    
                    # Ensure date is in the future
                    if parsed_date.date() < datetime.now().date():
                        # Try next year if date has passed this year
                        parsed_date = parsed_date.replace(year=current_year + 1)
                    
                    return parsed_date.strftime('%Y-%m-%d')
                except ValueError:
                    continue
            
            # If no format matched, try to extract date components
            import re
            
            # Try to find month and day
            months = {
                'january': 1, 'jan': 1, 'february': 2, 'feb': 2,
                'march': 3, 'mar': 3, 'april': 4, 'apr': 4,
                'may': 5, 'june': 6, 'jun': 6,
                'july': 7, 'jul': 7, 'august': 8, 'aug': 8,
                'september': 9, 'sep': 9, 'sept': 9,
                'october': 10, 'oct': 10, 'november': 11, 'nov': 11,
                'december': 12, 'dec': 12
            }
            
            for month_name, month_num in months.items():
                if month_name in date_str_lower:
                    # Extract day number
                    day_match = re.search(r'\b(\d{1,2})\b', date_str)
                    if day_match:
                        day = int(day_match.group(1))
                        year = current_year
                        
                        # Check if year is specified
                        year_match = re.search(r'\b(20\d{2})\b', date_str)
                        if year_match:
                            year = int(year_match.group(1))
                        
                        # Create date
                        try:
                            parsed_date = datetime(year, month_num, day)
                            # Ensure date is in the future
                            if parsed_date.date() < datetime.now().date():
                                parsed_date = parsed_date.replace(year=year + 1)
                            return parsed_date.strftime('%Y-%m-%d')
                        except ValueError:
                            pass
            
            # Last resort: return the string as-is if it looks like a date
            if re.match(r'\d{4}-\d{2}-\d{2}', date_str):
                return date_str
            
        except Exception as e:
            logger.error(f"Error parsing date '{date_str}': {e}")
        
        return None
    
    def format_duration(self, duration_str: str) -> str:
        """Format duration string for voice output"""
        # Convert from PT7H30M to "7 hours 30 minutes"
        import re
        
        duration_str = duration_str.replace('PT', '')
        
        hours_match = re.search(r'(\d+)H', duration_str)
        minutes_match = re.search(r'(\d+)M', duration_str)
        
        parts = []
        
        if hours_match:
            hours = int(hours_match.group(1))
            if hours == 1:
                parts.append("1 hour")
            else:
                parts.append(f"{hours} hours")
        
        if minutes_match:
            minutes = int(minutes_match.group(1))
            if minutes == 1:
                parts.append("1 minute")
            else:
                parts.append(f"{minutes} minutes")
        
        return " and ".join(parts) if parts else duration_str
    
    def get_airline_name(self, code: str) -> str:
        """Get airline name from code"""
        return self.AIRLINE_NAMES.get(code, code)
    
    async def search_flights(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Search for flights with enhanced parameter handling"""
        
        if not self.amadeus_client:
            return {
                "status": "error",
                "message": "Flight search service is not configured. Please contact support.",
                "error_code": "SERVICE_NOT_CONFIGURED"
            }
        
        try:
            # Extract and validate parameters
            origin = params.get('origin', '').strip()
            destination = params.get('destination', '').strip()
            departure_date = params.get('departure_date', '').strip()
            
            # Optional parameters
            return_date = params.get('return_date', '').strip()
            adults = int(params.get('adults', 1))
            children = int(params.get('children', 0))
            infants = int(params.get('infants', 0))
            travel_class = params.get('travel_class', 'ECONOMY').upper()
            nonstop_only = params.get('nonstop', False) or params.get('nonstop_only', False)
            max_price = params.get('max_price')
            
            # Validate required parameters
            if not origin:
                return {
                    "status": "error",
                    "message": "Please specify the departure city or airport.",
                    "error_code": "MISSING_ORIGIN"
                }
            
            if not destination:
                return {
                    "status": "error",
                    "message": "Please specify the destination city or airport.",
                    "error_code": "MISSING_DESTINATION"
                }
            
            if not departure_date:
                return {
                    "status": "error",
                    "message": "Please specify when you want to travel.",
                    "error_code": "MISSING_DATE"
                }
            
            # Map locations to airport codes
            origin_code = self.map_location_to_airport(origin)
            destination_code = self.map_location_to_airport(destination)
            
            logger.info(f"Flight search: {origin} ({origin_code}) → {destination} ({destination_code}) on {departure_date}")
            
            # Parse dates
            departure_date_parsed = self.parse_date(departure_date)
            if not departure_date_parsed:
                return {
                    "status": "error",
                    "message": f"I couldn't understand the date '{departure_date}'. Please try saying it differently, like 'tomorrow' or 'January 15th'.",
                    "error_code": "INVALID_DATE"
                }
            
            # Check if date is in the past
            if datetime.strptime(departure_date_parsed, '%Y-%m-%d').date() < datetime.now().date():
                return {
                    "status": "error",
                    "message": "The departure date cannot be in the past. Please choose a future date.",
                    "error_code": "DATE_IN_PAST"
                }
            
            # Build Amadeus search parameters
            search_params = {
                'originLocationCode': origin_code,
                'destinationLocationCode': destination_code,
                'departureDate': departure_date_parsed,
                'adults': adults,
                'max': 5,  # Limit for voice interface
                'currencyCode': 'USD'
            }
            
            # Add optional parameters
            if return_date:
                return_date_parsed = self.parse_date(return_date)
                if return_date_parsed:
                    search_params['returnDate'] = return_date_parsed
            
            if children > 0:
                search_params['children'] = children
            
            if infants > 0:
                search_params['infants'] = infants
            
            if travel_class != 'ECONOMY':
                search_params['travelClass'] = travel_class
            
            if nonstop_only:
                search_params['nonStop'] = 'true'
            
            if max_price:
                search_params['maxPrice'] = int(max_price)
            
            # Make API call with timeout
            logger.info(f"Amadeus search params: {search_params}")
            
            # Use asyncio to run the synchronous Amadeus call with timeout
            import asyncio
            loop = asyncio.get_event_loop()
            
            try:
                # Add a 10-second timeout for the API call
                response = await asyncio.wait_for(
                    loop.run_in_executor(
                        None,
                        lambda: self.amadeus_client.shopping.flight_offers_search.get(**search_params)
                    ),
                    timeout=20.0  # 20 second timeout for slow test environment
                )
            except asyncio.TimeoutError:
                logger.error("Amadeus API call timed out after 20 seconds")
                return {
                    "status": "error",
                    "message": "The flight search is taking longer than expected. Please try again or try a simpler search.",
                    "error_code": "TIMEOUT"
                }
            
            if not response.data:
                return {
                    "status": "success",
                    "message": f"No flights found from {origin} to {destination} on {departure_date_parsed}. Try different dates or remove filters like nonstop only.",
                    "flights": [],
                    "search_params": {
                        "origin": f"{origin} ({origin_code})",
                        "destination": f"{destination} ({destination_code})",
                        "date": departure_date_parsed,
                        "passengers": adults + children + infants
                    }
                }
            
            # Format flight results for voice output
            flights = []
            for offer in response.data[:3]:  # Limit to top 3 for voice
                flight_info = self.format_flight_offer(offer)
                if flight_info:
                    flights.append(flight_info)
            
            # Create voice-friendly summary
            summary = self.create_voice_summary(flights, origin, destination, departure_date_parsed)
            
            return {
                "status": "success",
                "message": summary,
                "flights": flights,
                "total_results": len(response.data),
                "search_params": {
                    "origin": f"{origin} ({origin_code})",
                    "destination": f"{destination} ({destination_code})",
                    "date": departure_date_parsed,
                    "passengers": adults + children + infants,
                    "class": travel_class,
                    "nonstop_only": nonstop_only
                }
            }
            
        except ResponseError as e:
            error_message = self.parse_amadeus_error(e)
            logger.error(f"Amadeus API error: {error_message}")
            
            return {
                "status": "error",
                "message": error_message,
                "error_code": "API_ERROR"
            }
            
        except Exception as e:
            logger.error(f"Unexpected error in flight search: {e}")
            return {
                "status": "error",
                "message": "I encountered an error while searching for flights. Please try again.",
                "error_code": "UNEXPECTED_ERROR"
            }
    
    def format_flight_offer(self, offer: Dict) -> Optional[Dict]:
        """Format a single flight offer for voice output"""
        try:
            price = offer.get('price', {})
            total_price = float(price.get('grandTotal', price.get('total', 0)))
            currency = price.get('currency', 'USD')
            
            itineraries = offer.get('itineraries', [])
            if not itineraries:
                return None
            
            # Process outbound flight
            outbound = itineraries[0]
            segments = outbound.get('segments', [])
            if not segments:
                return None
            
            first_segment = segments[0]
            last_segment = segments[-1]
            
            # Get airline and flight info
            airline_code = first_segment.get('carrierCode', '')
            airline_name = self.get_airline_name(airline_code)
            flight_number = f"{airline_code}{first_segment.get('number', '')}"
            
            # Get times and airports
            departure = first_segment.get('departure', {})
            arrival = last_segment.get('arrival', {})
            
            dep_time = departure.get('at', '').replace('T', ' at ')
            arr_time = arrival.get('at', '').replace('T', ' at ')
            dep_airport = departure.get('iataCode', '')
            arr_airport = arrival.get('iataCode', '')
            
            # Format duration
            duration = self.format_duration(outbound.get('duration', ''))
            
            # Count stops
            stops = len(segments) - 1
            if stops == 0:
                stop_text = "nonstop"
            elif stops == 1:
                stop_text = "1 stop"
            else:
                stop_text = f"{stops} stops"
            
            # Get cabin class
            cabin = segments[0].get('cabin', 'ECONOMY')
            
            flight_data = {
                'airline': airline_name,
                'flight_number': flight_number,
                'price': total_price,
                'price_formatted': f"${total_price:.2f} {currency}",
                'departure_time': dep_time,
                'arrival_time': arr_time,
                'departure_airport': dep_airport,
                'arrival_airport': arr_airport,
                'duration': duration,
                'stops': stop_text,
                'cabin': cabin.replace('_', ' ').title(),
                'available_seats': offer.get('numberOfBookableSeats', 'unknown')
            }
            
            # Add return flight info if roundtrip
            if len(itineraries) > 1:
                return_flight = itineraries[1]
                return_segments = return_flight.get('segments', [])
                if return_segments:
                    return_first = return_segments[0]
                    return_last = return_segments[-1]
                    
                    flight_data['return_departure'] = return_first.get('departure', {}).get('at', '').replace('T', ' at ')
                    flight_data['return_arrival'] = return_last.get('arrival', {}).get('at', '').replace('T', ' at ')
                    flight_data['return_duration'] = self.format_duration(return_flight.get('duration', ''))
                    flight_data['is_roundtrip'] = True
            
            return flight_data
            
        except Exception as e:
            logger.error(f"Error formatting flight offer: {e}")
            return None
    
    def create_voice_summary(self, flights: List[Dict], origin: str, destination: str, date: str) -> str:
        """Create a voice-friendly summary of flight results"""
        if not flights:
            return f"No flights found from {origin} to {destination} on {date}."
        
        if len(flights) == 1:
            flight = flights[0]
            return (f"I found one flight from {origin} to {destination}. "
                   f"{flight['airline']} for {flight['price_formatted']}, "
                   f"departing {flight['departure_time']}, "
                   f"arriving {flight['arrival_time']}. "
                   f"It's a {flight['stops']} flight taking {flight['duration']}.")
        
        # Multiple flights
        summary = f"I found {len(flights)} flights from {origin} to {destination}. "
        
        # Find cheapest
        cheapest = min(flights, key=lambda x: x['price'])
        summary += f"The cheapest is {cheapest['airline']} for {cheapest['price_formatted']}. "
        
        # Find fastest if different from cheapest
        fastest = min(flights, key=lambda x: x['duration'])
        if fastest != cheapest:
            summary += f"The fastest is {fastest['airline']} taking {fastest['duration']}. "
        
        # Mention if there are nonstop options
        nonstop_flights = [f for f in flights if 'nonstop' in f['stops']]
        if nonstop_flights:
            summary += f"There {'is' if len(nonstop_flights) == 1 else 'are'} {len(nonstop_flights)} nonstop option{'s' if len(nonstop_flights) > 1 else ''}. "
        
        summary += "Would you like more details about any of these flights?"
        
        return summary
    
    def parse_amadeus_error(self, error: ResponseError) -> str:
        """Parse Amadeus error into user-friendly message"""
        try:
            if hasattr(error, 'response') and hasattr(error.response, 'body'):
                errors = error.response.body.get('errors', [])
                if errors:
                    first_error = errors[0]
                    title = first_error.get('title', '')
                    detail = first_error.get('detail', '')
                    
                    # Map common errors to user-friendly messages
                    if 'INVALID FORMAT' in title:
                        if 'originLocationCode' in detail or 'destinationLocationCode' in detail:
                            return "I couldn't recognize that airport or city. Please try saying it differently."
                    elif 'INVALID DATE' in title or 'Date/Time is in the past' in detail:
                        return "The travel date must be in the future. Please choose a different date."
                    elif 'MANDATORY DATA MISSING' in title:
                        return "I need more information to search for flights. Please specify the origin, destination, and travel date."
                    elif 'NO FARE FOUND' in title:
                        return "No flights are available for this route on the selected date."
                    
                    return f"{title}: {detail}" if detail else title
        except:
            pass
        
        return "There was an error searching for flights. Please try again."