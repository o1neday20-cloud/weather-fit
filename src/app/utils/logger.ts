export interface LogData {
  timestamp: string;
  userId: string;
  eventType: string;
  eventData: any;
  pageUrl: string;
  userAgent: string;
}

export class Logger {
  private static logs: LogData[] = [];

  static log(eventType: string, eventData: any) {
    const logEntry: LogData = {
      timestamp: new Date().toISOString(),
      userId: this.getUserId(),
      eventType,
      eventData,
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
    };

    this.logs.push(logEntry);
    
    // 로컬 스토리지에 저장
    this.saveLogs();
    
    // 콘솔에 출력
    console.log('[LOG]', logEntry);
  }

  static getUserId(): string {
    let userId = localStorage.getItem('userId');
    if (!userId) {
      userId = 'user_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('userId', userId);
    }
    return userId;
  }

  static saveLogs() {
    localStorage.setItem('appLogs', JSON.stringify(this.logs));
  }

  static getLogs(): LogData[] {
    const storedLogs = localStorage.getItem('appLogs');
    if (storedLogs) {
      this.logs = JSON.parse(storedLogs);
    }
    return this.logs;
  }

  static clearLogs() {
    this.logs = [];
    localStorage.removeItem('appLogs');
  }

  static exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}
