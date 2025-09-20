# Flight API Timeout Fix

## Issue
The Amadeus test API was timing out because:
- Test environment responses take 12-15 seconds
- Original timeout was set to 10 seconds
- This caused the voice bot to hang or fail on flight searches

## Solution Implemented

### 1. Added Timeout Protection
Added asyncio timeout wrapper to prevent indefinite hanging:
```python
# In flight_handler.py and server.py
response = await asyncio.wait_for(
    loop.run_in_executor(None, amadeus_api_call),
    timeout=20.0  # Increased to 20 seconds
)
```

### 2. Graceful Error Handling
When timeout occurs, users get friendly messages:
- "The flight search is taking longer than expected. Please try again or try a simpler search."
- Instead of technical errors or hanging

### 3. Files Modified
- `src/flight_handler.py`: Added 20-second timeout with error handling
- `src/server.py`: Added matching timeout protection
- Both files now handle `asyncio.TimeoutError` gracefully

## Current Status
✅ **Timeout protection active** - No more hanging
✅ **20-second timeout** - Accommodates slow test API
✅ **User-friendly errors** - Better voice experience
✅ **Server remains responsive** - Even during slow searches

## Performance Observations
Based on testing:
- Amadeus TEST environment: ~12-15 seconds per search
- Amadeus PRODUCTION environment: Expected to be faster (2-5 seconds)
- Current 20-second timeout provides good buffer

## Recommendations

### For Production
When moving to production:
1. Switch Amadeus to production environment:
   ```python
   hostname='production'  # Instead of 'test'
   ```
2. Can reduce timeout to 10 seconds for better UX
3. Monitor actual response times

### For Better Performance
1. **Implement Caching**: Cache frequent routes (NYC-LAX, etc.)
2. **Pre-warm API**: Keep connection alive with periodic health checks
3. **Parallel Searches**: For roundtrip, search both directions simultaneously
4. **Progressive Loading**: Return first result immediately, others as they arrive

### Voice Bot Experience
The voice bot now:
- Won't freeze during flight searches
- Provides clear feedback if searches are slow
- Continues working even if one search fails
- Handles timeouts gracefully

## Testing
Test timeout handling:
```bash
# Test with future dates to ensure results
python test_amadeus_direct.py

# Test the enhanced handler
python test_voice_flight.py

# Full integration test
./manage_server.sh restart
# Then use voice bot to search for flights
```

## Monitoring
Watch for timeout issues in logs:
```bash
tail -f /tmp/voicebot_server.log | grep -i timeout
```

If seeing frequent timeouts:
1. Check Amadeus API status
2. Verify network connectivity
3. Consider increasing timeout further
4. Switch to production API if available