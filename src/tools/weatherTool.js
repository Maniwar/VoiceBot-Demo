import https from 'https';

export class WeatherTool {
    constructor(config = {}) {
        this.apiKey = config.apiKey || process.env.OPENWEATHER_API_KEY;
        this.units = config.units || 'metric'; // metric, imperial, kelvin
        this.enabled = config.enabled !== false;
    }

    async getCurrentWeather(location, options = {}) {
        if (!this.enabled) {
            throw new Error('Weather service is disabled');
        }

        if (!this.apiKey) {
            throw new Error('OpenWeather API key not configured');
        }

        const params = new URLSearchParams({
            q: location,
            appid: this.apiKey,
            units: options.units || this.units,
            lang: options.lang || 'en'
        });

        return this.makeRequest(`/data/2.5/weather?${params}`);
    }

    async getForecast(location, days = 5) {
        if (!this.enabled) {
            throw new Error('Weather service is disabled');
        }

        if (!this.apiKey) {
            throw new Error('OpenWeather API key not configured');  
        }

        const params = new URLSearchParams({
            q: location,
            appid: this.apiKey,
            units: this.units,
            cnt: Math.min(days * 8, 40) // 8 forecasts per day, max 40
        });

        return this.makeRequest(`/data/2.5/forecast?${params}`);
    }

    async getWeatherByCoords(lat, lon, options = {}) {
        if (!this.enabled) {
            throw new Error('Weather service is disabled');
        }

        if (!this.apiKey) {
            throw new Error('OpenWeather API key not configured');
        }

        const params = new URLSearchParams({
            lat: lat,
            lon: lon,
            appid: this.apiKey,
            units: options.units || this.units
        });

        return this.makeRequest(`/data/2.5/weather?${params}`);
    }

    makeRequest(path) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.openweathermap.org',
                path: path,
                method: 'GET'
            };

            https.get(options, (res) => {
                let data = '';
                
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        
                        if (result.cod && result.cod !== 200 && result.cod !== "200") {
                            reject(new Error(result.message || 'Weather API error'));
                            return;
                        }

                        const formatted = this.formatWeatherData(result);
                        resolve(formatted);
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', reject);
        });
    }

    formatWeatherData(data) {
        if (data.list) {
            // Forecast data
            return {
                type: 'forecast',
                location: {
                    name: data.city.name,
                    country: data.city.country,
                    coords: data.city.coord
                },
                forecasts: data.list.map(item => this.formatSingleWeather(item))
            };
        } else {
            // Current weather
            return {
                type: 'current',
                location: {
                    name: data.name,
                    country: data.sys?.country,
                    coords: data.coord
                },
                ...this.formatSingleWeather(data)
            };
        }
    }

    formatSingleWeather(data) {
        return {
            timestamp: data.dt,
            datetime: new Date(data.dt * 1000).toISOString(),
            temperature: {
                current: data.main.temp,
                feels_like: data.main.feels_like,
                min: data.main.temp_min,
                max: data.main.temp_max,
                unit: this.getTemperatureUnit()
            },
            conditions: {
                main: data.weather?.[0]?.main,
                description: data.weather?.[0]?.description,
                icon: `https://openweathermap.org/img/wn/${data.weather?.[0]?.icon}@2x.png`
            },
            details: {
                pressure: data.main.pressure,
                humidity: data.main.humidity,
                visibility: data.visibility,
                clouds: data.clouds?.all
            },
            wind: {
                speed: data.wind?.speed,
                direction: data.wind?.deg,
                gust: data.wind?.gust
            },
            rain: data.rain,
            snow: data.snow
        };
    }

    getTemperatureUnit() {
        switch(this.units) {
            case 'imperial': return '°F';
            case 'kelvin': return 'K';
            default: return '°C';
        }
    }

    formatAsMarkdown(weather) {
        let markdown = '';
        
        if (weather.type === 'current') {
            markdown += `## 🌤️ Weather in ${weather.location.name}, ${weather.location.country}\n\n`;
            markdown += `### Current Conditions\n`;
            markdown += `![Weather](${weather.conditions.icon})\n`;
            markdown += `- **${weather.conditions.main}**: ${weather.conditions.description}\n`;
            markdown += `- **Temperature**: ${weather.temperature.current}${weather.temperature.unit} `;
            markdown += `(feels like ${weather.temperature.feels_like}${weather.temperature.unit})\n`;
            markdown += `- **Humidity**: ${weather.details.humidity}%\n`;
            markdown += `- **Wind**: ${weather.wind.speed} m/s\n`;
            markdown += `- **Pressure**: ${weather.details.pressure} hPa\n`;
            
            if (weather.rain) {
                markdown += `- **Rain**: ${weather.rain['1h'] || weather.rain['3h']} mm\n`;
            }
        } else {
            markdown += `## 📅 Weather Forecast for ${weather.location.name}, ${weather.location.country}\n\n`;
            
            weather.forecasts.slice(0, 5).forEach(forecast => {
                const date = new Date(forecast.datetime);
                markdown += `### ${date.toLocaleDateString()} ${date.toLocaleTimeString()}\n`;
                markdown += `![Weather](${forecast.conditions.icon}) `;
                markdown += `**${forecast.conditions.main}** - ${forecast.temperature.current}${forecast.temperature.unit}\n`;
                markdown += `${forecast.conditions.description}\n\n`;
            });
        }
        
        return markdown;
    }

    formatAsHTML(weather) {
        let html = '<div class="weather-widget">';
        
        if (weather.type === 'current') {
            html += `
                <div class="weather-current">
                    <h2>Weather in ${weather.location.name}, ${weather.location.country}</h2>
                    <div class="weather-main">
                        <img src="${weather.conditions.icon}" alt="${weather.conditions.main}">
                        <div class="temperature">${weather.temperature.current}${weather.temperature.unit}</div>
                        <div class="description">${weather.conditions.description}</div>
                    </div>
                    <div class="weather-details">
                        <div>Feels like: ${weather.temperature.feels_like}${weather.temperature.unit}</div>
                        <div>Humidity: ${weather.details.humidity}%</div>
                        <div>Wind: ${weather.wind.speed} m/s</div>
                        <div>Pressure: ${weather.details.pressure} hPa</div>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="weather-forecast">
                    <h2>Forecast for ${weather.location.name}, ${weather.location.country}</h2>
                    <div class="forecast-items">
            `;
            
            weather.forecasts.slice(0, 8).forEach(forecast => {
                const date = new Date(forecast.datetime);
                html += `
                    <div class="forecast-item">
                        <div class="forecast-time">${date.toLocaleTimeString()}</div>
                        <img src="${forecast.conditions.icon}" alt="${forecast.conditions.main}">
                        <div class="forecast-temp">${forecast.temperature.current}${forecast.temperature.unit}</div>
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
export const weatherToolDefinition = {
    name: 'get_weather',
    description: 'Get current weather or forecast for a location',
    parameters: {
        type: 'object',
        properties: {
            location: {
                type: 'string',
                description: 'City name, e.g., "London, UK" or "New York"'
            },
            forecast: {
                type: 'boolean',
                description: 'Get forecast instead of current weather',
                default: false
            },
            days: {
                type: 'number',
                description: 'Number of forecast days (1-5)',
                default: 3
            }
        },
        required: ['location']
    }
};

export default WeatherTool;