const express = require('express');

function startKeepAliveServer() {
  const app = express();
  const PORT = process.env.PORT || 8000;

  app.get('/', (req, res) => {
    res.send('Bot is running');
  });

  app.get('/health', (req, res) => {
      res.status(200).send('OK');
  });

  try {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Web server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start keep-alive server:', err);
  }
}

module.exports = { startKeepAliveServer };
