import https from 'https';

export class FreeWeatherTool {
    constructor(config = {}) {
        this.enabled = config.enabled !== false;
        this.units = config.units || 'metric'; // metric or imperial
    }

    async getCurrentWeather(location, options = {}) {
        if (!this.enabled) {
            throw new Error('Weather service is disabled');
        }

        try {
            // First, geocode the location to get coordinates
            const coords = await this.geocodeLocation(location);
            if (!coords) {
                throw new Error(`Location "${location}" not found`);
            }

            // Get weather data using coordinates
            const weather = await this.getWeatherByCoords(
                coords.latitude, 
                coords.longitude,
                coords.name,
                coords.country
            );
            
            return weather;
        } catch (error) {
            throw error;
        }
    }

    async geocodeLocation(location) {
        return new Promise((resolve, reject) => {
            const query = encodeURIComponent(location);
            const options = {
                hostname: 'geocoding-api.open-meteo.com',
                path: `/v1/search?name=${query}&count=1&language=en&format=json`,
                method: 'GET'
            };

            https.get(options, (res) => {
                let data = '';
                
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        
                        if (result.results && result.results.length > 0) {
                            const loc = result.results[0];
                            resolve({
                                latitude: loc.latitude,
                                longitude: loc.longitude,
                                name: loc.name,
                                country: loc.country,
                                admin1: loc.admin1 // state/region
                            });
                        } else {
                            resolve(null);
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', reject);
        });
    }

    async getWeatherByCoords(lat, lon, cityName = '', country = '') {
        return new Promise((resolve, reject) => {
            // Open-Meteo API - completely free, no API key needed
            const tempUnit = this.units === 'imperial' ? 'fahrenheit' : 'celsius';
            const windUnit = this.units === 'imperial' ? 'mph' : 'kmh';
            
            const params = new URLSearchParams({
                latitude: lat,
                longitude: lon,
                current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m',
                temperature_unit: tempUnit,
                wind_speed_unit: windUnit,
                precipitation_unit: 'mm'
            });

            const options = {
                hostname: 'api.open-meteo.com',
                path: `/v1/forecast?${params}`,
                method: 'GET'
            };

            https.get(options, (res) => {
                let data = '';
                
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        const formatted = this.formatWeatherData(result, cityName, country);
                        resolve(formatted);
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', reject);
        });
    }

    async getForecast(location, days = 5) {
        if (!this.enabled) {
            throw new Error('Weather service is disabled');
        }

        try {
            // First, geocode the location
            const coords = await this.geocodeLocation(location);
            if (!coords) {
                throw new Error(`Location "${location}" not found`);
            }

            return new Promise((resolve, reject) => {
                const tempUnit = this.units === 'imperial' ? 'fahrenheit' : 'celsius';
                const windUnit = this.units === 'imperial' ? 'mph' : 'kmh';
                
                const params = new URLSearchParams({
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
                    temperature_unit: tempUnit,
                    wind_speed_unit: windUnit,
                    precipitation_unit: 'mm',
                    forecast_days: Math.min(days, 7) // Free tier supports up to 7 days
                });

                const options = {
                    hostname: 'api.open-meteo.com',
                    path: `/v1/forecast?${params}`,
                    method: 'GET'
                };

                https.get(options, (res) => {
                    let data = '';
                    
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const result = JSON.parse(data);
                            const formatted = this.formatForecastData(
                                result, 
                                coords.name, 
                                coords.country
                            );
                            resolve(formatted);
                        } catch (error) {
                            reject(error);
                        }
                    });
                }).on('error', reject);
            });
        } catch (error) {
            throw error;
        }
    }

    getWeatherDescription(code) {
        // WMO Weather interpretation codes
        const weatherCodes = {
            0: { main: 'Clear', description: 'Clear sky', icon: '☀️' },
            1: { main: 'Mostly Clear', description: 'Mainly clear', icon: '🌤️' },
            2: { main: 'Partly Cloudy', description: 'Partly cloudy', icon: '⛅' },
            3: { main: 'Overcast', description: 'Overcast', icon: '☁️' },
            45: { main: 'Foggy', description: 'Fog', icon: '🌫️' },
            48: { main: 'Foggy', description: 'Depositing rime fog', icon: '🌫️' },
            51: { main: 'Drizzle', description: 'Light drizzle', icon: '🌦️' },
            53: { main: 'Drizzle', description: 'Moderate drizzle', icon: '🌦️' },
            55: { main: 'Drizzle', description: 'Dense drizzle', icon: '🌦️' },
            61: { main: 'Rain', description: 'Slight rain', icon: '🌧️' },
            63: { main: 'Rain', description: 'Moderate rain', icon: '🌧️' },
            65: { main: 'Rain', description: 'Heavy rain', icon: '🌧️' },
            71: { main: 'Snow', description: 'Slight snow fall', icon: '🌨️' },
            73: { main: 'Snow', description: 'Moderate snow fall', icon: '🌨️' },
            75: { main: 'Snow', description: 'Heavy snow fall', icon: '❄️' },
            77: { main: 'Snow Grains', description: 'Snow grains', icon: '❄️' },
            80: { main: 'Rain Showers', description: 'Slight rain showers', icon: '🌦️' },
            81: { main: 'Rain Showers', description: 'Moderate rain showers', icon: '🌦️' },
            82: { main: 'Rain Showers', description: 'Violent rain showers', icon: '⛈️' },
            85: { main: 'Snow Showers', description: 'Slight snow showers', icon: '🌨️' },
            86: { main: 'Snow Showers', description: 'Heavy snow showers', icon: '🌨️' },
            95: { main: 'Thunderstorm', description: 'Thunderstorm', icon: '⛈️' },
            96: { main: 'Thunderstorm', description: 'Thunderstorm with slight hail', icon: '⛈️' },
            99: { main: 'Thunderstorm', description: 'Thunderstorm with heavy hail', icon: '⛈️' }
        };
        
        return weatherCodes[code] || { 
            main: 'Unknown', 
            description: 'Unknown weather', 
            icon: '❓' 
        };
    }

    formatWeatherData(data, cityName = '', country = '') {
        const current = data.current || {};
        const weather = this.getWeatherDescription(current.weather_code);
        
        return {
            type: 'current',
            location: {
                name: cityName || `${data.latitude}, ${data.longitude}`,
                country: country,
                coords: {
                    lat: data.latitude,
                    lon: data.longitude
                }
            },
            temperature: {
                current: current.temperature_2m,
                feels_like: current.apparent_temperature,
                unit: this.units === 'imperial' ? '°F' : '°C'
            },
            conditions: {
                main: weather.main,
                description: weather.description,
                icon: weather.icon
            },
            details: {
                humidity: current.relative_humidity_2m,
                cloud_cover: current.cloud_cover,
                precipitation: current.precipitation
            },
            wind: {
                speed: current.wind_speed_10m,
                direction: current.wind_direction_10m,
                unit: this.units === 'imperial' ? 'mph' : 'km/h'
            }
        };
    }

    formatForecastData(data, cityName = '', country = '') {
        const daily = data.daily || {};
        const forecasts = [];
        
        for (let i = 0; i < daily.time?.length; i++) {
            const weather = this.getWeatherDescription(daily.weather_code[i]);
            forecasts.push({
                date: daily.time[i],
                temperature: {
                    max: daily.temperature_2m_max[i],
                    min: daily.temperature_2m_min[i],
                    unit: this.units === 'imperial' ? '°F' : '°C'
                },
                conditions: {
                    main: weather.main,
                    description: weather.description,
                    icon: weather.icon
                },
                precipitation: {
                    sum: daily.precipitation_sum[i],
                    probability: daily.precipitation_probability_max[i]
                },
                wind: {
                    max_speed: daily.wind_speed_10m_max[i],
                    unit: this.units === 'imperial' ? 'mph' : 'km/h'
                }
            });
        }
        
        return {
            type: 'forecast',
            location: {
                name: cityName || `${data.latitude}, ${data.longitude}`,
                country: country,
                coords: {
                    lat: data.latitude,
                    lon: data.longitude
                }
            },
            forecasts
        };
    }

    formatAsMarkdown(weather) {
        let markdown = '';
        
        if (weather.type === 'current') {
            markdown += `## ${weather.conditions.icon} Weather in ${weather.location.name}`;
            if (weather.location.country) markdown += `, ${weather.location.country}`;
            markdown += '\n\n';
            markdown += `### Current Conditions\n`;
            markdown += `- **${weather.conditions.main}**: ${weather.conditions.description}\n`;
            markdown += `- **Temperature**: ${weather.temperature.current}${weather.temperature.unit} `;
            markdown += `(feels like ${weather.temperature.feels_like}${weather.temperature.unit})\n`;
            markdown += `- **Humidity**: ${weather.details.humidity}%\n`;
            markdown += `- **Wind**: ${weather.wind.speed} ${weather.wind.unit}`;
            if (weather.wind.direction) markdown += ` from ${weather.wind.direction}°`;
            markdown += '\n';
            markdown += `- **Cloud Cover**: ${weather.details.cloud_cover}%\n`;
            
            if (weather.details.precipitation > 0) {
                markdown += `- **Precipitation**: ${weather.details.precipitation} mm\n`;
            }
        } else {
            markdown += `## 📅 Weather Forecast for ${weather.location.name}`;
            if (weather.location.country) markdown += `, ${weather.location.country}`;
            markdown += '\n\n';
            
            weather.forecasts.forEach(forecast => {
                const date = new Date(forecast.date);
                markdown += `### ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}\n`;
                markdown += `${forecast.conditions.icon} **${forecast.conditions.main}** - `;
                markdown += `High: ${forecast.temperature.max}${forecast.temperature.unit}, `;
                markdown += `Low: ${forecast.temperature.min}${forecast.temperature.unit}\n`;
                markdown += `${forecast.conditions.description}`;
                if (forecast.precipitation.probability > 0) {
                    markdown += ` - ${forecast.precipitation.probability}% chance of precipitation`;
                }
                markdown += '\n\n';
            });
        }
        
        return markdown;
    }

    formatAsHTML(weather) {
        let html = '<div class="weather-widget">';
        
        if (weather.type === 'current') {
            html += `
                <div class="weather-current">
                    <h2>${weather.conditions.icon} Weather in ${weather.location.name}`;
            if (weather.location.country) html += `, ${weather.location.country}`;
            html += `</h2>
                    <div class="weather-main">
                        <div class="temperature">${weather.temperature.current}${weather.temperature.unit}</div>
                        <div class="description">${weather.conditions.description}</div>
                    </div>
                    <div class="weather-details">
                        <div>Feels like: ${weather.temperature.feels_like}${weather.temperature.unit}</div>
                        <div>Humidity: ${weather.details.humidity}%</div>
                        <div>Wind: ${weather.wind.speed} ${weather.wind.unit}</div>
                        <div>Cloud Cover: ${weather.details.cloud_cover}%</div>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="weather-forecast">
                    <h2>Forecast for ${weather.location.name}`;
            if (weather.location.country) html += `, ${weather.location.country}`;
            html += `</h2>
                    <div class="forecast-items">
            `;
            
            weather.forecasts.forEach(forecast => {
                const date = new Date(forecast.date);
                html += `
                    <div class="forecast-item">
                        <div class="forecast-date">${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                        <div class="forecast-icon">${forecast.conditions.icon}</div>
                        <div class="forecast-temp">
                            <span class="temp-high">${forecast.temperature.max}°</span>
                            <span class="temp-low">${forecast.temperature.min}°</span>
                        </div>
                        <div class="forecast-desc">${forecast.conditions.main}</div>
                    </div>
                `;
            });
            
            html += '</div></div>';
        }
        
        html += '</div>';
        return html;
    }
}

// Tool definition for OpenAI Realtime API
export const freeWeatherToolDefinition = {
    name: 'get_weather',
    description: 'Get current weather or forecast for a location using free Open-Meteo API',
    parameters: {
        type: 'object',
        properties: {
            location: {
                type: 'string',
                description: 'City name, e.g., "London", "New York", "Tokyo"'
            },
            forecast: {
                type: 'boolean',
                description: 'Get forecast instead of current weather',
                default: false
            },
            days: {
                type: 'number',
                description: 'Number of forecast days (1-7)',
                default: 3
            }
        },
        required: ['location']
    }
};

export default FreeWeatherTool;