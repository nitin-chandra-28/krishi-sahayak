        // --- Global State ---
        const pages = document.querySelectorAll('.page');
        const navItems = document.querySelectorAll('.nav-item');
        const appContainer = document.getElementById('app-container');
        const mainContentArea = appContainer.parentElement;
        let yieldChartInstance = null;
        let mapInstance = null;
        let currentDistrict = 'Hisar';
        let lastWeatherData = null;
        let updateIntervals = {};
        let isDataFresh = {
            weather: false,
            soil: false,
            mandi: false
        };
        let lastUpdateTimes = {
            weather: null,
            soil: null,
            mandi: null
        };
        
        // District rainfall norms (approx annual mm) for variability by location
        const districtRainfallNorms = {
            Hisar: 429,
            Indore: 955,
            Karnal: 734,
            Nagpur: 1100,
            Sirsa: 412,
            Aurangabad: 734
        };
    // data readiness flags
    window.__soilReady = false;
    window.__weatherReady = false;
    
    // Enhanced UI Functions
    function showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        const bgColor = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            warning: 'bg-yellow-500',
            info: 'bg-blue-500'
        }[type] || 'bg-blue-500';
        
        toast.className = `fixed top-4 right-4 z-50 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg transform translate-x-full transition-transform duration-300 flex items-center space-x-2`;
        toast.innerHTML = `
            <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : type === 'warning' ? 'alert-triangle' : 'info'}" class="w-5 h-5"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(toast);
        lucide.createIcons();
        
        // Slide in
        setTimeout(() => toast.classList.remove('translate-x-full'), 100);
        
        // Slide out and remove
        setTimeout(() => {
            toast.classList.add('translate-x-full');
            setTimeout(() => document.body.removeChild(toast), 300);
        }, duration);
    }
    
    function addLoadingSpinner(element) {
        if (!element) return;
        element.classList.add('pulse');
        const spinner = element.querySelector('.loading-spinner');
        if (!spinner) {
            const spinnerDiv = document.createElement('div');
            spinnerDiv.className = 'loading-spinner absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-800/80 rounded-lg';
            spinnerDiv.innerHTML = '<div class="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>';
            element.style.position = 'relative';
            element.appendChild(spinnerDiv);
        }
    }
    
    function removeLoadingSpinner(element) {
        if (!element) return;
        element.classList.remove('pulse');
        const spinner = element.querySelector('.loading-spinner');
        if (spinner) {
            spinner.remove();
        }
    }
    
    function updateDataFreshness(dataType) {
        isDataFresh[dataType] = true;
        lastUpdateTimes[dataType] = new Date();
        
        // Add fresh data indicator
        const indicators = document.querySelectorAll(`[data-freshness="${dataType}"]`);
        indicators.forEach(indicator => {
            indicator.classList.add('data-fresh');
            setTimeout(() => indicator.classList.remove('data-fresh'), 3000);
        });
        
        // Show success toast
        showToast(`${dataType.charAt(0).toUpperCase() + dataType.slice(1)} data updated`, 'success', 2000);
    }
    
    function animateValue(element, start, end, duration = 1000) {
        if (!element) return;
        const range = end - start;
        const increment = range / (duration / 16);
        let current = start;
        
        const timer = setInterval(() => {
            current += increment;
            if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
                current = end;
                clearInterval(timer);
            }
            
            if (element.textContent.includes('°C')) {
                element.textContent = `${Math.round(current)}°C`;
            } else if (element.textContent.includes('%')) {
                element.textContent = `${Math.round(current)}%`;
            } else {
                element.textContent = Math.round(current).toString();
            }
        }, 16);
    }
        
        // --- Page Navigation ---
        function navigateToPage(pageId) {
            const predictionPages = ['prediction-page'];
            if (predictionPages.includes(pageId)) {
                appContainer.classList.add('max-w-lg', 'shadow-2xl', 'md:rounded-2xl', 'mx-auto', 'bg-white', 'dark:bg-gray-800');
                mainContentArea.classList.add('md:py-6');
            } else {
                appContainer.classList.remove('max-w-lg', 'shadow-2xl', 'md:rounded-2xl', 'mx-auto', 'bg-white', 'dark:bg-gray-800');
                mainContentArea.classList.remove('md:py-6');
            }

            pages.forEach(page => page.classList.remove('active'));
            document.getElementById(pageId).classList.add('active');

            navItems.forEach(item => item.classList.remove('active'));
            const activeNavItems = document.querySelectorAll(`.nav-item[onclick*="'${pageId}'"]`);
            activeNavItems.forEach(item => item.classList.add('active'));
            
            // Invalidate map size after navigation to ensure it renders correctly
            if (pageId === 'prediction-page' && mapInstance) {
                setTimeout(() => mapInstance.invalidateSize(), 0);
            }
            // Ensure translations update on every page navigation
            if (typeof translateStaticText === 'function') translateStaticText();
        }

        // --- Prediction Form Steps ---
        function goToPredictionStep(step) {
            document.querySelectorAll('.prediction-step').forEach(s => s.classList.remove('active'));
            document.getElementById(`prediction-step-${step}`).classList.add('active');

            if (step === 3) {
                document.getElementById('loading-spinner').style.display = 'flex';
                document.getElementById('results-content').style.display = 'none';
                setTimeout(() => {
                    document.getElementById('loading-spinner').style.display = 'none';
                    document.getElementById('results-content').style.display = 'block';
                    renderYieldChart();
                }, 2500);
            }
        }
        
        // --- Chart Rendering ---
        function renderYieldChart() {
            const ctx = document.getElementById('yieldChart').getContext('2d');
            if (yieldChartInstance) yieldChartInstance.destroy();
            Chart.defaults.color = document.documentElement.classList.contains('dark') ? '#e5e7eb' : '#374151';
            
            yieldChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Your Field', 'District Avg.', 'State Avg.'],
                    datasets: [{
                        label: 'Yield (Quintals/Acre)',
                        data: [45.5, 38, 35],
                        backgroundColor: ['rgba(34, 197, 94, 0.6)','rgba(59, 130, 246, 0.6)','rgba(249, 115, 22, 0.6)'],
                        borderColor: ['rgba(22, 163, 74, 1)','rgba(37, 99, 235, 1)','rgba(234, 88, 12, 1)'],
                        borderWidth: 2,
                        borderRadius: 4,
                        borderSkipped: false,
                    }]
                },
                options: {
                    responsive: true,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: { 
                        legend: { 
                            display: false 
                        }, 
                        title: { 
                            display: true, 
                            text: 'Yield Comparison',
                            font: { size: 16, weight: 'bold' }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            borderColor: '#374151',
                            borderWidth: 1,
                            callbacks: {
                                afterLabel: function(context) {
                                    const tips = [
                                        'Based on your field conditions and inputs',
                                        'Average for your district this season',
                                        'State-wide average yield'
                                    ];
                                    return tips[context.dataIndex] || '';
                                }
                            }
                        }
                    },
                    scales: { 
                        y: { 
                            beginAtZero: true,
                            grid: {
                                color: document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    },
                    animation: {
                        duration: 1500,
                        easing: 'easeOutBounce'
                    },
                    onHover: (event, elements) => {
                        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
                    },
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const index = elements[0].index;
                            const labels = ['Your Field', 'District Average', 'State Average'];
                            showToast(`Clicked on ${labels[index]}`, 'info', 2000);
                        }
                    }
                }
            });
        }
        
        // Create interactive soil nutrient chart
        function createSoilNutrientChart() {
            const chartContainer = document.querySelector('.dashboard-card.card-2');
            if (!chartContainer || chartContainer.querySelector('.soil-chart-container')) return;
            
            const chartDiv = document.createElement('div');
            chartDiv.className = 'soil-chart-container mt-4 hidden';
            chartDiv.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <h4 class="text-sm font-medium">Nutrient Analysis</h4>
                    <button class="toggle-chart-btn text-xs text-blue-600 dark:text-blue-400 hover:underline">Show Chart</button>
                </div>
                <canvas id="soilChart" width="300" height="200"></canvas>
            `;
            
            chartContainer.appendChild(chartDiv);
            
            const toggleBtn = chartDiv.querySelector('.toggle-chart-btn');
            const canvas = chartDiv.querySelector('#soilChart');
            
            toggleBtn.addEventListener('click', () => {
                if (chartDiv.classList.contains('hidden')) {
                    chartDiv.classList.remove('hidden');
                    toggleBtn.textContent = 'Hide Chart';
                    renderSoilChart();
                } else {
                    chartDiv.classList.add('hidden');
                    toggleBtn.textContent = 'Show Chart';
                }
            });
        }
        
        function renderSoilChart() {
            const canvas = document.getElementById('soilChart');
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            const dataset = (typeof districtSoilData !== 'undefined') ? districtSoilData : (typeof window.districtSoilData !== 'undefined' ? window.districtSoilData : undefined);
            const soilData = dataset ? dataset[currentDistrict] : { Zn: 50, Fe: 50, Cu: 50, Mn: 50, B: 50, S: 50 };
            
            const nutrients = Object.keys(soilData);
            const values = Object.values(soilData).map(v => typeof v === 'number' ? v : 50);
            
            new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: nutrients,
                    datasets: [{
                        label: 'Current Levels (%)',
                        data: values,
                        backgroundColor: 'rgba(34, 197, 94, 0.2)',
                        borderColor: 'rgba(34, 197, 94, 1)',
                        borderWidth: 2,
                        pointBackgroundColor: 'rgba(34, 197, 94, 1)',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }, {
                        label: 'Optimal Range',
                        data: nutrients.map(() => 80), // Optimal range indicator
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderColor: 'rgba(59, 130, 246, 0.5)',
                        borderWidth: 1,
                        borderDash: [5, 5],
                        pointRadius: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: { size: 11 }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                afterLabel: function(context) {
                                    const nutrient = context.label;
                                    const tips = {
                                        'Zn': 'Zinc - Essential for enzyme function',
                                        'Fe': 'Iron - Critical for chlorophyll synthesis',
                                        'Cu': 'Copper - Important for photosynthesis',
                                        'Mn': 'Manganese - Aids in nutrient uptake',
                                        'B': 'Boron - Necessary for cell wall formation',
                                        'S': 'Sulfur - Key component of proteins'
                                    };
                                    return tips[nutrient] || '';
                                }
                            }
                        }
                    },
                    scales: {
                        r: {
                            beginAtZero: true,
                            max: 100,
                            ticks: {
                                stepSize: 20,
                                font: { size: 10 }
                            },
                            grid: {
                                color: document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'
                            }
                        }
                    },
                    animation: {
                        duration: 1000,
                        easing: 'easeOutQuart'
                    }
                }
            });
        }
        
        // --- Smart Advisory Generation ---
        function generateSmartAdvisory(soilData, weatherData) {
            const advisoryElement = document.getElementById('advisory-message');
            let message = "";
            const moistureValue = parseFloat(soilData.moisture);

            if (moistureValue < 45 && weatherData.forecast === 'clear' && weatherData.nextRainDays > 3) {
                message = `<strong>Action Required:</strong> Soil moisture is low (${soilData.moisture}%) and no rain is expected for ${weatherData.nextRainDays} days. Recommend immediate irrigation.`;
            } else if (moistureValue > 85 && weatherData.forecast === 'rain') {
                message = `<strong>Alert:</strong> Soil is already saturated and more rain is coming. Check drainage to prevent waterlogging.`;
            } else if (weatherData.forecast === 'thunderstorm') {
                 message = `<strong>Weather Warning:</strong> Thunderstorm expected. Secure equipment and check crop supports.`;
            } else {
                message = `Conditions are optimal. Soil moisture is good (${soilData.moisture}%) and weather is stable. Monitor as usual.`;
            }
            advisoryElement.innerHTML = message;
        }

        function renderAdvisoryVisual(text, soilNutrients) {
            const container = document.getElementById('advisory-visual');
            const metrics = document.getElementById('advisory-metrics');
            if (!container) return;
            // Show chips for a few soil keys if present
            if (metrics) {
                const keys = Object.keys(soilNutrients || {}).slice(0, 6);
                metrics.innerHTML = keys.map(k => {
                    const v = soilNutrients[k];
                    return `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800">${k}: ${typeof v === 'number' ? v.toFixed(2) : v}</span>`;
                }).join('');
            }
            // Convert text into bullet lines
            const lines = (text || '').split(/\n|\r/).map(s => s.trim()).filter(Boolean);
            const iconFor = (s) => {
                const t = s.toLowerCase();
                if (t.includes('irrigat') || t.includes('water')) return 'droplets';
                if (t.includes('fertil') || t.includes('nitrogen') || t.includes('urea') || t.includes('npk')) return 'sprout';
                if (t.includes('disease') || t.includes('fung') || t.includes('pest') || t.includes('spray')) return 'shield-alert';
                if (t.includes('weather') || t.includes('rain') || t.includes('wind')) return 'cloud-sun';
                return 'info';
            };
            const badgeFor = (s) => {
                const t = s.toLowerCase();
                if (t.includes('immediate') || t.includes('urgent') || t.includes('now')) return { cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', label: 'High' };
                if (t.includes('should') || t.includes('consider')) return { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', label: 'Med' };
                return { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', label: 'Low' };
            };
            const items = lines.map(s => {
                const badge = badgeFor(s);
                const icon = iconFor(s);
                return `<div class="flex items-start p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40">
                    <i data-lucide="${icon}" class="w-4 h-4 mt-0.5 mr-2"></i>
                    <div class="flex-1 text-sm">${s}</div>
                    <span class="ml-2 px-2 py-0.5 rounded-full text-[10px] ${badge.cls}">${badge.label}</span>
                </div>`;
            });
            container.innerHTML = items.join('') || '<p class="text-sm text-gray-500">No recommendations.</p>';
            lucide.createIcons();
        }

        // --- API & Data Functions ---
        function initializeMap(lat, lon) {
             try {
                mapInstance = L.map('map').setView([lat, lon], 13);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
                    subdomains: 'abcd',
                    maxZoom: 19
                }).addTo(mapInstance);
                L.marker([lat, lon]).addTo(mapInstance)
                    .bindPopup("📍 Your current location")
                    .openPopup();
            } catch (e) {
                console.error("Could not initialize map:", e);
                document.getElementById('map').innerHTML = `<div class="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-500 rounded-lg"><p>Map failed to load.</p></div>`;
            }
        }

        function updateWeatherUI(lat, lon, showAnimation = true) {
            const apiKey = "9505fd1df737e20152fbd78cdb289b6a"; // Note: This key is public for demo purposes.
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
            
            // Add loading spinner to weather card
            const weatherCard = document.querySelector('.dashboard-card.card-1');
            if (showAnimation) addLoadingSpinner(weatherCard);
            
            fetch(url)
                .then(res => {
                    if (!res.ok) throw new Error(`Weather API request failed with status ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    const temp = Math.round(data.main.temp);
                    const condition = data.weather[0].main;
                    const city = data.name;
                    // crude rainfall estimate from current conditions (for variability demo)
                    const conditionRainMap = { 'Thunderstorm': 20, 'Drizzle': 5, 'Rain': 15, 'Snow': 10, 'Clouds': 2, 'Clear': 0 };
                    const estRain = conditionRainMap[condition] ?? 1;
                    
                    const oldTemp = lastWeatherData?.tempC || temp;
                    lastWeatherData = {
                        city,
                        tempC: temp,
                        condition,
                        humidity: data.main.humidity,
                        windKmh: Math.round(data.wind.speed * 3.6),
                        rainfall: estRain * 30 // approx monthly mm proxy to drive variability
                    };

                    // Update Dashboard Card with animations
                    const tempElement = document.getElementById('dashboard-temp');
                    if (showAnimation && tempElement) {
                        animateValue(tempElement, oldTemp, temp);
                    } else if (tempElement) {
                        tempElement.textContent = `${temp}°C`;
                    }
                    
                    const conditionElement = document.getElementById('dashboard-condition');
                    if (conditionElement) {
                        if (showAnimation) {
                            conditionElement.classList.add('fade-in');
                            setTimeout(() => conditionElement.classList.remove('fade-in'), 500);
                        }
                        conditionElement.textContent = condition;
                    }
                    
                    document.getElementById('dashboard-humidity').innerHTML = `<i data-lucide="droplets" class="w-4 h-4 mr-2"></i> ${data.main.humidity}%`;
                    document.getElementById('dashboard-wind').innerHTML = `<i data-lucide="wind" class="w-4 h-4 mr-2"></i> ${lastWeatherData.windKmh} km/h`;

                    // Update Weather Page
                    document.getElementById('weather-page-location').textContent = `Detailed weather information for ${city}.`;
                    document.getElementById('weather-page-temp').textContent = `${temp}°C`;
                    document.getElementById('weather-page-condition').textContent = condition;
                    document.getElementById('weather-page-city').textContent = city;

                    // Update district for soil dataset and render
                    const dataset = (typeof districtSoilData !== 'undefined') ? districtSoilData : (typeof window.districtSoilData !== 'undefined' ? window.districtSoilData : undefined);
                    if (dataset) {
                        currentDistrict = city in dataset ? city : currentDistrict;
                        renderSoilDataset(currentDistrict);
                    }

                    lucide.createIcons();
                    // mark weather ready for predictions
                    window.__weatherReady = true;
                    
                    // Remove loading spinner and update freshness
                    if (showAnimation) {
                        removeLoadingSpinner(weatherCard);
                        updateDataFreshness('weather');
                        
                        // Add bounce animation to weather card
                        weatherCard?.classList.add('bounce');
                        setTimeout(() => weatherCard?.classList.remove('bounce'), 1000);
                    }
                    
                    try { if (typeof updatePredictionReadiness === 'function') updatePredictionReadiness(); } catch(_) {}
                })
                .catch(err => {
                    console.error("Weather API error:", err);
                    if (showAnimation) {
                        removeLoadingSpinner(weatherCard);
                        showToast('Failed to update weather data', 'error');
                    }
                });
        }
        
        function fetchSoilData(showAnimation = true) {
            const soilDataContent = document.getElementById('soil-data-content');
            const soilDataLoading = document.getElementById('soil-data-loading');
            const soilDataError = document.getElementById('soil-data-error');
            const soilCard = document.querySelector('.dashboard-card.card-2');
            
            console.log('fetchSoilData called with showAnimation:', showAnimation);
            
            // Ensure elements exist
            if (!soilDataContent || !soilDataLoading) {
                console.error('Soil data elements not found');
                return;
            }
            
            if (showAnimation && soilCard) addLoadingSpinner(soilCard);
            
            // Show loading state
            soilDataLoading.classList.remove('hidden');
            soilDataContent.classList.add('hidden');
            if (soilDataError) soilDataError.classList.add('hidden');
            
            const advisoryMsg = document.getElementById('advisory-message');
            if (advisoryMsg) advisoryMsg.innerHTML = 'Analyzing farm data...';

            // Check if dataset is available
            const useDataset = (typeof districtSoilData !== 'undefined') || (typeof window.districtSoilData !== 'undefined');
            console.log('Using dataset:', useDataset, 'Current district:', currentDistrict);

            if (useDataset) {
                setTimeout(() => {
                    try {
                        console.log('Rendering soil dataset for district:', currentDistrict);
                        renderSoilDataset(currentDistrict, showAnimation);
                        
                        // Hide loading, show content
                        soilDataLoading.classList.add('hidden');
                        soilDataContent.classList.remove('hidden');
                        
                        if (showAnimation) {
                            soilDataContent.classList.add('slide-in-up');
                            setTimeout(() => soilDataContent.classList.remove('slide-in-up'), 600);
                        }
                        
                        if (advisoryMsg) advisoryMsg.innerHTML = 'Loading AI advisory...';
                        window.__soilReady = true;
                        
                        // Generate advisory
                        const dataset = (typeof districtSoilData !== 'undefined') ? districtSoilData : window.districtSoilData;
                        const row = dataset ? dataset[currentDistrict] : null;
                        const soilSummary = row || {};
                        
                        generateSmartAdvisory(soilSummary, lastWeatherData);
                        renderAdvisoryVisual('Maintain regular irrigation and monitor for pests.', soilSummary);
                        lucide.createIcons();
                        
                        if (showAnimation && soilCard) {
                            removeLoadingSpinner(soilCard);
                            updateDataFreshness('soil');
                            
                            // Add bounce animation to soil card
                            soilCard.classList.add('bounce');
                            setTimeout(() => soilCard.classList.remove('bounce'), 1000);
                        }
                        
                        console.log('Soil data rendering completed successfully');
                        
                        try { if (typeof updatePredictionReadiness === 'function') updatePredictionReadiness(); } catch(_) {}
                    } catch (error) {
                        console.error('Error rendering soil dataset:', error);
                        // Show error state
                        soilDataLoading.classList.add('hidden');
                        if (soilDataError) {
                            soilDataError.classList.remove('hidden');
                        } else {
                            soilDataContent.innerHTML = '<p class="text-center text-red-600 dark:text-red-400">Error loading soil data</p>';
                            soilDataContent.classList.remove('hidden');
                        }
                        if (showAnimation && soilCard) removeLoadingSpinner(soilCard);
                    }
                }, showAnimation ? 800 : 100);
            } else {
                // Fallback to mock data
                setTimeout(() => {
                    try {
                        const data = { moisture: 45, ph: 6.8, nitrogen: 120, phosphorus: 55, potassium: 150 };
                        const renderSoilProgress = (label, value, percent, unit = '') => {
                            const isDark = document.documentElement.classList.contains('dark');
                            const bgColor = isDark ? 'bg-green-700' : 'bg-green-500';
                            return `<div><div class="flex justify-between items-center mb-1 text-sm"><span class="text-gray-600 dark:text-gray-300">${label}</span><span class="font-semibold">${value}${unit}</span></div><div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 progress-bar"><div class="progress-fill ${bgColor} h-2 rounded-full" style="width: ${percent}%"></div></div></div>`;
                        };
                        
                        soilDataContent.innerHTML = renderSoilProgress('Moisture', data.moisture, data.moisture, '%') +
                                                    renderSoilProgress('pH Level', data.ph, (data.ph / 14) * 100) +
                                                    renderSoilProgress('Nitrogen (N)', data.nitrogen, (data.nitrogen / 200) * 100, ' ppm') +
                                                    renderSoilProgress('Phosphorus (P)', data.phosphorus, (data.phosphorus / 100) * 100, ' ppm') +
                                                    renderSoilProgress('Potassium (K)', data.potassium, (data.potassium / 250) * 100, ' ppm');
                        
                        soilDataLoading.classList.add('hidden');
                        soilDataContent.classList.remove('hidden');
                        
                        if (showAnimation && soilCard) {
                            removeLoadingSpinner(soilCard);
                            updateDataFreshness('soil');
                        }
                        
                        const fakeWeatherData = { forecast: 'clear', nextRainDays: 5 };
                        generateSmartAdvisory(data, fakeWeatherData);
                        lucide.createIcons();
                        window.__soilReady = true;
                        
                        console.log('Fallback soil data rendered successfully');
                        
                        try { if (typeof updatePredictionReadiness === 'function') updatePredictionReadiness(); } catch(_) {}
                    } catch (error) {
                        console.error('Error rendering fallback soil data:', error);
                        soilDataLoading.classList.add('hidden');
                        soilDataContent.innerHTML = '<p class="text-center text-red-600 dark:text-red-400">Error loading soil data</p>';
                        soilDataContent.classList.remove('hidden');
                        if (showAnimation && soilCard) removeLoadingSpinner(soilCard);
                    }
                }, showAnimation ? 2500 : 100);
            }
        }

        // Render soil progress bars from district dataset
        function renderSoilDataset(districtName, showAnimation = false) {
            const soilDataContent = document.getElementById('soil-data-content');
            const dataset = (typeof districtSoilData !== 'undefined') ? districtSoilData : (typeof window.districtSoilData !== 'undefined' ? window.districtSoilData : undefined);
            
            console.log('renderSoilDataset called:', { districtName, showAnimation, dataset: !!dataset, soilDataContent: !!soilDataContent });
            
            if (!soilDataContent) {
                console.error('soilDataContent element not found');
                return;
            }
            
            if (!dataset) {
                console.error('No soil dataset available');
                soilDataContent.innerHTML = '<p class="text-center text-gray-500">No soil data available</p>';
                return;
            }
            
            const dataForDistrict = dataset[districtName] || dataset['Hisar'] || {};
            console.log('Data for district:', districtName, dataForDistrict);
            
            if (!dataForDistrict || Object.keys(dataForDistrict).length === 0) {
                console.error('No data found for district:', districtName);
                soilDataContent.innerHTML = '<p class="text-center text-gray-500">No data available for this district</p>';
                return;
            }
            
            const isDark = document.documentElement.classList.contains('dark');
            const bgColor = isDark ? 'bg-green-700' : 'bg-green-500';
            
            const rows = Object.entries(dataForDistrict).map(([label, value]) => {
                const isNA = value === 'N/A' || value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
                const percent = isNA ? 0 : Number(value);
                const displayValue = isNA ? 'N/A' : `${percent.toFixed(1)}%`;
                const widthPercent = Math.max(0, Math.min(100, percent));
                
                return `<div class="soil-progress-item mb-3">
                    <div class="flex justify-between items-center mb-1 text-sm">
                        <span class="text-gray-600 dark:text-gray-300 font-medium">${label}</span>
                        <span class="font-semibold counter text-gray-800 dark:text-gray-200">${displayValue}</span>
                    </div>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 progress-bar overflow-hidden">
                        <div class="progress-fill ${bgColor} h-2 rounded-full transition-all duration-1000 ease-out" 
                             style="width: ${showAnimation ? 0 : widthPercent}%" 
                             data-target="${widthPercent}">
                        </div>
                    </div>
                </div>`;
            });
            
            soilDataContent.innerHTML = rows.join('');
            console.log('Soil data HTML rendered, element count:', soilDataContent.children.length);
            
            // Animate progress bars if requested
            if (showAnimation) {
                console.log('Starting animation for progress bars');
                setTimeout(() => {
                    const progressBars = soilDataContent.querySelectorAll('.progress-fill');
                    console.log('Found progress bars:', progressBars.length);
                    
                    progressBars.forEach((bar, index) => {
                        const target = parseFloat(bar.dataset.target);
                        setTimeout(() => {
                            bar.style.width = target + '%';
                            console.log(`Animating bar ${index} to ${target}%`);
                        }, index * 100);
                    });
                }, 100);
            }
        }

        // --- Initialization on Load ---
        window.addEventListener('load', () => {
            // --- Login Modal ---
            const loginModal = document.getElementById('login-modal');
            const loginButton = document.getElementById('login-button');
            const closeModalButton = document.getElementById('close-modal-button');
            const logoutButton = document.getElementById('logout-button');
            const profileButton = document.getElementById('profile-button');
            const profileModal = document.getElementById('profile-modal');
            const closeProfileButton = document.getElementById('close-profile-button');
            const closeProfileButton2 = document.getElementById('close-profile-button-2');
            const profileName = document.getElementById('profile-name');
            const profileEmail = document.getElementById('profile-email');
            const welcomeText = document.getElementById('welcome-text');
            
            // Demo users
            const demoUsers = [
                { email: 'farmer@example.com', password: 'demo123', name: 'Mr. Sharma' },
                { email: 'officer@example.com', password: 'demo123', name: 'Agri Officer' }
            ];

            const hideLoginModal = () => loginModal.classList.add('hidden');
            closeModalButton.addEventListener('click', hideLoginModal);

            function setSession(user) {
                localStorage.setItem('ks_user', JSON.stringify(user));
                welcomeText.textContent = `Welcome back, ${user.name}.`;
                logoutButton.classList.remove('hidden');
                if (profileButton) profileButton.classList.remove('hidden');
            }
            function clearSession() {
                localStorage.removeItem('ks_user');
                welcomeText.textContent = 'Welcome. Please log in.';
                logoutButton.classList.add('hidden');
                if (profileButton) profileButton.classList.add('hidden');
            }
            // Auto-restore session
            try {
                const saved = JSON.parse(localStorage.getItem('ks_user'));
                if (saved && saved.name) {
                    setSession(saved);
                    // If a prior session exists, hide the modal so user isn't blocked
                    if (loginModal && !loginModal.classList.contains('hidden')) {
                        loginModal.classList.add('hidden');
                    }
                }
            } catch (_) {}

            // Handle login
            loginButton.addEventListener('click', () => {
                const inputs = loginModal.querySelectorAll('input');
                const email = inputs[0]?.value?.trim();
                const password = inputs[1]?.value;
                const found = demoUsers.find(u => u.email === email && u.password === password);
                if (found) {
                    setSession(found);
                    hideLoginModal();
                } else {
                    alert('Invalid credentials. Try farmer@example.com / demo123');
                }
            });
            // Submit on Enter key inside modal inputs
            try {
                loginModal.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        loginButton.click();
                    }
                });
            } catch(_) {}
            // Logout
            if (logoutButton) {
                logoutButton.addEventListener('click', () => {
                    clearSession();
                    loginModal.classList.remove('hidden');
                });
            }

            // Profile modal handlers
            function openProfile() {
                try {
                    const saved = JSON.parse(localStorage.getItem('ks_user'));
                    profileName.textContent = saved?.name || '-';
                    profileEmail.textContent = saved?.email || '-';
                } catch (_) {
                    profileName.textContent = '-';
                    profileEmail.textContent = '-';
                }
                profileModal.classList.remove('hidden');
                lucide.createIcons();
            }
            function closeProfile() {
                profileModal.classList.add('hidden');
            }
            if (profileButton) profileButton.addEventListener('click', openProfile);
            if (closeProfileButton) closeProfileButton.addEventListener('click', closeProfile);
            if (closeProfileButton2) closeProfileButton2.addEventListener('click', closeProfile);

            // --- Dark Mode ---
            const darkModeToggles = document.querySelectorAll('.dark-mode-toggle');
            const applyTheme = (theme) => {
                document.documentElement.classList.toggle('dark', theme === 'dark');
                document.querySelectorAll('.sun-icon').forEach(i => i.classList.toggle('hidden', theme === 'dark'));
                document.querySelectorAll('.moon-icon').forEach(i => i.classList.toggle('hidden', theme !== 'dark'));
                if (yieldChartInstance) renderYieldChart();
            };
            const savedTheme = localStorage.getItem('theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
            darkModeToggles.forEach(toggle => {
                toggle.addEventListener('click', () => {
                    const newTheme = document.documentElement.classList.toggle('dark') ? 'dark' : 'light';
                    localStorage.setItem('theme', newTheme);
                    applyTheme(newTheme);
                });
            });

            // --- Initial Setup ---
            lucide.createIcons();
            navigateToPage('dashboard-page');
            
            // Verify soil dataset is loaded
            const datasetAvailable = (typeof districtSoilData !== 'undefined') || (typeof window.districtSoilData !== 'undefined');
            console.log('Dataset check at initialization:', {
                districtSoilData: typeof districtSoilData,
                windowDistrictSoilData: typeof window.districtSoilData,
                available: datasetAvailable,
                currentDistrict: currentDistrict
            });
            
            if (datasetAvailable) {
                const dataset = (typeof districtSoilData !== 'undefined') ? districtSoilData : window.districtSoilData;
                console.log('Available districts:', Object.keys(dataset).slice(0, 10));
            }
            
            // --- GPS Button Logic ---
            const gpsButton = document.getElementById('gps-button');
            function showPosition(position) {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                gpsButton.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i> <span>Location Captured!</span>`;
                lucide.createIcons();
                gpsButton.classList.replace('bg-blue-600', 'bg-green-600');
                if (mapInstance) {
                    mapInstance.setView([lat, lon], 13);
                    L.marker([lat, lon]).addTo(mapInstance);
                }
                setTimeout(() => {
                    gpsButton.innerHTML = `<i data-lucide="navigation" class="w-5 h-5"></i> <span>Use My Current Location</span>`;
                    lucide.createIcons();
                    gpsButton.classList.replace('bg-green-600', 'bg-blue-600');
                }, 3000);
            }

            function showError(error) {
                 console.error("Geolocation error:", error.message);
                 gpsButton.innerHTML = `<i data-lucide="navigation" class="w-5 h-5"></i> <span>Use My Current Location</span>`;
                 lucide.createIcons();
            }

            if(gpsButton) {
                gpsButton.addEventListener('click', () => {
                    if (navigator.geolocation) {
                        gpsButton.innerHTML = `<svg class="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Fetching...</span>`;
                        navigator.geolocation.getCurrentPosition(showPosition, showError);
                    } else {
                        console.error("Geolocation is not supported by this browser.");
                    }
                });
            }

            // --- Geolocation for Map & Weather on initial load ---
            const initializeAppWithLocation = (lat, lon) => {
                updateWeatherUI(lat, lon);
                initializeMap(lat, lon);
            };
            
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => initializeAppWithLocation(pos.coords.latitude, pos.coords.longitude),
                    (err) => {
                        console.error("Geolocation Error on page load:", err.message);
                        initializeAppWithLocation(29.1492, 75.7217); // Fallback to Hisar
                    }
                );
            } else {
                console.log("Geolocation is not supported. Using fallback location.");
                initializeAppWithLocation(29.1492, 75.7217); // Fallback to Hisar
            }

            // --- Fetch dynamic data ---
            console.log('Starting initial data fetch...');
            fetchSoilData();
            
            // Verify soil data is available
            setTimeout(() => {
                const soilContent = document.getElementById('soil-data-content');
                console.log('Soil content after initial fetch:', {
                    element: !!soilContent,
                    hidden: soilContent?.classList.contains('hidden'),
                    innerHTML: soilContent?.innerHTML.length > 0 ? 'Has content' : 'Empty',
                    districtSoilData: typeof districtSoilData !== 'undefined',
                    windowDistrictSoilData: typeof window.districtSoilData !== 'undefined'
                });
            }, 2000);
            
            // Set up auto-refresh intervals
            updateIntervals.weather = setInterval(() => {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => updateWeatherUI(pos.coords.latitude, pos.coords.longitude, true),
                        () => updateWeatherUI(29.1492, 75.7217, true) // Fallback
                    );
                } else {
                    updateWeatherUI(29.1492, 75.7217, true);
                }
            }, 300000); // Update every 5 minutes
            
            updateIntervals.soil = setInterval(() => {
                fetchSoilData(true);
            }, 600000); // Update every 10 minutes
            
            // Add refresh buttons to cards
            addRefreshButtons();
            
            // Add data freshness indicators
            addDataFreshnessIndicators();
            
            // Create interactive soil chart
            setTimeout(() => {
                createSoilNutrientChart();
                lucide.createIcons();
            }, 1000);

            // --- Urgent Alert Simulation ---
            const alertBanner = document.getElementById('urgent-alert');
            const closeAlertButton = document.getElementById('close-alert');
            closeAlertButton.addEventListener('click', () => alertBanner.classList.add('hidden'));
            setTimeout(() => {
                document.getElementById('alert-message').textContent = "Urgent: Locust swarm detected 50km from your location. Take preventive measures.";
                alertBanner.classList.remove('hidden');
            }, 5000);

            // --- Community Forum: state & behaviors ---
            const forumContainer = document.getElementById('forum-posts');
            const createPostBtn = document.getElementById('create-post-btn');
            const forumNewPostBtn = document.getElementById('forum-new-post');
            const forumSearch = document.getElementById('forum-search');
            const forumSort = document.getElementById('forum-sort');
            const forumLoadMore = document.getElementById('forum-load-more');
            const modal = document.getElementById('new-post-modal');
            const closeModalBtn = document.getElementById('close-new-post');
            const cancelModalBtn = document.getElementById('cancel-new-post');
            const savePostBtn = document.getElementById('save-new-post');
            const inputAuthor = document.getElementById('post-author');
            const inputTitle = document.getElementById('post-title');
            const inputContent = document.getElementById('post-content');

            const loadPosts = () => {
                try {
                    const raw = localStorage.getItem('forum_posts_v1');
                    if (raw) return JSON.parse(raw);
                } catch (_) {}
                // Default demo posts (expanded)
                return [
                    { author: 'Ramesh Singh', title: 'New pest affecting cotton crops in Punjab?', content: "Has anyone else noticed a new type of whitefly on their cotton plants? My usual pesticide isn't working.", minutesAgo: 30, replies: 5, likes: 12, avatarBg: 'e0e7ff', avatarText: 'RS' },
                    { author: 'Vinod Kumar', title: 'Best organic fertilizer for maize?', content: 'Looking for recommendations for organic fertilizers. Has anyone had good results with Jeevamrut?', minutesAgo: 120, replies: 12, likes: 28, avatarBg: 'd1fae5', avatarText: 'VK' },
                    { author: 'Neha Patel', title: 'How to conserve water during Kharif season?', content: 'Mulching and drip irrigation tips appreciated. What worked for you?', minutesAgo: 15, replies: 3, likes: 9, avatarBg: 'fde68a', avatarText: 'NP' },
                    { author: 'Ajay Verma', title: 'Tomato prices falling in local mandi', content: 'Any storage or value addition ideas to avoid distress sale?', minutesAgo: 45, replies: 7, likes: 18, avatarBg: 'bae6fd', avatarText: 'AV' },
                    { author: 'Pooja Sharma', title: 'Organic pest control for okra', content: 'Neem oil concentration suggestions? Leaves showing yellowing and holes.', minutesAgo: 200, replies: 6, likes: 14, avatarBg: 'fecaca', avatarText: 'PS' },
                    { author: 'Arun Gupta', title: 'Precision farming tools under 10k?', content: 'Any budget sensors or apps for soil moisture monitoring?', minutesAgo: 320, replies: 8, likes: 22, avatarBg: 'ddd6fe', avatarText: 'AG' },
                    { author: 'Kiran Rao', title: 'Best hybrid paddy for coastal Andhra', content: 'Salinity tolerance needed. Yield experiences?', minutesAgo: 65, replies: 4, likes: 11, avatarBg: 'bbf7d0', avatarText: 'KR' },
                    { author: 'Sanjay Yadav', title: 'Mini sprinkler vs drip for groundnut', content: 'Water availability limited. Which gives better results?', minutesAgo: 510, replies: 10, likes: 17, avatarBg: 'fbcfe8', avatarText: 'SY' },
                    { author: 'Meera Joshi', title: 'Compost ratios for kitchen waste', content: 'Carbon:nitrogen ratio advice? Odor control tips?', minutesAgo: 5, replies: 2, likes: 6, avatarBg: 'e9d5ff', avatarText: 'MJ' },
                    { author: 'Iqbal Khan', title: 'Tractor maintenance schedule', content: 'Engine oil interval and filter recommendations?', minutesAgo: 780, replies: 3, likes: 8, avatarBg: 'bae6fd', avatarText: 'IK' },
                    { author: 'Latika Nair', title: 'Banana drip spacing', content: 'What emitter spacing are you using for Grand Naine?', minutesAgo: 95, replies: 5, likes: 10, avatarBg: 'd1fae5', avatarText: 'LN' },
                    { author: 'Harish Kumar', title: 'Weed management in wheat', content: 'Pre-emergent suggestions? Rain expected next week.', minutesAgo: 60, replies: 9, likes: 21, avatarBg: 'fde68a', avatarText: 'HK' },
                    { author: 'Anita Das', title: 'Beekeeping with mustard', content: 'Placement distance from fields? Time of day for hive checks?', minutesAgo: 25, replies: 2, likes: 5, avatarBg: 'fecaca', avatarText: 'AD' },
                    { author: 'Ravi Teja', title: 'Chilli leaf curl prevention', content: 'How to control whitefly vectors without harming beneficials?', minutesAgo: 140, replies: 11, likes: 24, avatarBg: 'e0e7ff', avatarText: 'RT' },
                    { author: 'Sunita Bhatt', title: 'Vermicompost moisture level', content: 'How do you keep beds moist in summer heat?', minutesAgo: 360, replies: 4, likes: 7, avatarBg: 'ddd6fe', avatarText: 'SB' },
                    { author: 'Om Prakash', title: 'Cotton picking labor rates', content: 'What are current rates in your area?', minutesAgo: 900, replies: 6, likes: 12, avatarBg: 'bbf7d0', avatarText: 'OP' },
                    { author: 'Farah Ali', title: 'Millet recipes for direct sale', content: 'Looking for value-added ideas for weekly haat.', minutesAgo: 48, replies: 5, likes: 16, avatarBg: 'fbcfe8', avatarText: 'FA' },
                    { author: 'Deepak Singh', title: 'Soil pH correction for alkaline soil', content: 'Gypsum or elemental sulfur? Application timing?', minutesAgo: 110, replies: 8, likes: 19, avatarBg: 'e9d5ff', avatarText: 'DS' }
                ];
            };
            const savePosts = (posts) => {
                try { localStorage.setItem('forum_posts_v1', JSON.stringify(posts)); } catch (_) {}
            };
            let posts = loadPosts();
            // Ensure a healthy number of demo posts if storage is empty
            if (!posts || posts.length < 12) {
                const names = ['Asha','Bhanu','Chirag','Divya','Eshan','Gopal','Heena','Ishaan','Jyoti','Kabir'];
                const topics = ['irrigation tips','seed treatment','market prices','tractor care','organic pest control','composting','mulching','weed control','storage ideas','government schemes'];
                for (let i=posts.length; i<20; i++) {
                    const n = names[i % names.length] + ' ' + ['Kumar','Patel','Rao','Singh','Sharma'][i % 5];
                    const t = 'Discussion about ' + topics[i % topics.length];
                    const c = 'Sharing experience and asking for advice on ' + topics[i % topics.length] + '.';
                    posts.push({ author: n, title: t, content: c, minutesAgo: 20 + (i*7)%960, replies: (i*3)%13, likes: (i*5)%29, avatarBg: 'e5e7eb', avatarText: (n.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase()) });
                }
                try { localStorage.setItem('forum_posts_v1', JSON.stringify(posts)); } catch(_){}
            }
            let filteredPosts = [...posts];
            const PAGE = 10;
            let page = 1;

            function timeLabel(minutesAgo) {
                if (minutesAgo < 60) return `${minutesAgo}m ago`;
                const hours = Math.floor(minutesAgo / 60);
                return `${hours}h ago`;
            }

            function applyForumFilters() {
                const q = (forumSearch?.value || '').toLowerCase().trim();
                const sort = (forumSort?.value || 'recent');
                filteredPosts = posts.filter(p =>
                    (!q || p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) || p.author.toLowerCase().includes(q))
                );
                if (sort === 'likes') filteredPosts.sort((a,b)=>b.likes - a.likes);
                else if (sort === 'replies') filteredPosts.sort((a,b)=>b.replies - a.replies);
                else filteredPosts.sort((a,b)=>a.minutesAgo - b.minutesAgo);
                page = 1;
            }

            function renderPosts() {
                if (!forumContainer) return;
                const list = filteredPosts.slice(0, PAGE * page);
                forumContainer.innerHTML = list.map((p, idx) => {
                    const initials = p.avatarText || (p.author.split(' ').map(s => s[0]).join('').slice(0,2).toUpperCase());
                    return `
                    <div class=\"bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm\">
                        <div class=\"flex items-start space-x-3\">
                            <img src=\"https://placehold.co/40x40/${p.avatarBg || 'e5e7eb'}/111827?text=${encodeURIComponent(initials)}\" class=\"rounded-full\" alt=\"user avatar\">
                            <div class=\"w-full\">
                                <h3 class=\"font-semibold\">${p.title}</h3>
                                <p class=\"text-xs text-gray-500 dark:text-gray-400\">by ${p.author} • ${timeLabel(p.minutesAgo)}</p>
                                <p class=\"text-sm mt-2 text-gray-700 dark:text-gray-300\">${p.content}</p>
                                <div class=\"flex items-center justify-between mt-3\">
                                    <div class=\"flex items-center text-xs text-gray-500 dark:text-gray-400 space-x-4\">
                                        <button data-action=\"reply\" data-index=\"${idx}\" class=\"flex items-center hover:text-blue-600 dark:hover:text-blue-400\"><i data-lucide=\"message-square\" class=\"w-4 h-4 mr-1\"></i> <span>${p.replies} Replies</span></button>
                                        <button data-action=\"like\" data-index=\"${idx}\" class=\"flex items-center hover:text-emerald-600\"><i data-lucide=\"thumbs-up\" class=\"w-4 h-4 mr-1\"></i> <span>${p.likes} Likes</span></button>
                                    </div>
                                    <div class="flex items-center space-x-3">
                                        <button data-action="share" data-index="${idx}" class="text-xs text-blue-600 dark:text-blue-400 hover:underline">Share</button>
                                        <button data-action="delete" data-index="${idx}" class="text-xs text-red-600 dark:text-red-400 hover:underline">Delete</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>`;
                }).join('');
                lucide.createIcons();
                // Attach handlers
                forumContainer.querySelectorAll('button[data-action=like]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const i = Number(e.currentTarget.getAttribute('data-index'));
                        const post = filteredPosts[i];
                        post.likes += 1;
                        savePosts(posts);
                        renderPosts();
                    });
                });
                forumContainer.querySelectorAll('button[data-action=reply]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const i = Number(e.currentTarget.getAttribute('data-index'));
                        const post = filteredPosts[i];
                        post.replies += 1;
                        savePosts(posts);
                        renderPosts();
                    });
                });
                forumContainer.querySelectorAll('button[data-action=share]').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        try {
                            await navigator.clipboard.writeText(window.location.href + '#community-page');
                            alert('Post link copied to clipboard');
                        } catch (_) {
                            alert('Unable to copy link');
                        }
                    });
                });
                // delete handler
                forumContainer.querySelectorAll('button[data-action=delete]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const i = Number(e.currentTarget.getAttribute('data-index'));
                        const post = filteredPosts[i];
                        if (confirm('Delete this post?')) {
                            const originalIndex = posts.findIndex(p => p.title === post.title && p.author === post.author && p.content === post.content);
                            if (originalIndex > -1) posts.splice(originalIndex, 1);
                            savePosts(posts);
                            applyForumFilters();
                            renderPosts();
                        }
                    });
                });
                if (forumLoadMore) {
                    if (filteredPosts.length > PAGE * page) forumLoadMore.classList.remove('hidden');
                    else forumLoadMore.classList.add('hidden');
                }
            }

            function openModal() {
                if (!modal) return;
                inputAuthor.value = '';
                inputTitle.value = '';
                inputContent.value = '';
                modal.classList.remove('hidden');
                lucide.createIcons();
            }
            function closeModal() {
                modal.classList.add('hidden');
            }

            if (createPostBtn) createPostBtn.addEventListener('click', openModal);
            if (forumNewPostBtn) forumNewPostBtn.addEventListener('click', openModal);
            if (forumSearch) forumSearch.addEventListener('keyup', (e)=>{ if(e.key==='Enter'){ applyForumFilters(); renderPosts(); }});
            if (forumSort) forumSort.addEventListener('change', ()=>{ applyForumFilters(); renderPosts(); });
            if (forumLoadMore) forumLoadMore.addEventListener('click', ()=>{ page += 1; renderPosts(); });
            if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
            if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
            if (savePostBtn) savePostBtn.addEventListener('click', () => {
                const author = (inputAuthor.value || 'Anonymous').trim();
                const title = (inputTitle.value || '').trim();
                const content = (inputContent.value || '').trim();
                if (!title || !content) { alert('Please enter a title and content.'); return; }
                const initials = author.split(' ').map(s => s[0]).join('').slice(0,2).toUpperCase() || 'AN';
                posts.unshift({ author, title, content, minutesAgo: 1, replies: 0, likes: 0, avatarBg: 'e5e7eb', avatarText: initials });
                savePosts(posts);
                applyForumFilters();
                renderPosts();
                closeModal();
            });

            // Sidebar widgets
            function renderTrending() {
                const el = document.getElementById('forum-trending');
                if (!el) return;
                const topics = {};
                posts.forEach(p => p.title.split(/\s+/).forEach(w => {
                    const key = w.toLowerCase().replace(/[^a-z]/g,'');
                    if (!key || key.length < 4) return;
                    topics[key] = (topics[key]||0) + 1;
                }));
                const items = Object.entries(topics).sort((a,b)=>b[1]-a[1]).slice(0,6);
                el.innerHTML = items.map(([t,c])=>`<li class=\"flex items-center justify-between\"><span class=\"text-gray-700 dark:text-gray-300\">#${t}</span><span class=\"text-xs text-gray-500\">${c}</span></li>`).join('') || '<li class=\"text-sm text-gray-500\">No trends yet</li>';
            }

            function renderPoll() {
                const el = document.getElementById('forum-poll');
                if (!el) return;
                const key = 'forum_poll_v1';
                const labels = ['Market prices','Pest alerts','Modern techniques','Success stories'];
                let votes = { total: 0, counts: labels.map(()=>0) };
                try { const raw = localStorage.getItem(key); if (raw) votes = JSON.parse(raw); } catch(_){}
                function save(){ try{ localStorage.setItem(key, JSON.stringify(votes)); }catch(_){} }
                function row(label, i){
                    const pct = votes.total ? Math.round((votes.counts[i]/votes.total)*100) : 0;
                    return `<div class=\"text-sm\">\n                        <div class=\"flex items-center justify-between\"><span>${label}</span><span>${pct}%</span></div>\n                        <div class=\"h-2 bg-gray-100 dark:bg-gray-700 rounded\"><div class=\"h-2 bg-emerald-500 rounded\" style=\"width:${pct}%\"></div></div>\n                        <button data-i=\"${i}\" class=\"mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline\">Vote</button>\n                    </div>`;
                }
                el.innerHTML = labels.map(row).join('');
                el.querySelectorAll('button').forEach(btn=>{
                    btn.addEventListener('click', (e)=>{
                        const i = Number(e.currentTarget.getAttribute('data-i'));
                        votes.counts[i] += 1; votes.total += 1; save(); renderPoll();
                    });
                });
            }

            function renderTopContrib() {
                const el = document.getElementById('forum-top');
                if (!el) return;
                const byAuthor = {};
                posts.forEach(p => { if(!byAuthor[p.author]) byAuthor[p.author] = { replies:0, likes:0 }; byAuthor[p.author].replies += p.replies; byAuthor[p.author].likes += p.likes; });
                const arr = Object.entries(byAuthor).map(([author, m])=>({author, ...m})).sort((a,b)=> (b.replies+b.likes) - (a.replies+a.likes)).slice(0,5);
                el.innerHTML = arr.map(u=>`<div class=\"flex items-center justify-between text-sm\"><span>${u.author}</span><span class=\"text-xs text-gray-500\">${u.replies} replies • ${u.likes} likes</span></div>`).join('') || '<p class=\"text-sm text-gray-500\">No contributors yet</p>';
            }

            function renderActivity() {
                const el = document.getElementById('forum-activity');
                if (!el) return;
                const recent = [...posts].sort((a,b)=>a.minutesAgo - b.minutesAgo).slice(0,6);
                el.innerHTML = recent.map(p=>`<li class=\"flex items-center justify-between\"><span class=\"truncate max-w-[70%]\">${p.title}</span><span class=\"text-xs text-gray-500\">${timeLabel(p.minutesAgo)}</span></li>`).join('');
            }

            function renderForumSidebar(){ renderTrending(); renderPoll(); renderTopContrib(); renderActivity(); }

            applyForumFilters();
            renderPosts();
            renderForumSidebar();

            // --- Populate district selector ---
            const districtSelect = document.getElementById('district-select');
            const dataset = (typeof districtSoilData !== 'undefined') ? districtSoilData : (typeof window.districtSoilData !== 'undefined' ? window.districtSoilData : undefined);
            if (districtSelect && dataset) {
                const districts = Object.keys(dataset).sort();
                districtSelect.innerHTML = districts.map(d => `<option value="${d}">${d}</option>`).join('');
                districtSelect.value = currentDistrict;
                districtSelect.addEventListener('change', (e) => {
                    currentDistrict = e.target.value;
                    renderSoilDataset(currentDistrict);
                    window.__soilReady = true;
                    try { if (typeof updatePredictionReadiness === 'function') updatePredictionReadiness(); } catch(_) {}
                });
            } else if (districtSelect) {
                // If dataset still not present for some reason, ensure selector has at least current
                districtSelect.innerHTML = `<option value="${currentDistrict}">${currentDistrict}</option>`;
            }

            // --- Regenerate advisory button ---
            const regenBtn = document.getElementById('regenerate-advisory');
            if (regenBtn) {
                regenBtn.addEventListener('click', async () => {
                    const dataset = (typeof districtSoilData !== 'undefined') ? districtSoilData : (typeof window.districtSoilData !== 'undefined' ? window.districtSoilData : undefined);
                    const row = dataset ? dataset[currentDistrict] : {};
                    document.getElementById('advisory-message').textContent = 'Regenerating...';
                    generateSmartAdvisory(row, lastWeatherData);
                    renderAdvisoryVisual('Maintain regular irrigation and monitor for pests.', row);
                });
            }
            
            // --- Enhanced User Interactions ---
            // Add keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    switch(e.key) {
                        case '1':
                            e.preventDefault();
                            navigateToPage('dashboard-page');
                            showToast('Navigated to Dashboard', 'info', 1500);
                            break;
                        case '2':
                            e.preventDefault();
                            navigateToPage('weather-page');
                            showToast('Navigated to Weather', 'info', 1500);
                            break;
                        case '3':
                            e.preventDefault();
                            navigateToPage('prediction-page');
                            showToast('Navigated to Crop Yield', 'info', 1500);
                            break;
                        case 'r':
                            e.preventDefault();
                            // Refresh current page data
                            fetchSoilData(true);
                            if (navigator.geolocation) {
                                navigator.geolocation.getCurrentPosition(
                                    (pos) => updateWeatherUI(pos.coords.latitude, pos.coords.longitude, true),
                                    () => updateWeatherUI(29.1492, 75.7217, true)
                                );
                            }
                            showToast('Refreshing data...', 'info', 1500);
                            break;
                    }
                }
            });
            
            // Add tooltips to interactive elements
            addTooltips();
            
            // Add click feedback to cards
            document.querySelectorAll('.dashboard-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') {
                        card.classList.add('scale-95');
                        setTimeout(() => card.classList.remove('scale-95'), 150);
                    }
                });
            });
            
            // Enhanced button interactions
            document.querySelectorAll('.interactive-btn').forEach(btn => {
                btn.addEventListener('mouseenter', () => {
                    btn.style.transform = 'translateY(-2px)';
                });
                btn.addEventListener('mouseleave', () => {
                    btn.style.transform = 'translateY(0)';
                });
            });
            
            // Add expandable content functionality
            addExpandableContent();
            
            // Add card minimize/maximize functionality  
            addCardControls();
            
            // Add dashboard customization
            addDashboardCustomization();
        });
        
        function addExpandableContent() {
            // Handle expand buttons
            document.querySelectorAll('.expand-forecast-btn, .expand-prices-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetId = btn.dataset.target;
                    const target = document.getElementById(targetId);
                    
                    if (target) {
                        if (target.classList.contains('hidden')) {
                            target.classList.remove('hidden');
                            target.classList.add('slide-in-up');
                            btn.textContent = btn.textContent.replace('Show', 'Hide');
                        } else {
                            target.classList.add('hidden');
                            target.classList.remove('slide-in-up');
                            btn.textContent = btn.textContent.replace('Hide', 'Show');
                        }
                    }
                });
            });
        }
        
        function addCardControls() {
            document.querySelectorAll('.minimize-card').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const card = btn.closest('.dashboard-card');
                    if (card) {
                        const content = card.querySelector('.card-content') || 
                                       card.children[1] || 
                                       Array.from(card.children).slice(1);
                        
                        if (Array.isArray(content)) {
                            content.forEach(el => {
                                if (el.classList.contains('hidden')) {
                                    el.classList.remove('hidden');
                                    el.classList.add('fade-in');
                                } else {
                                    el.classList.add('hidden');
                                    el.classList.remove('fade-in');
                                }
                            });
                        } else if (content) {
                            if (content.classList.contains('hidden')) {
                                content.classList.remove('hidden');
                                content.classList.add('fade-in');
                            } else {
                                content.classList.add('hidden');
                                content.classList.remove('fade-in');
                            }
                        }
                        
                        // Toggle icon
                        const icon = btn.querySelector('i');
                        if (icon) {
                            if (icon.classList.contains('lucide-minus')) {
                                icon.className = icon.className.replace('lucide-minus', 'lucide-plus');
                                btn.title = 'Expand card';
                            } else {
                                icon.className = icon.className.replace('lucide-plus', 'lucide-minus');
                                btn.title = 'Minimize card';
                            }
                            lucide.createIcons();
                        }
                        
                        // Add bounce effect
                        card.classList.add('bounce');
                        setTimeout(() => card.classList.remove('bounce'), 500);
                    }
                });
            });
        }
        
        function addDashboardCustomization() {
            const customizeBtn = document.getElementById('customize-dashboard');
            if (customizeBtn) {
                customizeBtn.addEventListener('click', () => {
                    showCustomizationModal();
                });
            }
        }
        
        function showCustomizationModal() {
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4';
            modal.innerHTML = `
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold">Customize Dashboard</h3>
                        <button class="close-modal p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </button>
                    </div>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium mb-2">Card Layout</label>
                            <select id="layout-select" class="w-full p-2 border dark:border-gray-600 dark:bg-gray-700 rounded">
                                <option value="grid">Grid Layout (default)</option>
                                <option value="list">List Layout</option>
                                <option value="compact">Compact View</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">Auto-refresh Interval</label>
                            <select id="refresh-interval" class="w-full p-2 border dark:border-gray-600 dark:bg-gray-700 rounded">
                                <option value="300000">5 minutes</option>
                                <option value="600000">10 minutes</option>
                                <option value="1800000">30 minutes</option>
                                <option value="0">Disable</option>
                            </select>
                        </div>
                        <div>
                            <label class="flex items-center space-x-2">
                                <input type="checkbox" id="enable-animations" checked class="rounded">
                                <span class="text-sm">Enable animations</span>
                            </label>
                        </div>
                        <div>
                            <label class="flex items-center space-x-2">
                                <input type="checkbox" id="show-tooltips" checked class="rounded">
                                <span class="text-sm">Show tooltips</span>
                            </label>
                        </div>
                    </div>
                    <div class="flex justify-end space-x-2 mt-6">
                        <button class="close-modal px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">Cancel</button>
                        <button class="save-settings px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            lucide.createIcons();
            
            // Handle modal close
            modal.querySelectorAll('.close-modal').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.body.removeChild(modal);
                });
            });
            
            // Handle save
            modal.querySelector('.save-settings').addEventListener('click', () => {
                const layout = modal.querySelector('#layout-select').value;
                const refreshInterval = parseInt(modal.querySelector('#refresh-interval').value);
                const animations = modal.querySelector('#enable-animations').checked;
                const tooltips = modal.querySelector('#show-tooltips').checked;
                
                // Apply settings
                applyDashboardSettings({ layout, refreshInterval, animations, tooltips });
                
                // Save to localStorage
                localStorage.setItem('dashboardSettings', JSON.stringify({ layout, refreshInterval, animations, tooltips }));
                
                showToast('Dashboard settings saved!', 'success');
                document.body.removeChild(modal);
            });
            
            // Load existing settings
            const saved = localStorage.getItem('dashboardSettings');
            if (saved) {
                const settings = JSON.parse(saved);
                modal.querySelector('#layout-select').value = settings.layout || 'grid';
                modal.querySelector('#refresh-interval').value = settings.refreshInterval || 300000;
                modal.querySelector('#enable-animations').checked = settings.animations !== false;
                modal.querySelector('#show-tooltips').checked = settings.tooltips !== false;
            }
        }
        
        function applyDashboardSettings(settings) {
            const dashboard = document.querySelector('#dashboard-page .grid');
            if (!dashboard) return;
            
            // Apply layout
            dashboard.className = dashboard.className.replace(/grid-cols-\d+/g, '');
            switch(settings.layout) {
                case 'list':
                    dashboard.classList.add('grid-cols-1');
                    break;
                case 'compact':
                    dashboard.classList.add('grid-cols-1', 'md:grid-cols-3', 'xl:grid-cols-4');
                    break;
                default:
                    dashboard.classList.add('grid-cols-1', 'md:grid-cols-2', 'xl:grid-cols-3');
            }
            
            // Update refresh intervals
            if (settings.refreshInterval > 0) {
                Object.values(updateIntervals).forEach(interval => clearInterval(interval));
                
                updateIntervals.weather = setInterval(() => {
                    if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                            (pos) => updateWeatherUI(pos.coords.latitude, pos.coords.longitude, settings.animations),
                            () => updateWeatherUI(29.1492, 75.7217, settings.animations)
                        );
                    }
                }, settings.refreshInterval);
                
                updateIntervals.soil = setInterval(() => {
                    fetchSoilData(settings.animations);
                }, settings.refreshInterval * 2);
            } else {
                Object.values(updateIntervals).forEach(interval => clearInterval(interval));
            }
            
            // Apply animation preferences
            if (!settings.animations) {
                document.body.classList.add('no-animations');
            } else {
                document.body.classList.remove('no-animations');
            }
            
            // Apply tooltip preferences
            if (!settings.tooltips) {
                document.querySelectorAll('[title]').forEach(el => {
                    el.setAttribute('data-original-title', el.title);
                    el.removeAttribute('title');
                });
            } else {
                document.querySelectorAll('[data-original-title]').forEach(el => {
                    el.setAttribute('title', el.getAttribute('data-original-title'));
                    el.removeAttribute('data-original-title');
                });
            }
        }
        
        function addTooltips() {
            const tooltipElements = [
                { selector: '[data-freshness="weather"]', text: 'Weather data - Click to refresh' },
                { selector: '[data-freshness="soil"]', text: 'Soil sensor data - Auto-updates every 10 minutes' },
                { selector: '.dashboard-card.card-3', text: 'Market prices - Updated daily' },
                { selector: '.float', text: 'Live weather conditions' }
            ];
            
            tooltipElements.forEach(({selector, text}) => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    el.title = text;
                    el.style.cursor = 'help';
                });
            });
        }
        
        function addRefreshButtons() {
            // Add refresh button to weather card
            const weatherCard = document.querySelector('.dashboard-card.card-1 h2');
            if (weatherCard && !weatherCard.querySelector('.refresh-btn')) {
                const refreshBtn = document.createElement('button');
                refreshBtn.className = 'refresh-btn ml-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors';
                refreshBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i>';
                refreshBtn.onclick = () => {
                    refreshBtn.classList.add('animate-spin');
                    if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                            (pos) => {
                                updateWeatherUI(pos.coords.latitude, pos.coords.longitude, true);
                                setTimeout(() => refreshBtn.classList.remove('animate-spin'), 1000);
                            },
                            () => {
                                updateWeatherUI(29.1492, 75.7217, true);
                                setTimeout(() => refreshBtn.classList.remove('animate-spin'), 1000);
                            }
                        );
                    }
                };
                weatherCard.appendChild(refreshBtn);
                lucide.createIcons();
            }
            
            // Add refresh button to soil card
            const soilCard = document.querySelector('.dashboard-card.card-2 h2');
            if (soilCard && !soilCard.querySelector('.refresh-btn')) {
                const refreshBtn = document.createElement('button');
                refreshBtn.className = 'refresh-btn ml-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors';
                refreshBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i>';
                refreshBtn.onclick = () => {
                    refreshBtn.classList.add('animate-spin');
                    fetchSoilData(true);
                    setTimeout(() => refreshBtn.classList.remove('animate-spin'), 2000);
                };
                soilCard.appendChild(refreshBtn);
                lucide.createIcons();
            }
        }
        
        function addDataFreshnessIndicators() {
            const weatherCard = document.querySelector('.dashboard-card.card-1');
            const soilCard = document.querySelector('.dashboard-card.card-2');
            
            if (weatherCard) weatherCard.setAttribute('data-freshness', 'weather');
            if (soilCard) soilCard.setAttribute('data-freshness', 'soil');
        }

        // Clean up intervals on page unload
        window.addEventListener('beforeunload', () => {
            Object.values(updateIntervals).forEach(interval => clearInterval(interval));
        });

        // --- Prediction readiness gate (require soil + weather + area) ---
        function updatePredictionReadiness() {
            const btn = document.getElementById('get-prediction-btn');
            const soilOk = !!window.__soilReady;
            const weatherOk = !!window.__weatherReady;
            const areaInput = document.getElementById('farm-area');
            const areaOk = !!(areaInput && Number(areaInput.value) > 0);
            const soilLabel = document.getElementById('status-soil');
            const weatherLabel = document.getElementById('status-weather');
            if (soilLabel) soilLabel.textContent = soilOk ? 'Soil — ready' : 'Soil — not ready';
            if (weatherLabel) weatherLabel.textContent = weatherOk ? 'Weather — ready' : 'Weather — not ready';
            if (btn) btn.disabled = !(soilOk && weatherOk && areaOk);
        }
        window.updatePredictionReadiness = updatePredictionReadiness;

        // Guard Get Prediction button and watch inputs
        window.addEventListener('DOMContentLoaded', function(){
            const btn = document.getElementById('get-prediction-btn');
            const areaInput = document.getElementById('farm-area');
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (btn.disabled) return;
                    goToPredictionStep(3);
                    runRuleBasedPrediction();
                });
            }
            if (areaInput) {
                areaInput.addEventListener('input', () => updatePredictionReadiness());
            }
            // initialize state once UI is ready
            updatePredictionReadiness();
        });

        // --- Auto-fill NPK and pH from district soil data if available ---
        function autofillSoilForm(district) {
            const dataset = (typeof districtSoilData !== 'undefined') ? districtSoilData : (typeof window.districtSoilData !== 'undefined' ? window.districtSoilData : undefined);
            if (!dataset || !district) return;
            const data = dataset[district];
            if (!data) return;
            // Try to fill N, P, K, pH if present
            const npkFields = [
                { key: 'N', selector: 'input[name="N"]' },
                { key: 'P', selector: 'input[name="P"]' },
                { key: 'K', selector: 'input[name="K"]' },
                { key: 'ph', selector: 'input[name="ph"]' }
            ];
            npkFields.forEach(f => {
                if (typeof data[f.key] !== 'undefined' && !isNaN(data[f.key])) {
                    const el = document.querySelector(f.selector);
                    if (el) el.value = data[f.key];
                }
            });
        }

        // Attach to district dropdown
        window.addEventListener('DOMContentLoaded', function() {
            const districtSelect = document.getElementById('district-select');
            if (districtSelect) {
                districtSelect.addEventListener('change', function() {
                    autofillSoilForm(this.value);
                });
                // Initial auto-fill
                autofillSoilForm(districtSelect.value);
            }
        });

        // --- Enhance AI recommendation result display ---
        function renderRecommendationResult(res) {
            const resultDiv = document.getElementById('result');
            if (!resultDiv) return;
            let html = `
                <h2>Recommended Crop: <span style="color:#2d7a2d">${res.recommended_crop}</span></h2>
                <p><b>Confidence:</b> ${(res.confidence*100).toFixed(1)}%</p>
                <p><b>Expected Yield (t/acre):</b> ${res.expected_yield_t_per_acre}</p>
                <p><b>Profit (Net):</b> ₹${res.profit_breakdown?.net?.toLocaleString() || '-'} (ROI: ${res.profit_breakdown?.roi || '-'}%)</p>
                <p><b>Yield Range (P10-P90):</b> ${res.yield_interval_p10_p90?.join(' - ')}</p>
            `;
            if (res.fertilizer_recommendation) {
                html += `<p><b>Fertilizer:</b> ${res.fertilizer_recommendation.type}, ${res.fertilizer_recommendation.dosage_kg_per_ha} kg/ha, Cost: ₹${res.fertilizer_recommendation.cost}</p>`;
            }
            if (res.season_analysis) {
                html += `<p><b>Season Suitability:</b> ${res.season_analysis.season_suitability}<br><b>Detected Season:</b> ${res.season_analysis.detected_season}<br><b>Explanation:</b> ${res.season_analysis.season_explanation}</p>`;
            }
            if (res.previous_crop_analysis) {
                html += `<p><b>Previous Crop Analysis:</b> ${res.previous_crop_analysis.nutrient_impact}<br><b>Original NPK:</b> ${res.previous_crop_analysis.original_npk?.join(', ')}<br><b>Adjusted NPK:</b> ${res.previous_crop_analysis.adjusted_npk?.join(', ')}</p>`;
            }
            if (res.why) {
                html += `<div style="margin-top:1em;"><b>AI Explanation:</b><ul>${res.why.map(w => `<li>${w}</li>`).join('')}</ul></div>`;
            }
            html += `<p style="font-size:0.9em;color:#888;">Model version: ${res.model_version} | ${res.timestamp}</p>`;
            resultDiv.innerHTML = html;
            resultDiv.style.display = 'block';
        }
        // Patch the form submit handler to use the new renderRecommendationResult
        const form = document.getElementById('soilForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const resultDiv = document.getElementById('result');
                const errorDiv = document.getElementById('error');
                resultDiv.style.display = 'none';
                errorDiv.textContent = '';
                const formData = new FormData(form);
                const data = {};
                formData.forEach((value, key) => {
                    data[key] = value;
                });
                ["N","P","K","ph","temperature","humidity","rainfall","area_ha"].forEach(k => data[k] = parseFloat(data[k]));
                if (!data.previous_crop) delete data.previous_crop;
                if (!data.season) delete data.season;
                if (!data.planting_date) delete data.planting_date;
                try {
                    const response = await fetch('http://localhost:8000/predict', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.detail || 'API error');
                    }
                    const res = await response.json();
                    renderRecommendationResult(res);
                } catch (err) {
                    errorDiv.textContent = err.message || 'Failed to get recommendation.';
                }
            });
        }

        // --- Rule-Based Prediction Integration ---
        function getSoilDataForDistrict(district) {
            if (typeof districtSoilData !== 'undefined' && districtSoilData[district]) {
                return districtSoilData[district];
            }
            return { N: 60, P: 30, K: 30, pH: 7, Zn: 50, Fe: 50, Cu: 50, Mn: 50, B: 50, S: 50 }; // fallback
        }
        function getWeatherData() {
            // TODO: Replace with real weather API if available
            return { rainfall: 700, temperature: 28, humidity: 65 };
        }
        function runRuleBasedPrediction() {
            const districtSelect = document.getElementById('district-select');
            const areaInput = document.getElementById('farm-area');
            const cropSelect = document.getElementById('crop-select');
            if (!districtSelect || !areaInput) return;
            const district = districtSelect.value;
            const area = parseFloat(areaInput.value) || 1;
            const crop = (cropSelect && cropSelect.value) ? cropSelect.value : 'Wheat';
            // Use real weather data if available
            let weather = (typeof lastWeatherData !== 'undefined' && lastWeatherData && lastWeatherData.tempC)
                ? {
                    rainfall: lastWeatherData.rainfall || 700, // If rainfall is not present, fallback
                    temperature: lastWeatherData.tempC,
                    humidity: lastWeatherData.humidity
                }
                : { rainfall: 700, temperature: 28, humidity: 65 };
            // Adjust rainfall using district norms and crop factor (rough seasonal proxy)
            try {
                const norm = districtRainfallNorms[district];
                if (norm) {
                    const cropFactor = (function(){
                        if (crop === 'Rice') return 0.7;
                        if (crop === 'Sugarcane') return 0.8;
                        if (crop === 'Wheat') return 0.45;
                        if (crop === 'Cotton') return 0.55;
                        return 0.5;
                    })();
                    const seasonalFromNorm = norm * cropFactor; // mm for growing season
                    const currentSignal = Math.max(0, Number(weather.rainfall) || 0);
                    weather.rainfall = Math.round(0.8 * seasonalFromNorm + 0.2 * currentSignal);
                }
            } catch(_) {}
            // Use real soil data if available
            let soil = (typeof districtSoilData !== 'undefined' && districtSoilData[district])
                ? { ...districtSoilData[district] }
                : { N: 60, P: 30, K: 30, pH: 7, Zn: 50, Fe: 50, Cu: 50, Mn: 50, B: 50, S: 50 };
            // if NPK missing from dataset row, approximate from micro averages to add variance
            (function enhanceSoilFromMicros(){
                const microKeys = ['Zn','Fe','Cu','Mn','B','S'];
                const vals = microKeys.map(k => Number(soil[k] ?? 50));
                const avg = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length) : 50;
                if (soil.N === undefined) soil.N = Math.max(30, Math.min(120, avg * 1.2));
                if (soil.P === undefined) soil.P = Math.max(15, Math.min(70, avg * 0.6));
                if (soil.K === undefined) soil.K = Math.max(20, Math.min(90, avg * 0.8));
                if (soil.pH === undefined && soil.ph === undefined) soil.pH = 6.5 + (avg-50)/200; // 6.25..6.75
            })();
            if (typeof ruleBasedPrediction !== 'function') {
                document.getElementById('prediction-explanation').textContent = 'Rule-based prediction function not found.';
                return;
            }
            const result = ruleBasedPrediction({
                weather,
                location: district,
                size: area,
                soil,
                crop
            });
            document.getElementById('predicted-yield').textContent = result.predicted_yield + ' quintals';
            const perAcre = (result.predicted_yield && area) ? (result.predicted_yield/area) : result.predicted_yield;
            const perAcreEl = document.getElementById('predicted-yield-per-acre');
            if (perAcreEl) perAcreEl.textContent = (Math.round(perAcre*10)/10) + ' quintals/acre';
            document.getElementById('irrigation-recommendation').textContent = result.irrigation_recommendation;
            document.getElementById('crop-recommendation').textContent = result.crop_recommendation;
            document.getElementById('prediction-explanation').textContent = result.explanation;
            const confEl = document.getElementById('prediction-confidence');
            const drvEl = document.getElementById('prediction-drivers');
            if (confEl) confEl.textContent = Math.round(result.confidence * 100) + '%';
            if (drvEl) drvEl.textContent = (result.key_drivers || []).slice(0,3).join(', ');
            // Headline card update
            const headlineYield = document.getElementById('headline-yield');
            const headlineConf = document.getElementById('headline-confidence');
            if (headlineYield) headlineYield.textContent = (Math.round(((result.predicted_yield/area)||0)*10)/10) || '--';
            if (headlineConf) headlineConf.textContent = Math.round(result.confidence*100) + '%';
            // Chips
            const chips = document.getElementById('prediction-drivers-chips');
            if (chips) {
                const cls = (t)=>{
                    const s = (t||'').toLowerCase();
                    if (s.includes('npk') || s.includes('ph') || s.includes('micro')) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
                    if (s.includes('temp') || s.includes('rain') || s.includes('humid')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
                    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
                };
                const tip = (t)=>{
                    const s = (t||'').toLowerCase();
                    if (s.includes('npk')) return 'Balance NPK with recommended doses';
                    if (s.includes('ph')) return 'Adjust pH with lime/gypsum as needed';
                    if (s.includes('micro')) return 'Apply micronutrient mix as per soil test';
                    if (s.includes('temp')) return 'Shift planting window or use tolerant varieties';
                    if (s.includes('rain')) return 'Plan irrigation/drainage per forecast';
                    if (s.includes('humid')) return 'Monitor for fungal diseases; use prophylaxis';
                    return 'Review field conditions and adjust practices';
                };
                chips.innerHTML = (result.key_drivers||[]).slice(0,6).map(d=>`<span title="${tip(d)}" class="px-2 py-1 rounded-full text-[11px] border border-gray-200 dark:border-gray-700 ${cls(d)}">${d}</span>`).join('');
            }
            // Sparks
            try {
                const soilPct = Math.round((result.__soilScore || 0.5) * 100);
                const weatherPct = Math.round((result.__weatherScore || 0.5) * 100);
                const soilBar = document.getElementById('spark-soil');
                const weatherBar = document.getElementById('spark-weather');
                const labelSoil = document.getElementById('label-soil');
                const labelWeather = document.getElementById('label-weather');
                // animate after a short delay to trigger CSS transition
                setTimeout(() => {
                    if (soilBar) soilBar.style.width = soilPct + '%';
                    if (weatherBar) weatherBar.style.width = weatherPct + '%';
                }, 30);
                if (labelSoil) labelSoil.textContent = soilPct + '%';
                if (labelWeather) labelWeather.textContent = weatherPct + '%';
            } catch(_) {}
        }

        // Provide an improved, transparent rule-based predictor
        if (typeof window.ruleBasedPrediction !== 'function') {
            window.ruleBasedPrediction = function(input){
                const { soil = {}, weather = {}, size = 1, crop = 'Wheat', location = '—' } = input || {};
                const cropBaseYield = {
                    'Wheat': 40,
                    'Rice': 35,
                    'Cotton': 12,
                    'Sugarcane': 320
                };
                const base = cropBaseYield[crop] || 30;
                // Targets (rough heuristics; units simplified for demo)
                const targets = { N: 80, P: 40, K: 40, pH: [6.5, 7.5] };
                const npkScore = ['N','P','K'].map(k => {
                    const v = Number(soil[k] ?? 0);
                    const t = targets[k];
                    const score = 1 - Math.min(1, Math.abs(v - t) / (t || 1));
                    return isFinite(score) ? score : 0.5;
                });
                const ph = Number(soil.pH ?? soil.ph ?? 7);
                const phRange = targets.pH;
                const phScore = (ph >= phRange[0] && ph <= phRange[1]) ? 1 : Math.max(0, 1 - (Math.abs((phRange[0]+phRange[1])/2 - ph) / 2));
                // Micronutrient availability percentage average
                const microKeys = ['Zn','Fe','Cu','Mn','B','S'];
                const microVals = microKeys.map(k => Number(soil[k] ?? 50));
                const microScore = microVals.length ? Math.min(1, Math.max(0, (microVals.reduce((a,b)=>a+b,0)/microVals.length)/100)) : 0.5;
                const soilScore = 0.5 * (npkScore.reduce((a,b)=>a+b,0)/3) + 0.3 * phScore + 0.2 * microScore; // 0..1

                // Weather heuristics by crop (very rough)
                const cropOpt = {
                    'Wheat': { t:[18,26], h:[40,70], r:[400,800] },
                    'Rice': { t:[24,32], h:[60,90], r:[1000,2000] },
                    'Cotton': { t:[21,30], h:[40,70], r:[500,900] },
                    'Sugarcane': { t:[20,35], h:[50,85], r:[1200,2500] }
                }[crop] || { t:[20,30], h:[40,80], r:[500,1000] };
                const t = Number(weather.temperature ?? 28);
                const h = Number(weather.humidity ?? 65);
                const r = Number(weather.rainfall ?? 700);

                const within = (v, [lo,hi]) => (v>=lo && v<=hi) ? 1 : Math.max(0, 1 - (Math.min(Math.abs(v-lo), Math.abs(v-hi)) / (hi-lo)));
                const tScore = within(t, cropOpt.t);
                const hScore = within(h, cropOpt.h);
                const rScore = within(r, cropOpt.r);
                const weatherScore = 0.5*tScore + 0.3*hScore + 0.2*rScore; // 0..1

                // Combine
                const overall = 0.6*soilScore + 0.4*weatherScore; // 0..1
                // map to multiplier around base (±30%)
                const multiplier = 0.7 + overall*0.6; // 0.7..1.3
                let yieldPerAcre = Math.max(0.5, base * multiplier);

                // Confidence based on data completeness and agreement
                const completeness = [soil.N, soil.P, soil.K, soil.pH ?? soil.ph].filter(v=>typeof v!=='undefined').length / 4;
                const agreement = Math.abs(soilScore - weatherScore) < 0.25 ? 1 : 0.7;
                const confidence = Math.max(0.5, 0.4*completeness + 0.6*agreement);

                // Irrigation recommendation
                let irrigation = 'Maintain current schedule.';
                if (h < 45 && r < cropOpt.r[0]) irrigation = 'Increase irrigation: low humidity and below-normal rainfall.';
                else if (h > 85 || r > cropOpt.r[1]) irrigation = 'Reduce irrigation: high humidity/above-normal rainfall.';

                // Crop alternative suggestion (simple pick best base fit)
                const crops = ['Wheat','Rice','Cotton','Sugarcane'];
                let best = { name: crop, score: overall };
                crops.forEach(c => {
                    const opt = {
                        'Wheat': { t:[18,26], h:[40,70], r:[400,800] },
                        'Rice': { t:[24,32], h:[60,90], r:[1000,2000] },
                        'Cotton': { t:[21,30], h:[40,70], r:[500,900] },
                        'Sugarcane': { t:[20,35], h:[50,85], r:[1200,2500] }
                    }[c];
                    const cScore = 0.6*soilScore + 0.4*(0.5*within(t,opt.t)+0.3*within(h,opt.h)+0.2*within(r,opt.r));
                    if (cScore > best.score + 0.08) best = { name: c, score: cScore };
                });
                const cropRec = (best.name !== crop) ? `${best.name} (conditions slightly more favorable)` : crop;

                // Drivers
                const drivers = [];
                if (npkScore.reduce((a,b)=>a+b,0)/3 < 0.75) drivers.push('NPK below target');
                if (phScore < 0.8) drivers.push(`pH suboptimal (${isFinite(ph)?ph:'~'})`);
                if (microScore < 0.7) drivers.push('Micronutrients limited');
                if (tScore < 0.7) drivers.push(`Temperature ${t}°C`);
                if (rScore < 0.7) drivers.push(`Rainfall ${r}mm`);
                if (hScore < 0.7) drivers.push(`Humidity ${h}%`);

                return {
                    predicted_yield: Math.round(yieldPerAcre * size * 10)/10, // total for area
                    irrigation_recommendation: irrigation,
                    crop_recommendation: cropRec,
                    explanation: `Based on soil (${(soilScore*100).toFixed(0)}%) and weather (${(weatherScore*100).toFixed(0)}%) suitability in ${location}.`,
                    confidence,
                    key_drivers: drivers.slice(0,4),
                    __soilScore: soilScore,
                    __weatherScore: weatherScore
                };
            };
        }

// i18next integration for multilingual support
// (No import needed, i18next is loaded globally from CDN)

i18next.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: { translation: {
      'Help Center': 'Help Center',
      'Find answers or reach out for assistance': 'Find answers or reach out for assistance',
      'FAQs': 'FAQs',
      'Contact': 'Contact',
      'Dashboard': 'Dashboard',
      'Welcome. Please log in.': 'Welcome. Please log in.',
      'Crop Yield': 'Crop Yield',
      'Smart Advisory': 'Smart Advisory',
      'Weather': 'Weather',
      'Weather Forecast': 'Weather Forecast',
      'Mandi Prices': 'Mandi Prices',
      'Community Forum': 'Community Forum',
      'Quick Actions': 'Quick Actions',
      'Predict Yield': 'Predict Yield',
      'Get Advisory': 'Get Advisory',
      'Check Weather': 'Check Weather',
      'Join Forum': 'Join Forum',
      'How can I check crop prices?': 'How can I check crop prices?',
      'Go to the "Mandi Prices" section from the sidebar. You can view daily updated prices.': 'Go to the "Mandi Prices" section from the sidebar. You can view daily updated prices.',
      'How do I get weather updates?': 'How do I get weather updates?',
      'Open the "Weather" page in the app. It shows real-time forecasts for your location.': 'Open the "Weather" page in the app. It shows real-time forecasts for your location.',
      'Who can I contact for technical help?': 'Who can I contact for technical help?',
      'Use the Contact tab in this Help Center to reach our support team directly.': 'Use the Contact tab in this Help Center to reach our support team directly.',
      'Weather Overview': 'Weather Overview',
      'Soil Data': 'Soil Data',
      'District': 'District',
      'Average Min': 'Average Min',
      'Average Modal': 'Average Modal',
      'Average Max': 'Average Max',
      'View All': 'View All',
      'Loading...': 'Loading...',
      '--°C': '--°C',
      '--%': '--%',
      '-- km/h': '-- km/h',
      'Sensor offline. Check connection.': 'Sensor offline. Check connection.',
      'Connecting to sensor...': 'Connecting to sensor...',
      'Clouds': 'Clouds',
      'Rain': 'Rain',
      'Clear': 'Clear',
      'Thunderstorm': 'Thunderstorm',
      'Drizzle': 'Drizzle',
      'Mist': 'Mist',
      'Haze': 'Haze',
      'Fog': 'Fog',
      'Snow': 'Snow',
    }},
    hi: { translation: {
      'Help Center': 'सहायता केंद्र',
      'Find answers or reach out for assistance': 'उत्तर खोजें या सहायता के लिए संपर्क करें',
      'FAQs': 'सामान्य प्रश्न',
      'Contact': 'संपर्क करें',
      'Dashboard': 'डैशबोर्ड',
      'Welcome. Please log in.': 'स्वागत है। कृपया लॉगिन करें।',
      'Crop Yield': 'फसल उपज',
      'Smart Advisory': 'स्मार्ट सलाह',
      'Weather': 'मौसम',
      'Weather Forecast': 'मौसम पूर्वानुमान',
      'Mandi Prices': 'मंडी दाम',
      'Community Forum': 'समुदाय मंच',
      'Quick Actions': 'त्वरित क्रियाएँ',
      'Predict Yield': 'उपज अनुमान',
      'Get Advisory': 'सलाह प्राप्त करें',
      'Check Weather': 'मौसम देखें',
      'Join Forum': 'फोरम जॉइन करें',
      'How can I check crop prices?': 'मैं फसल के दाम कैसे देख सकता हूँ?',
      'Go to the "Mandi Prices" section from the sidebar. You can view daily updated prices.': 'साइडबार से "मंडी दाम" अनुभाग में जाएं। आप प्रतिदिन अपडेट किए गए दाम देख सकते हैं।',
      'How do I get weather updates?': 'मौसम की जानकारी कैसे प्राप्त करें?',
      'Open the "Weather" page in the app. It shows real-time forecasts for your location.': 'ऐप में "मौसम" पेज खोलें। यह आपके स्थान के लिए रीयल-टाइम पूर्वानुमान दिखाता है।',
      'Who can I contact for technical help?': 'तकनीकी सहायता के लिए किससे संपर्क करें?',
      'Use the Contact tab in this Help Center to reach our support team directly.': 'हमारी सहायता टीम से सीधे संपर्क करने के लिए इस सहायता केंद्र में संपर्क टैब का उपयोग करें।',
      'Weather Overview': 'मौसम का अवलोकन',
      'Soil Data': 'मिट्टी का डेटा',
      'District': 'जिला',
      'Average Min': 'औसत न्यूनतम',
      'Average Modal': 'औसत मोडल',
      'Average Max': 'औसत अधिकतम',
      'View All': 'सभी देखें',
      'Loading...': 'लोड हो रहा है...',
      '--°C': '--°से',
      '--%': '--%',
      '-- km/h': '-- किमी/घंटा',
      'Sensor offline. Check connection.': 'सेंसर ऑफ़लाइन है। कनेक्शन जांचें।',
      'Connecting to sensor...': 'सेंसर से कनेक्ट हो रहा है...',
      'Clouds': 'बादल',
      'Rain': 'बारिश',
      'Clear': 'साफ़',
      'Thunderstorm': 'आंधी',
      'Drizzle': 'फुहार',
      'Mist': 'कोहरा',
      'Haze': 'धुंध',
      'Fog': 'कोहरा',
      'Snow': 'बर्फ',
    }},
    or: { translation: {
      'Help Center': 'ସହଯୋଗ କେନ୍ଦ୍ର',
      'Find answers or reach out for assistance': 'ଉତ୍ତର ଖୋଜନ୍ତୁ କିମ୍ବା ସହଯୋଗ ପାଇଁ ଯୋଗାଯୋଗ କରନ୍ତୁ।',
      'FAQs': 'ସାଧାରଣ ପ୍ରଶ୍ନ',
      'Contact': 'ଯୋଗାଯୋଗ',
      'Dashboard': 'ଡ୍ୟାସବୋର୍ଡ',
      'Welcome. Please log in.': 'ସ୍ୱାଗତ। ଦୟାକରି ଲଗଇନ୍ କରନ୍ତୁ।',
      'Crop Yield': 'ଫସଲ ଉତ୍ପାଦନ',
      'Smart Advisory': 'ସ୍ମାର୍ଟ ପରାମର୍ଶ',
      'Weather': 'ପାଣିପାଗ',
      'Weather Forecast': 'ପାଣିପାଗ ପୂର୍ବାନୁମାନ',
      'Mandi Prices': 'ମଣ୍ଡି ଦର',
      'Community Forum': 'ସମୁଦାୟ ଫୋରମ୍',
      'Quick Actions': 'ତ୍ୱରିତ କାର୍ଯ୍ୟ',
      'Predict Yield': 'ଉତ୍ପାଦନ ଅନୁମାନ',
      'Get Advisory': 'ପରାମର୍ଶ ନିଅନ୍ତୁ',
      'Check Weather': 'ପାଣିପାଗ ଦେଖନ୍ତୁ',
      'Join Forum': 'ଫୋରମ୍ ଯୋଗଦିଅନ୍ତୁ',
      'How can I check crop prices?': 'ମୁଁ କିପରି ଫସଲ ଦର ଦେଖିପାରିବି?',
      'Go to the "Mandi Prices" section from the sidebar. You can view daily updated prices.': 'ସାଇଡବାରରୁ "ମଣ୍ଡି ଦର" ଅଞ୍ଚଳକୁ ଯାଆନ୍ତୁ। ଆପଣ ପ୍ରତିଦିନ ଅଦ୍ୟତିତ ଦର ଦେଖିପାରିବେ।',
      'How do I get weather updates?': 'ମୁଁ କିପରି ପାଣିପାଗ ଅଦ୍ୟତନ ମିଳିପାରିବି?',
      'Open the "Weather" page in the app. It shows real-time forecasts for your location.': 'ଆପ୍ରେ "ପାଣିପାଗ" ପୃଷ୍ଠା ଖୋଲନ୍ତୁ। ଏହା ଆପଣଙ୍କ ଅଞ୍ଚଳ ପାଇଁ ରିଅଲ୍-ଟାଇମ୍ ପୂର୍ବାନୁମାନ ଦେଖାଏ।',
      'Who can I contact for technical help?': 'ମୁଁ କାହା ସହିତ ତକନିକୀ ସହଯୋଗ ପାଇଁ ଯୋଗାଯୋଗ କରିପାରିବି?',
      'Use the Contact tab in this Help Center to reach our support team directly.': 'ଏହି ସହଯୋଗ କେନ୍ଦ୍ରରେ ଥିବା ଯୋଗାଯୋଗ ଟ୍ୟାବ୍ ବ୍ୟବହାର କରି ଆମ ସହଯୋଗ ଦଳ ସହିତ ସିଧାସଳଖ ଯୋଗାଯୋଗ କରନ୍ତୁ।',
      'Weather Overview': 'ପାଣିପାଗ ସମୀକ୍ଷା',
      'Soil Data': 'ମାଟି ତଥ୍ୟ',
      'District': 'ଜିଲ୍ଲା',
      'Average Min': 'ସର୍ବନିମ୍ନ ହାରାହାରି',
      'Average Modal': 'ମୋଡାଲ୍ ହାରାହାରି',
      'Average Max': 'ସର୍ବାଧିକ ହାରାହାରି',
      'View All': 'ସମସ୍ତ ଦେଖନ୍ତୁ',
      'Loading...': 'ଲୋଡିଂ...',
      '--°C': '--°ସେ',
      '--%': '--%',
      '-- km/h': '-- କିମି/ଘଣ୍ଟା',
      'Sensor offline. Check connection.': 'ସେନ୍ସର୍ ଅଫ୍ଲାଇନ୍। ସଂଯୋଗ ଯାଞ୍ଚ କରନ୍ତୁ।',
      'Connecting to sensor...': 'ସେନ୍ସର୍ ସହିତ ସଂଯୋଗ କରୁଛି...',
      'Clouds': 'ମେଘ',
      'Rain': 'ବର୍ଷା',
      'Clear': 'ପରିଷ୍କାର',
      'Thunderstorm': 'ଗଜଗଜି',
      'Drizzle': 'ଫୁହାର',
      'Mist': 'ଧୂସର',
      'Haze': 'ଧୂସର',
      'Fog': 'କୁହୁଡ଼ି',
      'Snow': 'ହିମ',
    }},
    // Add similar translation objects for mr, ta, te, bn, gu, pa, kn as needed
  }
});

function setLanguage(lang) {
  i18next.changeLanguage(lang, () => {
    translateStaticText();
  });
}

function translateDynamicDashboard() {
  // Weather card (dynamic)
  const temp = document.getElementById('dashboard-temp');
  const cond = document.getElementById('dashboard-condition');
  const hum = document.getElementById('dashboard-humidity');
  const wind = document.getElementById('dashboard-wind');
  if (typeof lastWeatherData === 'object' && lastWeatherData && temp && cond && hum && wind) {
    temp.textContent = `${lastWeatherData.tempC}°C`;
    cond.textContent = i18next.t(lastWeatherData.condition);
    hum.innerHTML = `<i data-lucide="droplets" class="w-4 h-4 mr-2"></i> ${lastWeatherData.humidity}%`;
    wind.innerHTML = `<i data-lucide="wind" class="w-4 h-4 mr-2"></i> ${lastWeatherData.windKmh} km/h`;
  } else {
    // Placeholders if no data
    if (temp) temp.textContent = i18next.t('--°C');
    if (cond) cond.textContent = i18next.t('Loading...');
    if (hum) hum.innerHTML = `<i data-lucide="droplets" class="w-4 h-4 mr-2"></i> ${i18next.t('--%')}`;
    if (wind) wind.innerHTML = `<i data-lucide="wind" class="w-4 h-4 mr-2"></i> ${i18next.t('-- km/h')}`;
  }
  // Soil sensor loading
  const soilLoading = document.getElementById('soil-data-loading');
  if (soilLoading) {
    const span = soilLoading.querySelector('span');
    if (span && (span.textContent.trim() === 'Connecting to sensor...' || span.textContent.trim() === 'सेंसर से कनेक्ट हो रहा है...' || span.textContent.trim() === 'ସେନ୍ସର୍ ସହିତ ସଂଯୋଗ କରୁଛି...')) span.textContent = i18next.t('Connecting to sensor...');
  }
  // Soil sensor error
  const soilError = document.getElementById('soil-data-error');
  if (soilError) {
    const p = soilError.querySelector('p');
    if (p && (p.textContent.trim() === 'Sensor offline. Check connection.' || p.textContent.trim() === 'सेंसर ऑफ़लाइन है। कनेक्शन जांचें।' || p.textContent.trim() === 'ସେନ୍ସର୍ ଅଫ୍ଲାଇନ୍। ସଂଯୋଗ ଯାଞ୍ଚ କରନ୍ତୁ।')) p.textContent = i18next.t('Sensor offline. Check connection.');
  }
}

function translateStaticText() {
  // Dashboard
  const dashboardHeader = document.querySelector('#dashboard-page h1');
  if (dashboardHeader) dashboardHeader.textContent = i18next.t('कृषि Sahayak');
  const welcomeText = document.getElementById('welcome-text');
  if (welcomeText) welcomeText.textContent = i18next.t('Welcome. Please log in.');
  // Main nav/sidebar
  document.querySelectorAll('.nav-item-desktop span, .nav-item-mobile p').forEach(el => {
    if (el.textContent.trim() === 'Dashboard') el.textContent = i18next.t('Dashboard');
    if (el.textContent.trim() === 'Crop Yield') el.textContent = i18next.t('Crop Yield');
    if (el.textContent.trim() === 'Smart Advisory') el.textContent = i18next.t('Smart Advisory');
    if (el.textContent.trim() === 'Weather') el.textContent = i18next.t('Weather');
    if (el.textContent.trim() === 'Mandi Prices' || el.textContent.trim() === 'Mandi') el.textContent = i18next.t('Mandi Prices');
    if (el.textContent.trim() === 'Forum' || el.textContent.trim() === 'Community') el.textContent = i18next.t('Community Forum');
  });
  // Dashboard cards
  const dashCardHeaders = document.querySelectorAll('#dashboard-page .font-semibold.text-lg, #dashboard-page .font-semibold.text-lg.mb-4');
  dashCardHeaders.forEach(el => {
    if (el.textContent.trim() === 'Weather Overview') el.textContent = i18next.t('Weather Overview');
    if (el.textContent.trim() === 'Soil Data') el.textContent = i18next.t('Soil Data');
    if (el.textContent.trim() === 'Mandi Prices') el.textContent = i18next.t('Mandi Prices');
    if (el.textContent.trim() === 'Quick Actions') el.textContent = i18next.t('Quick Actions');
  });
  // Dashboard card labels
  const dashLabels = document.querySelectorAll('#dashboard-page label, #dashboard-page .text-xs');
  dashLabels.forEach(el => {
    if (el.textContent.trim() === 'District') el.textContent = i18next.t('District');
    if (el.textContent.trim() === 'Average Min') el.textContent = i18next.t('Average Min');
    if (el.textContent.trim() === 'Average Modal') el.textContent = i18next.t('Average Modal');
    if (el.textContent.trim() === 'Average Max') el.textContent = i18next.t('Average Max');
  });
  // View All button
  const viewAllBtn = document.querySelector('#dashboard-page button.text-blue-600, #dashboard-page button.text-blue-400');
  if (viewAllBtn && (viewAllBtn.textContent.trim() === 'View All')) viewAllBtn.textContent = i18next.t('View All');
  // Quick Actions buttons
  document.querySelectorAll('#dashboard-page .grid button p').forEach(el => {
    if (el.textContent.trim() === 'Predict Yield') el.textContent = i18next.t('Predict Yield');
    if (el.textContent.trim() === 'Get Advisory') el.textContent = i18next.t('Get Advisory');
    if (el.textContent.trim() === 'Check Weather') el.textContent = i18next.t('Check Weather');
    if (el.textContent.trim() === 'Join Forum') el.textContent = i18next.t('Join Forum');
  });
  // Help Center
  const helpHeader = document.querySelector('#help-page h1');
  if (helpHeader) helpHeader.textContent = i18next.t('Help Center');
  const helpSub = document.querySelector('#help-page p');
  if (helpSub) helpSub.textContent = i18next.t('Find answers or reach out for assistance');
  const faqTab = document.getElementById('faq-tab');
  if (faqTab) faqTab.textContent = i18next.t('FAQs');
  const contactTab = document.getElementById('contact-tab');
  if (contactTab) contactTab.textContent = i18next.t('Contact');
  // FAQ questions
  const faqQuestions = document.querySelectorAll('#faq-section button span');
  const faqQKeys = [
    'How can I check crop prices?',
    'How do I get weather updates?',
    'Who can I contact for technical help?'
  ];
  faqQuestions.forEach((el, idx) => {
    el.childNodes[1].textContent = i18next.t(faqQKeys[idx]);
  });
  // FAQ answers
  const faqAnswers = document.querySelectorAll('#faq-section .faq-answer p');
  const faqAKeys = [
    'Go to the "Mandi Prices" section from the sidebar. You can view daily updated prices.',
    'Open the "Weather" page in the app. It shows real-time forecasts for your location.',
    'Use the Contact tab in this Help Center to reach our support team directly.'
  ];
  faqAnswers.forEach((el, idx) => {
    el.textContent = i18next.t(faqAKeys[idx]);
  });
  // Weather page
  const weatherHeader = document.querySelector('#weather-page h1');
  if (weatherHeader) weatherHeader.textContent = i18next.t('Weather Forecast');
  // Mandi page
  const mandiHeader = document.querySelector('#mandi-page h1');
  if (mandiHeader) mandiHeader.textContent = i18next.t('Mandi Prices');
  // Community Forum
  const forumHeader = document.querySelector('#community-page h1');
  if (forumHeader) forumHeader.textContent = i18next.t('Community Forum');
  // Smart Advisory
  const advisoryHeader = document.querySelector('#advisory-page h1');
  if (advisoryHeader) advisoryHeader.textContent = i18next.t('Smart Advisory');
  translateDynamicDashboard();
}

window.setLanguage = setLanguage;
window.addEventListener('DOMContentLoaded', translateStaticText);