var forever = require('forever-monitor');

  var child = new (forever.Monitor)('index.js', {
    silent: true,
  });

  child.start();