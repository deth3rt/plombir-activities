// ==================== SYNC MODULE ====================
// Отправка статистики в Google Sheets с очередью и повторами
// Работает даже при обрыве интернета — данные дойдут позже

const Sync = {
  // ==================== НАСТРОЙКИ ====================
  CONFIG: {
    URL: 'https://script.google.com/macros/s/AKfycbxXZkgQXEUwMIqceGfjnV7V_YSVzIKnuE1WsYLHlzNb3ovCOKz2b9OkZt5IBwHkTP_ixA/exec',
    KEY: 'Pavel9696',
    QUEUE_STORAGE: 'plombir_sync_queue_v1',
    MAX_RETRIES: 5,
    TIMEOUT_MS: 10000,
    RETRY_DELAY_MS: 3000
  },
  
  // ==================== ОТПРАВИТЬ СОБЫТИЕ ====================
  // activity: 'lipkiy' | 'facts' | 'v-teme'
  // player: 'Игрок 1 (ЛИПКИЙ)'
  // result: '260' | '4/5' | '3:1'
  // details: { ... } — любые доп. данные
  async send(activity, player, result, details = {}) {
    const payload = {
      key: this.CONFIG.KEY,
      activity: activity,
      player: player,
      result: result,
      details: JSON.stringify(details),
      timestamp: Date.now()
    };
    
    // Пробуем отправить
    const success = await this._trySend(payload);
    
    if (success) {
      console.log('✅ Синхронизировано:', payload);
      return true;
    }
    
    // Не удалось — в очередь
    this._addToQueue(payload);
    console.log('📥 Добавлено в очередь:', payload);
    return false;
  },
  
  // ==================== ПОПЫТКА ОТПРАВКИ ====================
  async _trySend(payload, attempt = 1) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.CONFIG.TIMEOUT_MS);
      
      const response = await fetch(this.CONFIG.URL, {
        method: 'POST',
        mode: 'no-cors', // Google Apps Script требует no-cors
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // no-cors не даёт прочитать ответ, но запрос уходит
      return true;
    } catch (err) {
      console.warn(`⚠️ Попытка ${attempt} не удалась:`, err.message);
      
      if (attempt < this.CONFIG.MAX_RETRIES) {
        await this._sleep(this.CONFIG.RETRY_DELAY_MS);
        return this._trySend(payload, attempt + 1);
      }
      
      return false;
    }
  },
  
  // ==================== ОЧЕРЕДЬ ====================
  _getQueue() {
    try {
      const data = localStorage.getItem(this.CONFIG.QUEUE_STORAGE);
      return data ? JSON.parse(data) : [];
    } catch(e) { return []; }
  },
  
  _saveQueue(queue) {
    try {
      localStorage.setItem(this.CONFIG.QUEUE_STORAGE, JSON.stringify(queue));
    } catch(e) {}
  },
  
  _addToQueue(payload) {
    const queue = this._getQueue();
    queue.push({ ...payload, queuedAt: Date.now() });
    this._saveQueue(queue);
  },
  
  // ==================== ОТПРАВИТЬ ВСЁ ИЗ ОЧЕРЕДИ ====================
  async flushQueue() {
    const queue = this._getQueue();
    if (queue.length === 0) return;
    
    console.log(`📤 Отправка очереди (${queue.length} записей)...`);
    
    const remaining = [];
    
    for (const item of queue) {
      const success = await this._trySend(item);
      if (!success) {
        remaining.push(item);
      }
    }
    
    this._saveQueue(remaining);
    
    if (remaining.length === 0) {
      console.log('✅ Очередь очищена');
    } else {
      console.log(`⏳ Осталось в очереди: ${remaining.length}`);
    }
  },
  
  // ==================== УТИЛИТЫ ====================
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  // ==================== АВТО-ОТПРАВКА ПРИ ВОССТАНОВЛЕНИИ ИНТЕРНЕТА ====================
  init() {
    // При появлении интернета — отправляем очередь
    window.addEventListener('online', () => {
      console.log('🌐 Интернет появился — отправка очереди');
      this.flushQueue();
    });
    
    // При загрузке страницы — тоже проверяем очередь
    if (navigator.onLine) {
      setTimeout(() => this.flushQueue(), 2000);
    }
    
    // Периодическая проверка (каждые 30 секунд)
    setInterval(() => {
      if (navigator.onLine) {
        this.flushQueue();
      }
    }, 30000);
  },
  
  // ==================== СТАТИСТИКА ОЧЕРЕДИ ====================
  getQueueSize() {
    return this._getQueue().length;
  }
};

// Инициализация
Sync.init();