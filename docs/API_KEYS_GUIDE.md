# API Keys Setup Guide

This guide shows you how to get free API keys for services that require authentication.

## APIs Requiring Keys (11 total)

### 1. NASA API
- **Get Key**: https://api.nasa.gov/
- **Cost**: FREE
- **Steps**:
  1. Visit https://api.nasa.gov/
  2. Fill out the form with your name and email
  3. Key is sent instantly to your email
  4. No credit card required
- **Limits**: 1,000 requests per hour
- **Auth Type**: Query parameter (`?api_key=YOUR_KEY`)

### 2. News API
- **Get Key**: https://newsapi.org/register
- **Cost**: FREE (Developer plan)
- **Steps**:
  1. Visit https://newsapi.org/register
  2. Create account with email
  3. Key shown on dashboard immediately
  4. No credit card required
- **Limits**: 100 requests per day (free tier)
- **Auth Type**: Header (`X-Api-Key: YOUR_KEY`)

### 3. YouTube Data API
- **Get Key**: https://console.cloud.google.com/
- **Cost**: FREE (with limits)
- **Steps**:
  1. Go to [Google Cloud Console](https://console.cloud.google.com/)
  2. Create new project or select existing
  3. Enable "YouTube Data API v3"
  4. Go to Credentials → Create Credentials → API Key
  5. Optional: Restrict key to YouTube API only
- **Limits**: 10,000 units per day free
- **Auth Type**: Query parameter (`?key=YOUR_KEY`)

### 4. Google Maps Geocoding API
- **Get Key**: https://console.cloud.google.com/
- **Cost**: $200/month FREE credit
- **Steps**:
  1. Go to [Google Cloud Console](https://console.cloud.google.com/)
  2. Enable billing (required but you get $200 free/month)
  3. Enable "Geocoding API"
  4. Create API key in Credentials section
  5. Restrict key to Geocoding API
- **Limits**: $200 free credit monthly (~40,000 requests)
- **Auth Type**: Query parameter (`?key=YOUR_KEY`)

### 5. Google Translate API
- **Get Key**: https://console.cloud.google.com/
- **Cost**: Uses free credit
- **Steps**:
  1. Go to [Google Cloud Console](https://console.cloud.google.com/)
  2. Enable billing (uses same $200 credit)
  3. Enable "Cloud Translation API"
  4. Create API key
  5. Restrict to Translation API
- **Limits**: 500,000 characters/month free
- **Auth Type**: Query parameter (`?key=YOUR_KEY`)

### 6. Google Custom Search API
- **Get Key**: https://developers.google.com/custom-search/v1/introduction
- **Cost**: FREE (with limits)
- **Steps**:
  1. Go to [Google Cloud Console](https://console.cloud.google.com/)
  2. Enable "Custom Search API"
  3. Create API key
  4. Also need Search Engine ID:
     - Visit https://cse.google.com/cse/
     - Create new search engine
     - Get Search Engine ID (cx parameter)
- **Limits**: 100 searches/day free
- **Auth Type**: Query parameter (`?key=YOUR_KEY&cx=YOUR_SEARCH_ENGINE_ID`)

### 7. Google Gemini API
- **Get Key**: https://makersuite.google.com/
- **Cost**: FREE
- **Steps**:
  1. Visit https://makersuite.google.com/
  2. Sign in with Google account
  3. Click "Get API key"
  4. Create new key or use existing
  5. No credit card required
- **Limits**: 60 requests per minute free
- **Auth Type**: Query parameter (`?key=YOUR_KEY`)

### 8. OpenAI API (if adding ChatGPT)
- **Get Key**: https://platform.openai.com/api-keys
- **Cost**: Pay-as-you-go (no free tier)
- **Steps**:
  1. Visit https://platform.openai.com/
  2. Sign up/Sign in
  3. Add payment method
  4. Go to API keys section
  5. Create new secret key
  6. Save immediately (shown only once)
- **Auth Type**: Header (`Authorization: Bearer YOUR_KEY`)

### 9. Amadeus Flight Search API (Optional)
- **Get Key**: https://developers.amadeus.com/
- **Cost**: FREE (Test environment)
- **Steps**:
  1. Go to [Amadeus for Developers](https://developers.amadeus.com/)
  2. Click "Register" and create a free account
  3. Verify your email
  4. Log in and go to "My Apps" in dashboard
  5. Click "Create New App"
  6. Choose "Test" environment (free)
  7. Copy your Client ID and Client Secret
- **Limits**: 1,000 calls/month free in test environment
- **Configuration**: 
  - Go to Admin Panel → API Endpoints
  - Find "Amadeus Flight Search API"
  - Click Edit and add your Client ID and Client Secret
  - Save the configuration

### 10. Travelpayouts Affiliate API (Optional)
- **Get Key**: https://www.travelpayouts.com/
- **Cost**: FREE (Commission-based)
- **Steps**:
  1. Go to [Travelpayouts](https://www.travelpayouts.com/)
  2. Sign up as an affiliate partner
  3. Complete profile verification
  4. Navigate to "API" section in dashboard
  5. Generate your API token
  6. Get your Marker ID (affiliate identifier)
- **Purpose**: Generates affiliate booking links for flight results
- **Configuration**: 
  - Go to Admin Panel → API Endpoints
  - Find "Travelpayouts Affiliate API"
  - Click Edit and add your Token and Marker ID
  - Save the configuration

### 11. Custom Business APIs
- **Examples**: Salesforce, HubSpot, Stripe, etc.
- **Get Keys**: From your service provider's developer portal
- **Auth Types**: Varies (OAuth, API Key, JWT, etc.)

## Quick Setup in Admin Panel

1. Go to http://localhost:3000/admin
2. Click "API Endpoints" tab
3. Find the API with orange "🔑 API KEY REQUIRED" badge
4. Click Edit button
5. Enter your API key in the password field
6. Select Authentication Type (Header or Query)
7. Click Save

## Security Best Practices

### DO:
- Store keys in environment variables for production
- Use different keys for dev/staging/production
- Restrict keys to specific APIs when possible
- Monitor usage in provider dashboards
- Rotate keys periodically

### DON'T:
- Commit API keys to GitHub
- Share keys publicly
- Use production keys in development
- Exceed rate limits

## Free APIs (No Key Required)

These 33 APIs work immediately without any setup:
- Weather, Jokes, Facts, Quotes, Advice
- Cat/Dog pictures, Pokemon, Star Wars
- IP info, Exchange rates, Countries
- Dictionary, Trivia, Cocktails, Meals
- Google Books, Google Trends (unofficial)
- And many more...

## Troubleshooting

### API Key Not Working?
1. Check if key is active in provider dashboard
2. Verify correct auth type (Header vs Query)
3. Check rate limits haven't been exceeded
4. Ensure API is enabled in provider console
5. Try regenerating the key

### Rate Limited?
- Most free APIs reset daily
- NASA: 1,000/hour
- News API: 100/day
- YouTube: 10,000 units/day
- Use caching to reduce API calls

### Need Higher Limits?
- Most services offer paid tiers
- Google gives $200/month free credit
- Consider caching responses
- Implement request throttling

## Managing API Keys

All API keys are managed through the web-based Admin Panel:

1. Go to http://localhost:3000/admin
2. Click on "API Endpoints" tab
3. Find the API you want to configure
4. Click the Edit button
5. Enter your API key in the password field
6. Select the appropriate Authentication Type
7. Click Save

The keys are stored locally in your browser and sent securely with each API request.