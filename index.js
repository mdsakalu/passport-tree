var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var v = require('validator');
var mongo = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;
var Q = require('q');

var db;

v.isFunction = function(f) {
  return typeof(f) == "function";
};

app.use(express.static(__dirname + '/client'));

function randomInts(num, min, max) {
  var low = parseInt(min, 10);
  var high = parseInt(max, 10);
  
  var arr = [];
  for (var i = 0; i < num; i++) {
    arr[i] = Math.floor((Math.random() * (high - low + 1)) + low);
  }
  return arr;
}

io.on('connection', function(socket) {
  console.log('a user connected');

  var factories = db.collection('factories');
  var socketId = socket.id;
  
  function hasLock(oid, callback) {
    factories.findOne({'_id': oid}, function(err, record) {
      if(err) {
        callback(false);
      } else {
        callback(record.lock == socketId);
      }
    });
  }

  console.log(socketId);

  socket.on('retrieveAll', function(callback) {
    if(!v.isFunction(callback)) return;
    
    factories.find().toArray(function(err, records) {
      if (err) {
        callback(err);
      } else {
        callback(null, records);
      }
    });
  });

  socket.on('createFactory', function(name, min, max, callback) {
    if(!v.isFunction(callback)) return;
    if(!v.isInt(min) || !v.isInt(max) || v.toInt(min) > v.toInt(max)) {
      callback("invalid input");
      return;
    }
    
    var factory = {
      'name': name,
      'min': min,
      'max': max,
      'nodes': [],
      'lock': ''
    };

    factories.insert(factory, {w: 1}, function(err, records) {
      if (err) {
        callback(err);
      } else {
        callback(err, records[0]);
        socket.broadcast.emit('new factory', records[0]);
      }
    });
  });

  socket.on('generateNodes', function(id, numNodes, min, max, callback) {
    if(!v.isFunction(callback)) return;
    if(!v.isMongoId(id) || !v.isInt(numNodes) || !v.isInt(min) || !v.isInt(max) || v.toInt(min) > v.toInt(max)) {
      callback("invalid input");
      return;
    }
    
    numNodes = v.toInt(numNodes);
    min = v.toInt(min);
    max = v.toInt(max);
    
    var oid = new ObjectID(id);
    
    var nodes = randomInts(numNodes, min, max);
    factories.update({'_id': oid}, {$set: {'nodes': nodes}}, function(err, numUpdated) {
      if (err) {
        callback(err);
        return;
      } else {
        factories.findOne({'_id': oid}, function(err, record) {
          if(err) {
            callback(err);
          } else {
            callback(null, record.nodes);
            socket.broadcast.emit('factory updated', record);
          }
        });
      }
    });
  });

  socket.on('updateFactory', function(id, name, min, max, callback) {
    if(!v.isFunction(callback)) return;
    if(!v.isMongoId(id) || !v.isInt(min) || !v.isInt(max) || v.toInt(min) > v.toInt(max)) {
      callback("invalid input");
      return;
    }
    
    var oid = new ObjectID(id);
    
    factories.update({'_id': oid}, {$set: {'name': name, 'min': min, 'max': max}}, function(err) {
      if (err) {
        callback(err);
      } else {
        factories.findOne({'_id': oid}, function(err, record) {
          if(err) {
            callback(err);
          } else {
            callback();
            socket.broadcast.emit('factory updated', record);
          }
        });
      }
    });
  });

  socket.on('deleteFactory', function(id, callback) {
    if(!v.isFunction(callback)) return;
    if(!v.isMongoId(id)) {
      callback("invalid input");
      return;
    }
    
    var oid = new ObjectID(id);
    
    factories.findOne({'_id': oid}, function(err, record) {
      if (err) {
        callback(err);
        return;
      } else {
        factories.remove({'_id': oid}, {w:1}, function(err, numRemoved) {
          if(err) {
            callback(err);
          } else {
            io.emit('factory deleted', id);
            callback();
          }
        });
      }
    });
  });

  socket.on('lock', function(id, callback) {
    if(!v.isFunction(callback)) return;
    if(!v.isMongoId(id)) {
      callback(false);
      return;
    }
    
    var oid = new ObjectID(id);
    
    factories.findOne({'_id': oid}, function(err, record) {
      if (err) {
        callback(false);
      } else {
        if(record.lock == '') {
          factories.update({'_id': oid}, {$set: {'lock': socketId}}, function(err, numUpdated) {
            if(err) {
              callback(false);
            } else {
              callback(true);
            }
          });
        } else {
          callback(false);
        }
      }
    });
  });

  socket.on('unlock', function(id) {
    if(!v.isMongoId(id)) {
      return;
    }
    
    var oid = new ObjectID(id);
    
    hasLock(oid, function(shouldUnlock) {
      if(shouldUnlock) {
        factories.update({'_id': oid}, {$set: {'lock': ''}}, function(){});
      }
    });
  });

  socket.on('disconnect', function() {
    factories.update({'lock': socketId}, {$set: {'lock': ''}}, function(){});
    console.log('a user disconnected');
  });
});


// default to a 'localhost' configuration:
var connection_string = '127.0.0.1:27017/passport-tree';
// if OPENSHIFT env variables are present, use the available connection info:
if(process.env.OPENSHIFT_MONGODB_DB_PASSWORD){
  connection_string = process.env.OPENSHIFT_MONGODB_DB_USERNAME + ":" +
  process.env.OPENSHIFT_MONGODB_DB_PASSWORD + "@" +
  process.env.OPENSHIFT_MONGODB_DB_HOST + ':' +
  process.env.OPENSHIFT_MONGODB_DB_PORT + '/' +
  process.env.OPENSHIFT_APP_NAME;
}

mongo.connect(connection_string, function(err, database) {
  if (err) throw err;

  db = database;
  
  //clear any stale locks
  db.collection('factories').update({'lock': {$ne: ''}}, {$set: {'lock': ''}}, function(){});

  // Start the application  after the database connection is ready
  var ip_addr = process.env.OPENSHIFT_NODEJS_IP   || process.env.IP || "0.0.0.0";
  var port    = process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || 3000;
  http.listen(port, ip_addr, function() {
    console.log('listening on *:' + process.env.PORT || 3000);
  });
});