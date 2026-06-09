module.exports = {
  apps: [
    {
      name:       'weatherfit-api',
      script:     '/home/ubuntu/weather-fit/backend/server.js',
      instances:  1,
      autorestart: true,
      watch:      false,
      // 로그 경로
      out_file:   '/home/ubuntu/logs/weatherfit-out.log',
      error_file: '/home/ubuntu/logs/weatherfit-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
