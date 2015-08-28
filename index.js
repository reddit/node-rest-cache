var crypto = require('crypto');
var LRU = require('lru-cache');

function Cache(config) {
  var config = config || {};

  this.rules = config.rules || {};
  this.defaultCacheConfig = config.defaultCacheConfig || {};
  this.dataTypes = config.dataTypes || {};

  this.requestCache = {};
  this.dataCache = {};

  this.setUpDataCache();
}

Cache.prototype.setUpDataCache = function() {
  for (var k in this.dataTypes) {
    var cacheConfig = this.dataTypes[k].cache || this.defaultCacheConfig.cache;
    this.dataCache[k] = new LRU(cacheConfig);
  }
}

Cache.prototype.get = function(fn, params, options) {
  var cache = this;
  var options = options || {};

  var config = options.config || this.defaultCacheConfig;
  var format = options.format || Cache.returnData;
  var key = options.name || fn.name;

  if (!key) {
    return Promise.reject('No key was passed in, and function did not have a name.');
  }

  var paramsHash = this.generateHash(params);

  var failedRule = false;

  if (config.rules) {
    failedRule = config.rules.some(function(rule) {
      return !rule(params);
    });
  }

  if (!failedRule) {
    var cachedData = this.loadFromCache(key, paramsHash, config);

    if (cachedData) {
      return Promise.resolve(cachedData);
    }
  }

  return new Promise(function(resolve, reject) {
    fn.apply(undefined, params).then(function(data){
      var formattedData = format(data);
      resolve(data);
      cache.setCaches(key, paramsHash, formattedData, config);
    }, function(error) {
      reject(error);
    });
  });
};

Cache.prototype.getById = function(type, id, fn, params, options) {
  if (this.dataCache[type]) {
    var res = this.dataCache[type].get(id);

    if (res) {
      return Promise.resolve(res);
    }
  }

  return this.get(fn, params, options);
}

Cache.prototype.generateHash = function(params) {
  var shasum = crypto.createHash('sha1');
  shasum.update(JSON.stringify(params) || '');
  return shasum.digest('hex');
}

Cache.prototype.loadFromCache = function(key, hash, config) {
  if (!this.requestCache[key]) { return; }

  var requestCache = this.requestCache[key].get(hash);
  if(!requestCache) { return; }

  var obj = {};
  for (var type in requestCache) {
    if (!this.dataCache[type]) { return; }

    var id = this.dataCache[type] ? this.cache.dataType[type].idProperty || 'id' : 'id';

    obj[type] = this.dataCache[type].filter(function(d) {
      return this.dataCache[type].indexOf(d[id]) > -1;
    });
  }

  return obj;
}

Cache.prototype.setCaches = function(key, hash, data, config) {
  this.setRequestCache(key, hash, data, config);
  this.setDataCache(data);
}

Cache.prototype.setRequestCache = function(key, hash, data, config) {
  var dataType;
  var id;

  if (!config.cache) {
    throw('No LRU configuration passed in, aborting.');
  }

  this.requestCache[key] = this.requestCache[key] || new LRU(config.cache);

  var idCache = {};

  for (var type in data) {
    dataType = this.dataTypes[type];
    id = dataType ? dataType.idProperty || 'id' : 'id';

    idCache[type] = data[type].map(function(d) {
      return d[id];
    });
  }

  this.requestCache[key].set(hash, idCache);
}

Cache.prototype.setDataCache = function(data) {
  var dataType;
  var id;

  for (var k in data) {
    var config = (this.dataTypes[k] || {}).cache || this.defaultCacheConfig.cache;

    if (!config) {
      throw('No LRU configuration passed in, aborting.');
    }

    this.dataCache[k] = this.dataCache[k] || new LRU(config);
    dataType = this.dataTypes[k];
    id = dataType ? dataType.idProperty || 'id' : 'id';

    for (var o in data[k]) {
      this.dataCache[k].set(data[k][o][id], data[k][o]);
    }
  }
}

Cache.returnData = function(d) {
  return d;
}

module.exports = Cache;
