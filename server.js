var forever = require('forever-monitor');

  var child = new (forever.Monitor)('index.js');

  child.start();