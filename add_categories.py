#!/usr/bin/env python3
"""Add categories to all APIs in api_config.json"""

import json

# Define API categories
API_CATEGORIES = {
    # Travel & Flights
    "amadeus_flight_search": "Travel & Flights",
    "travelpayouts_affiliate": "Travel & Flights",
    
    # Weather & Environment
    "openweathermap_current": "Weather & Environment",
    "openweathermap_forecast": "Weather & Environment",
    "nasa_apod": "Weather & Environment",
    "nasa_neo": "Weather & Environment",
    "sunrise_sunset": "Weather & Environment",
    
    # Knowledge & Information
    "wikipedia_search": "Knowledge & Information",
    "wikidata_search": "Knowledge & Information",
    "openlibrary_search": "Knowledge & Information",
    "arxiv_search": "Knowledge & Information",
    "crossref_works": "Knowledge & Information",
    
    # News & Media
    "newsapi_headlines": "News & Media",
    "newsapi_everything": "News & Media",
    "reddit_search": "News & Media",
    "hackernews_top": "News & Media",
    "youtube_search": "News & Media",
    
    # Entertainment
    "tvmaze_search": "Entertainment",
    "tvmaze_schedule": "Entertainment",
    "spotify_search": "Entertainment",
    "itunes_search": "Entertainment",
    "rawg_games": "Entertainment",
    "opentdb_trivia": "Entertainment",
    "jeopardy_random": "Entertainment",
    "chucknorris_random": "Entertainment",
    "kanye_quote": "Entertainment",
    "quotable_random": "Entertainment",
    "advice_slip": "Entertainment",
    
    # Finance & Crypto
    "exchangerate_latest": "Finance & Crypto",
    "coindesk_btc": "Finance & Crypto",
    
    # Location & Maps
    "ipapi_location": "Location & Maps",
    "google_geocode": "Location & Maps",
    
    # Data & Numbers
    "numbers_trivia": "Data & Numbers",
    "numbers_date": "Data & Numbers",
    
    # Development & Tech
    "github_user": "Development & Tech",
    "github_repos": "Development & Tech",
    
    # Food & Recipes
    "edamam_recipes": "Food & Recipes",
    "cocktaildb_search": "Food & Recipes",
    
    # Search & Discovery
    "google_search": "Search & Discovery",
    
    # Language & Translation
    "google_translate": "Language & Translation",
    "datamuse_words": "Language & Translation",
    
    # AI & Machine Learning
    "google_gemini": "AI & Machine Learning"
}

# Load the config file
with open('./data/api_config.json', 'r') as f:
    config = json.load(f)

# Add categories to each endpoint
for endpoint in config['endpoints']:
    api_id = endpoint.get('id', '')
    if api_id in API_CATEGORIES:
        endpoint['category'] = API_CATEGORIES[api_id]
    else:
        # Try to guess category from name
        name = endpoint.get('name', '').lower()
        if 'weather' in name:
            endpoint['category'] = 'Weather & Environment'
        elif 'news' in name:
            endpoint['category'] = 'News & Media'
        elif 'google' in name:
            endpoint['category'] = 'Search & Discovery'
        else:
            endpoint['category'] = 'Uncategorized'

# Save the updated config
with open('./data/api_config.json', 'w') as f:
    json.dump(config, f, indent=2)

print(f"Added categories to {len(config['endpoints'])} endpoints")

# Print category summary
category_count = {}
for endpoint in config['endpoints']:
    category = endpoint.get('category', 'Uncategorized')
    category_count[category] = category_count.get(category, 0) + 1

print("\nCategory Summary:")
for category, count in sorted(category_count.items()):
    print(f"  {category}: {count} APIs")