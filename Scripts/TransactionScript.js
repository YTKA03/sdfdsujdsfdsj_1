(function() {
    'use strict';

    console.log('[Сповіщення про транзакцію] Скрипт запущен');

    // Звуки
    const sounds = {
        option1: {
            buy: new Audio('https://local.sounds/pokypka228.mp3'),
            sell: new Audio('https://local.sounds/prodazha228.mp3')
        },
        option2: {
            buy: new Audio('https://local.sounds/long228.mp3'),
            sell: new Audio('https://local.sounds/shorti228.mp3')
        },
        option3: {
            buy: new Audio('https://local.sounds/zelalong.mp3'),
            sell: new Audio('https://local.sounds/zelashort.mp3')
        }
    };

    // Конфигурация
    const GMGN_WS_URL = 'wss://ws.gmgn.ai/quotation';
    const MEXC_WS_URL = 'wss://contract.mexc.com/edge';
    const chainMap = {
        '195': 'tron',
        '501': 'sol',
        '81457': 'blast',
        '56': 'bsc',
        '1': 'ethereum',
        '784': 'sui',
        '8453': 'base'
    };

    let wsGmgn = null;
    let wsMexc = null;
    let transactionQueue1 = { buy: [], sell: [] };
    let transactionQueue2 = { buy: [], sell: [] };
    let previousTransactions = new Set();
    let currentFilterAmount1 = 1000;
    let currentFilterAmount2 = 1000;
    let currentFilterTime = 10;
    let pendingAudioQueue = [];
    let currentBackgroundColor = '#000000';
    let isTable1Visible = true;
    let isTable2Visible = true;
    let isSoundEnabled1 = true;
    let isSoundEnabled2 = true;
    let soundMode1 = 'transaction';
    let soundMode2 = 'transaction';
    let selectedSound1 = 'option1';
    let selectedSound2 = 'option1';
    let lastDominance1 = 'neutral';
    let lastDominance2 = 'neutral';
    let lastDifference1 = 0;
    let lastDifference2 = 0;
    let isNewTransaction1 = false;
    let isNewTransaction2 = false;
    let currentTokenAddress = null;
    let currentChain = null;
    let filterPanel = null;
    let table1 = null;
    let table2 = null;
    let priceTable = null;
    let mexcPrice = null;
    let dexPrice = null;
    let tokenName = null;
    let isPriceTableVisible = true;
    let priceDecimals = 5; // Начальное значение, будет обновлено из WebSocket MEXC
    let mexcDecimals = 5; // Для хранения количества знаков из MEXC

    function log(message, data = '') {
        console.log(`[Сповіщення про транзакцію] ${message}`, data);
    }

    function cleanup() {
        log('Очистка ресурсов начата');
        if (wsGmgn) {
            wsGmgn.close();
            wsGmgn = null;
            log('GMGN WebSocket закрыт');
        }
        if (wsMexc) {
            wsMexc.close();
            wsMexc = null;
            log('MEXC WebSocket закрыт');
        }
        if (filterPanel) {
            filterPanel.remove();
            filterPanel = null;
            log('Панель фильтров удалена');
        }
        if (table1) {
            clearInterval(table1.getAttribute('data-timer-id'));
            table1.remove();
            table1 = null;
            log('Таблица 1 удалена');
        }
        if (table2) {
            clearInterval(table2.getAttribute('data-timer-id'));
            table2.remove();
            table2 = null;
            log('Таблица 2 удалена');
        }
        if (priceTable) {
            priceTable.remove();
            priceTable = null;
            log('Таблица цен удалена');
        }
        transactionQueue1 = { buy: [], sell: [] };
        transactionQueue2 = { buy: [], sell: [] };
        previousTransactions.clear();
        pendingAudioQueue = [];
        mexcPrice = null;
        dexPrice = null;
        tokenName = null;
        log('Очистка ресурсов завершена');
    }

    function closeBanner() {
        const banner = document.querySelector('.css-12rtj2z');
        if (banner && banner.classList.contains('banner')) {
            banner.style.display = 'none';
            log('Баннер скрыт');
        } else {
            log('Баннер не найден или не соответствует условию');
        }
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    function applyBackgroundColor(color) {
        const rgb = hexToRgb(color);
        const rgbaColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`;
        if (filterPanel) {
            filterPanel.style.background = rgbaColor;
            log(`Изменен цвет фона filterPanel на: ${color}`);
        }
        if (table1) {
            table1.style.background = rgbaColor;
            log(`Изменен цвет фона table1 на: ${color}`);
        }
        if (table2) {
            table2.style.background = rgbaColor;
            log(`Изменен цвет фона table2 на: ${color}`);
        }
        if (priceTable) {
            priceTable.style.background = rgbaColor;
            log(`Изменен цвет фона priceTable на: ${color}`);
        }
        currentBackgroundColor = color;
        log(`Общий цвет фона изменен на: ${color}`);
    }

    function getChainAndTokenFromURL() {
        const url = window.location.href;
        const regex = /\/(tron|sol|blast|bsc|ethereum|sui|base)\/token\/([a-zA-Z0-9]+)/;
        const match = url.match(regex);
        if (match) {
            const network = match[1];
            const tokenAddress = match[2];
            const chainId = Object.keys(chainMap).find(key => chainMap[key] === network);
            log('Извлечены параметры из URL', { network, tokenAddress, chainId });
            return { chain: network, tokenAddress, chainId };
        }
        log('Параметры из URL не извлечены');
        return null;
    }

    function getTokenName() {
        const element = document.querySelector('span.text-text-100.text-xl.font-semibold.leading-\\[21px\\]');
        const name = element ? element.textContent.trim() : 'Unknown Token';
        log('Извлечено имя токена', name);
        return name;
    }

    function formatNumberWithSpaces(number) {
        return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    function generateGmgnSubscribeMessage(chain, tokenAddress) {
        const randomIdStat = `stat-${Math.random().toString(36).substr(2, 9)}`;
        const randomIdActivity = `activity-${Math.random().toString(36).substr(2, 9)}`;
        const messages = [
            {
                action: 'subscribe',
                channel: 'token_stat',
                id: randomIdStat,
                data: [{ chain, addresses: tokenAddress }]
            },
            {
                action: 'subscribe',
                channel: 'token_activity',
                id: randomIdActivity,
                data: [{ chain, addresses: tokenAddress }]
            }
        ];
        log('Сгенерированы сообщения подписки GMGN', messages);
        return messages;
    }

    function generateMexcSubscribeMessage(symbol) {
        const message = {
            method: 'sub.ticker',
            param: {
                symbol: symbol,
                instType: 'futures'
            }
        };
        log('Сгенерировано сообщение подписки MEXC', message);
        return message;
    }

    function initGmgnWebSocket(chain, tokenAddress) {
        wsGmgn = new WebSocket(GMGN_WS_URL);

        wsGmgn.onopen = () => {
            log('Подключено к GMGN WebSocket');
            const subscribeMessages = generateGmgnSubscribeMessage(chain, tokenAddress);
            subscribeMessages.forEach(msg => wsGmgn.send(JSON.stringify(msg)));
        };

        wsGmgn.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.channel === 'token_activity') {
                    data.data.forEach(activity => {
                        if (activity.a === tokenAddress) {
                            const isBuy = activity.e === 'buy';
                            const volume = parseFloat(activity.au || 0);
                            const txHash = activity.id || `tx-${Math.random().toString(36).substr(2, 9)}`;

                            if (!previousTransactions.has(txHash) && (volume >= currentFilterAmount1 || volume >= currentFilterAmount2)) {
                                const type = isBuy ? 'buy' : 'sell';
                                previousTransactions.add(txHash);

                                if (volume >= currentFilterAmount1) {
                                    updateTransactionTable(1, volume, type, txHash);
                                }
                                if (volume >= currentFilterAmount2) {
                                    updateTransactionTable(2, volume, type, txHash);
                                }
                            }
                        }
                    });
                } else if (data.channel === 'token_stat') {
                    data.data.forEach(stat => {
                        if (stat.a === tokenAddress) {
                            dexPrice = parseFloat(stat.p || 0);
                            updatePriceTable();
                        }
                    });
                }
            } catch (e) {
                log('Ошибка обработки сообщения GMGN WebSocket:', e);
            }
        };

        wsGmgn.onerror = (error) => {
            log('Ошибка GMGN WebSocket:', error);
        };

        wsGmgn.onclose = () => {
            log('GMGN WebSocket закрыт');
            wsGmgn = null;
        };
    }

    function initMexcWebSocket(symbols) {
        if (wsMexc) {
            wsMexc.close();
            wsMexc = null;
            log('Предыдущий MEXC WebSocket закрыт перед новым подключением');
        }

        wsMexc = new WebSocket(MEXC_WS_URL);

        wsMexc.onopen = () => {
            log('Подключено к MEXC WebSocket');
            symbols.forEach(symbol => {
                const subscribeMessage = generateMexcSubscribeMessage(symbol);
                wsMexc.send(JSON.stringify(subscribeMessage));
                log(`Отправлена подписка на символ: ${symbol}`);
            });
        };

        wsMexc.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.channel === 'push.ticker') {
                    const price = parseFloat(data.data.lastPrice || 0);
                    const symbol = data.data.symbol;
                    if (price > 0) {
                        mexcPrice = price;
                        // Определяем количество знаков после запятой в lastPrice
                        const priceStr = data.data.lastPrice.toString();
                        const decimalPart = priceStr.split('.')[1];
                        mexcDecimals = decimalPart ? decimalPart.length : 0;
                        // Если priceDecimals ещё не изменён пользователем, устанавливаем его равным mexcDecimals
                        if (priceDecimals === 5) { // Начальное значение 5 означает, что пользователь ещё не менял
                            priceDecimals = mexcDecimals;
                            log(`Установлено количество знаков по умолчанию из MEXC: ${priceDecimals} для символа ${symbol}`);
                        }
                        updatePriceTable();
                        log(`Получена цена MEXC: ${mexcPrice} для символа ${symbol}`);
                    }
                }
            } catch (e) {
                log('Ошибка обработки сообщения MEXC WebSocket:', e);
            }
        };

        wsMexc.onerror = (error) => {
            log('Ошибка MEXC WebSocket:', error);
        };

        wsMexc.onclose = () => {
            log('MEXC WebSocket закрыт');
            wsMexc = null;
        };
    }

    function createPriceTable() {
        priceTable = document.createElement('div');
        priceTable.className = 'gmgn-script-container';
        priceTable.id = 'priceTable';
        priceTable.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 10px;
            border-radius: 8px;
            z-index: 1000;
            font-family: Arial, sans-serif;
            width: 250px;
            cursor: move;
            display: block;
        `;
        document.body.appendChild(priceTable);
        applyBackgroundColor(currentBackgroundColor);

        let isDraggingPriceTable = false;
        let priceTableXOffset = 0;
        let priceTableYOffset = 0;

        priceTable.addEventListener('mousedown', (e) => {
            const rect = priceTable.getBoundingClientRect();
            isDraggingPriceTable = true;
            priceTableXOffset = e.clientX - rect.left;
            priceTableYOffset = e.clientY - rect.top;
            log('Начато перетаскивание таблицы цен', { x: e.clientX, y: e.clientY });
        });

        document.addEventListener('mousemove', (e) => {
            if (isDraggingPriceTable) {
                e.preventDefault();
                priceTable.style.left = `${e.clientX - priceTableXOffset}px`;
                priceTable.style.top = `${e.clientY - priceTableYOffset}px`;
                priceTable.style.transform = 'none';
            }
        });

        document.addEventListener('mouseup', () => {
            isDraggingPriceTable = false;
            log('Перетаскивание таблицы цен завершено');
        });

        updatePriceTable();
        log('Таблица цен создана и добавлена на страницу');
    }

    function updatePriceTable() {
        if (!priceTable) {
            log('updatePriceTable: priceTable не существует, пропускаем обновление');
            return;
        }

        const displayTokenName = tokenName || 'Unknown Token';
        const dexPriceStr = dexPrice ? dexPrice.toFixed(priceDecimals) : 'N/A';
        const mexcPriceStr = mexcPrice ? mexcPrice.toFixed(priceDecimals) : 'N/A';
        let percentageDiff = 'N/A';
        let arrow = '';
        let mexcColor = 'white';

        if (dexPrice && mexcPrice) {
            percentageDiff = (((mexcPrice - dexPrice) / dexPrice) * 100).toFixed(2);
            percentageDiff = percentageDiff >= 0 ? `+${percentageDiff}` : percentageDiff;
            arrow = mexcPrice > dexPrice ? '🠕' : '🠗';
            mexcColor = mexcPrice > dexPrice ? '#00FF00' : '#FF0000';
        }

        priceTable.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">${displayTokenName}</div>
            <div style="border-bottom: 2px solid #ff0000; margin-bottom: 5px;"></div>
            <div style="display: flex; align-items: center; margin-bottom: 5px;">
                <span style="width: 60px;">DEX</span>
                <span style="margin-right: 10px;">${dexPriceStr}</span>
            </div>
            <div style="display: flex; align-items: center;">
                <span style="width: 60px;">MEXC</span>
                <span style="margin-right: 10px; color: ${mexcColor};">${mexcPriceStr} ${arrow}</span>
                <span style="margin-left: auto; color: white;">(${percentageDiff}%)</span>
            </div>
        `;

        priceTable.style.display = isPriceTableVisible ? 'block' : 'none';
        log('Таблица цен обновлена', { displayTokenName, dexPriceStr, mexcPriceStr, percentageDiff, isVisible: isPriceTableVisible });
    }

    function createFilterPanel() {
        filterPanel = document.createElement('div');
        filterPanel.className = 'gmgn-script-container';
        filterPanel.id = 'transactionFilterPanel';
        filterPanel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 10px;
            border-radius: 8px;
            z-index: 1000;
            font-family: Arial, sans-serif;
        `;
        filterPanel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; gap: 10px;">
                <div style="font-weight: bold;">Налаштування</div>
                <button id="toggleFilters" style="background: none; border: none; color: white; cursor: pointer;">▶️</button>
            </div>
            <div id="filterContent" style="display: none; max-height: 530px; overflow-y: auto;">
                <div class="collapsible-section" style="border-bottom: 2px solid #ff0000; padding-bottom: 10px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                        <div style="font-weight: bold;">Фільтр суми (Таблиця 1)</div>
                        <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▼</button>
                    </div>
                    <div class="section-content" style="display: block;">
                        <div id="currentFilterDisplay1" style="margin-top: 5px; margin-bottom: 5px;">Поточний: ${currentFilterAmount1} $</div>
                        <div style="display: flex; gap: 5px;">
                            <button class="filter-btn amount-btn1" data-amount="10">10 $</button>
                            <button class="filter-btn amount-btn1" data-amount="100">100 $</button>
                            <button class="filter-btn amount-btn1" data-amount="500">500 $</button>
                            <button class="filter-btn amount-btn1" data-amount="1000">1000 $</button>
                        </div>
                        <div style="margin-top: 5px;">
                            <input type="number" id="customFilterAmount1" placeholder="Своя сума $" style="width: 80px; padding: 2px;">
                            <button id="applyCustomFilter1" class="apply-btn">Застосувати</button>
                        </div>
                    </div>
                </div>
                <div class="collapsible-section" style="border-bottom: 2px solid #ff0000; padding-bottom: 10px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                        <div style="font-weight: bold;">Фільтр суми (Таблиця 2)</div>
                        <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▼</button>
                    </div>
                    <div class="section-content" style="display: block;">
                        <div id="currentFilterDisplay2" style="margin-top: 5px; margin-bottom: 5px;">Поточний: ${currentFilterAmount2} $</div>
                        <div style="display: flex; gap: 5px;">
                            <button class="filter-btn amount-btn2" data-amount="1000">1000 $</button>
                            <button class="filter-btn amount-btn2" data-amount="2000">2000 $</button>
                            <button class="filter-btn amount-btn2" data-amount="5000">5000 $</button>
                            <button class="filter-btn amount-btn2" data-amount="10000">10000 $</button>
                        </div>
                        <div style="margin-top: 5px;">
                            <input type="number" id="customFilterAmount2" placeholder="Своя сума $" style="width: 80px; padding: 2px;">
                            <button id="applyCustomFilter2" class="apply-btn">Застосувати</button>
                        </div>
                    </div>
                </div>
                <div class="collapsible-section" style="border-bottom: 2px solid #ff0000; padding-bottom: 10px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                        <div style="font-weight: bold;">Фільтр часу</div>
                        <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▼</button>
                    </div>
                    <div class="section-content" style="display: block;">
                        <div id="currentTimeFilterDisplay" style="margin-top: 5px; margin-bottom: 5px;">Поточний: ${currentFilterTime}с</div>
                        <div style="display: flex; gap: 5px;">
                            <button class="filter-btn time-btn" data-time="10">10с</button>
                            <button class="filter-btn time-btn" data-time="30">30с</button>
                            <button class="filter-btn time-btn" data-time="60">60с</button>
                            <button class="filter-btn time-btn" data-time="120">120с</button>
                        </div>
                        <div style="margin-top: 5px;">
                            <input type="number" id="customFilterTime" placeholder="Своя тривалість (с)" style="width: 80px; padding: 2px;">
                            <button id="applyCustomTimeFilter" class="apply-btn">Застосувати</button>
                        </div>
                    </div>
                </div>
                <div class="collapsible-section" style="border-bottom: 2px solid #ff0000; padding-bottom: 10px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                        <div style="font-weight: bold;">Видимість таблиць</div>
                        <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▶️</button>
                    </div>
                    <div class="section-content" style="display: none;">
                        <div style="margin-top: 5px;">
                            <label style="display: flex; align-items: center; gap: 5px;">
                                <input type="checkbox" id="showTable1" checked>
                                Показати таблицю 1
                            </label>
                        </div>
                        <div style="margin-top: 5px;">
                            <label style="display: flex; align-items: center; gap: 5px;">
                                <input type="checkbox" id="showTable2" checked>
                                Показати таблицю 2
                            </label>
                        </div>
                    </div>
                </div>
                <div class="collapsible-section" style="border-bottom: 2px solid #ff0000; padding-bottom: 10px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                        <div style="font-weight: bold;">Відслідковування цін</div>
                        <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▶️</button>
                    </div>
                    <div class="section-content" style="display: none;">
                        <div style="margin-top: 5px;">
                            <label style="display: flex; align-items: center; gap: 5px;">
                                <input type="checkbox" id="showPriceTable" checked>
                                Показати таблицю цін
                            </label>
                        </div>
                        <div style="margin-top: 5px;">
                            <label>Кількість знаків після коми:</label>
                            <div style="display: flex; gap: 5px; margin-top: 5px; flex-wrap: wrap;">
                                <button class="filter-btn decimals-btn" data-decimals="mexc">MEXC</button>
                                <button class="filter-btn decimals-btn" data-decimals="1">1</button>
                                <button class="filter-btn decimals-btn" data-decimals="2">2</button>
                                <button class="filter-btn decimals-btn" data-decimals="4">4</button>
                                <button class="filter-btn decimals-btn" data-decimals="6">6</button>
                            </div>
                            <div style="margin-top: 5px;">
                                <input type="number" id="priceDecimalsInput" placeholder="К-сть знаків" min="0" max="10" style="width: 80px; padding: 2px;">
                                <button id="applyPriceDecimals" class="apply-btn">Застосувати</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="collapsible-section" style="border-bottom: 2px solid #ff0000; padding-bottom: 10px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                        <div style="font-weight: bold;">Звук для таблиць</div>
                        <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▶️</button>
                    </div>
                    <div class="section-content" style="display: none;">
                        <div style="margin-top: 5px;">
                            <label style="display: flex; align-items: center; gap: 5px;">
                                <input type="checkbox" id="soundTable1" checked>
                                Звук для таблиці 1
                            </label>
                        </div>
                        <div style="margin-top: 5px;">
                            <label style="display: flex; align-items: center; gap: 5px;">
                                <input type="checkbox" id="soundTable2" checked>
                                Звук для таблиці 2
                            </label>
                        </div>
                    </div>
                </div>
                <div class="collapsible-section" style="border-bottom: 2px solid #ff0000; padding-bottom: 10px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                        <div style="font-weight: bold;">Вибір звуку</div>
                        <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▶️</button>
                    </div>
                    <div class="section-content" style="display: none;">
                        <div style="margin-top: 5px;">
                            <strong>Таблиця 1:</strong>
                            <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 5px;">
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="soundOption1" value="option1" checked>
                                    Звук 1: Стандартний
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="soundOption1" value="option2">
                                    Звук 2: Класичний
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="soundOption1" value="option3">
                                    Звук 3: Потужний
                                </label>
                            </div>
                        </div>
                        <div style="margin-top: 10px;">
                            <strong>Таблиця 2:</strong>
                            <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 5px;">
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="soundOption2" value="option1" checked>
                                    Звук 1: Стандартний
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="soundOption2" value="option2">
                                    Звук 2: Класичний
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="soundOption2" value="option3">
                                    Звук 3: Потужний
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="collapsible-section" style="border-bottom: 2px solid #ff0000; padding-bottom: 10px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                        <div style="font-weight: bold;">Режим звуку</div>
                        <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▶️</button>
                    </div>
                    <div class="section-content" style="display: none;">
                        <div style="margin-top: 5px;">
                            <strong>Таблиця 1:</strong>
                            <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 5px;">
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="soundMode1" value="transaction" checked>
                                    Режим 1: За транзакціями
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="soundMode1" value="dominance">
                                    Режим 2: За зміною переваги
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="soundMode1" value="difference">
                                    Режим 3: За зміною різниці
                                </label>
                            </div>
                        </div>
                        <div style="margin-top: 10px;">
                            <strong>Таблиця 2:</strong>
                            <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 5px;">
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="soundMode2" value="transaction" checked>
                                    Режим 1: За транзакціями
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="soundMode2" value="dominance">
                                    Режим 2: За зміною переваги
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="soundMode2" value="difference">
                                    Режим 3: За зміною різниці
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="collapsible-section">
                    <div style="display: flex; justify-content: space-between; cursor: pointer;" class="section-header">
                        <div style="font-weight: bold;">Колір фону</div>
                        <button class="toggle-section" style="background: none; border: none; color: white; cursor: pointer;">▶️</button>
                    </div>
                    <div class="section-content" style="display: none;">
                        <input type="color" id="backgroundColorPicker" value="${currentBackgroundColor}" style="width: 100%; height: 30px; cursor: pointer; margin-top: 5px;">
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(filterPanel);

        const style = document.createElement('style');
        style.textContent = `
            .gmgn-script-container .apply-btn {
                background-color: #4CAF50;
                color: white;
                border: none;
                padding: 3px 8px;
                cursor: pointer;
                border-radius: 3px;
                transition: background-color 0.2s;
            }
            .gmgn-script-container .apply-btn:active {
                background-color: #45a049;
            }
            .gmgn-script-container .filter-btn {
                background-color: #333;
                color: white;
                border: none;
                padding: 3px 8px;
                cursor: pointer;
                border-radius: 3px;
            }
            .gmgn-script-container .filter-btn:hover {
                background-color: #555;
            }
        `;
        document.head.appendChild(style);
        log('Стили для панели фильтров добавлены');

        // Привязка событий через делегирование
        document.addEventListener('click', (e) => {
            const target = e.target;

            // Открытие/закрытие панели фильтров
            if (target.id === 'toggleFilters') {
                e.stopPropagation();
                const filterContent = document.getElementById('filterContent');
                filterContent.style.display = filterContent.style.display === 'none' ? 'block' : 'none';
                target.textContent = filterContent.style.display === 'none' ? '▶️' : '▼';
                log(`Панель фильтров ${filterContent.style.display === 'block' ? 'открыта' : 'закрыта'}`);
            }

            // Открытие/закрытие секций
            if (target.closest('.section-header')) {
                e.stopPropagation();
                const header = target.closest('.section-header');
                const section = header.nextElementSibling;
                const toggleButton = header.querySelector('.toggle-section');
                section.style.display = section.style.display === 'none' ? 'block' : 'none';
                toggleButton.textContent = section.style.display === 'none' ? '▶️' : '▼';
                log(`Секция настроек ${header.textContent} ${section.style.display === 'block' ? 'открыта' : 'закрыта'}`);
            }

            // Фильтр суммы (Таблица 1)
            if (target.classList.contains('amount-btn1')) {
                currentFilterAmount1 = parseInt(target.getAttribute('data-amount'));
                log(`Фильтр суммы (Таблица 1): ${currentFilterAmount1} $`);
                updateFilterDisplay1();
                updateFilterButtonStyles1();
            }

            // Пользовательский фильтр суммы (Таблица 1)
            if (target.id === 'applyCustomFilter1') {
                const input = document.getElementById('customFilterAmount1');
                const value = parseFloat(input.value);
                if (!isNaN(value) && value > 0) {
                    currentFilterAmount1 = value;
                    log(`Пользовательский фильтр суммы (Таблица 1): ${currentFilterAmount1} $`);
                    updateFilterDisplay1();
                    updateFilterButtonStyles1();
                    input.value = '';
                }
            }

            // Фильтр суммы (Таблица 2)
            if (target.classList.contains('amount-btn2')) {
                currentFilterAmount2 = parseInt(target.getAttribute('data-amount'));
                log(`Фильтр суммы (Таблица 2): ${currentFilterAmount2} $`);
                updateFilterDisplay2();
                updateFilterButtonStyles2();
            }

            // Пользовательский фильтр суммы (Таблица 2)
            if (target.id === 'applyCustomFilter2') {
                const input = document.getElementById('customFilterAmount2');
                const value = parseFloat(input.value);
                if (!isNaN(value) && value > 0) {
                    currentFilterAmount2 = value;
                    log(`Пользовательский фильтр суммы (Таблица 2): ${currentFilterAmount2} $`);
                    updateFilterDisplay2();
                    updateFilterButtonStyles2();
                    input.value = '';
                }
            }

            // Фильтр времени
            if (target.classList.contains('time-btn')) {
                currentFilterTime = parseInt(target.getAttribute('data-time'));
                log(`Фильтр времени: ${currentFilterTime}с`);
                updateTimeFilterDisplay();
                updateTimeFilterButtonStyles();
            }

            // Пользовательский фильтр времени
            if (target.id === 'applyCustomTimeFilter') {
                const input = document.getElementById('customFilterTime');
                const value = parseInt(input.value);
                if (!isNaN(value) && value > 0) {
                    currentFilterTime = value;
                    log(`Пользовательский фильтр времени: ${currentFilterTime}с`);
                    updateTimeFilterDisplay();
                    updateTimeFilterButtonStyles();
                    input.value = '';
                }
            }

            // Выбор количества знаков после комы через кнопки
            if (target.classList.contains('decimals-btn')) {
                const decimals = target.getAttribute('data-decimals');
                if (decimals === 'mexc') {
                    priceDecimals = mexcDecimals;
                } else {
                    priceDecimals = parseInt(decimals);
                }
                updatePriceTable();
                updateDecimalsButtonStyles();
                log(`Кількість знаків після коми: ${priceDecimals}`);
            }

            // Применение количества знаков после комы через ввод
            if (target.id === 'applyPriceDecimals') {
                const input = document.getElementById('priceDecimalsInput');
                const value = parseInt(input.value);
                if (!isNaN(value) && value >= 0 && value <= 10) {
                    priceDecimals = value;
                    updatePriceTable();
                    updateDecimalsButtonStyles();
                    input.value = ''; // Очистка поля после применения
                    log(`Кількість знаків після коми: ${priceDecimals}`);
                }
            }
        });

        // Обработчики для чекбоксов и радио-кнопок
        document.addEventListener('change', (e) => {
            const target = e.target;

            // Видимость таблицы 1
            if (target.id === 'showTable1') {
                isTable1Visible = target.checked;
                if (table1) {
                    table1.style.display = isTable1Visible && (transactionQueue1.buy.length || transactionQueue1.sell.length) ? 'block' : 'none';
                }
                log(`Таблица 1 ${isTable1Visible ? 'показана' : 'скрыта'}`);
            }

            // Видимость таблицы 2
            if (target.id === 'showTable2') {
                isTable2Visible = target.checked;
                if (table2) {
                    table2.style.display = isTable2Visible && (transactionQueue2.buy.length || transactionQueue2.sell.length) ? 'block' : 'none';
                }
                log(`Таблица 2 ${isTable2Visible ? 'показана' : 'скрыта'}`);
            }

            // Звук для таблицы 1
            if (target.id === 'soundTable1') {
                isSoundEnabled1 = target.checked;
                log(`Звук для таблицы 1 ${isSoundEnabled1 ? 'включен' : 'выключен'}`);
            }

            // Звук для таблицы 2
            if (target.id === 'soundTable2') {
                isSoundEnabled2 = target.checked;
                log(`Звук для таблицы 2 ${isSoundEnabled2 ? 'включен' : 'выключен'}`);
            }

            // Режим звука для таблицы 1
            if (target.name === 'soundMode1') {
                soundMode1 = target.value;
                log(`Режим звука для таблицы 1: ${soundMode1}`);
            }

            // Режим звука для таблицы 2
            if (target.name === 'soundMode2') {
                soundMode2 = target.value;
                log(`Режим звука для таблицы 2: ${soundMode2}`);
            }

            // Выбор звука для таблицы 1
            if (target.name === 'soundOption1') {
                selectedSound1 = target.value;
                log(`Выбран звук для таблицы 1: ${selectedSound1}`);
            }

            // Выбор звука для таблицы 2
            if (target.name === 'soundOption2') {
                selectedSound2 = target.value;
                log(`Выбран звук для таблицы 2: ${selectedSound2}`);
            }

            // Видимость таблицы цен
            if (target.id === 'showPriceTable') {
                isPriceTableVisible = target.checked;
                updatePriceTable();
                log(`Таблица цен ${isPriceTableVisible ? 'показана' : 'скрыта'}`);
            }

            // Выбор цвета фона
            if (target.id === 'backgroundColorPicker') {
                applyBackgroundColor(target.value);
            }
        });

        log('Панель фильтров создана и обработчики событий привязаны');
    }

    function updateFilterDisplay1() {
        const display = document.getElementById('currentFilterDisplay1');
        if (display) display.textContent = `Поточний: ${currentFilterAmount1} $`;
        log('Обновлен дисплей фильтра суммы (Таблица 1)', currentFilterAmount1);
    }

    function updateFilterButtonStyles1() {
        document.querySelectorAll('.gmgn-script-container .amount-btn1').forEach(btn => {
            const amount = parseInt(btn.getAttribute('data-amount'));
            btn.style.backgroundColor = amount === currentFilterAmount1 ? 'rgba(0, 255, 0, 0.5)' : '#333';
        });
        log('Обновлены стили кнопок фильтра суммы (Таблица 1)');
    }

    function updateFilterDisplay2() {
        const display = document.getElementById('currentFilterDisplay2');
        if (display) display.textContent = `Поточний: ${currentFilterAmount2} $`;
        log('Обновлен дисплей фильтра суммы (Таблица 2)', currentFilterAmount2);
    }

    function updateFilterButtonStyles2() {
        document.querySelectorAll('.gmgn-script-container .amount-btn2').forEach(btn => {
            const amount = parseInt(btn.getAttribute('data-amount'));
            btn.style.backgroundColor = amount === currentFilterAmount2 ? 'rgba(0, 255, 0, 0.5)' : '#333';
        });
        log('Обновлены стили кнопок фильтра суммы (Таблица 2)');
    }

    function updateTimeFilterDisplay() {
        const display = document.getElementById('currentTimeFilterDisplay');
        if (display) display.textContent = `Поточний: ${currentFilterTime}с`;
        log('Обновлен дисплей фильтра времени', currentFilterTime);
    }

    function updateTimeFilterButtonStyles() {
        document.querySelectorAll('.gmgn-script-container .time-btn').forEach(btn => {
            const time = parseInt(btn.getAttribute('data-time'));
            btn.style.backgroundColor = time === currentFilterTime ? 'rgba(0, 255, 0, 0.5)' : '#333';
        });
        log('Обновлены стили кнопок фильтра времени');
    }

    function updateDecimalsButtonStyles() {
        document.querySelectorAll('.gmgn-script-container .decimals-btn').forEach(btn => {
            const decimals = btn.getAttribute('data-decimals');
            const isSelected = (decimals === 'mexc' && priceDecimals === mexcDecimals) || parseInt(decimals) === priceDecimals;
            btn.style.backgroundColor = isSelected ? 'rgba(0, 255, 0, 0.5)' : '#333';
        });
        log('Обновлены стили кнопок количества знаков после комы');
    }

    function createTransactionTable(tableNum) {
        const tableId = `transactionAlertTable${tableNum}`;
        let table = document.getElementById(tableId);
        if (!table) {
            table = document.createElement('div');
            table.className = 'gmgn-script-container';
            table.id = tableId;
            const initialTop = 20;
            let initialLeft = tableNum === 1 ? window.innerWidth / 2 - 200 : window.innerWidth / 2 - 200 - 420;
            table.style.cssText = `
                position: fixed;
                top: ${initialTop}px;
                left: ${initialLeft}px;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 15px;
                border-radius: 8px;
                z-index: 1000;
                font-family: Arial, sans-serif;
                width: 400px;
                height: auto;
                min-width: 300px;
                min-height: 200px;
                max-height: 400px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                cursor: move;
                resize: both;
                overflow: auto;
            `;
            document.body.appendChild(table);
            applyBackgroundColor(currentBackgroundColor);

            let isDraggingTable = false;
            let tableXOffset = 0;
            let tableYOffset = 0;

            table.addEventListener('mousedown', (e) => {
                const rect = table.getBoundingClientRect();
                const isResizeHandle = e.clientX > rect.right - 15 && e.clientY > rect.bottom - 15;
                if (!isResizeHandle) {
                    isDraggingTable = true;
                    tableXOffset = e.clientX - rect.left;
                    tableYOffset = e.clientY - rect.top;
                }
            });

            document.addEventListener('mousemove', (e) => {
                if (isDraggingTable) {
                    e.preventDefault();
                    table.style.left = `${e.clientX - tableXOffset}px`;
                    table.style.top = `${e.clientY - tableYOffset}px`;
                    table.style.transform = 'none';
                }
            });

            document.addEventListener('mouseup', () => {
                isDraggingTable = false;
            });

            table.addEventListener('resize', () => {
                table.style.overflowY = 'auto';
            });

            if (tableNum === 1) table1 = table;
            else table2 = table;
            log(`Таблица ${tableNum} создана`, { initialLeft, initialTop });
        }
        return table;
    }

    function updateTransactionTable(tableNum, amount, type, transactionId) {
        const queue = tableNum === 1 ? transactionQueue1 : transactionQueue2;
        const soundMode = tableNum === 1 ? soundMode1 : soundMode2;
        const isSoundEnabled = tableNum === 1 ? isSoundEnabled1 : isSoundEnabled2;
        const selectedSound = tableNum === 1 ? selectedSound1 : selectedSound2;
        const now = Date.now();

        if (!queue[type].some(t => t.transactionId === transactionId)) {
            queue[type].push({ amount, startTime: now, transactionId });
            log(`Добавлена транзакция (Таблица ${tableNum}): ${transactionId}`, { amount, type });

            if (isSoundEnabled && soundMode === 'transaction') {
                pendingAudioQueue.push({ tableNum, type });
                playPendingAudio();
            }

            if (tableNum === 1) {
                isNewTransaction1 = true;
            } else {
                isNewTransaction2 = true;
            }
        }

        const table = createTransactionTable(tableNum);

        function refreshTable() {
            const currentTime = Date.now();
            queue.buy = queue.buy.filter(t => (currentTime - t.startTime) / 1000 < currentFilterTime);
            queue.sell = queue.sell.filter(t => (currentTime - t.startTime) / 1000 < currentFilterTime);

            const buyTotal = queue.buy.reduce((sum, t) => sum + t.amount, 0);
            const sellTotal = queue.sell.reduce((sum, t) => sum + t.amount, 0);
            const difference = buyTotal - sellTotal;

            log(`Таблица ${tableNum} - Покупка: ${buyTotal}, Продажа: ${sellTotal}, Разница: ${difference}`);

            if (isSoundEnabled && soundMode === 'dominance') {
                const isNewTransaction = tableNum === 1 ? isNewTransaction1 : isNewTransaction2;
                let currentDominance = difference > 0 ? 'buy' : difference < 0 ? 'sell' : 'neutral';
                const prevDominance = tableNum === 1 ? lastDominance1 : lastDominance2;

                if (isNewTransaction && currentDominance !== prevDominance) {
                    if (currentDominance === 'buy') {
                        pendingAudioQueue.push({ tableNum, type: 'buy' });
                        log(`Преимущество покупки (Таблица ${tableNum}): ${difference}, звук: buy`);
                    } else if (currentDominance === 'sell') {
                        pendingAudioQueue.push({ tableNum, type: 'sell' });
                        log(`Преимущество продажи (Таблица ${tableNum}): ${difference}, звук: sell`);
                    }
                    playPendingAudio();
                }

                if (tableNum === 1) {
                    lastDominance1 = currentDominance;
                    isNewTransaction1 = false;
                } else {
                    lastDominance2 = currentDominance;
                    isNewTransaction2 = false;
                }
            }

            if (isSoundEnabled && soundMode === 'difference') {
                const prevDifference = tableNum === 1 ? lastDifference1 : lastDifference2;
                const isNewTransaction = tableNum === 1 ? isNewTransaction1 : isNewTransaction2;

                if (isNewTransaction && difference !== prevDifference) {
                    if (difference > 0) {
                        pendingAudioQueue.push({ tableNum, type: 'buy' });
                        log(`Положительная разница (Таблица ${tableNum}): ${difference}, звук: buy`);
                    } else if (difference < 0) {
                        pendingAudioQueue.push({ tableNum, type: 'sell' });
                        log(`Отрицательная разница (Таблица ${tableNum}): ${difference}, звук: sell`);
                    }
                    playPendingAudio();
                }

                if (tableNum === 1) {
                    lastDifference1 = difference;
                    isNewTransaction1 = false;
                } else {
                    lastDifference2 = difference;
                    isNewTransaction2 = false;
                }
            }

            const differenceBackground = difference >= 0 ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)';
            table.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <div style="font-weight: bold;">
                        Покупка: $${formatNumberWithSpaces(buyTotal.toFixed(2))}
                    </div>
                    <div style="font-weight: bold;">
                        Продажа: $${formatNumberWithSpaces(sellTotal.toFixed(2))}
                    </div>
                </div>
                <div style="text-align: center; margin-bottom: 10px; padding: 5px; background: ${differenceBackground} !important; border-radius: 4px;">
                    <span style="font-weight: bold;">
                        ${difference >= 0 ? `Покупка $${formatNumberWithSpaces(difference.toFixed(2))}` : `Продажа $${formatNumberWithSpaces(Math.abs(difference).toFixed(2))}`}
                    </span>
                </div>
                <div style="display: flex; justify-content: space-between; flex-grow: 1; overflow-y: auto;">
                    <div style="width: 48%;">
                        <strong>Покупка:</strong>
                        ${queue.buy.map(t => {
                            const secondsElapsed = Math.min(Math.floor((currentTime - t.startTime) / 1000), currentFilterTime);
                            return `<div style="margin-left: 10px;">$${formatNumberWithSpaces(t.amount.toFixed(2))} - ${secondsElapsed}с</div>`;
                        }).join('')}
                    </div>
                    <div style="width: 48%;">
                        <strong>Продажа:</strong>
                        ${queue.sell.map(t => {
                            const secondsElapsed = Math.min(Math.floor((currentTime - t.startTime) / 1000), currentFilterTime);
                            return `<div style="margin-left: 10px;">$${formatNumberWithSpaces(t.amount.toFixed(2))} - ${secondsElapsed}с</div>`;
                        }).join('')}
                    </div>
                </div>
            `;
            const isVisible = (tableNum === 1 ? isTable1Visible : isTable2Visible) && (queue.buy.length || queue.sell.length);
            table.style.display = isVisible ? 'block' : 'none';
            log(`Таблица ${tableNum} обновлена`, { buyTotal, sellTotal, difference, isVisible });
        }

        refreshTable();
        if (!document.querySelector(`#transactionAlertTable${tableNum}Timer`)) {
            const timer = setInterval(refreshTable, 1000);
            table.setAttribute('data-timer-id', timer);
            table.insertAdjacentHTML('beforeend', `<span id="transactionAlertTable${tableNum}Timer" style="display: none;"></span>`);
            log(`Таймер для таблицы ${tableNum} установлен`, timer);
        }
    }

    function playPendingAudio() {
        if (document.visibilityState !== 'visible') {
            log('Вкладка неактивна, звук ожидает');
            return;
        }

        while (pendingAudioQueue.length > 0) {
            const { tableNum, type } = pendingAudioQueue.shift();
            const selectedSound = tableNum === 1 ? selectedSound1 : selectedSound2;
            const audioToPlay = type === 'buy' ? sounds[selectedSound].buy : sounds[selectedSound].sell;
            audioToPlay.play()
                .then(() => log(`Звук для ${type} (Таблица ${tableNum}) воспроизведен`))
                .catch(e => log(`Ошибка воспроизведения звука для ${type} (Таблица ${tableNum})`, e));
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            log('Вкладка активна, воспроизводим звуки');
            playPendingAudio();
        }
    });

    function checkAndInitialize() {
        const params = getChainAndTokenFromURL();
        if (params && (params.tokenAddress !== currentTokenAddress || params.chain !== currentChain)) {
            log('Обнаружен новый токен или сеть', params);
            currentTokenAddress = params.tokenAddress;
            currentChain = params.chain;
            tokenName = getTokenName();
            // Формируем два символа: <tokenName>_USDT и <tokenName>SOL_USDT
            const mexcSymbol1 = `${tokenName.toUpperCase()}_USDT`; // Например, TROLL_USDT
            const mexcSymbol2 = `${tokenName.toUpperCase()}SOL_USDT`; // Например, TROLLSOL_USDT
            const mexcSymbols = [mexcSymbol1, mexcSymbol2];
            log('Сформированы символы для MEXC', mexcSymbols);
            initGmgnWebSocket(params.chain, params.tokenAddress);
            initMexcWebSocket(mexcSymbols);
            closeBanner();
            createFilterPanel();
            createPriceTable();
        } else if (!params) {
            log('Токен не найден, очищаем');
            cleanup();
            currentTokenAddress = null;
            currentChain = null;
        }
    }

    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(history, arguments);
        checkAndInitialize();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(history, arguments);
        checkAndInitialize();
    };

    window.addEventListener('popstate', checkAndInitialize);

    checkAndInitialize();
    setInterval(closeBanner, 500);
})();