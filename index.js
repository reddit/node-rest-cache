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

Cache.prototype.get = function(key, fn, params, format, config) {
  var cache = this;

  if (typeof key === 'function') {
    config = format || this.defaultCacheConfig;
    format = params || Cache.returnData;
    params = fn;
    fn = key;
    key = fn.name;
  }

  if (!key) {
    return Promise.reject('No key was passed in, and function did not have a name.');
  }

  // Shift all the parameters if no key was passed in;
  var shasum = crypto.createHash('sha1');
  shasum.update(JSON.stringify(params) || '');
  var paramsHash = shasum.digest('hex');

  if (config.rules) {
    var failedRule = false;

    failedRule = config.rules.some(function(rule) {
      return !rule(params);
    });

    if (!failedRule) {
      var cachedData = this.loadFromCache(key, paramsHash, config);

      if (cachedData) {
        return Promise.resolve(cachedData);
      }
    }
  }

  return new Promise(function(resolve, reject) {
    var apply = typeof params === 'Array' ? 'apply' : 'call';

    // check cache
    // if rule failed, don't load it from the cache

    fn[apply](undefined, params).then(function(data){
      var formattedData = format(data);
      cache.setCaches(key, paramsHash, formattedData, config);
      resolve(data);
    }, function(error) {
      reject(error);
    });
  });
};

Cache.prototype.loadFromCache = function(key, hash, config) {
}

Cache.prototype.setCaches = function(key, hash, data, config) {
  this.setRequestCache(key, hash, data, config);
  this.setDataCache(data, config);
}

Cache.prototype.setRequestCache = function(key, hash, data, config) {
  var dataType;
  var id;

  this.requestCache[key] = this.requestCache[key] || {};
  this.requestCache[key][hash] = this.requestCache[hash] || {};

  for (var type in data) {
    dataType = this.dataTypes[type];
    id = dataType ? dataType.idProperty || 'id' : 'id';

    this.requestCache[key][hash][type] = data[type].map(function(d) {
      return d[id];
    });
  }
}

Cache.prototype.setDataCache = function(data, config) {
}

Cache.returnData = function(d) {
  return d;
}

module.exports = Cache;
