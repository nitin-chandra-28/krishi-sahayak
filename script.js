        // --- Global State ---
        const pages = document.querySelectorAll('.page');
        const navItems = document.querySelectorAll('.nav-item');
        const appContainer = document.getElementById('app-container');
        const mainContentArea = appContainer.parentElement;
        let yieldChartInstance = null;
        let mapInstance = null;
        let currentDistrict = 'Hisar';
        let lastWeatherData = null;
        
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
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false }, title: { display: true, text: 'Yield Comparison' } },
                    scales: { y: { beginAtZero: true } }
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

        function updateWeatherUI(lat, lon) {
            const apiKey = "9505fd1df737e20152fbd78cdb289b6a"; // Note: This key is public for demo purposes.
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
            
            fetch(url)
                .then(res => {
                    if (!res.ok) throw new Error(`Weather API request failed with status ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    const temp = Math.round(data.main.temp);
                    const condition = data.weather[0].main;
                    const city = data.name;
                    lastWeatherData = {
                        city,
                        tempC: temp,
                        condition,
                        humidity: data.main.humidity,
                        windKmh: Math.round(data.wind.speed * 3.6)
                    };

                    // Update Dashboard Card
                    document.getElementById('dashboard-temp').textContent = `${temp}°C`;
                    document.getElementById('dashboard-condition').textContent = condition;
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
                })
                .catch(err => console.error("Weather API error:", err));
        }
        
        function fetchSoilData() {
            const soilDataContent = document.getElementById('soil-data-content');
            const soilDataLoading = document.getElementById('soil-data-loading');
            const soilDataError = document.getElementById('soil-data-error');
            
            soilDataLoading.classList.remove('hidden');
            soilDataContent.classList.add('hidden');
            soilDataError.classList.add('hidden');
            document.getElementById('advisory-message').innerHTML = `Analyzing farm data...`;

            // Prefer dataset if available; fallback to mock sensor demo
            const useDataset = (typeof districtSoilData !== 'undefined') || (typeof window.districtSoilData !== 'undefined');

            if (useDataset) {
                setTimeout(() => {
                    renderSoilDataset(currentDistrict);
                    soilDataLoading.classList.add('hidden');
                    soilDataContent.classList.remove('hidden');
                    document.getElementById('advisory-message').innerHTML = `Loading AI advisory...`;
                    // Compose minimal soil summary from dataset row
                    const dataset = (typeof districtSoilData !== 'undefined') ? districtSoilData : (typeof window.districtSoilData !== 'undefined' ? window.districtSoilData : undefined);
                    const row = dataset ? dataset[currentDistrict] : null;
                    const soilSummary = row || {};
                    generateSmartAdvisory(soilSummary, lastWeatherData);
                    renderAdvisoryVisual('Maintain regular irrigation and monitor for pests.', soilSummary);
                    lucide.createIcons();
                }, 800);
            } else {
                setTimeout(() => {
                    const data = { moisture: 45, ph: 6.8, nitrogen: 120, phosphorus: 55, potassium: 150 };
                    const renderSoilProgress = (label, value, percent, unit = '') => {
                        const isDark = document.documentElement.classList.contains('dark');
                        const bgColor = isDark ? 'bg-green-700' : 'bg-green-500';
                        return `<div><div class="flex justify-between items-center mb-1 text-sm"><span class="text-gray-600 dark:text-gray-300">${label}</span><span class="font-semibold">${value}${unit}</span></div><div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div class="${bgColor} h-2 rounded-full" style="width: ${percent}%"></div></div></div>`;
                    };
                    soilDataContent.innerHTML = renderSoilProgress('Moisture', data.moisture, data.moisture, '%') +
                                                renderSoilProgress('pH Level', data.ph, (data.ph / 14) * 100) +
                                                renderSoilProgress('Nitrogen (N)', data.nitrogen, (data.nitrogen / 200) * 100, ' ppm') +
                                                renderSoilProgress('Phosphorus (P)', data.phosphorus, (data.phosphorus / 100) * 100, ' ppm') +
                                                renderSoilProgress('Potassium (K)', data.potassium, (data.potassium / 250) * 100, ' ppm');
                    soilDataLoading.classList.add('hidden');
                    soilDataContent.classList.remove('hidden');
                    const fakeWeatherData = { forecast: 'clear', nextRainDays: 5 };
                    generateSmartAdvisory(data, fakeWeatherData);
                    lucide.createIcons();
                }, 2500);
            }
        }

        // Render soil progress bars from district dataset
        function renderSoilDataset(districtName) {
            const soilDataContent = document.getElementById('soil-data-content');
            const dataset = (typeof districtSoilData !== 'undefined') ? districtSoilData : (typeof window.districtSoilData !== 'undefined' ? window.districtSoilData : undefined);
            if (!soilDataContent || !dataset) return;
            const dataForDistrict = dataset[districtName] || dataset['Hisar'];
            if (!dataForDistrict) return;
            const isDark = document.documentElement.classList.contains('dark');
            const bgColor = isDark ? 'bg-green-700' : 'bg-green-500';
            const rows = Object.entries(dataForDistrict).map(([label, value]) => {
                const isNA = value === 'N/A' || value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
                const percent = isNA ? 0 : Number(value);
                const displayValue = isNA ? 'N/A' : `${percent.toFixed(2)}%`;
                return `<div><div class="flex justify-between items-center mb-1 text-sm"><span class="text-gray-600 dark:text-gray-300">${label}</span><span class="font-semibold">${displayValue}</span></div><div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div class="${bgColor} h-2 rounded-full" style="width: ${Math.max(0, Math.min(100, percent))}%"></div></div></div>`;
            });
            soilDataContent.innerHTML = rows.join('');
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
                if (saved && saved.name) setSession(saved);
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
            fetchSoilData();

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
            if (!districtSelect || !areaInput) return;
            const district = districtSelect.value;
            const area = parseFloat(areaInput.value) || 1;
            // Use real weather data if available
            let weather = (typeof lastWeatherData !== 'undefined' && lastWeatherData && lastWeatherData.tempC)
                ? {
                    rainfall: lastWeatherData.rainfall || 700, // If rainfall is not present, fallback
                    temperature: lastWeatherData.tempC,
                    humidity: lastWeatherData.humidity
                }
                : { rainfall: 700, temperature: 28, humidity: 65 };
            // Use real soil data if available
            let soil = (typeof districtSoilData !== 'undefined' && districtSoilData[district])
                ? districtSoilData[district]
                : { N: 60, P: 30, K: 30, pH: 7, Zn: 50, Fe: 50, Cu: 50, Mn: 50, B: 50, S: 50 };
            if (typeof ruleBasedPrediction !== 'function') {
                document.getElementById('prediction-explanation').textContent = 'Rule-based prediction function not found.';
                return;
            }
            const result = ruleBasedPrediction({
                weather,
                location: district,
                size: area,
                soil
            });
            document.getElementById('predicted-yield').textContent = result.predicted_yield + ' quintals';
            document.getElementById('irrigation-recommendation').textContent = result.irrigation_recommendation;
            document.getElementById('crop-recommendation').textContent = result.crop_recommendation;
            document.getElementById('prediction-explanation').textContent = result.explanation;
        }