# Flight API Improvements for VoiceBot

## Summary
The voicebot's flight search capability has been significantly enhanced with better natural language processing, error handling, and voice-friendly responses.

## Key Improvements Implemented

### 1. Enhanced Flight Handler (`src/flight_handler.py`)
- **City-to-Airport Mapping**: Comprehensive mapping of 80+ cities to airport codes
  - US cities: New York → NYC, San Francisco → SFO, Los Angeles → LAX, etc.
  - International: London → LON, Paris → CDG, Tokyo → NRT, etc.
  - Handles variations: "NYC", "New York", "Manhattan" all map to appropriate airports

- **Natural Language Date Parsing**:
  - Relative dates: "tomorrow", "next week", "next month"
  - Natural formats: "January 15th", "Jan 15", "15th of January"
  - Automatic year handling (defaults to current/next year)
  - Past date prevention (automatically advances to next year if needed)

- **Airline Name Resolution**:
  - Maps airline codes to full names for better voice output
  - Examples: AA → American Airlines, BA → British Airways

- **Voice-Optimized Formatting**:
  - Duration formatting: "PT7H30M" → "7 hours and 30 minutes"
  - Price formatting with currency
  - Stop counting: "nonstop", "1 stop", "2 stops"

### 2. Improved Error Handling
- **User-Friendly Error Messages**:
  ```python
  "I couldn't understand the date 'next friday'. Please try saying it differently, like 'tomorrow' or 'January 15th'."
  ```
  Instead of technical API errors

- **Specific Error Codes**:
  - `MISSING_ORIGIN`, `MISSING_DESTINATION`, `INVALID_DATE`
  - `DATE_IN_PAST`, `SERVICE_NOT_CONFIGURED`, `API_ERROR`

- **Graceful Degradation**:
  - Falls back to broader searches if initial search fails
  - Provides helpful suggestions when no flights found

### 3. Enhanced Voice Bot Integration

#### Updated Function Definition in OpenAI Session
The function calling definition now provides better guidance:
```javascript
{
  "name": "call_external_api",
  "description": "...For FLIGHT SEARCH: use endpoint='amadeus_flight_search' - you can use city names (e.g., 'New York', 'London') or airport codes...",
  "parameters": {
    "endpoint": "amadeus_flight_search",
    "params": {
      "origin": "city name or airport code",
      "destination": "city name or airport code",
      "departure_date": "date in natural language or YYYY-MM-DD",
      "return_date": "optional for roundtrip",
      "adults": number,
      "children": number,
      "travel_class": "ECONOMY/BUSINESS/FIRST",
      "nonstop": true/false
    }
  }
}
```

#### Voice-Friendly Response Format
The system now generates natural language summaries:
```
"I found 3 flights from New York to London. The cheapest is British Airways for $450.00. The fastest is American Airlines taking 6 hours and 45 minutes. There are 2 nonstop options. Would you like more details about any of these flights?"
```

### 4. Configuration Management
- Credentials loaded from `data/api_config.json`
- No need for environment variables
- Automatic initialization on first use
- Graceful handling when credentials missing

## Testing

### Test Files Created
1. **`test_flight_with_config.py`** - Tests with credentials from config file
2. **`test_voice_flight.py`** - Tests voice parameter parsing
3. **`test_flight_realtime.py`** - Tests with real API calls

### Sample Voice Queries Supported
- "Find flights from New York to London tomorrow"
- "I need 2 business class tickets from San Francisco to Paris"
- "Show me nonstop flights from Miami to Chicago"
- "Book a roundtrip from Boston to Las Vegas next month"
- "What are the cheapest flights from Seattle to Tokyo"

## API Usage Statistics
Based on your Amadeus dashboard:
- Test calls available: 2,000 per month
- Currently used: 10 calls
- Remaining: 1,990 calls

## Recommendations for Further Improvement

1. **Implement Caching**:
   - Cache frequently searched routes
   - Store airport code mappings in memory
   - Cache date parsing results

2. **Add More Natural Language Variations**:
   - "I want to visit..." → destination extraction
   - "Coming back on..." → return date extraction
   - "For my family of 4..." → passenger count extraction

3. **Enhance Voice Feedback**:
   - Add booking instructions
   - Mention baggage allowances
   - Include terminal information

4. **Add Monitoring**:
   - Track successful vs failed searches
   - Monitor API response times
   - Log common user queries for improvement

5. **Implement Fallback Options**:
   - When Amadeus fails, try alternative APIs
   - Provide general flight advice when no results
   - Suggest alternative airports or dates

## Configuration Status
✅ Amadeus credentials configured in `data/api_config.json`
✅ Enhanced flight handler integrated into server
✅ Voice parameter mapping implemented
✅ Error handling improved
✅ Natural language date parsing working

## How to Use

### For Testing
```bash
# Test flight search with config
python test_flight_with_config.py

# Test voice parameter parsing
python test_voice_flight.py

# Start the voice bot server
python src/server.py
```

### Voice Commands Examples
When talking to the voice bot:
- "Find me flights from New York to London tomorrow"
- "I need to fly from Chicago to Miami next Friday"
- "Search for business class flights from San Francisco to Tokyo"
- "What flights are available from Boston to Las Vegas for 2 adults and 1 child?"

## Troubleshooting

### If flights aren't being found:
1. Check Amadeus API credentials in `data/api_config.json`
2. Verify the dates are in the future (not past dates)
3. Check API quota hasn't been exceeded
4. Try with major airport codes (JFK, LAX, ORD)

### If city names aren't recognized:
1. Check the city mapping in `flight_handler.py`
2. Try using airport codes directly
3. Use major city names without qualifiers

### If dates aren't parsed correctly:
1. Use explicit formats: "January 15, 2025"
2. Use relative dates: "tomorrow", "next week"
3. Avoid ambiguous formats like "1/2" (could be Jan 2 or Feb 1)